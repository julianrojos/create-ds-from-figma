import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { localDependencies } from './local-dependencies.mjs';
import { projectFile } from './render-plan.mjs';
import { inlineTokenUsage, tokenReferences } from './style-token-usage.mjs';
import { createFloatResolver, externalSerializationProblems, serializationProblems } from './serialization.mjs';

export function verifyTokenStyles(root, metadata, { dependencySession } = {}) {
  const state = JSON.parse(readFileSync(projectFile(root, 'design-system/relationships/figma-state.json'), 'utf8'));
  // inputs are audited files, not necessarily loaded by the isolated view.
  const seeds = [metadata.code.path, ...(metadata.verification?.stylesheets || [])];
  const loaded = dependencySession ? dependencySession.resolve(seeds, { runtimeOnly: true }) : localDependencies(root, seeds, { runtimeOnly: true });
  const required = new Set((metadata.tokens || []).filter(n => typeof n === 'string' && n.startsWith('--'))), defined = new Set();
  const variableIds = new Set((metadata.bindings || []).map(b => b.variableId));
  const inlineDefined = new Set(), inlineScopes = [], inlineAliases = new Map(), variables = new Map(), decisions = new Map(), references = [], cssAliases = new Map(), unknownStyles = [], uncertainInlineReferences = [], warnings = [...loaded.warnings];
  for (const [collectionId, collection] of Object.entries(state.collections || {})) {
    if (!collection.file) continue;
    const data = JSON.parse(readFileSync(projectFile(root, `design-system/tokens/${collection.file}`), 'utf8'));
    const checked = serializationProblems(collection, data, `tokens/${collection.file}`);
    warnings.push(...checked.errors.map(error => `Serialization analysis incomplete: ${error}`));
    for (const [id, css] of checked.decisions) decisions.set(id, css);
    for (const [name, variable] of Object.entries(data.variables || {})) {
      if (!variable || typeof variable.id !== 'string' || typeof variable.cssName !== 'string' || typeof variable.type !== 'string') {
        warnings.push(`tokens/${collection.file}/${name}: token identity is malformed; consumption analysis is partial`); continue;
      }
      variables.set(variable.id, { ...variable, name, file: collection.file, collectionId });
      if (variableIds.has(variable.id) && variable.cssName) {
        required.add(variable.cssName);
        for (const binding of metadata.bindings.filter(b => b.variableId === variable.id)) references.push({
          cssName: variable.cssName, kind: 'binding', variableId: variable.id,
          ...Object.fromEntries(['observation', 'node', 'figmaProperty', 'cssSelector', 'cssProperty', 'part', 'variant', 'mode'].filter(key => typeof binding[key] === 'string').map(key => [key, binding[key]])),
        });
      }
    }
  }
  const externals = metadata.externalVariables || [];
  const externalIds = new Set(externals.map(v => v.id));
  const externalDecisions = externalSerializationProblems(Object.fromEntries(Object.entries(state.externalSerialization || {}).filter(([id]) => externalIds.has(id))), externals);
  warnings.push(...externalDecisions.errors.map(error => `Serialization analysis incomplete: ${error}`));
  for (const [id, css] of externalDecisions.decisions) decisions.set(id, css);
  for (const variable of externals) {
    if (variables.has(variable.id)) continue;
    variables.set(variable.id, { ...variable, name: variable.cssName, file: 'external', origin: 'external' });
    if (variableIds.has(variable.id) && variable.cssName) {
      required.add(variable.cssName);
      for (const binding of metadata.bindings.filter(b => b.variableId === variable.id)) references.push({
        cssName: variable.cssName, kind: 'binding', variableId: variable.id, node: binding.node, figmaProperty: binding.figmaProperty,
      });
    }
  }
  const prefix = `--${state.tokenPrefix || 'ds'}-`;
  for (const file of loaded.files.filter(f => f.endsWith('.css'))) {
    const css = postcss.parse(readFileSync(projectFile(root, file), 'utf8'));
    css.walkDecls(decl => {
      if (decl.prop.startsWith('--')) defined.add(decl.prop);
      const names = tokenReferences(decl.value, '--');
      if (decl.prop.startsWith('--')) cssAliases.set(decl.prop, [...new Set([...(cssAliases.get(decl.prop) || []), ...names])]);
      else for (const cssName of names) references.push({ cssName, kind: 'css', file, line: decl.source.start.line, column: decl.source.start.column, property: decl.prop });
      valueParser(decl.value).walk(node => {
        if (node.type !== 'function' || node.value.toLowerCase() !== 'var') return;
        const name = node.nodes.find(n => n.type === 'word')?.value;
        if (name?.startsWith(prefix)) required.add(name);
      });
    });
  }
  for (const file of loaded.files.filter(f => /\.[cm]?[jt]sx?$/.test(f))) {
    const inline = inlineTokenUsage(file, readFileSync(projectFile(root, file), 'utf8'), '--');
    references.push(...inline.consumedReferences); warnings.push(...inline.warnings);
    for (const alias of inline.aliases) inlineAliases.set(alias.name, [...(inlineAliases.get(alias.name) || []), alias]);
    uncertainInlineReferences.push(...inline.uncertainReferences);
    if (inline.unknownLocations.length) unknownStyles.push({ file, locations: inline.unknownLocations });
    inline.definitions.forEach(name => inlineDefined.add(name));
    inlineScopes.push({ file, uncovered: inline.uncovered });
  }
  // An inline definition satisfies only references in its own style object; elsewhere, inheritance between elements is not modelled and stays unverified.
  for (const { file, uncovered } of inlineScopes) for (const name of new Set(uncovered.map(r => r.cssName).filter(n => n.startsWith(prefix)))) {
    if (!defined.has(name) && inlineDefined.has(name)) warnings.push(`${file}: ${name} is defined only inline in another style object; element inheritance is not verified`);
    else required.add(name);
  }
  const byName = new Map([...variables.values()].map(v => [v.cssName, v]));
  const resolveFloat = createFloatResolver({ variables, decisions });
  const consumed = new Map();
  const visit = (id, reference, trail = new Set()) => {
    if (trail.has(id) || !variables.has(id)) return;
    const variable = variables.get(id);
    if (!consumed.has(id)) consumed.set(id, new Map());
    const { aliasChain, ...origin } = reference;
    consumed.get(id).set(JSON.stringify(origin), reference);
    for (const raw of Object.values(variable.valuesByMode || {})) if (raw?.source === 'local') visit(raw.targetVariableId, reference, new Set([...trail, id]));
  };
  for (const cssName of metadata.tokens || []) if (byName.has(cssName)) references.push({ cssName, kind: 'metadata-token' });
  const follow = (name, reference, trail = new Set()) => {
    if (trail.has(name)) return;
    if (byName.has(name)) visit(byName.get(name).id, reference);
    for (const alias of cssAliases.get(name) || []) follow(alias, reference, new Set([...trail, name]));
    for (const alias of inlineAliases.get(name) || []) {
      const warning = `${alias.file}: consumption of inline alias ${name} from another style object or CSS is possible; element matching and inheritance are not verified`;
      if (!warnings.includes(warning)) warnings.push(warning);
      for (const target of alias.targets) follow(target.cssName, { ...reference, aliasChain: [...(reference.aliasChain || []), name, ...(target.aliasChain || [])] }, new Set([...trail, name]));
    }
  };
  for (const reference of references) follow(reference.cssName, reference);
  const pendingFloats = [...variables.values()].filter(v => v.type === 'FLOAT' && resolveFloat(v.id).status === 'pending').map(v => ({
    id: v.id, name: v.name, cssName: v.cssName, collectionId: v.collectionId, file: v.file,
    references: [...(consumed.get(v.id)?.values() || [])], decision: v.origin === 'external'
      ? 'Record an evidence-backed project decision { css, source } in figma-state.json.externalSerialization for this external variable ID.'
      : 'Record an evidence-backed css serialization and source in figma-state.json; alias-only variables inherit their targets.' }));
  const missing = [...required].filter(name => !defined.has(name)).sort();
  return { errors: missing.map(name => `Token ${name} has no definition in CSS loaded by the verification view`),
    warnings, required: [...required].sort(), stylesheets: loaded.files.filter(f => f.endsWith('.css')), pendingFloats,
    consumption: { status: warnings.length ? 'PARTIAL' : 'STATIC_REFERENCES', unknownStyles, uncertainInlineReferences, scope: 'Metadata bindings and reachable CSS/JSX literal styles with local aliases across recorded modes; not proof of execution. Dynamic expressions and unresolved imports remain unknown.' } };
}
