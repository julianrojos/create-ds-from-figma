import { createRequire } from 'node:module';

const { PNG } = createRequire(import.meta.url)('pngjs');
// A pixel differs "strongly" above this share of the full channel range: anti-aliasing stays below it, a missing outline or color does not.
export const STRONG_DIFFERENCE = 0.08;
// Each decoded image costs 12 bytes per pixel. The search cost is region pixels times (2 * shift + 1)^2 comparisons, so it is budgeted
// before any work starts: an advisory tool must not be able to hang the loop that calls it.
const MAX_PIXELS = 8 * 1024 * 1024, MAX_SIDE = 16384, MAX_SHIFT = 40, MAX_REGIONS = 256, ALIGNMENT_WINDOW = 256;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const DEFAULT_OPERATIONS = 250e6, MAX_OPERATIONS = 4e9;
const fail = message => { throw new Error(`Pixel residual: ${message}`); };

// The header is read before any decompression: pngjs sizes its buffers from the declared dimensions, and an interlaced image is inflated
// without a bound at all, so a few kilobytes could otherwise ask for gigabytes. Dimensions, interlacing and file size are refused first.
function checkedHeader(bytes) {
  if (bytes.length > MAX_FILE_BYTES) fail('the file exceeds the size budget');
  if (bytes.length < 33 || !SIGNATURE.equals(bytes.subarray(0, 8)) || bytes.readUInt32BE(8) !== 13 || bytes.toString('latin1', 12, 16) !== 'IHDR') fail('invalid PNG (missing signature or IHDR)');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) fail('image dimensions are outside the supported range');
  if (bytes[28] !== 0) fail('interlaced PNGs are not supported because their decompression cannot be bounded');
}

// Decoded and composited over white, so transparent margins compare as paper and not as black.
export function decodeImage(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  checkedHeader(bytes);
  let png;
  try { png = PNG.sync.read(bytes, { checkCRC: true }); } catch (error) { fail(`invalid PNG (${error.message})`); }
  if (!png.width || !png.height || png.width * png.height > MAX_PIXELS) fail('image dimensions are outside the supported range');
  const rgb = new Float32Array(png.width * png.height * 3);
  for (let i = 0; i < png.width * png.height; i++) {
    const alpha = png.data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = png.data[i * 4 + c] * alpha + 255 * (1 - alpha);
  }
  return { width: png.width, height: png.height, rgb };
}

// A candidate pixel outside the image is a full difference, never paper: otherwise a shift that leaves a region outside the candidate
// would look like a perfect match. The reference is always inside, because regions are validated against it.
const difference = (reference, candidate, x, y, dx, dy) => {
  const cx = x + dx, cy = y + dy;
  if (cx < 0 || cy < 0 || cx >= candidate.width || cy >= candidate.height) return 1;
  const r = (y * reference.width + x) * 3, k = (cy * candidate.width + cx) * 3;
  return (Math.abs(reference.rgb[r] - candidate.rgb[k]) + Math.abs(reference.rgb[r + 1] - candidate.rgb[k + 1]) + Math.abs(reference.rgb[r + 2] - candidate.rgb[k + 2])) / 765;
};
// Stops as soon as the running sum exceeds `limit`: from then on this shift cannot beat the best one, so the result is identical to a full scan.
const measure = (reference, candidate, region, dx, dy, limit = Infinity) => {
  let sum = 0, strong = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const d = difference(reference, candidate, x, y, dx, dy);
      sum += d; if (d > STRONG_DIFFERENCE) strong++;
    }
    if (sum > limit) return null;
  }
  const pixels = region.width * region.height;
  return { sum, mean: sum / pixels * 100, strong: strong / pixels * 100 };
};

function checkedRegion(image, region, id) {
  const ok = region && ['x', 'y', 'width', 'height'].every(k => Number.isInteger(region[k])) && region.width > 0 && region.height > 0 && region.x >= 0 && region.y >= 0 &&
    region.x + region.width <= image.width && region.y + region.height <= image.height;
  if (!ok) fail(`region ${id} must be integer pixels inside the reference image`);
  return region;
}

const shiftOrder = new Map();
// Smallest shifts first, so a good match is found early and prunes the rest; ties keep the smallest shift, then smallest dy, then dx.
function shiftsFor(maxShift) {
  if (!shiftOrder.has(maxShift)) {
    const all = [];
    for (let dy = -maxShift; dy <= maxShift; dy++) for (let dx = -maxShift; dx <= maxShift; dx++) all.push({ dx, dy, cost: Math.abs(dx) + Math.abs(dy) });
    shiftOrder.set(maxShift, all.sort((a, b) => a.cost - b.cost || a.dy - b.dy || a.dx - b.dx));
  }
  return shiftOrder.get(maxShift);
}
const checkedShift = maxShift => { if (!Number.isInteger(maxShift) || maxShift < 0 || maxShift > MAX_SHIFT) fail(`maxShift must be an integer from 0 to ${MAX_SHIFT}`); };

export function estimateOperations(regions, maxShift) {
  checkedShift(maxShift);
  return regions.reduce((total, r) => total + r.width * r.height, 0) * (2 * maxShift + 1) ** 2;
}
function checkedBudget(operations, limit) {
  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_OPERATIONS) fail(`maxOperations must be a number from 1 to ${MAX_OPERATIONS}`);
  if (operations > limit) fail(`the search needs ${Math.ceil(operations)} pixel comparisons, over the budget of ${limit}; use fewer or smaller regions, a smaller maxShift or raise maxOperations`);
}

// Share of the region that falls inside the candidate at a given shift: below 100 the candidate does not cover what was compared.
const coverage = (candidate, region, dx, dy) => {
  const width = Math.max(0, Math.min(region.x + region.width + dx, candidate.width) - Math.max(region.x + dx, 0));
  const height = Math.max(0, Math.min(region.y + region.height + dy, candidate.height) - Math.max(region.y + dy, 0));
  return width * height / (region.width * region.height) * 100;
};

// The best local shift cancels geometric deviation, which the geometry checks already report, and keeps the appearance residual.
export function regionResidual(reference, candidate, region, { maxShift = 12 } = {}) {
  checkedShift(maxShift);
  let best;
  for (const shift of shiftsFor(maxShift)) {
    const m = measure(reference, candidate, region, shift.dx, shift.dy, best ? best.sum + 1e-7 * region.width * region.height : Infinity);
    if (m && (!best || m.sum < best.sum - 1e-7 * region.width * region.height)) best = { ...m, dx: shift.dx, dy: shift.dy };
  }
  const round = v => Math.round(v * 1000) / 1000;
  return { shift: { dx: best.dx, dy: best.dy }, meanPercent: round(best.mean), strongPercent: round(best.strong), coveragePercent: round(coverage(candidate, region, best.dx, best.dy)), pixels: region.width * region.height };
}

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// Advisory ranking of regions, never a verdict: with fewer than two other regions there is no clean reference to be relative to.
export function compareRegions(referenceBytes, candidateBytes, regions, { maxShift = 12, maxOperations = DEFAULT_OPERATIONS } = {}) {
  if (Array.isArray(regions) && regions.length > MAX_REGIONS) fail(`at most ${MAX_REGIONS} regions are supported`);
  if (!Array.isArray(regions) || !regions.length || new Set(regions.map(r => r?.id)).size !== regions.length || regions.some(r => typeof r?.id !== 'string' || !r.id)) fail('regions need unique string IDs');
  const reference = decodeImage(referenceBytes), candidate = decodeImage(candidateBytes);
  for (const r of regions) checkedRegion(reference, r, r?.id);
  const operations = estimateOperations(regions, maxShift);
  checkedBudget(operations, maxOperations);
  const measured = regions.map(r => ({ id: r.id, ...regionResidual(reference, candidate, checkedRegion(reference, r, r.id), { maxShift }) }));
  const ranked = measured.map(m => {
    const others = measured.filter(o => o.id !== m.id).map(o => o.strongPercent);
    const base = others.length >= 2 ? median(others) : null;
    return { ...m, relativeToOthers: base === null ? null : Math.round((m.strongPercent + 0.5) / (base + 0.5) * 100) / 100 };
  }).sort((a, b) => b.strongPercent - a.strongPercent || (a.id < b.id ? -1 : 1));
  const hotspots = ranked.filter(r => r.strongPercent >= 2 && (r.relativeToOthers === null || r.relativeToOthers >= 3)).map(r => r.id);
  return { schemaVersion: 1, status: 'NOT VERIFIED', reference: { width: reference.width, height: reference.height }, candidate: { width: candidate.width, height: candidate.height },
    maxShift, budget: { operations, limit: maxOperations }, strongDifference: STRONG_DIFFERENCE, regions: ranked, hotspots,
    scope: 'Advisory appearance residual per region after aligning each one locally. Anti-aliasing of rotated edges leaves a floor, text and shadows differ between renderers, and no threshold is calibrated: this ranks regions to inspect, it neither passes nor fails them.' };
}

// The alignment comes from a central window of at most ALIGNMENT_WINDOW pixels per side, then applies to the whole image: the heatmap is a
// picture to look at, and searching the entire image per shift is what made it unbounded.
export function heatmap(referenceBytes, candidateBytes, { maxShift = 12, maxOperations = DEFAULT_OPERATIONS } = {}) {
  const reference = decodeImage(referenceBytes), candidate = decodeImage(candidateBytes);
  const width = Math.min(reference.width, ALIGNMENT_WINDOW), height = Math.min(reference.height, ALIGNMENT_WINDOW);
  const window = { x: Math.floor((reference.width - width) / 2), y: Math.floor((reference.height - height) / 2), width, height };
  checkedBudget(estimateOperations([window], maxShift) + reference.width * reference.height, maxOperations);
  const { shift } = regionResidual(reference, candidate, window, { maxShift });
  const out = new PNG({ width: reference.width, height: reference.height });
  for (let y = 0; y < reference.height; y++) for (let x = 0; x < reference.width; x++) {
    const v = Math.max(0, 255 - Math.min(255, difference(reference, candidate, x, y, shift.dx, shift.dy) * 255 * 3)), i = (y * reference.width + x) * 4;
    out.data[i] = 255; out.data[i + 1] = v; out.data[i + 2] = v; out.data[i + 3] = 255;
  }
  return { shift, alignedOn: window, png: PNG.sync.write(out) };
}
