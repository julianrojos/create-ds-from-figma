import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { referenceCode, referenceSession, saveReference, decodeReference } from '../../skills/create-ds-from-figma/scripts/figma-reference.mjs';
import { nestedInventory } from '../lib/nested-inventory.mjs';
import { captureFigma } from '../../skills/create-ds-from-figma/scripts/lib/capture-figma.mjs';
import { sealCapture } from '../lib/figma-evidence.mjs';
import { planInventoryTokens, saveInventoryTokens } from '../lib/inventory-tokens.mjs';
import { preanalyze } from '../../skills/create-ds-from-figma/scripts/figma-preanalysis.mjs';

async function nestedSnapshot(mains = [{ id: '2:1', key: 'local', remote: false }, { id: '3:1', key: 'remote', remote: true }, null]) {
  const child = (main, index) => ({ id: `1:${index + 2}`, type: 'INSTANCE', name: 'Same name', children: [], getMainComponentAsync: async () => main });
  const root = { id: '1:1', name: 'Parent', type: 'COMPONENT', children: mains.map(child), componentPropertyDefinitions: {} };
  const figma = { skipInvisibleInstanceChildren: true, getNodeByIdAsync: async () => root, variables: { getLocalVariableCollectionsAsync: async () => [] } };
  return sealCapture(await captureFigma(figma, { fileKey: 'FILE', nodeId: '1:1' }));
}

test('reference exports exact PNG bytes with node bounds and explicit scale, then saves a typed immutable artifact', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reference-test-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const png = new PNG({ width: 2, height: 3 }); png.data.fill(255); const bytes = PNG.sync.write(png);
  let settings;
  const figma = { fileKey: 'FILE', getNodeByIdAsync: async () => ({ width: 2, height: 3, exportAsync: async options => { settings = options; return bytes; } }), base64Encode: bytes => Buffer.from(bytes).toString('base64') };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const chunk = await new AsyncFunction('figma', referenceCode('FILE', '1:1', 1))(figma);
  assert.deepEqual(settings, { format: 'PNG', constraint: { type: 'SCALE', value: 1 }, contentsOnly: false, useAbsoluteBounds: true });
  writeFileSync(path.join(root, '0.json'), JSON.stringify(chunk));
  assert.deepEqual(referenceSession(root).image.bytes, bytes);
  const artifact = saveReference(root, root); assert.equal(artifact.kind, 'figma-screenshot'); assert.equal(artifact.provenance.figmaRef, 'FILE:1:1');
  assert.deepEqual(readFileSync(path.join(root, artifact.path)), bytes); assert.deepEqual(saveReference(root, root), artifact);
  assert.throws(() => referenceCode('FILE', '1:1', 0)); assert.throws(() => referenceCode('FILE', '1:1', 5));
  await assert.rejects(new AsyncFunction('figma', referenceCode('OTHER', '1:1', 1))(figma), /identity/);
  const raw = referenceSession(root).raw; raw.base64 = Buffer.from('not PNG').toString('base64'); assert.throws(() => decodeReference(raw), /PNG/);
  writeFileSync(path.join(root, artifact.path), 'corrupt'); assert.throws(() => saveReference(root, root), /differs/);
});

test('PNG direct MCP capture uses shared checked transport and does not publish before save', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reference-mcp-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, 'config.json');
  writeFileSync(config, JSON.stringify({ transport: { type: 'stdio', command: process.execPath, args: [path.resolve('.agents/checks/tests/fixtures/capture-mcp-server.mjs'), 'reference'] },
    tool: { name: 'execute_design', codeArgument: 'javascript', fileKeyArgument: 'designFile' }, chunkSize: 80 }));
  const cli = path.resolve('.agents/skills/create-ds-from-figma/scripts/figma-reference.mjs');
  const result = spawnSync(process.execPath, [cli, 'capture', 'FILE', '1:1', '1', config, '--approve-connection'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); const response = JSON.parse(result.stdout);
  try { assert.ok(response.chunks > 1); assert.equal(referenceSession(response.directory).image.hash, response.hash); assert.equal(existsSync(path.join(root, 'design-system')), false); }
  finally { rmSync(response.directory, { recursive: true, force: true }); }
});

test('PNG sessions reject malformed export dates before publishing any project artifact', async t => {
  const session = mkdtempSync(path.join(os.tmpdir(), 'reference-date-'));
  const project = mkdtempSync(path.join(os.tmpdir(), 'reference-project-'));
  t.after(() => { rmSync(session, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); });
  const bytes = PNG.sync.write(new PNG({ width: 2, height: 3 }));
  const figma = { fileKey: 'FILE', getNodeByIdAsync: async () => ({ width: 2, height: 3, exportAsync: async () => bytes }),
    base64Encode: data => Buffer.from(data).toString('base64') };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const original = await new AsyncFunction('figma', referenceCode('FILE', '1:1', 1))(figma);
  for (const capturedAt of [undefined, null, 0, true, {}, [], '', 'no-date', '2024-01-01',
    '2024-01-01T00:00:00Z', '2024-01-01T00:00:00.000+00:00', '2024-02-30T00:00:00.000Z', '+010000-01-01T00:00:00.000Z']) {
    writeFileSync(path.join(session, '0.json'), JSON.stringify({ ...original, capturedAt }));
    assert.throws(() => referenceSession(session), /export timestamp/);
    assert.throws(() => saveReference(project, session), /export timestamp/);
    assert.equal(existsSync(path.join(project, 'design-system')), false);
  }
  const capturedAt = '2024-02-29T23:59:59.123Z';
  writeFileSync(path.join(session, '0.json'), JSON.stringify({ ...original, capturedAt }));
  assert.equal(saveReference(project, session).provenance.capturedAt, capturedAt);
});

test('nested diagnosis distinguishes proven missing/external from unknown identity and ambiguous mappings', async () => {
  const snapshot = await nestedSnapshot();
  assert.deepEqual(nestedInventory(snapshot, {}).instances.map(i => i.status), ['missing', 'external', 'unresolved']);
  const sameName = { 'FILE:99:99': { name: 'Same name', figma: { refs: ['FILE:99:99'] } } };
  assert.deepEqual(nestedInventory(snapshot, sameName).instances.map(i => i.status), ['missing', 'external', 'unresolved']);
  const map = { 'FILE:2:1': { name: 'Local', figma: { refs: ['FILE:2:1', 'componentKey:local'] } },
    'LIB:3:1': { name: 'Remote', figma: { refs: ['LIB:3:1', 'componentKey:remote'] } } };
  assert.deepEqual(nestedInventory(snapshot, map).instances.map(i => i.status), ['mapped', 'mapped', 'unresolved']);
  assert.deepEqual(nestedInventory(snapshot, map).instances.slice(0, 2).map(i => i.resolvedComponent), ['Local', 'Remote']);
  map['FILE:4:1'] = { name: 'Conflict', figma: { refs: ['FILE:4:1', 'componentKey:local'] } };
  assert.equal(nestedInventory(snapshot, map).instances[0].status, 'unresolved');
  snapshot.hash = 'wrong'; assert.throws(() => nestedInventory(snapshot, map), /hash/);
});

test('nested mains resolve through canonical variant refs and repeated refs within one entry stay unambiguous', async () => {
  const snapshot = await nestedSnapshot();
  const map = { 'FILE:20:1': { name: 'LocalSet', figma: { refs: ['FILE:20:1'], variants: {
    Small: { refs: ['FILE:2:1', 'componentKey:local'] }, Alternate: { refs: ['componentKey:local'] } } } },
    'LIB:30:1': { name: 'RemoteSet', figma: { refs: ['LIB:30:1'], variants: { Regular: { refs: ['LIB:3:1', 'componentKey:remote'] } } } } };
  const instances = nestedInventory(snapshot, map).instances;
  assert.deepEqual(instances.map(i => i.status), ['mapped', 'mapped', 'unresolved']);
  assert.deepEqual(instances.slice(0, 2).map(i => i.resolvedComponent), ['LocalSet', 'RemoteSet']);
  map['FILE:40:1'] = { name: 'ConflictingSet', figma: { refs: ['FILE:40:1'], variants: { Regular: { refs: ['FILE:2:1'] } } } };
  assert.equal(nestedInventory(snapshot, map).instances[0].status, 'unresolved');
});

test('unknown provenance and remote node IDs alone cannot resolve; schema and malformed entries do not map', async () => {
  const unknown = await nestedSnapshot([{ id: '2:1', key: 'local', remote: null }, { id: '3:1', key: '', remote: true }]);
  const map = { 'FILE:2:1': { name: 'Local', figma: { refs: ['FILE:2:1', 'componentKey:local'] } },
    'FILE:3:1': { name: 'NotRemoteIdentity', figma: { refs: ['FILE:3:1'] } } };
  assert.deepEqual(nestedInventory(unknown, map).instances.map(i => i.status), ['unresolved', 'unresolved']);
  const known = await nestedSnapshot();
  assert.deepEqual(nestedInventory(known, { _schema: map['FILE:2:1'], 'FILE:2:1': [], 'componentKey:remote': null }).instances.map(i => i.status), ['missing', 'external', 'unresolved']);
  assert.deepEqual(nestedInventory(known, { WrongLocal: { refs: ['FILE:2:1'] }, WrongRemote: { refs: ['componentKey:remote'] } }).instances.map(i => i.status), ['missing', 'external', 'unresolved']);
});

test('preanalysis and the nested CLI consume canonical variant maps without inventing missing dependencies', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nested-map-integration-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const inventory = path.resolve('.agents/checks/tests/fixtures/variable-inventory-sealed.json');
  saveInventoryTokens(root, planInventoryTokens(root, inventory));
  const snapshot = await nestedSnapshot([{ id: '2:1', key: 'local', remote: false }]);
  const map = { 'FILE:20:1': { name: 'Child', figma: { refs: ['FILE:20:1'], variants: { Small: { refs: ['FILE:2:1', 'componentKey:local'] } } } } };
  const snapshotPath = path.join(root, 'snapshot.json'), mapPath = path.join(root, 'design-system/relationships/figma-code-map.json');
  writeFileSync(snapshotPath, JSON.stringify(snapshot)); writeFileSync(mapPath, JSON.stringify(map));
  const result = preanalyze(root, inventory, snapshotPath);
  assert.equal(result.status, 'DIAGNOSED', JSON.stringify(result.errors)); assert.equal(result.nested.instances[0].resolvedComponent, 'Child');
  assert.ok(!result.nextActions.some(action => action.code === 'IMPORT_NESTED_COMPONENT'));
  const cli = path.resolve('.agents/skills/create-ds-from-figma/scripts/figma-capture.mjs');
  const run = spawnSync(process.execPath, [cli, 'nested', snapshotPath, mapPath], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).instances[0].status, 'mapped');
});

test('synthetic PNG validates pixels and rejects CRC corruption without a design asset', () => {
  const png = new PNG({ width: 3, height: 2 }); png.data.fill(128);
  const bytes = PNG.sync.write(png), raw = { schemaVersion: 1, fileKey: 'FILE', nodeId: '1:1', scope: 'node-bounds', scale: 1, base64: bytes.toString('base64') };
  const decoded = decodeReference(raw); assert.equal(decoded.width, 3); assert.equal(decoded.height, 2); assert.deepEqual(decoded.bytes, bytes);
  bytes[33] ^= 1; raw.base64 = bytes.toString('base64'); assert.throws(() => decodeReference(raw));
});
