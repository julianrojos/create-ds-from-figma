import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_OPERATIONS, MAX_FILE_BYTES, MAX_OPERATIONS, STRONG_DIFFERENCE, compareRegions, decodeImage, estimateOperations, heatmap, regionResidual } from '../lib/pixel-residual.mjs';
import { pixelDiagnose } from '../../skills/create-ds-from-figma/scripts/pixel-diagnose.mjs';

const { PNG } = createRequire(import.meta.url)('pngjs');
const W = 120, H = 90;
// Synthetic card: a grey 1px outline and a diamond "pointer" at the bottom whose own outline can be omitted or recolored.
function draw({ outline = true, pointer = '#ffffff', pointerOutline = '#d9d9d9', noise = 0, shift = [0, 0], alpha = 255 } = {}) {
  const png = new PNG({ width: W, height: H }); let seed = 7;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const put = (x, y, hex) => { x += shift[0]; y += shift[1]; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; const n = parseInt(hex.slice(1), 16);
    png.data[i] = n >> 16; png.data[i + 1] = (n >> 8) & 255; png.data[i + 2] = n & 255; png.data[i + 3] = alpha; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; png.data[i] = png.data[i + 1] = png.data[i + 2] = 255; png.data[i + 3] = 255; }
  for (let y = 10; y < 60; y++) for (let x = 10; x < 110; x++) if (outline && (x === 10 || x === 109 || y === 10 || y === 59)) put(x, y, '#d9d9d9'); else put(x, y, '#ffffff');
  for (let d = 0; d < 9; d++) for (let x = 60 - d; x <= 60 + d; x++) { const y = 60 + 9 - d; put(x, y, (x === 60 - d || x === 60 + d) && pointerOutline ? pointerOutline : pointer); }
  for (let y = 25; y < 35; y++) for (let x = 25; x < 45; x++) put(x, y, '#333333');
  if (noise) for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) png.data[i * 4 + c] = Math.max(0, Math.min(255, png.data[i * 4 + c] + Math.round((rand() - 0.5) * 2 * noise)));
  return PNG.sync.write(png);
}
const solid = (value, width, height) => { const png = new PNG({ width, height }); for (let i = 0; i < width * height; i++) { png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = value; png.data[i * 4 + 3] = 255; } return PNG.sync.write(png); };
const regions = [{ id: 'pointer', x: 44, y: 56, width: 32, height: 24 }, { id: 'left', x: 6, y: 20, width: 10, height: 30 }, { id: 'right', x: 104, y: 20, width: 10, height: 30 }, { id: 'top', x: 30, y: 6, width: 60, height: 10 }];
const reference = draw();

test('an identical or merely shifted rendering leaves no residual once each region is aligned', () => {
  for (const candidate of [draw(), draw({ shift: [3, -2] }), draw({ noise: 3 })]) {
    const result = compareRegions(reference, candidate, regions);
    assert.deepEqual(result.hotspots, []);
    for (const region of result.regions) assert.ok(region.strongPercent < 2, `${region.id}: ${region.strongPercent}`);
  }
  assert.deepEqual(regionResidual(decodeImage(reference), decodeImage(draw({ shift: [3, -2] })), regions[1]).shift.dx, 3, 'the shift that cancels the deviation is reported');
});

test('a missing outline or a wrong color on one part stands out against the clean parts', () => {
  for (const defect of [{ pointerOutline: '' }, { pointer: '#222222' }, { pointerOutline: '#ff0000' }]) {
    const result = compareRegions(reference, draw(defect), regions);
    assert.deepEqual(result.hotspots, ['pointer'], JSON.stringify(defect));
    assert.equal(result.regions[0].id, 'pointer'); assert.ok(result.regions[0].relativeToOthers >= 3);
    assert.equal(result.status, 'NOT VERIFIED'); assert.match(result.scope, /neither passes nor fails/);
  }
});

test('the result is deterministic, ranked, relative only with enough other regions, and never a verdict', () => {
  const candidate = draw({ pointerOutline: '' });
  const first = compareRegions(reference, candidate, regions), second = compareRegions(reference, candidate, regions);
  assert.deepEqual(first, second);
  const shuffled = compareRegions(reference, candidate, [regions[3], regions[1], regions[0], regions[2]]);
  assert.deepEqual(shuffled.regions.map(r => r.id), ['pointer', 'left', 'right', 'top'], 'ranked by residual, ties by ID, whatever the input order');
  const alone = compareRegions(reference, candidate, [regions[0]]);
  assert.equal(alone.regions[0].relativeToOthers, null, 'a single region has nothing clean to be relative to');
  assert.deepEqual(alone.hotspots, ['pointer'], 'it is still flagged by its absolute residual');
  const clear = new PNG({ width: 2, height: 2 }); clear.data.fill(0);
  assert.deepEqual([...decodeImage(PNG.sync.write(clear)).rgb], new Array(12).fill(255), 'transparent pixels are composited over white, not black');
});

test('invalid input is rejected instead of being read as a match', () => {
  const bad = [[Buffer.from('not a png'), reference, regions], [reference, reference, []], [reference, reference, [{ id: 'a', x: 0, y: 0, width: 0, height: 5 }]],
    [reference, reference, [{ id: 'a', x: 100, y: 0, width: 50, height: 5 }]], [reference, reference, [{ id: 'a', x: 0.5, y: 0, width: 5, height: 5 }]],
    [reference, reference, [{ id: 'a', x: 0, y: 0, width: 5, height: 5 }, { id: 'a', x: 5, y: 5, width: 5, height: 5 }]], [reference, reference, [{ x: 0, y: 0, width: 5, height: 5 }]]];
  for (const [a, b, r] of bad) assert.throws(() => compareRegions(a, b, r), /^Error: Pixel residual:/);
  assert.throws(() => compareRegions(reference, reference, regions, { maxShift: 41 }), /maxShift/); assert.throws(() => compareRegions(reference, reference, regions, { maxShift: 1.5 }), /maxShift/);
  const corrupted = Buffer.from(reference); corrupted[40] ^= 0xff;
  assert.throws(() => decodeImage(corrupted), /invalid PNG/);
});

test('the heatmap marks the differing area and the CLI never overwrites its outputs', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pixel-test-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const map = heatmap(reference, draw({ pointerOutline: '' })), image = PNG.sync.read(map.png);
  const at = (x, y) => image.data[(y * W + x) * 4 + 1];
  assert.equal(at(5, 5), 255, 'unchanged areas stay white'); assert.ok(at(60 - 5, 60 + 9 - 4) < 255 || at(60 - 4, 60 + 9 - 4) < 255 || at(56, 66) < 255, 'the missing pointer outline is red');
  writeFileSync(path.join(dir, 'ref.png'), reference); writeFileSync(path.join(dir, 'cand.png'), draw({ pointerOutline: '' })); writeFileSync(path.join(dir, 'regions.json'), JSON.stringify(regions));
  const out = pixelDiagnose(['compare', path.join(dir, 'ref.png'), path.join(dir, 'cand.png'), path.join(dir, 'regions.json'), '--heatmap', path.join(dir, 'heat.png'), '--max-shift', '4']);
  assert.deepEqual(out.hotspots, ['pointer']); assert.ok(existsSync(path.join(dir, 'heat.png'))); assert.equal(out.maxShift, 4);
  assert.throws(() => pixelDiagnose(['compare', path.join(dir, 'ref.png'), path.join(dir, 'cand.png'), path.join(dir, 'regions.json'), '--heatmap', path.join(dir, 'heat.png')]), /EEXIST/);
  for (const bad of [[], ['compare'], ['compare', 'a', 'b', 'c', '--bogus', 'x'], ['compare', path.join(dir, 'ref.png'), path.join(dir, 'cand.png'), path.join(dir, 'regions.json'), '--max-shift', 'x']]) assert.throws(() => pixelDiagnose(bad));
  assert.equal(readFileSync(path.join(dir, 'ref.png')).equals(reference), true, 'inputs are never modified');
});

// Reference implementation: every shift scanned completely, ties to the smallest shift, then dy, then dx.
function exhaustive(reference, candidate, region, maxShift) {
  let best;
  for (let dy = -maxShift; dy <= maxShift; dy++) for (let dx = -maxShift; dx <= maxShift; dx++) {
    let sum = 0, strong = 0, inside = 0;
    for (let y = region.y; y < region.y + region.height; y++) for (let x = region.x; x < region.x + region.width; x++) {
      const cx = x + dx, cy = y + dy, outside = cx < 0 || cy < 0 || cx >= candidate.width || cy >= candidate.height;
      let d = 1;
      if (!outside) { d = 0; for (let c = 0; c < 3; c++) d += Math.abs(reference.rgb[(y * reference.width + x) * 3 + c] - candidate.rgb[(cy * candidate.width + cx) * 3 + c]); d /= 765; inside++; }
      sum += d; if (d > STRONG_DIFFERENCE) strong++;
    }
    const cost = Math.abs(dx) + Math.abs(dy), eps = 1e-7 * region.width * region.height;
    if (!best || sum < best.sum - eps || Math.abs(sum - best.sum) <= eps && (cost < best.cost || cost === best.cost && (dy < best.dy || dy === best.dy && dx < best.dx))) best = { sum, strong, inside, dx, dy, cost };
  }
  const pixels = region.width * region.height, round = v => Math.round(v * 1000) / 1000;
  return { shift: { dx: best.dx, dy: best.dy }, meanPercent: round(best.sum / pixels * 100), strongPercent: round(best.strong / pixels * 100), coveragePercent: round(best.inside / pixels * 100), pixels };
}

test('pruning the search returns exactly what a complete scan returns, ties included', () => {
  const ref = decodeImage(reference);
  const variants = [draw(), draw({ shift: [3, -2] }), draw({ shift: [-4, 5], noise: 6 }), draw({ pointerOutline: '' }), draw({ pointer: '#222222', shift: [1, 1] }), draw({ noise: 40 }), draw({ outline: false }), solid(0, 40, 30), solid(255, W, H)];
  for (const bytes of variants) {
    const candidate = decodeImage(bytes);
    for (const region of [...regions, { id: 'all', x: 0, y: 0, width: W, height: H }, { id: 'flat', x: 0, y: 70, width: 30, height: 15 }, { id: 'edge', x: 0, y: 0, width: 12, height: 12 }]) {
      for (const maxShift of [0, 3, 8]) assert.deepEqual(regionResidual(ref, candidate, region, { maxShift }), exhaustive(ref, candidate, region, maxShift), `${region.id} shift ${maxShift}`);
    }
  }
});

test('the search is budgeted before any work: oversized, too many or badly bounded requests fail immediately', () => {
  assert.equal(estimateOperations([{ width: 10, height: 20 }, { width: 5, height: 5 }], 2), 225 * 25);
  assert.equal(estimateOperations([{ width: 3, height: 3 }], 0), 9);
  assert.throws(() => estimateOperations([], 41), /maxShift/);
  const big = new PNG({ width: 1500, height: 1500 }); big.data.fill(255); const bytes = PNG.sync.write(big);
  const whole = [{ id: 'all', x: 0, y: 0, width: 1500, height: 1500 }];
  assert.ok(estimateOperations(whole, 12) > DEFAULT_OPERATIONS);
  const started = Date.now();
  assert.throws(() => compareRegions(bytes, bytes, whole), /needs \d+ pixel comparisons, over the budget/);
  assert.throws(() => heatmap(bytes, bytes, { maxShift: 40 }), /over the budget/);
  assert.ok(Date.now() - started < 5000, 'rejection happens before the search, not after it');
  assert.equal(compareRegions(bytes, bytes, whole, { maxShift: 0 }).budget.operations, 1500 * 1500, 'a smaller shift fits the default budget');
  assert.equal(compareRegions(bytes, bytes, whole, { maxShift: 0, maxOperations: 2.25e6 }).hotspots.length, 0);
  assert.throws(() => compareRegions(bytes, bytes, whole, { maxShift: 0, maxOperations: 2.25e6 - 1 }), /budget/);
  for (const maxOperations of [0, -1, NaN, Infinity, MAX_OPERATIONS + 1, '1e6']) assert.throws(() => compareRegions(reference, reference, regions, { maxOperations }), /maxOperations/, String(maxOperations));
  const many = Array.from({ length: 257 }, (_, i) => ({ id: `r${i}`, x: 0, y: 0, width: 1, height: 1 }));
  assert.throws(() => compareRegions(reference, reference, many, { maxShift: 0 }), /^Error: Pixel residual: at most 256 regions are supported$/, 'the count limit has its own diagnostic');
  assert.equal(compareRegions(reference, reference, many.slice(0, 256), { maxShift: 0 }).regions.length, 256);
  assert.throws(() => compareRegions(reference, reference, [many[0], many[0]], { maxShift: 0 }), /regions need unique string IDs/, 'duplicate IDs keep their diagnostic');
  assert.throws(() => compareRegions(reference, reference, [{ ...many[0], id: 1 }], { maxShift: 0 }), /regions need unique string IDs/, 'non-string IDs keep their diagnostic');
  assert.ok(compareRegions(reference, reference, regions).budget.operations <= DEFAULT_OPERATIONS);
});

test('the heatmap aligns on a bounded central window and reports it', () => {
  const big = new PNG({ width: 700, height: 500 }); big.data.fill(255); const bytes = PNG.sync.write(big);
  const map = heatmap(bytes, bytes, { maxShift: 2 });
  assert.deepEqual(map.alignedOn, { x: 222, y: 122, width: 256, height: 256 });
  assert.deepEqual(heatmap(reference, reference, { maxShift: 1 }).alignedOn, { x: 0, y: 0, width: W, height: H }, 'a small image is aligned whole');
  assert.equal(PNG.sync.read(map.png).width, 700);
});

test('the CLI accepts an explicit operation budget and refuses an invalid or insufficient one', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pixel-budget-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = ['ref.png', 'cand.png', 'regions.json'].map(f => path.join(dir, f));
  writeFileSync(files[0], reference); writeFileSync(files[1], draw()); writeFileSync(files[2], JSON.stringify(regions));
  assert.equal(pixelDiagnose(['compare', ...files, '--max-operations', '1e9']).budget.limit, 1e9);
  assert.throws(() => pixelDiagnose(['compare', ...files, '--max-operations', '1000']), /budget/);
  for (const bad of ['x', '0', '5e9']) assert.throws(() => pixelDiagnose(['compare', ...files, '--max-operations', bad]), /maxOperations/);
  assert.throws(() => pixelDiagnose(['compare', ...files, '--max-operations', '1e9', '--max-operations', '2e9']));
});

test('a candidate that is entirely different or does not cover the region can never look like a match', () => {
  const white = solid(255, 8, 8), black = solid(0, 8, 8), whole = [{ id: 'all', x: 0, y: 0, width: 8, height: 8 }];
  for (const maxShift of [0, 3, 12, 40]) {
    const result = compareRegions(white, black, whole, { maxShift }).regions[0];
    assert.equal(result.meanPercent, 100, `maxShift ${maxShift}`); assert.equal(result.strongPercent, 100); assert.equal(result.coveragePercent, 100);
    assert.deepEqual(compareRegions(white, black, whole, { maxShift }).hotspots, ['all']);
  }
  assert.equal(compareRegions(white, white, whole, { maxShift: 12 }).regions[0].meanPercent, 0, 'identical images are still a perfect match');
  const cropped = decodeImage(draw()), bottom = { id: 'bottom', x: 40, y: 50, width: 40, height: 30 }, top = { id: 'top', x: 10, y: 10, width: 40, height: 20 };
  const small = new PNG({ width: W, height: 55 }); small.data.set(PNG.sync.read(draw()).data.subarray(0, W * 55 * 4));
  const result = compareRegions(draw(), PNG.sync.write(small), [top, bottom], { maxShift: 0 });
  const byId = Object.fromEntries(result.regions.map(r => [r.id, r]));
  assert.equal(byId.top.coveragePercent, 100); assert.ok(byId.top.strongPercent < 2);
  assert.ok(byId.bottom.coveragePercent < 100 && byId.bottom.coveragePercent > 0, `partial coverage is reported: ${byId.bottom.coveragePercent}`);
  assert.ok(byId.bottom.strongPercent > 50, 'what the candidate does not cover counts as different'); assert.equal(result.hotspots[0], 'bottom');
  const away = compareRegions(draw(), PNG.sync.write(small), [{ id: 'gone', x: 40, y: 70, width: 20, height: 10 }], { maxShift: 12 }).regions[0];
  assert.equal(away.coveragePercent, 0, 'a region the candidate lacks entirely has no coverage'); assert.equal(away.strongPercent, 100);
  assert.equal(regionResidual(cropped, cropped, top).coveragePercent, 100);
  const map = PNG.sync.read(heatmap(draw(), PNG.sync.write(small), { maxShift: 0 }).png);
  assert.ok(map.data[(70 * W + 60) * 4 + 1] < 255, 'the heatmap shows the missing area as different');
});

// A valid IHDR for arbitrary declared dimensions with whatever follows: the point is whether anything is decompressed before the check.
function crafted({ width, height, interlace = 0, data = Buffer.from('not zlib') }) {
  // The data is garbage and the IHDR checksum wrong: reaching the decoder always ends in an invalid PNG error, never in a header message.
  return flipHeaderChecksum(valid({ width, height, interlace, data }));
}
const flipHeaderChecksum = png => { const copy = Buffer.from(png); copy[29] ^= 0xff; return copy; };
function valid({ width, height, interlace = 0, data = Buffer.from('not zlib') }) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = bytes => { let c = 0xffffffff; for (const x of bytes) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const length = Buffer.alloc(4); length.writeUInt32BE(body.length); const typed = Buffer.concat([Buffer.from(type), body]), sum = Buffer.alloc(4); sum.writeUInt32BE(crc(typed)); return Buffer.concat([length, typed, sum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 1; ihdr[9] = 0; ihdr[12] = interlace;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', data), chunk('IEND', Buffer.alloc(0))]);
}

test('the header decides before anything is decompressed: dimensions, interlacing, signature and file size', () => {
  // These files are corrupt, so the decoder would fail them with "invalid PNG" if it ran first: the dimension message proves the order.
  for (const [width, height] of [[6000, 6000], [20000, 20000], [16385, 1], [1, 16385], [4294967295, 4294967295], [0, 5], [5, 0]]) {
    assert.throws(() => decodeImage(crafted({ width, height })), /dimensions are outside the supported range/, `${width}x${height}`);
  }
  assert.throws(() => decodeImage(crafted({ width: 4, height: 4, interlace: 1 })), /interlaced PNGs are not supported/);
  assert.throws(() => decodeImage(crafted({ width: 4, height: 4, interlace: 1, data: zlib.deflateSync(Buffer.alloc(64 * 1024 * 1024)) })), /interlaced/, 'a small interlaced bomb is refused, not inflated');
  assert.throws(() => decodeImage(crafted({ width: 4, height: 4 })), /^Error: Pixel residual: invalid PNG \((?!missing signature)/, 'within the limits the decoder does run, so the same crafted file fails there');
  for (const bad of [Buffer.alloc(0), Buffer.from('plain text that is not a PNG at all, long enough to pass a length test'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(40)]), Buffer.concat([Buffer.from([0, 80, 78, 71, 13, 10, 26, 10]), reference.subarray(8)])]) assert.throws(() => decodeImage(bad), /invalid PNG \(missing signature or IHDR\)/);
  assert.throws(() => decodeImage(Buffer.alloc(MAX_FILE_BYTES + 1)), /size budget/);
  assert.deepEqual([decodeImage(reference).width, decodeImage(reference).height], [W, H]);
  assert.throws(() => compareRegions(crafted({ width: 20000, height: 20000 }), reference, regions), /outside the supported range/, 'the comparison refuses it as well');
});
