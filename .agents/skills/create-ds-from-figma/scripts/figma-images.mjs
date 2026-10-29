import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../../checks/lib/figma-evidence.mjs';
import { authorizedRule, checkResourceBytes, loadResourcePolicy } from '../../../checks/lib/resource-policy.mjs';
import { transportChecksum } from './lib/capture-figma.mjs';
import { assembleChunks } from './lib/capture-code.mjs';
import { bridgeCode } from './lib/capture-bridge.mjs';
import { resolveResource } from './resolve-resources.mjs';

export function imageCode(fileKey, imageHash, maxBytes, offset = 0, chunkSize = 12000) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileKey) || !/^[a-f0-9]{40}$/.test(imageHash) || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 33554432 || !Number.isSafeInteger(offset) || offset < 0 || (chunkSize === null ? offset !== 0 : !Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 12000)) throw new Error('Invalid original-image transport arguments');
  return `if (figma.fileKey !== ${JSON.stringify(fileKey)}) throw new Error('Active Figma file differs or cannot be verified');
const image = figma.getImageByHash(${JSON.stringify(imageHash)});
if (!image) throw new Error('Original Figma image unavailable');
const bytes = await image.getBytesAsync();
if (!bytes.length || bytes.length > ${maxBytes}) throw new Error('Original image exceeds byte budget or is empty');
const data = {schemaVersion:1,collector:'figma-image-v1',fileKey:${JSON.stringify(fileKey)},imageHash:${JSON.stringify(imageHash)},byteLength:bytes.length,base64:figma.base64Encode(bytes)};
const canonicalJson = ${canonicalJson.toString()}; const checksum = ${transportChecksum.toString()}; const payload = canonicalJson(data);
return {transportVersion:1,offset:${offset},total:payload.length,checksum:checksum(payload),payload:${chunkSize === null ? 'payload' : `payload.slice(${offset},${offset + chunkSize})`}};`;
}
export function decodeImage(raw, { fileKey, imageHash, maxBytes = 33554432 } = {}) {
  if (raw?.schemaVersion !== 1 || raw.collector !== 'figma-image-v1' || !/^[A-Za-z0-9_-]+$/.test(raw.fileKey) || !/^[a-f0-9]{40}$/.test(raw.imageHash) || typeof raw.base64 !== 'string' || raw.base64.length > Math.ceil(maxBytes / 3) * 4 || !Number.isSafeInteger(raw.byteLength)) throw new Error('Invalid original-image payload');
  if (fileKey !== undefined && raw.fileKey !== fileKey || imageHash !== undefined && raw.imageHash !== imageHash) throw new Error('Original-image source identity differs');
  const bytes = Buffer.from(raw.base64, 'base64');
  if (!bytes.length || bytes.length > maxBytes || raw.byteLength !== bytes.length || bytes.toString('base64') !== raw.base64 || createHash('sha1').update(bytes).digest('hex') !== raw.imageHash) throw new Error('Original-image bytes or identity differ');
  return { raw, bytes };
}
export function imageSession(directory, expected) {
  return decodeImage(assembleChunks(readdirSync(directory).filter(f => /^\d+\.json$/.test(f)).map(f => JSON.parse(readFileSync(path.join(directory, f), 'utf8')))), expected);
}
function context(root, requestPath) {
  const request = JSON.parse(readFileSync(requestPath, 'utf8')), state = loadResourcePolicy(root), rule = authorizedRule(state, request);
  if (request.kind !== 'image' || rule.origin.kind !== 'figma') throw new Error('An authorized Figma image rule is required');
  return { request, rule, maxBytes: state.policy.maxBytes };
}
export async function resolveImageSession(root, requestPath, directory) {
  const { request, rule, maxBytes } = context(root, requestPath);
  const base = realpathSync(root), output = realpathSync(directory);
  if (output === base || output.startsWith(base + path.sep)) throw new Error('Image capture must remain outside the project');
  const { bytes } = imageSession(output, { fileKey: request.fileKey, imageHash: request.identity, maxBytes });
  checkResourceBytes(bytes, rule, maxBytes);
  const input = path.join(output, `original-${request.identity}.${rule.format}`);
  if (existsSync(input)) {
    if (realpathSync(input) !== input || !readFileSync(input).equals(bytes)) throw new Error('Existing original image differs or is a symlink');
  } else writeFileSync(input, bytes, { flag: 'wx' });
  return resolveResource(root, { ...request, input }, output);
}
async function main() {
  const [command, ...args] = process.argv.slice(2); let result;
  if (command === 'code' && [3, 4].includes(args.length)) { console.log(imageCode(args[0], args[1], Number(args[2]), Number(args[3] || 0))); return; }
  if (command === 'bridge' && (args.length === 2 || args.length === 4 && args[2] === '--max-chunks')) {
    const { request, maxBytes } = context(args[0], args[1]);
    imageCode(request.fileKey, request.identity, maxBytes);
    console.log(bridgeCode(fileURLToPath(import.meta.url), request.fileKey, request.identity, { codeArguments: [String(maxBytes)], maxChunks: args.length === 4 ? Number(args[3]) : 256 })); return;
  }
  if (command === 'session' && !args.length) result = mkdtempSync(path.join(os.tmpdir(), 'figma-images-'));
  else if (command === 'stage' && args.length === 1) {
    const chunk = JSON.parse(readFileSync(0, 'utf8'));
    if (chunk.transportVersion !== 1 || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0 || typeof chunk.payload !== 'string' || chunk.payload.length > 45 * 1024 * 1024) throw new Error('Invalid image chunk');
    writeFileSync(path.join(args[0], `${chunk.offset}.json`), JSON.stringify(chunk) + '\n', { flag: 'wx' }); result = { staged: chunk.offset };
  } else if (command === 'validate-session' && args.length === 1) {
    const { raw, bytes } = imageSession(args[0]); result = { fileKey: raw.fileKey, imageHash: raw.imageHash, bytes: bytes.length };
  } else if (command === 'resolve' && args.length === 3) result = await resolveImageSession(...args);
  else if (command === 'capture' && args.length >= 4 && args.slice(3).includes('--approve-connection') && args.slice(3).every(f => ['--approve-connection', '--keep-failed'].includes(f))) {
    const { request, maxBytes } = context(args[0], args[1]);
    const { capturePayloadFromMcp } = await import('./lib/capture-mcp.mjs');
    const captured = await capturePayloadFromMcp(JSON.parse(readFileSync(args[2], 'utf8')), request.fileKey, request.identity, {
      approvedConnection: true, keepFailed: args.includes('--keep-failed'),
      codeFor: (offset, size) => imageCode(request.fileKey, request.identity, maxBytes, offset, size),
      validate: raw => ({ bytes: decodeImage(raw, { fileKey: request.fileKey, imageHash: request.identity, maxBytes }).bytes.length }) });
    result = await resolveImageSession(args[0], args[1], captured.directory);
  } else throw new Error('Use bridge ROOT REQUEST [--max-chunks N], capture ROOT REQUEST CONFIG --approve-connection [--keep-failed], code FILE HASH MAX_BYTES [OFFSET], session, stage SESSION, validate-session SESSION or resolve ROOT REQUEST SESSION');
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(`Figma images: ${error.message}`); process.exitCode = 1; }
}
