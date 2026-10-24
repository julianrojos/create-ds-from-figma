import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMutations } from './lib/mutation-runner.mjs';

const inventory = '.agents/checks/lib/variable-inventory.mjs';
const tokens = '.agents/checks/lib/inventory-tokens.mjs';
const nested = '.agents/checks/lib/nested-inventory.mjs';
const collector = '.agents/skills/create-ds-from-figma/scripts/lib/capture-inventory.mjs';
runMutations({
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), name: 'inventory',
  scope: 'Targeted inventory, token preservation and nested-identity regressions; not exhaustive mutation coverage or live Figma validation.',
  tests: ['.agents/checks/tests/variable-inventory.test.mjs', '.agents/checks/tests/figma-reference.test.mjs', '.agents/checks/tests/tokens-css.test.mjs'],
  mutants: [
    ['.agents/checks/lib/tokens-css.mjs', 'ignore-external-float-decision', 'const css = externalDecisions.decisions.get(variable.id);', 'const css = undefined;'],
    ['.agents/checks/lib/tokens-css.mjs', 'default-external-float-to-px', 'const css = externalDecisions.decisions.get(variable.id);', 'const css = externalDecisions.decisions.get(variable.id) || { kind: "unit", unit: "px" };'],
    ['.agents/checks/lib/serialization.mjs', 'ignore-unknown-external-decision', 'return serializationProblems({ serialization: entries === undefined ? {} : entries }, { variables },', 'return serializationProblems({ serialization: {} }, { variables },'],
    [inventory, 'ignore-explicit-alias-mode', ': selected ? [resolve(target, selected.modeId, next)]', ': false ? [resolve(target, selected.modeId, next)]'],
    [tokens, 'discard-alias-mode-decision', 'next.aliasModes = { ...state.aliasModes, ...aliasModes };', 'next.aliasModes = {};'],
    [collector, 'unordered-variable-ids', 'variableIds: [...c.variableIds].sort()', 'variableIds: [...c.variableIds]'],
    [inventory, 'accept-non-object-envelope', "if (!object(envelope)) fail('envelope must be an object');", ''],
    [inventory, 'accept-unknown-envelope-fields', 'if (Object.keys(envelope).length !== envelopeFields.length || !envelopeFields.every(key => Object.hasOwn(envelope, key)))', 'if (false)'],
    [inventory, 'accept-invalid-capture-date', "return Number.isFinite(time) && new Date(time).toISOString() === value;", 'return true;'],
    [inventory, 'accept-noncanonical-capture-date', 'new Date(time).toISOString() === value', 'true'],
    [inventory, 'accept-wrong-inventory-hash', 'envelope.hash !== expected.hash', 'false'],
    [inventory, 'accept-wrong-file-origin', 'if (fileKey !== undefined && fileKey !== expected.inventory.source.fileKey)', 'if (false)'],
    [inventory, 'accept-missing-variable-mode', 'if (canonicalJson(Object.keys(v.valuesByMode).sort()) !== canonicalJson(c.modes.map(m => m.modeId).sort()))', 'if (false)'],
    [inventory, 'accept-omitted-local-variable', 'if (c.variableIds.some(id => !variables.has(id) || variables.get(id).collectionId !== c.id))', 'if (false)'],
    [inventory, 'accept-invalid-alias-target', 'if (!target || target.type !== v.type)', 'if (false)'],
    [inventory, 'invent-local-alias-provenance', "source: variables.get(raw.id).remote ? 'external' : 'local'", "source: 'local'"],
    [inventory, 'guess-cross-collection-mode', 'if (new Set(candidates.map(canonicalJson)).size !== 1)', 'if (false)'],
    [collector, 'omit-unused-local-variable', 'const locals = await figma.variables.getLocalVariablesAsync();', "const locals = (await figma.variables.getLocalVariablesAsync()).filter(v => v.id !== 'size');"],
    [tokens, 'discard-serialization-decision', 'serialization: previous.serialization || {}', 'serialization: {}'],
    [tokens, 'discard-mode-scope', 'scopes[m] ?? null', 'null'],
    [tokens, 'discard-retained-variable', 'filter(([, v]) => !incomingIds.has(v.id))', 'filter(() => false)'],
    [tokens, 'discard-retained-collection', 'Object.assign(Object.create(null), next.collections)', 'Object.create(null)'],
    [tokens, 'rename-published-css-name', 'cssName: preflight.variables[v.id]', "cssName: preflight.variables[v.id].replace('published', 'reset')"],
    [tokens, 'overwrite-changed-plan-input', 'if (!Object.hasOwn(plan.expected || {}, relative) || (existing === null ? null : sha256(existing)) !== plan.expected[relative])', 'if (false)'],
    [nested, 'invent-missing-identity', "!identityKnown || matches.length > 1 ? 'unresolved'", "!identityKnown || matches.length > 1 ? 'missing'"],
    [nested, 'ignore-ambiguous-mappings', '!identityKnown || matches.length > 1', '!identityKnown || matches.length > 100'],
    [nested, 'match-by-name-not-stable-ref', 'entryRefs(key, entry).includes(ref)', 'entry.name === node.name'],
    [nested, 'read-noncanonical-map-refs', 'entryRefs(key, entry)', '(Array.isArray(entry.refs) ? entry.refs : [])'],
    [nested, 'classify-remote-as-local-missing', ": main.remote ? 'external' : 'missing'", ": main.remote ? 'missing' : 'missing'"],
    [nested, 'ignore-nested-snapshot-hash', 'if (snapshot?.hash !== sealCapture(snapshot.capture).hash)', 'if (false)'],
  ],
});
