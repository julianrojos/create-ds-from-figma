import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { projectFile } from './render-plan.mjs';
import { localDependencies } from './local-dependencies.mjs';
import { concreteFontWeight } from './font-weight.mjs';
import { cssImportProblem, resolveCssPackage } from './css-import-resolution.mjs';

const meaningful = nodes => nodes.filter(node => !['space', 'comment'].includes(node.type));
const simple = value => {
  const nodes = meaningful(valueParser(value).nodes);
  if (!nodes.length || nodes.some(n => n.unclosed || !['string', 'word'].includes(n.type) || n.value.includes('\\'))) return null;
  if (nodes.some(n => n.type === 'string') && nodes.length !== 1) return null;
  return nodes.map(n => n.value).join(' ').toLowerCase();
};
const weights = value => {
  const normalized = simple(value), aliases = { normal: 400, bold: 700 };
  if (normalized === null) return null;
  const numbers = normalized.split(' ').map(word => word in aliases ? aliases[word] : /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(word) ? Number(word) : NaN);
  return numbers.length <= 2 && numbers.every(n => n >= 1 && n <= 1000) && (numbers.length === 1 || numbers[0] <= numbers[1]) ? [numbers[0], numbers.at(-1)] : null;
};
const urlValue = node => {
  if (node.type === 'string') return node.value;
  if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return null;
  const nodes = meaningful(node.nodes);
  return !node.unclosed && nodes.length === 1 && !nodes[0].unclosed && ['word', 'string'].includes(nodes[0].type) ? nodes[0].value : null;
};
const sourceUrls = value => {
  const groups = [[]];
  for (const node of meaningful(valueParser(value).nodes)) {
    if (node.type === 'div' && node.value === ',') groups.push([]);
    else groups.at(-1).push(node);
  }
  if (groups.some(group => !group.length || group.some(node => node.type !== 'function' || node.unclosed) || !['url', 'local'].includes(group[0].value.toLowerCase()) || group.slice(1).some(node => !['format', 'tech'].includes(node.value.toLowerCase())))) return null;
  return groups.filter(group => group[0].value.toLowerCase() === 'url').map(group => urlValue(group[0]));
};

// Inspect declared/static entry points, not arbitrary audited files or dynamic CSS side effects.
export function fontConfigurations(root, metadata) {
  const warnings = new Set(), faces = [], visited = new Set();
  const localFile = (from, url) => {
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url) || url.includes('\\')) throw new Error('External, escaped or contextual font URL needs review');
    const clean = decodeURIComponent(url.split(/[?#]/)[0]);
    const relative = clean.startsWith('/')
      ? (existsSync(path.join(root, 'public', clean.slice(1))) ? path.join('public', clean.slice(1)) : clean.slice(1))
      : path.relative(root, path.resolve(root, path.dirname(from), clean));
    const normalized = relative.split(path.sep).join('/');
    return { file: projectFile(root, normalized), relative: normalized };
  };
  const visit = relative => {
    let file;
    try { file = projectFile(root, relative); } catch (error) { warnings.add(`${relative}: ${error.message}`); return; }
    if (visited.has(file)) return;
    visited.add(file);
    let css;
    try { css = postcss.parse(readFileSync(file, 'utf8'), { from: relative }); }
    catch (error) { warnings.add(`${relative}: ${error.message}`); return; }
    css.walkAtRules(rule => {
      const name = rule.name.toLowerCase();
      if (!['import', 'font-face'].includes(name)) return;
      if (rule.parent.type !== 'root') { warnings.add(`${relative}: nested @${name} needs contextual review`); return; }
      if (name === 'import') {
        const nodes = meaningful(valueParser(rule.params).nodes), url = nodes.length === 1 ? urlValue(nodes[0]) : null;
        try {
          if (!url) throw new Error('Conditional or contextual @import needs review');
          const problem = cssImportProblem(url);
          if (problem) throw new Error(problem);
          let target;
          try { target = localFile(relative, url); }
          catch (error) {
            if (/^(?:[a-z][a-z\d+.-]*:|[./#])/i.test(url) || url.includes('\\')) throw error;
            const resolved = resolveCssPackage(root, relative, url, { cssImport: true });
            const candidate = path.relative(root, resolved).split(path.sep).join('/');
            target = { file: projectFile(root, candidate), relative: candidate };
          }
          if (!target.relative.endsWith('.css')) throw new Error('Only local CSS imports can be inspected');
          visit(target.relative);
        } catch (error) { warnings.add(`${relative}: ${error.message}`); }
        return;
      }
      const declarations = new Map();
      for (const node of rule.nodes || []) if (node.type === 'decl') declarations.set(node.prop.toLowerCase(), node);
      if ([...declarations.values()].some(node => node.important)) { warnings.add(`${relative}: important font descriptors need review`); return; }
      const family = simple(declarations.get('font-family')?.value || '');
      const weight = weights(declarations.get('font-weight')?.value || 'normal');
      const style = simple(declarations.get('font-style')?.value || 'normal');
      const sources = [];
      const urls = sourceUrls(declarations.get('src')?.value || '');
      if (!urls) { warnings.add(`${relative}: unsupported src descriptor needs review`); return; }
      for (const url of urls) {
        try { sources.push(localFile(relative, url).file); }
        catch (error) { warnings.add(`${relative}: ${error.message}`); }
      }
      if (family && weight && ['normal', 'italic', 'oblique'].includes(style)) faces.push({ stylesheet: relative, line: rule.source.start.line, family, weight, style, sources });
      else warnings.add(`${relative}: unsupported font descriptors need review`);
    });
  };
  root = realpathSync(root);
  for (const file of metadata.verification?.stylesheets || []) visit(file);
  if (metadata.code?.path) {
    try {
      const discovered = localDependencies(root, [metadata.code.path], { runtimeOnly: true, stylesheetDiscovery: true });
      for (const warning of discovered.warnings) warnings.add(warning);
      for (const file of discovered.stylesheets) visit(file);
    } catch (error) { warnings.add(`Static CSS discovery NOT VERIFIED: ${error.message}`); }
  }
  const scope = 'Static declaration linkage only, not active conditions, browser source selection, loading, font identity or rendered glyphs. Dynamic imports, package JavaScript side effects and unresolved imports need independent review; resolvable static CSS package imports may be inspected without executing them.';
  const configurations = (metadata.verification?.fonts || []).map(font => {
    let source;
    try { if (font.source?.kind === 'file') source = projectFile(root, font.source.path); } catch { /* Registration diagnoses missing/escaping sources separately. */ }
    const expected = concreteFontWeight(font.css?.weight);
    const matches = source && expected !== null ? faces.filter(face => face.sources.includes(source) && face.family === simple(font.css?.family || '') && face.style === font.css?.style && face.weight[0] <= expected && face.weight[1] >= expected).map(({ stylesheet, line }) => ({ stylesheet, line })) : [];
    return { id: font.id, status: matches.length ? 'DECLARED' : 'NOT VERIFIED', matches,
      reason: expected === null ? 'Recorded CSS weight must be one concrete number from 1 to 1000, normal or bold; ranges belong to @font-face.' : matches.length ? 'An unconditional local CSS declaration references the registered file with matching descriptors.' : 'No supported unconditional declaration linking the registered file and CSS descriptors was established.', scope };
  });
  return { configurations, warnings: [...warnings].sort(), scope };
}
