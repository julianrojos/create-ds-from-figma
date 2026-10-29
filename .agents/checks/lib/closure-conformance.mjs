import { existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import ts from 'typescript';
import { moduleEntries, emittedImports } from './static-entry-imports.mjs';

export const classificationPath = 'design-system/component-classification.json';
const ignored = new Set(['.DS_Store', '.gitkeep', 'Thumbs.db', 'desktop.ini']);
const readJson = (root, file, fallback) => existsSync(path.join(root, file)) ? JSON.parse(readFileSync(path.join(root, file), 'utf8')) : fallback;
function safeStat(root, relative, findings) {
  let cursor = root;
  for (const segment of relative.split('/')) {
    cursor = path.join(cursor, segment);
    let stat;
    try { stat = lstatSync(cursor); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; throw error; }
    if (stat.isSymbolicLink()) {
      const file = path.relative(root, cursor).split(path.sep).join('/');
      if (!findings.some(f => f.code === 'UNSUPPORTED_SYMLINK' && f.file === file)) findings.push({status:'FAIL',code:'UNSUPPORTED_SYMLINK',file,reason:'Symbolic link was not followed; this path cannot be verified'});
      return null;
    }
  }
  return lstatSync(cursor);
}
function files(root, relative, findings) {
  const stat = safeStat(root,relative,findings);
  if (!stat) return [];
  if (!stat.isDirectory()) return [relative];
  return readdirSync(path.join(root, relative)).filter(n => !ignored.has(n)).sort().flatMap(n => files(root, `${relative}/${n}`,findings));
}
function classifications(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.auxiliaries)) throw new Error('Invalid component classification schema');
  const seen = new Set();
  return data.auxiliaries.map(item => {
    if (!item || !/^src\/components\/[^/.][^/]*$/.test(item.directory) || item.directory.includes('\\') || typeof item.reason !== 'string' || !item.reason.trim() || seen.has(item.directory)) throw new Error('Invalid or duplicate auxiliary classification');
    seen.add(item.directory); return { directory: item.directory, reason: item.reason, kind: 'auxiliary' };
  }).sort((a,b) => a.directory.localeCompare(b.directory));
}
export function componentClosure(root, { since } = {}) {
  const findings = [], inventory = readJson(root, 'design-system/inventory.json', { components: [] });
  const map = Object.entries(readJson(root, 'design-system/relationships/figma-code-map.json', {})).filter(([k]) => !k.startsWith('_')).map(([,v]) => v);
  const auxiliaries = classifications(readJson(root, classificationPath, { schemaVersion: 1, auxiliaries: [] }));
  const publicNames = new Set([...(inventory.components || []), ...map.map(e => e.name)]);
  const dirs = relative => safeStat(root,relative,findings)?.isDirectory() ? readdirSync(path.join(root, relative), { withFileTypes: true }).filter(e => !ignored.has(e.name) && (e.isDirectory() || e.isSymbolicLink()) && files(root, `${relative}/${e.name}`,findings).length).map(e => e.name) : [];
  const codeDirs = dirs('src/components'), sheetDirs = dirs('design-system/components');
  const names = new Set([...publicNames, ...sheetDirs, ...codeDirs.filter(n => !auxiliaries.some(a => a.directory === `src/components/${n}`))]);
  const fail = (component, reason) => findings.push({ status: 'FAIL', component, reason });
  // Existence is not enough: a directory named metadata.json or a code.path that
  // points at a folder must not satisfy the ficha or implementation contract.
  const regularFile = relative => safeStat(root, relative, findings)?.isFile() === true;
  const safeProjectPath = value => typeof value === 'string' && value !== '' && !path.isAbsolute(value) && !value.includes('\\') && path.posix.normalize(value) === value && value !== '..' && !value.startsWith('../');
  for (const name of [...names].sort()) {
    if (!inventory.components?.includes(name)) fail(name, 'Missing inventory entry');
    const entries = map.filter(e => e.name === name);
    if (entries.length !== 1) fail(name, 'Exactly one Figma map entry is required');
    const entry = entries[0];
    for (const file of [`design-system/components/${name}/metadata.json`, `design-system/components/${name}/usage.md`]) if (!regularFile(file)) fail(name, `Missing ficha file: ${file}`);
    const codePath = entry?.code?.path;
    if (!safeProjectPath(codePath) || !regularFile(codePath)) fail(name, 'Missing mapped implementation: a regular file inside the project is required');
    if (codeDirs.includes(name) && !entry?.code?.path?.startsWith(`src/components/${name}/`)) fail(name, 'Component directory does not match mapped implementation');
  }
  for (const item of auxiliaries) {
    const name = item.directory.split('/').at(-1);
    if (!codeDirs.includes(name)) fail(name, 'Auxiliary classification has no directory');
    if (publicNames.has(name) || sheetDirs.includes(name)) fail(name, 'Auxiliary classification conflicts with a public DS component');
  }
  let changes = { status: 'NOT_RUN', reason: 'No --since revision supplied; changes cannot be determined' };
  if (since !== undefined) {
    if (typeof since !== 'string' || !since || since.startsWith('-')) throw new Error('Invalid --since revision');
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
    const revision = git(['rev-parse', '--verify', '--end-of-options', `${since}^{commit}`]);
    const prefix = git(['rev-parse', '--show-prefix']);
    const gitPath = prefix + classificationPath;
    const top = git(['rev-parse', '--show-toplevel']);
    const present = git(['-C', top, 'ls-tree', '--name-only', revision, '--', gitPath]);
    const previous = present ? classifications(JSON.parse(git(['-C', top, 'show', `${revision}:${gitPath}`]))) : [];
    changes = { status: 'PASS', revision, entries: [...new Set([...previous, ...auxiliaries].map(i => i.directory))].sort().flatMap(directory => {
      const before = previous.find(i => i.directory === directory), after = auxiliaries.find(i => i.directory === directory);
      return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ directory, kind: !before ? 'added' : !after ? 'removed' : 'modified', before: before ?? null, after: after ?? null }];
    }) };
  }
  return { status: findings.length ? 'FAIL' : 'PASS', findings, coverage: {registeredComponents:publicNames.size, componentDirectories:codeDirs.length, fichaDirectories:sheetDirs.length, auxiliaries:auxiliaries.length}, classifications: [...[...publicNames].sort().map(name => ({ directory: `src/components/${name}`, kind: 'public', reason: 'Registered in inventory or Figma map; consistency checked separately' })), ...auxiliaries], changes };
}

// Existence and a deliberately narrow static scope proof. No selector matching,
// runtime imports, cascade or rendered values are inferred from a name alone.
export function cssTokenClosure(root) {
  const definitions = new Map(), references = [], findings = [];
  const cssFiles = files(root, 'src',findings).filter(f => f.endsWith('.css'));
  const loaded = new Set();
  // Follow only literal relative imports from module scripts declared in index.html.
  // Aliases, dynamic loaders and conditional imports never establish availability.
  const visit = file => {
    if (loaded.has(file) || !safeStat(root,file,findings)?.isFile()) return;
    loaded.add(file);
    const body = readFileSync(path.join(root, file), 'utf8');
    const imports = [];
    if (file.endsWith('.css')) {
      // CSS ignores an @import that follows any rule other than @charset, a
      // body-less @layer statement or another @import. Such an import never
      // establishes availability, so its definitions remain pending.
      let importsAllowed = true;
      for (const node of postcss.parse(body).nodes) {
        if (node.type === 'comment') continue;
        if (node.type === 'atrule' && node.name.toLowerCase() === 'charset') continue;
        if (node.type === 'atrule' && node.name.toLowerCase() === 'layer' && node.nodes === undefined) continue;
        if (node.type === 'atrule' && node.name.toLowerCase() === 'import') {
          const nodes = valueParser(node.params).nodes.filter(n => n.type !== 'space' && n.type !== 'comment');
          if (importsAllowed && nodes.length === 1 && nodes[0].type === 'string') imports.push(nodes[0].value);
          continue;
        }
        importsAllowed = false;
      }
    }
    else imports.push(...emittedImports(body,file));
    for (const specifier of imports.filter(s => s.startsWith('.'))) {
      const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (!candidate.startsWith('src/')) continue;
      const resolved = ['', '.tsx', '.ts', '.jsx', '.js', '/index.ts', '/index.tsx'].map(s => candidate + s).find(p => existsSync(path.join(root, p)) && lstatSync(path.join(root, p)).isFile());
      if (resolved) visit(resolved);
    }
  };
  if (safeStat(root,'index.html',findings)?.isFile()) {
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const src of moduleEntries(html)) visit(src);
  }
  for (const file of cssFiles) {
    const ast = postcss.parse(readFileSync(path.join(root, file), 'utf8'), { from: file });
    ast.walkAtRules('property', rule => {
      if (rule.params.startsWith('--ds-') && rule.nodes?.some(n => n.type === 'decl' && n.prop === 'initial-value')) {
        const list = definitions.get(rule.params) || [];
        list.push({file}); definitions.set(rule.params,list);
      }
    });
    ast.walkDecls(decl => {
      if (decl.prop.startsWith('--')) {
        const list = definitions.get(decl.prop) || [];
        list.push({ file, decl }); definitions.set(decl.prop, list);
      }
      valueParser(decl.value).walk(node => {
        if (node.type !== 'function' || node.value.toLowerCase() !== 'var') return;
        const token = node.nodes.find(n => n.type !== 'space' && n.type !== 'comment')?.value;
        if (token?.startsWith('--ds-')) references.push({ token, file, line: decl.source.start.line, decl });
      });
    });
  }
  for (const file of files(root, 'src/components',findings).filter(f => /\.[jt]sx?$/.test(f))) {
    const ast = ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const walk = node => {
      const property = ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.name) ? node.name.text : ts.isComputedPropertyName(node.name) && ts.isStringLiteral(node.name.expression) ? node.name.expression.text : null);
      const setter = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'setProperty' && node.arguments.length >= 2 && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : null;
      for (const token of [property, setter]) if (typeof token === 'string' && token.startsWith('--ds-')) {
        const list = definitions.get(token) || []; list.push({file}); definitions.set(token,list);
      }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        valueParser(node.text).walk(value => {
          if (value.type !== 'function' || value.value.toLowerCase() !== 'var') return;
          const token = value.nodes.find(n => n.type !== 'space' && n.type !== 'comment')?.value;
          if (token?.startsWith('--ds-')) {
            const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
            if ((ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) && value.unclosed) findings.push({ token, file, line, status:'NOT_RUN', reason:'Dynamic template reference cannot establish the full token name' });
            else references.push({ token, file, line });
          }
        });
      }
      ts.forEachChild(node, walk);
    }; walk(ast);
  }
  const unconditional = decl => { let p = decl.parent; while (p && p.type !== 'root') { if (p.type === 'atrule') return false; p = p.parent; } return true; };
  const incompleteScan = findings.some(f=>f.code==='UNSUPPORTED_SYMLINK');
  for (const ref of references) {
    const defs = definitions.get(ref.token) || [];
    // Same-rule declarations establish local availability, including forward
    // declarations. Conditional scopes and all cross-file scopes stay pending.
    const local = defs.some(d => d.decl && d.file === ref.file && d.decl.parent === ref.decl?.parent && unconditional(d.decl));
    const global = defs.some(d => d.decl && loaded.has(d.file) && !d.file.endsWith('.module.css') && d.decl.parent.selector === ':root' && unconditional(d.decl));
    findings.push({ token: ref.token, file: ref.file, line: ref.line, status: !defs.length ? incompleteScan ? 'NOT_RUN' : 'FAIL' : local || global ? 'PASS' : 'NOT_RUN', reason: !defs.length ? incompleteScan ? 'Source inspection incomplete; no definition found in inspected files' : 'No CSS definition in src; fallback does not establish a DS token' : local ? 'Unconditional definition in the same rule (availability only)' : global ? 'Unconditional global :root definition loaded by literal entry imports (availability only)' : 'Definition exists; selector, inheritance, mode or import availability is not established' });
  }
  return { status: findings.some(f => f.status === 'FAIL') ? 'FAIL' : findings.some(f => f.status === 'NOT_RUN') ? 'NOT_RUN' : 'PASS', findings, scope: 'Static CSS in src; availability only, not cascade validity or rendered binding values. Cross-file definitions require independent verification.' };
}

export function closureConformance(root, options = {}) {
  const components = componentClosure(root, options), tokens = cssTokenClosure(root);
  const cssReferences=tokens.findings.filter(f=>f.token).length;
  const uninspectedPaths=new Set([...components.findings,...tokens.findings].filter(f=>f.code==='UNSUPPORTED_SYMLINK').map(f=>f.file)).size;
  const populated=Object.values(components.coverage).some(n=>n>0) || cssReferences>0;
  const coverage={...components.coverage,cssReferences,uninspectedPaths,status:uninspectedPaths?'PARTIAL':populated?'ASSESSED':'NOT APPLICABLE',reason:uninspectedPaths?'Some source paths were not inspected; consult the failing path findings':populated?'Consistency of the listed project artifacts only; not visual delivery or agent evaluation':'No components or CSS token references to assess; a PASS does not validate an implementation'};
  return { schemaVersion: 1, status: [components.status, tokens.status].includes('FAIL') ? 'FAIL' : tokens.status === 'NOT_RUN' ? 'NOT_RUN' : 'PASS', coverage, components, tokens };
}

export function staleSummary(warnings) {
  const groups = new Map();
  for (const warning of warnings) {
    if (!/no longer current|Measurement input changed/.test(warning)) continue;
    const component = warning.split(':')[0], file = warning.match(/Measurement input changed: (.+)$/)?.[1];
    const item = groups.get(component) || { component, count: 0, files: [], reasons: [] };
    item.count++; if (file && !item.files.includes(file)) item.files.push(file);
    if (!item.reasons.includes(warning)) item.reasons.push(warning);
    groups.set(component, item);
  }
  return [...groups.values()];
}
