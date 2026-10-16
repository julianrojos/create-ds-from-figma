import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureInventory } from './lib/capture-inventory.mjs';
import { transportChecksum } from './lib/capture-figma.mjs';
import { assembleChunks } from './lib/capture-code.mjs';
import { bridgeCode } from './lib/capture-bridge.mjs';
import { canonicalJson } from '../../../checks/lib/figma-evidence.mjs';
import { readInventory, sealInventory } from '../../../checks/lib/variable-inventory.mjs';

export function inventoryCode(fileKey, offset = 0, chunkSize = 12000) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileKey) || !Number.isSafeInteger(offset) || offset < 0 ||
      (chunkSize !== null && (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 12000)) || (chunkSize === null && offset !== 0)) throw new Error('Invalid inventory transport arguments');
  return `const canonicalJson = ${canonicalJson.toString()};\nconst checksum = ${transportChecksum.toString()};\nconst data = await (${captureInventory.toString()})(figma, ${JSON.stringify({ fileKey })});\nconst payload = canonicalJson(data);\nreturn { transportVersion: 1, offset: ${offset}, total: payload.length, checksum: checksum(payload), payload: ${chunkSize === null ? 'payload' : `payload.slice(${offset}, ${offset + chunkSize})`} };`;
}

export function sessionInventory(directory) {
  const chunks = readdirSync(directory).filter(f => /^\d+\.json$/.test(f)).map(f => JSON.parse(readFileSync(path.join(directory, f), 'utf8')));
  return sealInventory(assembleChunks(chunks));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'code' && [1, 2].includes(args.length)) { process.stdout.write(inventoryCode(args[0], Number(args[1] || 0)) + '\n'); return; }
  if (command === 'bridge' && args.length === 1) { inventoryCode(args[0]); process.stdout.write(bridgeCode(fileURLToPath(import.meta.url), args[0], null) + '\n'); return; }
  if (command === 'session' && !args.length) result = mkdtempSync(path.join(os.tmpdir(), 'figma-inventory-'));
  else if (command === 'stage' && args.length === 1) {
    const chunk = JSON.parse(readFileSync(0, 'utf8'));
    if (chunk.transportVersion !== 1 || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0 || typeof chunk.payload !== 'string') throw new Error('Invalid inventory chunk');
    writeFileSync(path.join(args[0], `${chunk.offset}.json`), JSON.stringify(chunk) + '\n', { flag: 'wx' });
    result = { staged: chunk.offset };
  } else if (command === 'validate-session' && args.length === 1) {
    const envelope = sessionInventory(args[0]); result = { hash: envelope.hash, fileKey: envelope.inventory.source.fileKey, variables: envelope.inventory.variables.length };
  } else if (command === 'save' && args.length === 2) {
    const envelope = sessionInventory(args[0]);
    if (existsSync(args[1])) {
      if (readInventory(args[1]).hash !== envelope.hash) throw new Error('Existing inventory differs; never overwrite');
    } else writeFileSync(args[1], JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
    result = { path: path.resolve(args[1]), hash: envelope.hash, scope: 'Integrity and declared provenance, not authenticity or atomic Figma revision.' };
  } else if (command === 'capture' && args.length >= 3 && args.slice(2).includes('--approve-connection') && args.slice(2).every(f => ['--approve-connection', '--keep-failed'].includes(f))) {
    const { capturePayloadFromMcp } = await import('./lib/capture-mcp.mjs');
    result = await capturePayloadFromMcp(JSON.parse(readFileSync(args[1], 'utf8')), args[0], null, {
      approvedConnection: true, keepFailed: args.includes('--keep-failed'),
      codeFor: (offset, size) => inventoryCode(args[0], offset, size),
      validate: raw => { const sealed = sealInventory(raw); return { hash: sealed.hash, variables: sealed.inventory.variables.length }; } });
  } else throw new Error('Use code FILE [OFFSET], bridge FILE, capture FILE CONFIG --approve-connection [--keep-failed], session, stage SESSION, validate-session SESSION or save SESSION OUTPUT');
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(`Figma inventory: ${error.message}`); process.exitCode = 1; }
}
