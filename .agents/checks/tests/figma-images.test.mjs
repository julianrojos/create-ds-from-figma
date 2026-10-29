import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { imageCode, decodeImage, imageSession, resolveImageSession } from '../../skills/create-ds-from-figma/scripts/figma-images.mjs';
import { captureViaBridge } from '../../skills/create-ds-from-figma/scripts/lib/capture-bridge.mjs';
import { publishResource, inspectResolution } from '../../skills/create-ds-from-figma/scripts/resolve-resources.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { componentCapture } from './fixtures/component-capture.mjs';
import { persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { registerResource } from '../../skills/create-ds-from-figma/scripts/verification-resources.mjs';
import { verifyImports } from '../verify-imports.mjs';
import { snapshotResources } from '../lib/resource-diagnostics.mjs';
const original = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(27000, 5)]);
const identity = createHash('sha1').update(original).digest('hex');
const mock = (overrides = {}) => ({ fileKey: 'FILE', getImageByHash: hash => { assert.equal(hash, identity); return { getBytesAsync: async () => new Uint8Array(original) }; }, base64Encode: bytes => Buffer.from(bytes).toString('base64'), ...overrides });
const execute = (code, figma = mock()) => new Function('figma', `return (async()=>{${code}})()`)(figma);
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'images-project-')), directory = mkdtempSync(path.join(os.tmpdir(), 'images-session-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(directory, { recursive: true, force: true }); });
  const policy = { schemaVersion: 1, maxBytes: 40000, rules: [{ id: 'file-images', kind: 'image', identity: '*', format: 'png', origin: { kind: 'figma', fileKey: 'FILE' } }] };
  writeFileSync(path.join(root, 'resource-policy.json'), JSON.stringify(policy));
  const request = path.join(directory, 'request.json'); writeFileSync(request, JSON.stringify({ kind: 'image', fileKey: 'FILE', identity }));
  return { root, directory, request, policy };
}
async function capture(directory, options = {}) {
  return captureViaBridge({ fileKey: 'FILE', nodeId: identity, responseFormat: 'figma-execute',
    getCode: async offset => imageCode('FILE', identity, 40000, offset),
    runFigma: async code => ({ content: [{ type: 'text', text: JSON.stringify({ success: true, fileContext: { fileKey: 'FILE' }, result: await execute(code, options.figma) }) }] }),
    stage: async chunk => writeFileSync(path.join(directory, `${chunk.offset}.json`), JSON.stringify(chunk), { flag: 'wx' }), ...options });
}
test('original-image bridge transfers multiple chunks, resolves and publishes byte-identical content without touching policy', async t => {
  const f = fixture(t), policyBytes = readFileSync(path.join(f.root, 'resource-policy.json'));
  const result = await capture(f.directory); assert.ok(result.chunks.length > 2);
  assert.deepEqual(imageSession(f.directory).bytes, original);
  const resolution = await resolveImageSession(f.root, f.request, f.directory);
  const inspected = inspectResolution(f.root, resolution.receipt, { kind: 'image', identity, fileKey: 'FILE' });
  assert.deepEqual(inspected.bytes, original);
  assert.deepEqual(readdirSync(f.root), ['resource-policy.json']);
  const source = publishResource(f.root, resolution.receipt);
  assert.deepEqual(readFileSync(path.join(f.root, source.path)), original);
  assert.deepEqual(readFileSync(path.join(f.root, 'resource-policy.json')), policyBytes);
});
test('missing image, wrong file, oversized payload and altered bytes cannot resolve', async t => {
  await assert.rejects(execute(imageCode('FILE', identity, 40000), mock({ fileKey: 'OTHER' })), /file differs/);
  await assert.rejects(execute(imageCode('FILE', identity, 40000), mock({ getImageByHash: () => null })), /unavailable/);
  await assert.rejects(execute(imageCode('FILE', identity, 10)), /budget/);
  const raw = JSON.parse((await execute(imageCode('FILE', identity, 40000, 0, null))).payload);
  assert.throws(() => decodeImage({ ...raw, base64: Buffer.from('changed').toString('base64') }), /bytes or identity/);
  assert.throws(() => decodeImage(raw, { fileKey: 'OTHER' }), /source identity/);
  const f = fixture(t); await capture(f.directory);
  f.policy.rules = []; writeFileSync(path.join(f.root, 'resource-policy.json'), JSON.stringify(f.policy));
  await assert.rejects(resolveImageSession(f.root, f.request, f.directory), /DS_GAP/);
  assert.equal(readdirSync(f.directory).some(n => n.startsWith('original-')), false);
});
test('changed, truncated and duplicated chunks are rejected before producing a resource', async t => {
  const f = fixture(t); await capture(f.directory);
  const second = readdirSync(f.directory).filter(n => /^\d+\.json$/.test(n)).sort((a,b) => parseInt(a)-parseInt(b))[1];
  const file = path.join(f.directory, second), chunk = JSON.parse(readFileSync(file));
  for (const invalid of [{ ...chunk, checksum: 'different' }, { ...chunk, payload: chunk.payload.slice(1) }]) {
    writeFileSync(file, JSON.stringify(invalid));
    assert.throws(() => imageSession(f.directory));
    await assert.rejects(resolveImageSession(f.root, f.request, f.directory));
  }
  writeFileSync(file, JSON.stringify(chunk));
  const duplicate = path.join(f.directory, '999999.json'); writeFileSync(duplicate, readFileSync(file));
  assert.throws(() => imageSession(f.directory)); rmSync(duplicate);
  rmSync(file); assert.throws(() => imageSession(f.directory));
  assert.equal(readdirSync(f.directory).some(n => n.startsWith('original-')), false);
});
test('CLI bridge is policy-gated and completed capture registers against the observed snapshot', async t => {
  const f = fixture(t), script = '.agents/skills/create-ds-from-figma/scripts/figma-images.mjs';
  const bridge = spawnSync(process.execPath, [script, 'bridge', f.root, f.request], { encoding: 'utf8' });
  assert.equal(bridge.status, 0, bridge.stderr); assert.ok(bridge.stdout.includes('captureViaBridge'));
  await capture(f.directory); const resolution = await resolveImageSession(f.root, f.request, f.directory);
  const source = publishResource(f.root, resolution.receipt);
  const project = createPreviewProject({ image: { kind: 'unresolved', reason: 'awaiting original' } });
  t.after(() => rmSync(project.root, { recursive: true, force: true }));
  const metadataFile = path.join(project.root, project.metadataPath), metadata = JSON.parse(readFileSync(metadataFile));
  const previous = JSON.parse(readFileSync(path.join(project.root, metadata.evidence.snapshot))).capture;
  previous.nodes[0].properties.fills[0].imageHash = identity;
  const observed = componentCapture({ seeds: previous.nodes });
  const actions = snapshotResources(observed, { root: f.root }).nextActions;
  const action = actions.find(a => a.code === 'CAPTURE_FIGMA_IMAGE');
  assert.deepEqual(action.request, { kind: 'image', identity, fileKey: 'FILE' });
  assert.deepEqual(action.command.args.slice(-2), ['bridge', f.root]);
  const snapshotPath = path.join(f.directory, 'observed.json');
  const persisted = persistCapture(f.directory, observed);
  writeFileSync(snapshotPath, readFileSync(path.join(f.directory, persisted.snapshot)));
  const required = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/verification-plan.mjs', 'requirements', snapshotPath, f.root], { encoding: 'utf8' });
  assert.equal(required.status, 0, required.stderr);
  assert.ok(JSON.parse(required.stdout).nextActions.some(a => a.code === 'CAPTURE_FIGMA_IMAGE'));
  metadata.evidence = { ...metadata.evidence, ...persistCapture(project.root, observed) };
  metadata.verification.assets[0].imageHash = identity;
  writeFileSync(metadataFile, JSON.stringify(metadata));
  writeFileSync(path.join(project.root, 'resource-policy.json'), JSON.stringify(f.policy));
  const installed = publishResource(project.root, resolution.receipt);
  registerResource(project.root, project.metadataPath, 'image', identity, installed.path, { provenance: installed.provenance });
  const gate = await verifyImports(project.root);
  assert.ok(!gate.errors.some(e => /provenance|resource policy|image identity/i.test(e)), JSON.stringify(gate.errors));
  assert.equal(installed.sha256, source.sha256);
  f.policy.rules = []; writeFileSync(path.join(f.root, 'resource-policy.json'), JSON.stringify(f.policy));
  assert.notEqual(spawnSync(process.execPath, [script, 'bridge', f.root, f.request]).status, 0);
});
test('actual stdio MCP capture executes the image collector and directly returns a resolver receipt', t => {
  const f = fixture(t), config = path.join(f.directory, 'connection.json');
  writeFileSync(config, JSON.stringify({ transport: { type: 'stdio', command: process.execPath, args: [path.resolve('.agents/checks/tests/fixtures/capture-mcp-server.mjs'), 'wrapped-images'] }, tool: { name: 'figma_execute', codeArgument: 'code', fileKeyArgument: 'fileKey', responseFormat: 'figma-execute' }, chunkSize: 12000 }));
  const script = '.agents/skills/create-ds-from-figma/scripts/figma-images.mjs';
  const denied = spawnSync(process.execPath, [script, 'capture', f.root, f.request, config], { encoding: 'utf8' });
  assert.notEqual(denied.status, 0);
  const result = spawnSync(process.execPath, [script, 'capture', f.root, f.request, config, '--approve-connection'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const resolved = JSON.parse(result.stdout), session = path.dirname(resolved.receipt);
  t.after(() => rmSync(session, { recursive: true, force: true }));
  assert.equal(resolved.status, 'RESOLVED');
  assert.deepEqual(readFileSync(path.join(session, resolved.file)), original);
  assert.ok(readdirSync(session).some(name => name === 'response-0.json'));
});
