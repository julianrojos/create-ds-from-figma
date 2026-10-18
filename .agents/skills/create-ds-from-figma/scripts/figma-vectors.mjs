import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { captureVectors } from './lib/capture-vectors.mjs';
import { transportChecksum } from './lib/capture-figma.mjs';
import { assembleChunks } from './lib/capture-code.mjs';
import { bridgeCode } from './lib/capture-bridge.mjs';
import { canonicalJson } from '../../../checks/lib/figma-evidence.mjs';
import { readVectorExport, sealVectorExport, vectorSvg } from '../../../checks/lib/vector-export.mjs';

export function vectorCode(fileKey, nodeId, offset = 0, chunkSize = 12000) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileKey) || !/^\d+:\d+$/.test(nodeId) || !Number.isSafeInteger(offset) || offset < 0 ||
      (chunkSize !== null && (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 12000)) || (chunkSize === null && offset !== 0)) throw new Error('Invalid vector transport arguments');
  return `const canonicalJson = ${canonicalJson.toString()};\nconst checksum = ${transportChecksum.toString()};\nconst data = await (${captureVectors.toString()})(figma, ${JSON.stringify({ fileKey, nodeId })});\nconst payload = canonicalJson(data);\nreturn { transportVersion: 1, offset: ${offset}, total: payload.length, checksum: checksum(payload), payload: ${chunkSize === null ? 'payload' : `payload.slice(${offset}, ${offset + chunkSize})`} };`;
}

export function sessionVectors(directory) {
  const chunks = readdirSync(directory).filter(f => /^\d+\.json$/.test(f)).map(f => JSON.parse(readFileSync(path.join(directory, f), 'utf8')));
  return sealVectorExport(assembleChunks(chunks));
}

// The SVG is written exactly as Figma exported it and never overwritten: the file, not its description, is the authorized resource.
export function writeVectorSvg(envelope, id, output) {
  const vector = vectorSvg(envelope, id), bytes = Buffer.from(vector.svg);
  writeFileSync(output, bytes, { flag: 'wx' });
  return { path: path.resolve(output), vector: { id: vector.id, name: vector.name, type: vector.type, visible: vector.visible, width: vector.width, height: vector.height },
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    scope: 'Original Figma SVG export of one node, not an authorization, a CSS equivalence or proof of rendered fidelity. Register or reference it only where the user authorized it.' };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'code' && [2, 3].includes(args.length)) { process.stdout.write(vectorCode(args[0], args[1], Number(args[2] || 0)) + '\n'); return; }
  if (command === 'bridge' && args.length === 2) { vectorCode(args[0], args[1]); process.stdout.write(bridgeCode(fileURLToPath(import.meta.url), args[0], args[1]) + '\n'); return; }
  if (command === 'session' && !args.length) result = mkdtempSync(path.join(os.tmpdir(), 'figma-vectors-'));
  else if (command === 'stage' && args.length === 1) {
    const chunk = JSON.parse(readFileSync(0, 'utf8'));
    if (chunk.transportVersion !== 1 || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0 || typeof chunk.payload !== 'string') throw new Error('Invalid vector chunk');
    writeFileSync(path.join(args[0], `${chunk.offset}.json`), JSON.stringify(chunk) + '\n', { flag: 'wx' });
    result = { staged: chunk.offset };
  } else if (command === 'validate-session' && args.length === 1) {
    const envelope = sessionVectors(args[0]);
    result = { hash: envelope.hash, fileKey: envelope.vectorExport.source.fileKey, nodeId: envelope.vectorExport.source.nodeId, vectors: envelope.vectorExport.vectors.length };
  } else if (command === 'save' && args.length === 2) {
    const envelope = sessionVectors(args[0]);
    if (existsSync(args[1])) {
      if (readVectorExport(args[1]).hash !== envelope.hash) throw new Error('Existing vector export differs; never overwrite');
    } else writeFileSync(args[1], JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
    result = { path: path.resolve(args[1]), hash: envelope.hash, vectors: envelope.vectorExport.vectors.length, scope: 'Integrity and declared provenance, not authenticity or atomic Figma revision.' };
  } else if (command === 'svg' && args.length === 3) result = writeVectorSvg(readVectorExport(args[0]), args[1], args[2]);
  else if (command === 'capture' && args.length >= 3 && args.slice(3).includes('--approve-connection') && args.slice(3).every(f => ['--approve-connection', '--keep-failed'].includes(f))) {
    const { capturePayloadFromMcp } = await import('./lib/capture-mcp.mjs');
    result = await capturePayloadFromMcp(JSON.parse(readFileSync(args[2], 'utf8')), args[0], args[1], {
      approvedConnection: true, keepFailed: args.includes('--keep-failed'),
      codeFor: (offset, size) => vectorCode(args[0], args[1], offset, size),
      validate: raw => { const sealed = sealVectorExport(raw); return { hash: sealed.hash, vectors: sealed.vectorExport.vectors.length }; } });
  } else throw new Error('Use code FILE NODE [OFFSET], bridge FILE NODE, capture FILE NODE CONFIG --approve-connection [--keep-failed], session, stage SESSION, validate-session SESSION, save SESSION OUTPUT or svg EXPORT VECTOR_ID OUTPUT.svg');
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(`Figma vectors: ${error.message}`); process.exitCode = 1; }
}
