import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { localDependencies } from './local-dependencies.mjs';
import { projectFile } from './render-plan.mjs';

export function verifyTokenStyles(root, metadata, { dependencySession } = {}) {
  const state = JSON.parse(readFileSync(projectFile(root, 'design-system/relationships/figma-state.json'), 'utf8'));
  // inputs are audited files, not necessarily loaded by the isolated view.
  const seeds = [metadata.code.path, ...(metadata.verification?.stylesheets || [])];
  const loaded = dependencySession ? dependencySession.resolve(seeds, { runtimeOnly: true }) : localDependencies(root, seeds, { runtimeOnly: true });
  const required = new Set((metadata.tokens || []).filter(n => typeof n === 'string' && n.startsWith('--'))), defined = new Set();
  const variableIds = new Set((metadata.bindings || []).map(b => b.variableId));
  for (const collection of Object.values(state.collections || {})) {
    if (!collection.file) continue;
    const data = JSON.parse(readFileSync(projectFile(root, `design-system/tokens/${collection.file}`), 'utf8'));
    for (const variable of Object.values(data.variables || {})) if (variableIds.has(variable.id) && variable.cssName) required.add(variable.cssName);
  }
  for (const variable of metadata.externalVariables || []) if (variableIds.has(variable.id) && variable.cssName) required.add(variable.cssName);
  const prefix = `--${state.tokenPrefix || 'ds'}-`;
  for (const file of loaded.files.filter(f => f.endsWith('.css'))) {
    const css = postcss.parse(readFileSync(projectFile(root, file), 'utf8'));
    css.walkDecls(decl => {
      if (decl.prop.startsWith('--')) defined.add(decl.prop);
      valueParser(decl.value).walk(node => {
        if (node.type !== 'function' || node.value.toLowerCase() !== 'var') return;
        const name = node.nodes.find(n => n.type === 'word')?.value;
        if (name?.startsWith(prefix)) required.add(name);
      });
    });
  }
  const missing = [...required].filter(name => !defined.has(name)).sort();
  return { errors: missing.map(name => `Token ${name} has no definition in CSS loaded by the verification view`),
    warnings: loaded.warnings, required: [...required].sort(), stylesheets: loaded.files.filter(f => f.endsWith('.css')) };
}
