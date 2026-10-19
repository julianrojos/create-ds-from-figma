import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMutations } from './lib/mutation-runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
runMutations({ root, name: 'import-diagnostics', tests: ['.agents/checks/tests/import-diagnostics.test.mjs'],
  scope: 'Synthetic capture recovery and token-consumption guidance, not authenticity or Figma fidelity.',
  mutants: [
    ['.agents/checks/lib/token-styles.mjs', 'retain-duplicate-alias-references', 'consumed.get(id).set(JSON.stringify(origin), reference)', 'consumed.get(id).set(String(consumed.get(id).size), reference)'],
    ['.agents/checks/lib/token-styles.mjs', 'merge-distinct-reference-sites', 'consumed.get(id).set(JSON.stringify(origin), reference)', 'consumed.get(id).set(reference.kind, reference)'],
    ['.agents/checks/lib/token-styles.mjs', 'duplicate-diamond-consumption', 'consumed.get(id).set(JSON.stringify(origin), reference)', 'consumed.get(id).set(JSON.stringify(reference), reference)'],
    ['.agents/checks/lib/token-styles.mjs', 'drop-dynamic-style-locations', 'unknownStyles.push({ file, locations: inline.unknownLocations })', 'undefined'],
    ['.agents/checks/lib/token-styles.mjs', 'ignore-inline-consumption', 'references.push(...inline.consumedReferences)', 'references.push()'],
    ['.agents/checks/lib/token-styles.mjs', 'count-unused-inline-aliases', 'references.push(...inline.consumedReferences)', 'references.push(...inline.references)'],
    ['.agents/checks/lib/token-styles.mjs', 'ignore-css-consumed-inline-aliases', 'for (const alias of inlineAliases.get(name) || [])', 'for (const alias of [])'],
    ['.agents/checks/lib/style-token-usage.mjs', 'ignore-local-inline-aliases', 'consumedReferences.push(...followLocal(reference))', 'consumedReferences.push(reference)'],
    ['.agents/checks/lib/token-styles.mjs', 'ignore-alias-consumption', 'visit(raw.targetVariableId, reference, new Set([...trail, id]))', 'undefined'],
    ['.agents/checks/lib/token-styles.mjs', 'count-unused-css-aliases', "if (decl.prop.startsWith('--')) cssAliases.set", "if (false) cssAliases.set"],
    ['.agents/checks/lib/token-styles.mjs', 'inline-definition-is-global', 'inline.definitions.forEach(name => inlineDefined.add(name));', 'inline.definitions.forEach(name => { inlineDefined.add(name); defined.add(name); });'],
    ['.agents/checks/lib/token-styles.mjs', 'inline-definition-hides-absence', 'if (!defined.has(name) && inlineDefined.has(name)) warnings.push', 'if (!defined.has(name)) warnings.push'],
    ['.agents/checks/lib/style-token-usage.mjs', 'ignore-numeric-definitions', "(numeric || node.text !== '')", "(!numeric && node.text !== '')"],
    ['.agents/checks/lib/style-token-usage.mjs', 'empty-inline-definition', "(numeric || node.text !== '')", 'true'],
    ['.agents/checks/lib/style-token-usage.mjs', 'ignore-final-inline-assignment', 'scope.values.set(property.name.text, property.initializer);', 'if (!scope.values.has(property.name.text)) scope.values.set(property.name.text, property.initializer);'],
    ['.agents/checks/lib/style-token-usage.mjs', 'trust-definition-before-unknown-spread', '!scope.uncertain.has(property)', 'true'],
    ['.agents/checks/lib/style-token-usage.mjs', 'unknown-spread-proves-absence', 'if (scope.uncertain.has(reference.cssName) || scope.unknownSpread && !scope.afterUnknown.has(reference.cssName)) uncertainReferences.push(reference);', 'if (false) uncertainReferences.push(reference);'],
    ['.agents/checks/lib/style-token-usage.mjs', 'unknown-spread-cannot-supply', 'scope.unknownSpread = true;', 'scope.unknownSpread = false;'],
    ['.agents/checks/lib/style-token-usage.mjs', 'unknown-spread-hides-explicit-clearing', '!scope.afterUnknown.has(reference.cssName)', 'true'],
    ['.agents/checks/lib/style-token-usage.mjs', 'ignore-lexical-binding', 'const declarations = checker.getSymbolAtLocation(node)?.declarations || [];', 'const declarations = tree.statements.filter(ts.isVariableStatement).flatMap(s => s.declarationList.declarations).filter(d => ts.isIdentifier(d.name) && d.name.text === node.text);'],
    ['.agents/checks/lib/style-token-usage.mjs', 'hide-uncertain-definition-warning', 'if (uncertainReferences.length) warnings.push', 'if (false) warnings.push'],
    ['.agents/checks/lib/style-token-usage.mjs', 'boolean-defines-property', 'node = unwrap(node);\n    const numeric', 'node = unwrap(node);\n    if (node.kind === ts.SyntaxKind.TrueKeyword && property.startsWith(\'--\')) scope.defined.add(property);\n    const numeric'],
    ['.agents/checks/lib/style-token-usage.mjs', 'dynamic-definition-proves-absence', "if (property.startsWith('--')) scope.uncertain.add(property);", 'undefined;'],
    ['.agents/checks/lib/style-token-usage.mjs', 'ignore-transparent-value-wrappers', 'node = unwrap(node);\n    const numeric', 'const numeric'],
    ['.agents/checks/lib/style-token-usage.mjs', 'unproven-definition-shadows-global', 'return scope.defined.has(reference.cssName) ? targets : [reference, ...targets];', 'return targets;'],
    ['.agents/checks/lib/import-diagnostics.mjs', 'hide-capture-recovery', 'if (record.capture) nextActions.push', 'if (false) nextActions.push'],
    ['.agents/checks/lib/figma-evidence.mjs', 'misclassify-empty-capture', "empty ? 'EMPTY' : incompatible", "empty ? 'CORRUPT' : incompatible"],
    ['.agents/checks/lib/import-diagnostics.mjs', 'hide-unknown-consumption', "consumption: { status: 'UNKNOWN' }", "consumption: { status: 'STATIC_REFERENCES' }"],
  ],
});
