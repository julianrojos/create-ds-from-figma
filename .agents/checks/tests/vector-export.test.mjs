import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { captureVectors } from '../../skills/create-ds-from-figma/scripts/lib/capture-vectors.mjs';
import { sessionVectors, vectorCode, writeVectorSvg } from '../../skills/create-ds-from-figma/scripts/figma-vectors.mjs';
import { assembleChunks } from '../../skills/create-ds-from-figma/scripts/lib/capture-code.mjs';
import { normalizeVectorExport, readVectorExport, sealVectorExport, vectorSvg } from '../lib/vector-export.mjs';

const SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 0L12 6L6 12L0 6Z" fill="white"/></svg>';
const rect = (x, y, width, height) => ({ x, y, width, height });
const vectorNode = (id, name, props = {}) => ({ id, name, type: 'VECTOR', visible: true, width: 8, height: 8, absoluteBoundingBox: rect(10, 20, 11.3, 11.3), absoluteRenderBounds: rect(10, 20, 11.3, 11.3),
  exportAsync: async options => { assert.deepEqual(options, { format: 'SVG_STRING' }); return props.svg ?? SVG; }, ...props.node });
const mock = (extra = {}) => {
  const hidden = vectorNode('1:9', 'Hidden', { node: { visible: false } });
  const root = { id: '1:2', type: 'COMPONENT', name: 'Root', children: [
    { id: '1:3', type: 'FRAME', name: 'Frame', children: [vectorNode('1:5', 'Beak'), hidden] },
    { id: '1:4', type: 'TEXT', name: 'Title' }, vectorNode('1:1', 'Stroke', { node: { absoluteRenderBounds: rect(10, 25, 11.3, 6) } })] };
  return { fileKey: 'FILE', getNodeByIdAsync: async id => id === '1:2' ? root : null, ...extra };
};
const collect = async (figma = mock()) => captureVectors(figma, { fileKey: 'FILE', nodeId: '1:2' });
const sealed = async () => sealVectorExport(await collect(), '2020-01-01T00:00:00.000Z');
const temp = t => { const d = mkdtempSync(path.join(os.tmpdir(), 'vector-test-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

test('the collector exports every vector-like descendant, hidden ones included, with layout and render bounds', async () => {
  const data = await collect();
  assert.deepEqual(data.vectors.map(v => v.id), ['1:5', '1:9', '1:1'], 'traversal order is kept until sealing');
  assert.deepEqual(data.source, { fileKey: 'FILE', nodeId: '1:2', collector: 'vector-export-v1', api: 'PLUGIN', tool: 'use_figma', revision: null });
  const stroke = data.vectors[2];
  assert.deepEqual(stroke.bounds, rect(10, 20, 11.3, 11.3)); assert.deepEqual(stroke.renderBounds, rect(10, 25, 11.3, 6), 'the cropped SVG is located by its render bounds');
  assert.equal(data.vectors[1].visible, false);
  assert.equal(data.vectors[0].svg, SVG, 'the SVG is the exporter output, untouched');
});

test('the collector refuses a different file, a missing node and a node it cannot export', async () => {
  await assert.rejects(collect(mock({ fileKey: 'OTHER' })), /file identity/);
  await assert.rejects(collect(mock({ fileKey: undefined })), /file identity/);
  await assert.rejects(captureVectors(mock(), { fileKey: 'FILE', nodeId: '9:9' }), /unavailable/);
  const broken = mock(); (await broken.getNodeByIdAsync('1:2')).children.push({ id: '1:7', type: 'VECTOR', name: 'No export' });
  await assert.rejects(collect(broken), /cannot be exported/);
  const duplicated = mock(); (await duplicated.getNodeByIdAsync('1:2')).children.push(vectorNode('1:5', 'Again'));
  await assert.rejects(collect(duplicated), /Duplicate/);
});

test('sealing is canonical and order independent, and validation rejects malformed or active content', async () => {
  const raw = await collect(), reversed = structuredClone(raw); reversed.vectors.reverse();
  assert.equal(sealVectorExport(raw, '2020-01-01T00:00:00.000Z').hash, sealVectorExport(reversed, '2024-05-05T00:00:00.000Z').hash, 'neither order nor capture date changes the hash');
  assert.deepEqual(normalizeVectorExport(raw).vectors.map(v => v.id), ['1:1', '1:5', '1:9']);
  const mutate = change => { const copy = structuredClone(raw); change(copy); return copy; };
  for (const bad of [mutate(d => { d.schemaVersion = 2; }), mutate(d => { d.source.collector = 'other'; }), mutate(d => { d.source.fileKey = 'a b'; }), mutate(d => { d.source.nodeId = 'x'; }),
    mutate(d => { d.vectors[0].id = d.vectors[1].id; }), mutate(d => { d.vectors[0].type = 'FRAME'; }), mutate(d => { d.vectors[0].svg = 'not svg'; }),
    mutate(d => { d.vectors[0].svg = SVG.replace('<path', '<script>alert(1)</script><path'); }), mutate(d => { d.vectors[0].svg = SVG.replace('<path', '<path onload="x()"'); }),
    mutate(d => { d.vectors[0].svg = SVG.replace('fill="white"', 'fill="url(javascript:x)"'); }), mutate(d => { d.vectors[0].svg = SVG.replace('<path', '<foreignObject><p/></foreignObject><path'); }),
    mutate(d => { d.vectors[0].bounds = rect(1, 2, NaN, 4); }), mutate(d => { delete d.vectors[0].renderBounds; }), mutate(d => { d.vectors[0].width = -1; }),
    ]) assert.throws(() => sealVectorExport(bad), /^Error: Vector export:/);
  const padded = size => mutate(d => { d.vectors[0].svg = SVG.replace('</svg>', `<!--${'x'.repeat(size)}--></svg>`); });
  assert.doesNotThrow(() => sealVectorExport(padded(512 * 1024 - SVG.length - 20)), 'a valid document just under the budget is accepted');
  assert.throws(() => sealVectorExport(padded(512 * 1024)), /size budget exceeded/, 'a valid document over the budget is rejected for its size');
  const many = mutate(d => { d.vectors = Array.from({ length: 17 }, (_, i) => ({ ...d.vectors[0], id: `1:${100 + i}`, svg: SVG.replace('</svg>', `<!--${'y'.repeat(500 * 1024)}--></svg>`) })); });
  assert.throws(() => sealVectorExport(many), /size budget exceeded/, 'the total is bounded as well');
  assert.throws(() => sealVectorExport(raw, 'no-date'), /date/);
  assert.throws(() => sealVectorExport(raw, null), /date/);
});

test('a stored export is verified for hash, canonical form, envelope fields, origin and node', async t => {
  const dir = temp(t), file = path.join(dir, 'export.json'), valid = await sealed();
  writeFileSync(file, JSON.stringify(valid));
  assert.equal(readVectorExport(file, { fileKey: 'FILE', nodeId: '1:2' }).hash, valid.hash);
  assert.throws(() => readVectorExport(file, { fileKey: 'OTHER' }), /origin/); assert.throws(() => readVectorExport(file, { nodeId: '1:3' }), /node/);
  const tampered = structuredClone(valid); tampered.vectorExport.vectors[0].svg = SVG.replace('white', 'black'); writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => readVectorExport(file), /hash or canonical/);
  const variants = [null, [], 'x', { ...valid, extra: 1 }, { ...valid, capturedAt: undefined }, { ...valid, capturedAt: 0 }, { ...valid, hash: 'f'.repeat(64) }, { ...valid, schemaVersion: '1' }, { ...valid, vectorExport: undefined }];
  for (const envelope of variants) { writeFileSync(file, JSON.stringify(envelope)); assert.throws(() => readVectorExport(file), /^Error: Vector export:/, JSON.stringify(envelope)?.slice(0, 40)); }
});

test('capture dates must be canonical ISO UTC on sealing and reading, but do not change the content hash', async t => {
  const raw = await collect(), valid = await sealed(), file = path.join(temp(t), 'export.json');
  for (const capturedAt of ['2020-01-01', '2020-01-01T00:00:00Z', '2020-01-01T01:00:00.000+01:00',
    '2020-02-30T00:00:00.000Z', '2020-01-01T00:00:00.0000Z', '', 'no-date', 0, null]) {
    assert.throws(() => sealVectorExport(raw, capturedAt), /invalid capture date/, String(capturedAt));
    writeFileSync(file, JSON.stringify({ ...valid, capturedAt }));
    assert.throws(() => readVectorExport(file), /^Error: Vector export:/, String(capturedAt));
  }
  const capturedAt = '2024-02-29T12:34:56.789Z';
  const later = sealVectorExport(raw, capturedAt);
  assert.equal(later.hash, valid.hash, 'the date is validated, not authenticated by the content hash');
  writeFileSync(file, JSON.stringify(later));
  assert.equal(readVectorExport(file).capturedAt, capturedAt);
});

test('generated Plugin code transfers the exact export in full or in checked chunks', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor, raw = await collect();
  const run = (offset, size) => new AsyncFunction('figma', vectorCode('FILE', '1:2', offset, size))(mock());
  const full = await run(0, null);
  assert.deepEqual(assembleChunks([full]), JSON.parse(JSON.stringify(raw)));
  const chunks = []; for (let offset = 0, total = full.total; offset < total; offset += 300) chunks.push(await run(offset, 300));
  assert.ok(chunks.length > 2); assert.deepEqual(assembleChunks(chunks), assembleChunks([full]));
  for (const bad of [['', '1:2'], ['FILE', 'x'], ['FILE', '1:2', -1], ['FILE', '1:2', 0, 0], ['FILE', '1:2', 0, 12001], ['FILE', '1:2', 5, null]]) assert.throws(() => vectorCode(...bad), /Invalid vector transport/);
});

test('the SVG is written exactly as exported, never overwritten, and unknown vectors fail', async t => {
  const dir = temp(t), envelope = await sealed(), output = path.join(dir, 'beak.svg');
  const written = writeVectorSvg(envelope, '1:5', output);
  assert.equal(readFileSync(output, 'utf8'), SVG); assert.equal(written.bytes, Buffer.byteLength(SVG)); assert.equal(written.vector.id, '1:5');
  assert.match(written.scope, /not an authorization/);
  assert.throws(() => writeVectorSvg(envelope, '1:5', output), /EEXIST/);
  assert.throws(() => writeVectorSvg(envelope, '9:9', path.join(dir, 'x.svg')), /unknown vector/);
  assert.equal(existsSync(path.join(dir, 'x.svg')), false);
  assert.equal(vectorSvg(envelope, '1:9').visible, false, 'hidden vectors remain available for variants that show them');
});

test('the CLI stages, validates and saves immutable sessions and needs explicit connection approval', async t => {
  const dir = temp(t), script = '.agents/skills/create-ds-from-figma/scripts/figma-vectors.mjs';
  const cli = (args, input) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', input });
  const session = cli(['session']).stdout.trim(); t.after(() => rmSync(session, { recursive: true, force: true }));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (let offset = 0, total = Infinity; offset < total; offset += 400) {
    const chunk = await new AsyncFunction('figma', vectorCode("FILE", "1:2", offset, 400))(mock()); total = chunk.total;
    assert.equal(cli(['stage', session], JSON.stringify(chunk)).status, 0);
  }
  assert.equal(cli(['stage', session], JSON.stringify({ transportVersion: 1, offset: 0, payload: 'x' })).status, 1, 'a chunk is never overwritten');
  const checked = JSON.parse(cli(['validate-session', session]).stdout); assert.equal(checked.vectors, 3); assert.equal(checked.nodeId, '1:2');
  const output = path.join(dir, 'export.json'), saved = cli(['save', session, output]);
  assert.equal(saved.status, 0, saved.stderr); assert.equal(readVectorExport(output).hash, sessionVectors(session).hash);
  assert.equal(cli(['save', session, output]).status, 0, 'saving the same export again is idempotent');
  const other = path.join(dir, 'other.json'); writeFileSync(other, JSON.stringify({ ...JSON.parse(readFileSync(output)), hash: 'a'.repeat(64) }));
  const clash = cli(['save', session, other]); assert.equal(clash.status, 1); assert.match(clash.stderr, /Vector export|never overwrite/);
  const svg = cli(['svg', output, '1:5', path.join(dir, 'beak.svg')]); assert.equal(svg.status, 0, svg.stderr); assert.equal(readFileSync(path.join(dir, 'beak.svg'), 'utf8'), SVG);
  assert.equal(cli(['svg', output, '1:5', path.join(dir, 'beak.svg')]).status, 1);
  const config = path.join(dir, 'config.json'); writeFileSync(config, JSON.stringify({ transport: { type: 'stdio', command: 'node', args: ['-e', 'process.exit(9)'] }, tool: { name: 'use_figma', codeArgument: 'code' } }));
  const refused = cli(['capture', 'FILE', '1:2', config]); assert.equal(refused.status, 1); assert.match(refused.stderr, /Use code FILE NODE/, 'without approval the connection is never opened');
  assert.equal(cli(['bogus']).status, 1);
});
