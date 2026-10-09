import { captureFigma, captureProfile, extractObservations, transportChecksum } from './capture-figma.mjs';
import { canonicalJson } from '../../../../checks/lib/figma-evidence.mjs';

export function captureCode(fileKey, nodeId, offset = 0, chunkSize = 12000) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileKey) || !/^\d+:\d+$/.test(nodeId) || !Number.isSafeInteger(offset) || offset < 0 ||
      (chunkSize !== null && (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 12000)) || (chunkSize === null && offset !== 0)) throw new Error('Invalid capture arguments');
  const payloadExpression = chunkSize === null ? 'payload' : `payload.slice(${offset}, ${offset + chunkSize})`;
  return `const extractObservations = ${extractObservations.toString()};\nconst captureProfile = ${captureProfile.toString()};\nconst canonicalJson = ${canonicalJson.toString()};\nconst checksum = ${transportChecksum.toString()};\nconst capture = await (${captureFigma.toString()})(figma, ${JSON.stringify({ fileKey, nodeId })}, extractObservations);\nconst payload = canonicalJson(capture);\nreturn { transportVersion: 1, offset: ${offset}, total: payload.length, checksum: checksum(payload), payload: ${payloadExpression} };`;
}

export function assembleChunks(chunks) {
  if (!Array.isArray(chunks) || !chunks.length) throw new Error('Nonempty chunks array required');
  const ordered = [...chunks].sort((a, b) => a.offset - b.offset);
  let next = 0, payload = '';
  for (const c of ordered) {
    if (c.transportVersion !== 1 || c.offset !== next || typeof c.payload !== 'string' || !c.payload.length ||
        !Number.isSafeInteger(c.total) || c.total < 1 || c.total !== ordered[0].total || c.checksum !== ordered[0].checksum) throw new Error('Missing, duplicate, inconsistent or changed capture chunks');
    payload += c.payload; next += c.payload.length;
  }
  if (next !== ordered[0].total || transportChecksum(payload) !== ordered[0].checksum) throw new Error('Truncated or corrupted capture transport');
  return JSON.parse(payload);
}
