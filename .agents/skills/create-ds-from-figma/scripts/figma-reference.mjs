import { readFileSync, readdirSync, writeFileSync, mkdirSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { canonicalJson } from '../../../checks/lib/figma-evidence.mjs';
import { sha256 } from '../../../checks/lib/render-plan.mjs';
import { transportChecksum } from './lib/capture-figma.mjs';
import { assembleChunks } from './lib/capture-code.mjs';
import { bridgeCode } from './lib/capture-bridge.mjs';

export function referenceCode(fileKey, nodeId, scale, offset = 0, chunkSize = 12000) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileKey) || !/^\d+:\d+$/.test(nodeId) || !Number.isFinite(scale) || scale <= 0 || scale > 4 ||
      !Number.isSafeInteger(offset) || offset < 0 || (chunkSize === null ? offset !== 0 : !Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 12000)) throw new Error('Invalid reference export arguments; scale must be explicit, positive and at most 4');
  return `if (figma.fileKey !== ${JSON.stringify(fileKey)}) throw new Error('Active file identity differs or is unavailable');
const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
if (!node || typeof node.exportAsync !== 'function' || !Number.isFinite(node.width) || !Number.isFinite(node.height)) throw new Error('Exportable bounded node required');
if (Math.ceil(node.width * ${scale}) * Math.ceil(node.height * ${scale}) > 16 * 1024 * 1024) throw new Error('Reference exceeds pixel budget');
const bytes = await node.exportAsync({format:'PNG', constraint:{type:'SCALE',value:${scale}}, contentsOnly:false, useAbsoluteBounds:true});
if (bytes.length > 32 * 1024 * 1024) throw new Error('Reference exceeds byte budget');
const data = { schemaVersion:1, fileKey:${JSON.stringify(fileKey)}, nodeId:${JSON.stringify(nodeId)}, scale:${scale}, scope:'node-bounds', base64:figma.base64Encode(bytes) };
const canonicalJson = ${canonicalJson.toString()}; const checksum = ${transportChecksum.toString()}; const payload = canonicalJson(data);
return {transportVersion:1,offset:${offset},total:payload.length,checksum:checksum(payload),capturedAt:new Date().toISOString(),payload:${chunkSize === null ? 'payload' : `payload.slice(${offset}, ${offset + chunkSize})`}};`;
}

export function decodeReference(raw) {
  if (raw?.schemaVersion !== 1 || !/^[A-Za-z0-9_-]+$/.test(raw.fileKey) || !/^\d+:\d+$/.test(raw.nodeId) || raw.scope !== 'node-bounds' ||
      !Number.isFinite(raw.scale) || raw.scale <= 0 || raw.scale > 4 || typeof raw.base64 !== 'string' || raw.base64.length > 45 * 1024 * 1024) throw new Error('Invalid PNG export payload');
  const bytes = Buffer.from(raw.base64, 'base64');
  if (bytes.toString('base64') !== raw.base64 || bytes.length < 33 || bytes.length > 32 * 1024 * 1024 ||
      !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 16 * 1024 * 1024) throw new Error('Invalid or oversized PNG');
  const png = PNG.sync.read(bytes, { checkCRC: true });
  if (!png.width || !png.height) throw new Error('Empty PNG');
  return { bytes, hash: sha256(bytes), width: png.width, height: png.height };
}

export function referenceSession(directory) {
  const chunks = readdirSync(directory).filter(f => /^\d+\.json$/.test(f)).map(f => JSON.parse(readFileSync(path.join(directory, f), 'utf8'))).sort((a, b) => a.offset - b.offset);
  if (chunks.some(c => {
    const value = c?.capturedAt;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return true;
    const time = Date.parse(value);
    return !Number.isFinite(time) || new Date(time).toISOString() !== value;
  })) throw new Error('Invalid source export timestamp; expected canonical ISO UTC with a four-digit year');
  const raw = assembleChunks(chunks), image = decodeReference(raw);
  return { raw, image, capturedAt: chunks[0].capturedAt };
}

export function saveReference(root, directory) {
  const { raw, image, capturedAt } = referenceSession(directory);
  const relative = `design-system/verification/artifacts/figma-${image.hash}.png`, base = realpathSync(root);
  let current = base;
  for (const part of relative.split('/').slice(0, -1)) {
    current = path.join(current, part);
    if (existsSync(current) && !realpathSync(current).startsWith(base + path.sep)) throw new Error('Artifact directory escapes project');
  }
  mkdirSync(path.dirname(path.join(base, relative)), { recursive: true });
  const file = path.join(base, relative);
  if (existsSync(file)) {
    if (!realpathSync(file).startsWith(base + path.sep) || !readFileSync(file).equals(image.bytes)) throw new Error('Existing PNG differs or escapes project');
  } else writeFileSync(file, image.bytes, { flag: 'wx' });
  return { kind: 'figma-screenshot', path: relative, sha256: image.hash, export: { scope: raw.scope, scale: raw.scale },
    provenance: { tool: 'figma-reference-v1', capturedAt, figmaRef: `${raw.fileKey}:${raw.nodeId}` } };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'code' && [3, 4].includes(args.length)) { process.stdout.write(referenceCode(args[0], args[1], Number(args[2]), Number(args[3] || 0)) + '\n'); return; }
  if (command === 'bridge' && args.length === 3) {
    referenceCode(args[0], args[1], Number(args[2])); process.stdout.write(bridgeCode(fileURLToPath(import.meta.url), args[0], args[1], { codeArguments: [args[2]] }) + '\n'); return;
  }
  if (command === 'stage' && args.length === 1) {
    const chunk = JSON.parse(readFileSync(0, 'utf8'));
    if (chunk.transportVersion !== 1 || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0 || typeof chunk.payload !== 'string') throw new Error('Invalid reference chunk');
    writeFileSync(path.join(args[0], `${chunk.offset}.json`), JSON.stringify(chunk) + '\n', { flag: 'wx' }); result = { staged: chunk.offset };
  } else if (command === 'session' && !args.length) {
    const { mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); result = mkdtempSync(path.join(tmpdir(), 'figma-reference-'));
  } else if (command === 'validate-session' && args.length === 1) {
    const { image } = referenceSession(args[0]); result = { hash: image.hash, width: image.width, height: image.height };
  } else if (command === 'save' && args.length === 2) result = saveReference(args[0], args[1]);
  else if (command === 'capture' && args.length >= 5 && args.slice(4).includes('--approve-connection') && args.slice(4).every(f => ['--approve-connection', '--keep-failed'].includes(f))) {
    const { capturePayloadFromMcp } = await import('./lib/capture-mcp.mjs');
    result = await capturePayloadFromMcp(JSON.parse(readFileSync(args[3], 'utf8')), args[0], args[1], { approvedConnection: true, keepFailed: args.includes('--keep-failed'),
      codeFor: (offset, size) => referenceCode(args[0], args[1], Number(args[2]), offset, size),
      validate: raw => { const image = decodeReference(raw); return { hash: image.hash, width: image.width, height: image.height }; } });
  } else throw new Error('Use code FILE NODE SCALE [OFFSET], bridge FILE NODE SCALE, capture FILE NODE SCALE CONFIG --approve-connection [--keep-failed], session, stage SESSION, validate-session SESSION or save ROOT SESSION');
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(`Figma reference: ${error.message}`); process.exitCode = 1; }
}
