import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalJson } from './figma-evidence.mjs';
import { svgProblem } from './svg-safety.mjs';

const text = v => typeof v === 'string' && v.trim().length > 0;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const fail = message => { throw new Error(`Vector export: ${message}`); };
const KINDS = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE'];
export const MAX_SVG_BYTES = 512 * 1024, MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export function normalizeVectorExport(input) {
  const data = structuredClone(input);
  if (data?.schemaVersion !== 1 || data.source?.collector !== 'vector-export-v1' || data.source?.api !== 'PLUGIN' || !/^[A-Za-z0-9_-]+$/.test(data.source?.fileKey || '') ||
      !/^\d+:\d+$/.test(data.source?.nodeId || '') || !text(data.source?.tool) || !(data.source.revision === null || text(data.source.revision)) || !Array.isArray(data.vectors)) fail('invalid schema or provenance');
  const seen = new Set();
  let total = 0;
  for (const v of data.vectors) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || !text(v.id) || !text(v.name) || !KINDS.includes(v.type) || typeof v.visible !== 'boolean' || !finite(v.width) || !finite(v.height) || v.width < 0 || v.height < 0) fail('invalid vector record');
    for (const key of ['bounds', 'renderBounds']) if (v[key] !== null && !(v[key] && ['x', 'y', 'width', 'height'].every(k => finite(v[key][k])))) fail(`invalid ${key} for ${v.id}`);
    if (seen.has(v.id)) fail(`duplicate vector ${v.id}`);
    seen.add(v.id);
    if (typeof v.svg !== 'string') fail(`${v.id} is not an SVG document`);
    const bytes = Buffer.byteLength(v.svg);
    total += bytes;
    if (bytes > MAX_SVG_BYTES || total > MAX_TOTAL_BYTES) fail('SVG size budget exceeded');
    const problem = svgProblem(v.svg);
    if (problem) fail(`${v.id} is rejected: ${problem}`);
  }
  data.vectors.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return data;
}

export function sealVectorExport(input, capturedAt = new Date().toISOString()) {
  const vectorExport = normalizeVectorExport(input);
  const time = typeof capturedAt === 'string' ? Date.parse(capturedAt) : NaN;
  if (!Number.isFinite(time) || new Date(time).toISOString() !== capturedAt) fail('invalid capture date; expected canonical ISO UTC from toISOString()');
  return { schemaVersion: 1, capturedAt, hash: createHash('sha256').update(canonicalJson(vectorExport)).digest('hex'), vectorExport };
}

export function readVectorExport(file, { fileKey, nodeId } = {}) {
  const envelope = JSON.parse(readFileSync(file, 'utf8'));
  if (!envelope || typeof envelope !== 'object' || typeof envelope.capturedAt !== 'string' || Object.keys(envelope).sort().join() !== 'capturedAt,hash,schemaVersion,vectorExport') fail('hash or canonical export mismatch');
  const expected = sealVectorExport(envelope.vectorExport, envelope.capturedAt);
  if (envelope.schemaVersion !== 1 || envelope.hash !== expected.hash || canonicalJson(envelope.vectorExport) !== canonicalJson(expected.vectorExport)) fail('hash or canonical export mismatch');
  if (fileKey !== undefined && fileKey !== expected.vectorExport.source.fileKey) fail('file origin differs from the expected one');
  if (nodeId !== undefined && nodeId !== expected.vectorExport.source.nodeId) fail('requested node differs from the expected one');
  return envelope;
}

export function vectorSvg(envelope, id) {
  const vector = envelope.vectorExport.vectors.find(v => v.id === id);
  if (!vector) fail(`unknown vector ${id}`);
  return vector;
}
