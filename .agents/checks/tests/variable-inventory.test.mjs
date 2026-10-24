import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { captureInventory } from '../../skills/create-ds-from-figma/scripts/lib/capture-inventory.mjs';
import { inventoryCode, sessionInventory } from '../../skills/create-ds-from-figma/scripts/figma-inventory.mjs';
import { inventoryMock } from './fixtures/variable-inventory.mjs';
import { inventoryCollections, inventoryTokenCollections, readInventory, sealInventory } from '../lib/variable-inventory.mjs';
import { planInventoryTokens, saveInventoryTokens, tokenInventoryComparison } from '../lib/inventory-tokens.mjs';
import { generateTokensCss } from '../lib/tokens-css.mjs';
import { assembleChunks } from '../../skills/create-ds-from-figma/scripts/lib/capture-code.mjs';
import { preanalyze } from '../../skills/create-ds-from-figma/scripts/figma-preanalysis.mjs';
const script = name => path.resolve(`.agents/skills/create-ds-from-figma/scripts/${name}.mjs`);
const invoke = (name, args, options = {}) => spawnSync(process.execPath, [script(name), ...args], { encoding: 'utf8', ...options });
const temporary = t => { const root = mkdtempSync(path.join(os.tmpdir(), 'inventory-test-')); t.after(() => rmSync(root, { recursive: true, force: true })); return root; };
async function fixture(t) {
  const root = temporary(t), raw = await captureInventory(inventoryMock(), { fileKey: 'FILE' });
  const file = path.join(root, 'inventory.json'); writeFileSync(file, JSON.stringify(sealInventory(raw)));
  return { root, file, raw };
}

test('inventory captures all locals, unused variables, every mode and only referenced remote dependencies', async () => {
  const raw = await captureInventory(inventoryMock(), { fileKey: 'FILE' });
  assert.deepEqual(raw.variables.filter(v => !v.remote).map(v => v.id).sort(), ['alias', 'base', 'external-alias', 'size']);
  const sealed = sealInventory(raw);
  assert.equal(sealed.inventory.variables.length, 5); assert.equal(inventoryCollections(raw)[0].variables.length, 4);
  assert.equal(sealed.inventory.collections.length, 2);
  const reverse = structuredClone(raw); reverse.variables.reverse(); reverse.collections.reverse(); reverse.collections[0].variableIds.reverse();
  assert.equal(sealInventory(reverse, '2020-01-01T00:00:00.000Z').hash, sealed.hash);
  reverse.collections.find(c => c.id === 'C').modes.reverse(); assert.notEqual(sealInventory(reverse).hash, sealed.hash);
});

test('inventory rejects wrong identity, API failures and omitted local alias targets', async () => {
  await assert.rejects(captureInventory(inventoryMock(), { fileKey: 'OTHER' }), /identity/);
  const mock = inventoryMock(), local = await mock.variables.getLocalVariablesAsync();
  mock.variables.getLocalVariablesAsync = async () => local.filter(v => v.id !== 'base');
  await assert.rejects(captureInventory(mock, { fileKey: 'FILE' }), /Local variable omitted/);
  mock.variables.getLocalVariablesAsync = async () => { throw new Error('Denied'); };
  await assert.rejects(captureInventory(mock, { fileKey: 'FILE' }), /Denied/);
  const duplicate = inventoryMock(), all = await duplicate.variables.getLocalVariablesAsync();
  duplicate.variables.getLocalVariablesAsync = async () => [...all, all[0]];
  await assert.rejects(captureInventory(duplicate, { fileKey: 'FILE' }), /duplicate/);
  const wrong = inventoryMock(); wrong.variables.getVariableByIdAsync = async () => ({ ...all[0], id: 'not-the-requested-id', remote: true });
  await assert.rejects(captureInventory(wrong, { fileKey: 'FILE' }), /identity differs/);
});

test('inventory schema rejects incomplete graph, modes, duplicate IDs/names, foreign collections and invalid typed values', async () => {
  const raw = await captureInventory(inventoryMock(), { fileKey: 'FILE' });
  // These mutations address named fixture records, independently of transport ordering.
  raw.variables.sort((a, b) => ['base', 'alias', 'size', 'external-alias', 'remote'].indexOf(a.id) - ['base', 'alias', 'size', 'external-alias', 'remote'].indexOf(b.id));
  for (const mutate of [d => d.variables.pop(), d => d.variables.push(d.variables[0]), d => d.collections.push(d.collections[0]),
    d => delete d.variables[0].valuesByMode.dark, d => d.variables[0].valuesByMode.extra = 1, d => d.variables[0].collectionId = 'missing',
    d => d.variables[0].valuesByMode.light.r = 4, d => d.variables[2].valuesByMode.light = Infinity,
    d => d.collections[0].defaultModeId = 'missing', d => d.collections[0].variableIds.push('omitted'), d => d.variables[1].name = d.variables[0].name,
    d => d.variables[1].valuesByMode.light.id = 'unknown', d => d.variables[2].remote = true]) {
    const bad = structuredClone(raw); mutate(bad); assert.throws(() => sealInventory(bad), /Variable inventory:/);
  }
});

test('inventory transport is invariant to unordered API lists, but preserves mode order', async () => {
  const mock = inventoryMock(), before = await captureInventory(mock, { fileKey: 'FILE' });
  const locals = await mock.variables.getLocalVariablesAsync(), collections = await mock.variables.getLocalVariableCollectionsAsync();
  locals.reverse(); collections.forEach(c => c.variableIds.reverse());
  mock.variables.getLocalVariablesAsync = async () => locals;
  assert.deepEqual(await captureInventory(mock, { fileKey: 'FILE' }), before);
  collections[0].modes.reverse();
  assert.notDeepEqual(await captureInventory(mock, { fileKey: 'FILE' }), before);
});

async function themedInventory() {
  const raw = await captureInventory(inventoryMock(), { fileKey: 'FILE' });
  raw.collections.push({ id: 'T', name: 'Theme', remote: false, defaultModeId: 'slate', modes: [{ modeId: 'slate', name: 'Slate' }, { modeId: 'other', name: 'Other' }], variableIds: ['hue'] });
  raw.variables.push({ id: 'hue', name: 'hue', remote: false, collectionId: 'T', type: 'COLOR', scopes: ['ALL_SCOPES'], valuesByMode: { slate: { r: 1, g: 0, b: 0, a: 1 }, other: { r: 0, g: 0, b: 1, a: 1 } } });
  raw.variables.find(v => v.id === 'alias').valuesByMode = { light: { type: 'VARIABLE_ALIAS', id: 'hue' }, dark: { type: 'VARIABLE_ALIAS', id: 'hue' } };
  return raw;
}

test('explicit local alias modes resolve only cross-collection values without changing captured facts or same-collection modes', async () => {
  const raw = await themedInventory(), before = structuredClone(raw);
  assert.throws(() => inventoryTokenCollections(raw), /unrecorded mode/);
  const selected = inventoryTokenCollections(raw, { T: 'Slate' });
  assert.equal(selected.find(c => c.id === 'C').variables.alias.valuesByMode.Dark.value, '#FF0000');
  assert.equal(selected.find(c => c.id === 'C').variables.size.valuesByMode.Dark, 14);
  assert.equal(selected.find(c => c.id === 'T').variables.hue.valuesByMode.Other, '#0000FF');
  assert.equal(inventoryTokenCollections(raw, { T: 'Other' }).find(c => c.id === 'C').variables.alias.valuesByMode.Light.value, '#0000FF');
  assert.deepEqual(raw, before);
  for (const modes of [null, [], { T: 'missing' }, { missing: 'Slate' }, { T: 1 }, { R: 'Base' }]) assert.throws(() => inventoryTokenCollections(raw, modes), /alias mode|aliasModes/);
  raw.variables.find(v => v.id === 'hue').valuesByMode.slate = { type: 'VARIABLE_ALIAS', id: 'alias' };
  assert.throws(() => inventoryTokenCollections(raw, { T: 'Slate' }), /cycle/);
});

test('alias choices are saved, revalidated and cannot be silently replaced; CLI check uses stored decisions', async t => {
  const root = temporary(t), file = path.join(root, 'inventory.json'), modes = path.join(root, 'modes.json');
  writeFileSync(file, JSON.stringify(sealInventory(await themedInventory())));
  writeFileSync(modes, JSON.stringify({ T: 'Slate' }));
  const planned = invoke('generate-token-json', ['plan', root, '--inventory', file, '--alias-modes', modes]);
  assert.equal(planned.status, 0, planned.stderr); assert.equal(existsSync(path.join(root, 'design-system')), false);
  const plan = planInventoryTokens(root, file, { aliasModes: { T: 'Slate' } }); saveInventoryTokens(root, plan);
  const stateFile = path.join(root, 'design-system/relationships/figma-state.json'), state = JSON.parse(readFileSync(stateFile));
  assert.deepEqual(state.aliasModes, { T: 'Slate' });
  assert.equal(tokenInventoryComparison(root, readInventory(file)).status, 'PASS');
  assert.deepEqual(planInventoryTokens(root, file).outputs, plan.outputs);
  assert.match(generateTokensCss(root).css, /--ds-color-alias: var\(--ds-theme-hue\)/);
  assert.throws(() => planInventoryTokens(root, file, { aliasModes: { T: 'Other' } }), /migration/);
  assert.equal(invoke('generate-token-json', ['check', root, '--inventory', file]).status, 0);
  assert.equal(invoke('generate-token-json', ['check', root, '--inventory', file, '--alias-modes', modes]).status, 1);
  state.aliasModes.T = 'Other'; writeFileSync(stateFile, JSON.stringify(state));
  assert.equal(tokenInventoryComparison(root, readInventory(file)).status, 'FAIL');
  state.aliasModes.T = 'missing'; writeFileSync(stateFile, JSON.stringify(state));
  assert.throws(() => tokenInventoryComparison(root, readInventory(file)), /alias mode/);
});

test('seal verifies hash, provenance, canonical representation and capture date', async t => {
  const { file, raw } = await fixture(t);
  assert.equal(readInventory(file, 'FILE').hash, sealInventory(raw).hash);
  assert.throws(() => readInventory(file, 'OTHER'), /origin/);
  const data = JSON.parse(readFileSync(file)); data.inventory.variables[0].name = 'changed'; writeFileSync(file, JSON.stringify(data));
  assert.throws(() => readInventory(file), /hash/); assert.throws(() => sealInventory(raw, 'no-date'), /date/);
});

test('inventory reader rejects missing or unknown envelope fields and malformed envelope roots', async t => {
  const { file, raw } = await fixture(t), valid = sealInventory(raw);
  const malformed = [null, [], true, 0, 'inventory', { ...valid, extra: true }, { ...valid, _comment: 'unknown' },
    { ...valid, schemaVersion: '1' }, { ...valid, hash: null }, { ...valid, hash: 'g'.repeat(64) }];
  for (const field of ['schemaVersion', 'capturedAt', 'hash', 'inventory']) {
    const missing = structuredClone(valid); delete missing[field]; malformed.push(missing);
  }
  for (const envelope of malformed) {
    writeFileSync(file, JSON.stringify(envelope));
    assert.throws(() => readInventory(file), /^Error: Variable inventory:/);
  }
});

test('reader and sealer require canonical ISO UTC dates without coercion or calendar normalization', async t => {
  const { file, raw } = await fixture(t), valid = sealInventory(raw);
  for (const capturedAt of [null, 0, true, false, {}, [], '', 'no-date', '2024-01-01',
    '2024-01-01T00:00:00Z', '2024-01-01T00:00:00.000+00:00', '2024-02-30T00:00:00.000Z', '2023-02-29T00:00:00.000Z']) {
    writeFileSync(file, JSON.stringify({ ...valid, capturedAt }));
    assert.throws(() => readInventory(file), /Variable inventory: invalid capture date/);
    assert.throws(() => sealInventory(raw, capturedAt), /Variable inventory: invalid capture date/);
  }
});

test('sealer supplies the default timestamp only when creating; valid timestamps do not affect the inventory hash', async t => {
  const { file, raw } = await fixture(t), valid = sealInventory(raw);
  assert.equal(new Date(valid.capturedAt).toISOString(), valid.capturedAt);
  for (const capturedAt of ['2024-02-29T23:59:59.123Z', '+010000-01-01T00:00:00.000Z']) {
    const envelope = sealInventory(raw, capturedAt); assert.equal(envelope.hash, valid.hash);
    writeFileSync(file, JSON.stringify(envelope)); assert.deepEqual(readInventory(file), envelope);
  }
});

test('generated Plugin code transfers exact data in full or checked chunks without model transcription', async () => {
  const mock = inventoryMock(), AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const full = await new AsyncFunction('figma', inventoryCode('FILE', 0, null))(mock);
  assert.deepEqual(assembleChunks([full]), await captureInventory(mock, { fileKey: 'FILE' }));
  const chunks = [];
  for (let offset = 0; offset < full.total; offset += 500) chunks.push(await new AsyncFunction('figma', inventoryCode('FILE', offset, 500))(mock));
  assert.deepEqual(assembleChunks(chunks), assembleChunks([full])); chunks[0].payload += 'x'; assert.throws(() => assembleChunks(chunks));
  for (const args of [['bad/key'], ['FILE', -1], ['FILE', 1, null]]) assert.throws(() => inventoryCode(...args));
});

test('token conversion preserves types, alpha, mode identity and aliases; refuses cycles and ambiguous remote modes', async () => {
  const raw = await captureInventory(inventoryMock(), { fileKey: 'FILE' });
  const c = inventoryTokenCollections(raw)[0];
  assert.equal(c.variables.base.valuesByMode.Light, '#FF000080'); assert.equal(c.variables.size.valuesByMode.Light, 12);
  assert.deepEqual(c.variables.alias.valuesByMode.Dark, { targetVariableId: 'base', source: 'local', value: '#000000' });
  assert.deepEqual(c.variables['external-alias'].valuesByMode.Light, { targetVariableId: 'remote', source: 'external', value: 'Inter' });
  const cycle = structuredClone(raw); cycle.variables[0].valuesByMode.light = { type: 'VARIABLE_ALIAS', id: 'alias' };
  assert.throws(() => inventoryTokenCollections(cycle), /cycle/);
  const remote = raw.collections.find(c => c.remote); remote.modes.push({ modeId: 'other', name: 'Other' });
  raw.variables.find(v => v.remote).valuesByMode.other = 'Another';
  assert.throws(() => inventoryTokenCollections(raw), /unrecorded mode/);
});

test('preflight accepts explicit inventory without stdin and rejects wrong project origin and flags', async t => {
  const { root, file } = await fixture(t);
  const result = invoke('preflight-token-files', [root, '--inventory', file]);
  assert.equal(result.status, 0, result.stderr); const plan = JSON.parse(result.stdout);
  assert.equal(plan.inventory.hash, readInventory(file).hash); assert.equal(plan.tokenPrefix.value, 'ds');
  assert.ok(plan.variables.base); assert.equal(Object.keys(plan.variables).length, 4);
  for (const flags of [['--inventory'], ['--unknown', file], ['--inventory', file, '--inventory', file]]) assert.equal(invoke('preflight-token-files', [root, ...flags]).status, 1);
  const statePath = path.join(root, 'design-system/relationships/figma-state.json');
  mkdirSync(path.dirname(statePath), { recursive: true });
  const originalState = JSON.stringify({ fileKey: 'OTHER_PROJECT_FILE' });
  writeFileSync(statePath, originalState);
  const mismatch = invoke('preflight-token-files', [root, '--inventory', file]);
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /Inventory file origin "FILE" differs from project file origin "OTHER_PROJECT_FILE"/);
  assert.match(mismatch.stderr, /single source Figma file/);
  assert.match(mismatch.stderr, /intended branch and project/);
  assert.match(mismatch.stderr, /do not manually change fileKey/);
  assert.doesNotMatch(mismatch.stderr, /uncommitted|previous import/i);
  assert.equal(readFileSync(statePath, 'utf8'), originalState);
});

test('token JSON planning is read-only; explicit save writes facts, leaves mode/serialization decisions pending and validates inventory', async t => {
  const { root, file } = await fixture(t), plan = planInventoryTokens(root, file);
  assert.equal(existsSync(path.join(root, 'design-system')), false);
  assert.equal(plan.outputs['design-system/tokens/Color.json'].includes('--ds-color-base'), true);
  saveInventoryTokens(root, plan);
  const state = JSON.parse(readFileSync(path.join(root, 'design-system/relationships/figma-state.json')));
  assert.deepEqual(state.collections.C.modeScopes, { Dark: null }); assert.deepEqual(state.collections.C.serialization, {});
  assert.equal(tokenInventoryComparison(root, readInventory(file)).status, 'PASS');
  const css = generateTokensCss(root); assert.deepEqual(css.errors, []); assert.match(css.css, /--ds-color-base: #FF000080/); assert.doesNotMatch(css.css, /--ds-color-size:/);
  assert.deepEqual(planInventoryTokens(root, file).outputs, plan.outputs);
  const tokenFile = path.join(root, 'design-system/tokens/Color.json'), tokens = JSON.parse(readFileSync(tokenFile));
  tokens.variables.alias.valuesByMode.Light.alias = 'base'; writeFileSync(tokenFile, JSON.stringify(tokens));
  assert.equal(tokenInventoryComparison(root, readInventory(file)).status, 'PASS', 'Optional alias labels do not change target/value facts');
});

test('inventory comparison reports missing facts together and the CLI preserves the structured failure', async t => {
  const { root, file } = await fixture(t); saveInventoryTokens(root, planInventoryTokens(root, file));
  const tokenFile = path.join(root, 'design-system/tokens/Color.json'), tokens = JSON.parse(readFileSync(tokenFile));
  delete tokens.modes; delete tokens.variables.base; delete tokens.variables.size.scopes;
  delete tokens.variables.alias.valuesByMode.Light.targetVariableId;
  writeFileSync(tokenFile, JSON.stringify(tokens));
  const result = tokenInventoryComparison(root, readInventory(file));
  assert.equal(result.status, 'FAIL');
  for (const diagnostic of ['C: modes differs from inventory', 'C/base: missing variable base',
    'C/size: scopes differs from inventory', 'C/alias: valuesByMode differs from inventory']) assert.ok(result.errors.includes(diagnostic), JSON.stringify(result.errors));
  const cli = invoke('generate-token-json', ['check', root, '--inventory', file]);
  assert.equal(cli.status, 1); assert.equal(cli.stderr, ''); assert.deepEqual(JSON.parse(cli.stdout), result);
  assert.equal(readFileSync(tokenFile, 'utf8'), JSON.stringify(tokens), 'Comparison never repairs incomplete facts');
});

test('inventory comparison diagnoses malformed token objects without throwing or hiding other facts', async t => {
  const { root, file } = await fixture(t); saveInventoryTokens(root, planInventoryTokens(root, file));
  const tokenFile = path.join(root, 'design-system/tokens/Color.json'), original = JSON.parse(readFileSync(tokenFile));
  for (const data of [null, [], true, { ...original, variables: null }, { ...original, variables: [] },
    { ...original, variables: { ...original.variables, base: null, retained: null } },
    { ...original, variables: { ...original.variables, alias: { ...original.variables.alias, valuesByMode: [] } } }]) {
    writeFileSync(tokenFile, JSON.stringify(data));
    const result = tokenInventoryComparison(root, readInventory(file));
    assert.equal(result.status, 'FAIL'); assert.ok(result.errors.some(error => error.includes('C')));
    assert.doesNotMatch(result.errors.join('\n'), /non-JSON/);
  }
});

test('generation preserves published cssName, scopes, serialization, omitted variables and collection records', async t => {
  const { root, file, raw } = await fixture(t); saveInventoryTokens(root, planInventoryTokens(root, file));
  const stateFile = path.join(root, 'design-system/relationships/figma-state.json'), tokensFile = path.join(root, 'design-system/tokens/Color.json');
  const state = JSON.parse(readFileSync(stateFile)), tokens = JSON.parse(readFileSync(tokensFile));
  state.collections.C.modeScopes.Dark = { kind: 'selector', value: '[data-theme="dark"]' };
  state.collections.C.serialization.size = { css: { kind: 'unit', unit: 'px' }, source: { type: 'user' } };
  tokens.variables.base.cssName = '--ds-published-red'; writeFileSync(tokensFile, JSON.stringify(tokens)); writeFileSync(stateFile, JSON.stringify(state));
  raw.variables = raw.variables.filter(v => v.id !== 'size'); raw.collections[0].variableIds = raw.collections[0].variableIds.filter(id => id !== 'size');
  raw.variables.find(v => v.id === 'base').name = 'Renamed'; writeFileSync(file, JSON.stringify(sealInventory(raw)));
  let plan; assert.doesNotThrow(() => { plan = planInventoryTokens(root, file); }); saveInventoryTokens(root, plan);
  const actual = JSON.parse(readFileSync(tokensFile)); assert.equal(actual.variables.Renamed.cssName, '--ds-published-red'); assert.ok(actual.variables.size);
  const next = JSON.parse(readFileSync(stateFile)); assert.deepEqual(next.collections.C.serialization, state.collections.C.serialization); assert.deepEqual(next.collections.C.modeScopes, state.collections.C.modeScopes);
  assert.equal(tokenInventoryComparison(root, readInventory(file)).retainedVariables[0].id, 'size');
});

test('invalid inventories and retained name conflicts do not write project files', async t => {
  const { root, file, raw } = await fixture(t); saveInventoryTokens(root, planInventoryTokens(root, file));
  const before = readFileSync(path.join(root, 'design-system/tokens/Color.json'));
  raw.variables = raw.variables.filter(v => v.id !== 'size'); raw.collections[0].variableIds = raw.collections[0].variableIds.filter(id => id !== 'size'); raw.variables[0].name = 'size';
  writeFileSync(file, JSON.stringify(sealInventory(raw))); assert.throws(() => planInventoryTokens(root, file), /collision/);
  assert.deepEqual(readFileSync(path.join(root, 'design-system/tokens/Color.json')), before);
});

test('collections absent from the next inventory remain registered with their original files and decisions', async t => {
  const { root, file, raw } = await fixture(t);
  raw.collections.push({ id: 'OLD', name: 'Retained', remote: false, defaultModeId: 'base', modes: [{ modeId: 'base', name: 'Base' }], variableIds: ['flag'] });
  raw.variables.push({ id: 'flag', name: 'flag', remote: false, collectionId: 'OLD', type: 'BOOLEAN', scopes: ['ALL_SCOPES'], valuesByMode: { base: true } });
  writeFileSync(file, JSON.stringify(sealInventory(raw))); saveInventoryTokens(root, planInventoryTokens(root, file));
  const stateFile = path.join(root, 'design-system/relationships/figma-state.json'), before = JSON.parse(readFileSync(stateFile));
  const retainedFile = path.join(root, 'design-system/tokens/Retained.json'), retainedBytes = readFileSync(retainedFile);
  raw.collections = raw.collections.filter(c => c.id !== 'OLD'); raw.variables = raw.variables.filter(v => v.id !== 'flag');
  writeFileSync(file, JSON.stringify(sealInventory(raw)));
  let plan; assert.doesNotThrow(() => { plan = planInventoryTokens(root, file); }); saveInventoryTokens(root, plan);
  const after = JSON.parse(readFileSync(stateFile));
  assert.deepEqual(after.collections.OLD, before.collections.OLD); assert.deepEqual(after.variables.OLD, before.variables.OLD);
  assert.deepEqual(readFileSync(retainedFile), retainedBytes); assert.deepEqual(tokenInventoryComparison(root, readInventory(file)).retainedCollections, ['OLD']);
});

test('token output refuses project-escaping directory links before writing outside', async t => {
  const { root, file } = await fixture(t), outside = temporary(t), plan = planInventoryTokens(root, file);
  symlinkSync(outside, path.join(root, 'design-system'), 'dir');
  assert.throws(() => saveInventoryTokens(root, plan), /inside project/); assert.equal(existsSync(path.join(outside, 'tokens')), false);
});

test('inventory CLI stages and saves immutable sessions and requires connection approval before opening config', async t => {
  const root = temporary(t), mock = inventoryMock(), AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const chunk = await new AsyncFunction('figma', inventoryCode('FILE'))(mock);
  assert.equal(invoke('figma-inventory', ['stage', root], { input: JSON.stringify(chunk) }).status, 0);
  assert.equal(invoke('figma-inventory', ['stage', root], { input: JSON.stringify(chunk) }).status, 1);
  const output = path.join(root, 'sealed.json'); assert.equal(invoke('figma-inventory', ['save', root, output]).status, 0);
  assert.equal(sessionInventory(root).hash, readInventory(output).hash);
  assert.equal(invoke('figma-inventory', ['save', root, output]).status, 0);
  const denied = invoke('figma-inventory', ['capture', 'FILE', '/missing/config']); assert.equal(denied.status, 1); assert.doesNotMatch(denied.stderr, /ENOENT/);
});

test('explicit inventory checks block changed token facts without writing CSS; no inventory makes no provenance claim', async t => {
  const { root, file } = await fixture(t); saveInventoryTokens(root, planInventoryTokens(root, file));
  let r = invoke('generate-tokens-css', [root, '--inventory', file]); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Observed local facts/);
  const css = path.join(root, 'src/styles/tokens.css'), before = readFileSync(css), tokens = path.join(root, 'design-system/tokens/Color.json');
  const data = JSON.parse(readFileSync(tokens)); data.variables.base.valuesByMode.Light = '#FFFFFF'; writeFileSync(tokens, JSON.stringify(data));
  r = invoke('generate-tokens-css', [root, '--inventory', file]); assert.equal(r.status, 1); assert.deepEqual(readFileSync(css), before);
  r = invoke('generate-tokens-css', [root]); assert.equal(r.status, 0, r.stderr); assert.doesNotMatch(r.stdout, /inventory/);
});

test('actual stdio MCP inventory CLI captures all values without editor globals', t => {
  const root = temporary(t), config = path.join(root, 'connection.json');
  writeFileSync(config, JSON.stringify({ transport: { type: 'stdio', command: process.execPath, args: [path.resolve('.agents/checks/tests/fixtures/capture-mcp-server.mjs'), 'inventory'] },
    tool: { name: 'execute_design', codeArgument: 'javascript', fileKeyArgument: 'designFile' }, chunkSize: 500 }));
  const result = invoke('figma-inventory', ['capture', 'FILE', config, '--approve-connection']);
  assert.equal(result.status, 0, result.stderr); const response = JSON.parse(result.stdout);
  try { assert.ok(response.chunks > 1); assert.equal(sessionInventory(response.directory).hash, response.hash); }
  finally { rmSync(response.directory, { recursive: true, force: true }); }
});

test('versioned synthetic inventory is reproducible from the mock and replayable offline', async t => {
  const file = path.resolve('.agents/checks/tests/fixtures/variable-inventory-sealed.json');
  const envelope = readInventory(file, 'FILE');
  const regenerated = sealInventory(await captureInventory(inventoryMock(), { fileKey: 'FILE' }), '2020-01-01T00:00:00.000Z');
  assert.equal(readFileSync(file, 'utf8'), JSON.stringify(regenerated, null, 2) + '\n');
  assert.equal(envelope.inventory.collections.length, 2); assert.equal(envelope.inventory.variables.length, 5);
  assert.equal(inventoryTokenCollections(envelope.inventory).length, 1);
  const root = temporary(t), plan = planInventoryTokens(root, file);
  assert.equal(Object.keys(plan.outputs).length, 2); saveInventoryTokens(root, plan);
  assert.equal(tokenInventoryComparison(root, envelope).status, 'PASS'); assert.deepEqual(generateTokensCss(root).errors, []);
});

test('save refuses a plan whose project facts changed since planning', async t => {
  const { root, file } = await fixture(t); saveInventoryTokens(root, planInventoryTokens(root, file));
  const plan = planInventoryTokens(root, file), state = path.join(root, 'design-system/relationships/figma-state.json');
  const changed = readFileSync(state, 'utf8') + '\n'; writeFileSync(state, changed);
  assert.throws(() => saveInventoryTokens(root, plan), /changed since planning/); assert.equal(readFileSync(state, 'utf8'), changed);
});

test('read-only preanalysis returns reproducible next actions and a mismatching project remains blocked', async t => {
  const { root, file } = await fixture(t);
  const result = preanalyze(root, file); assert.equal(result.status, 'DIAGNOSED'); assert.equal(result.tokens.preflight.inventory.hash, readInventory(file).hash);
  assert.equal(result.nextActions[0].code, 'REVIEW_TOKEN_PLAN'); assert.equal(existsSync(path.join(root, 'design-system')), false);
  saveInventoryTokens(root, planInventoryTokens(root, file));
  const state = path.join(root, 'design-system/relationships/figma-state.json'); const changed = JSON.parse(readFileSync(state)); changed.fileKey = 'OTHER'; writeFileSync(state, JSON.stringify(changed));
  const blocked = preanalyze(root, file); assert.equal(blocked.status, 'BLOCKED'); assert.match(blocked.errors[0], /origin/);
});
