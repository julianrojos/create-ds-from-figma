import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
import { projectFile, sha256 } from './render-plan.mjs';
import { localDependencies } from './local-dependencies.mjs';

const propertyName = name => name.startsWith('--') ? name : name.replace(/[A-Z]/g, c => '-' + c.toLowerCase()).replace(/^ms-/, '-ms-');

// React's numeric style serialization: lengths get px, zero and unitless properties do not.
const unitlessStyles = new Set(('animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth').split(' '));
function inlineLiteral(name, expression) {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  let sign = 1;
  if (ts.isPrefixUnaryExpression(expression) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(expression.operator)) {
    sign = expression.operator === ts.SyntaxKind.MinusToken ? -1 : 1;
    expression = expression.operand;
  }
  if (!ts.isNumericLiteral(expression)) return undefined;
  const value = sign * Number(expression.text);
  if (!Number.isFinite(value)) return undefined;
  const unprefixed = name.replace(/^(?:Webkit|Moz|ms|O)([A-Z])/, (_, first) => first.toLowerCase());
  return `${value}${value === 0 || name.startsWith('--') || unitlessStyles.has(unprefixed) ? '' : 'px'}`;
}

export function collectCssDiagnostics(root, seeds, { application = false } = {}) {
  const errors = [], warnings = [], declarations = [], files = new Set();
  if (application) {
    const base = realpathSync(root), visit = relative => {
      for (const entry of readdirSync(path.join(base, relative), { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const next = `${relative}/${entry.name}`;
        if (entry.isDirectory()) visit(next);
        else if (/\.(?:css|[cm]?[jt]sx?)$/.test(entry.name)) files.add(next);
      }
    };
    visit('src');
  } else {
    const dependencies = localDependencies(root, seeds);
    dependencies.files.forEach(f => files.add(f)); warnings.push(...dependencies.warnings);
  }
  const add = (file, line, property, value, kind, supports = []) => {
    if (property.startsWith('--') || /\b(?:var|env)\s*\(/i.test(value)) return; // Syntax support cannot establish substituted-value validity.
    const record = { file, line, property, value, kind, ...(supports.length ? { supports } : {}) };
    declarations.push({ id: sha256(JSON.stringify(record)), ...record });
  };
  for (const file of [...files].sort()) {
    if (!/\.(?:css|[cm]?[jt]sx?)$/.test(file)) continue;
    const source = readFileSync(projectFile(root, file), 'utf8');
    if (file.endsWith('.css')) {
      try {
        const tree = postcss.parse(source, { from: file });
        tree.walkDecls(d => {
          if (d.parent?.type === 'atrule' && ['font-face', 'property'].includes(d.parent.name)) return;
          if (['composes', 'compose-with'].includes(d.prop) || d.parent?.type === 'rule' && /^:(?:export|import)\b/.test(d.parent.selector)) {
            warnings.push(`${file}:${d.source.start.line}: compile-time CSS Module declaration needs transformed-style review`); return;
          }
          const supports = [];
          for (let parent = d.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && parent.name.toLowerCase() === 'supports') supports.unshift(parent.params);
          add(file, d.source.start.line, d.prop, d.value, 'css', supports);
        });
        tree.walkRules(rule => {
          const props = new Set((rule.nodes || []).filter(n => n.type === 'decl').map(n => n.prop));
          if ([...props].some(p => /^border(?:-(?:top|right|bottom|left))?-style$/.test(p))) {
            if (!props.has('border') && ![...props].some(p => /^border(?:-.*)?-color$/.test(p))) warnings.push(`${file}:${rule.source.start.line} ${rule.selector}: border color may be implicit (currentColor); decide explicitly and inspect the cascade`);
            if (!props.has('border') && ['top', 'right', 'bottom', 'left'].some(side => !props.has(`border-${side}`) && !props.has(`border-${side}-width`) && !props.has('border-width'))) warnings.push(`${file}:${rule.source.start.line} ${rule.selector}: border widths may retain initial values; decide explicitly and inspect the cascade`);
          }
        });
      } catch (error) { errors.push(`${file}: ${error.message}`); }
    } else {
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const walk = n => {
        if (ts.isJsxAttribute(n) && n.name.getText(tree) === 'style') {
          const expression = n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression;
          if (expression && ts.isObjectLiteralExpression(expression)) for (const p of expression.properties) {
            const line = tree.getLineAndCharacterOfPosition(p.getStart(tree)).line + 1;
            const value = ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? inlineLiteral(p.name.text, p.initializer) : undefined;
            if (value !== undefined) add(file, line, propertyName(p.name.text), value, 'inline');
            else warnings.push(`${file}:${line}: dynamic inline style is outside literal syntax diagnostics`);
          }
          else warnings.push(`${file}:${tree.getLineAndCharacterOfPosition(n.getStart(tree)).line + 1}: dynamic inline style needs rendered review`);
        }
        ts.forEachChild(n, walk);
      };
      walk(tree);
    }
  }
  return { schemaVersion: 1, scope: application ? 'application-source' : 'component-dependencies', declarations, errors, warnings };
}

export function compareCssDiagnostics(requirements, measurement) {
  const checks = [], results = measurement?.cssDiagnostics;
  const add = (id, status, reason, detail = {}) => checks.push({ id: `css:${id}`, status, reason, ...detail });
  for (const [index, reason] of requirements.errors.entries()) add(`parse:${index}`, 'FAIL', reason);
  if (!requirements.declarations.length) return checks;
  if (!results || results.schemaVersion !== 1 || !Array.isArray(results.results) || new Set(results.results.map(r => r?.id)).size !== results.results.length || results.results.length !== requirements.declarations.length) {
    add('coverage', 'NOT RUN', 'Exact browser CSS syntax diagnostics are missing or malformed.'); return checks;
  }
  for (const d of requirements.declarations) {
    const r = results.results.find(r => r?.id === d.id);
    if (d.supports?.length && typeof r?.applicable !== 'boolean') {
      add(d.id, 'NOT RUN', 'Feature-query applicability was not measured in this browser.', { declaration: d }); continue;
    }
    if (d.supports?.length && r.applicable === false) {
      add(d.id, 'PASS', 'Declaration is inactive under its @supports conditions in this browser; not a syntax or cross-browser validity claim.', { declaration: d }); continue;
    }
    const vendor = /^-(?:moz|webkit|ms|o)-/i.test(d.property) || /(^|[\s,(])-(?:moz|webkit|ms|o)-/i.test(d.value);
    const status = typeof r?.supported !== 'boolean' ? 'NOT RUN' : r.supported ? 'PASS' : vendor ? 'NOT COMPARABLE' : 'FAIL';
    add(d.id, status, vendor && r?.supported === false ? 'Vendor-specific declaration is unsupported in this browser; review its fallback or test the target engine, not universal CSS invalidity.' : 'Browser CSS.supports for this literal declaration; not proof of cascade or substituted token validity.', { declaration: d });
  }
  return checks;
}
