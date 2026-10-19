import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { canonicalJson } from './figma-evidence.mjs';

function freezeJson(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeJson); Object.freeze(value); }
  return value;
}

// Cache parsing/validation, not freshness. Every lookup resolves the safe path and hashes current bytes.
export function createEvidenceSession(root, { metadataOverrides = new Map() } = {}) {
  const base = realpathSync(root), parsed = new Map(), derived = new Map();
  if (!(metadataOverrides instanceof Map)) throw new Error('metadataOverrides must be a Map');
  const stats = { reads: 0, parses: 0, validations: 0 };
  const read = (relative, { allowOverrides = true } = {}) => {
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => ['.', '..'].includes(p))) throw new Error('Invalid evidence input path');
    const file = realpathSync(path.resolve(base, relative));
    if (!file.startsWith(base + path.sep)) throw new Error('Evidence input escapes project');
    const overridden = allowOverrides && metadataOverrides.has(relative);
    const bytes = overridden ? Buffer.from(canonicalJson(metadataOverrides.get(relative))) : readFileSync(file);
    stats.reads++;
    const hash = createHash('sha256').update(bytes).digest('hex'), key = `${file}:${overridden ? 'candidate' : 'disk'}`;
    if (parsed.get(key)?.hash !== hash) { parsed.set(key, Object.freeze({ hash, value: freezeJson(JSON.parse(bytes.toString('utf8'))) })); stats.parses++; }
    return parsed.get(key);
  };
  const memo = (key, hash, build) => {
    if (derived.get(key)?.hash !== hash) { const value = build(); derived.set(key, { hash, value }); stats.validations++; }
    return derived.get(key).value;
  };
  return { root: base, metadataOverrides, stats, read, memo,
    json: relative => structuredClone(read(relative).value) };
}

export function evidenceSessionFor(root, { evidenceSession, metadataOverrides } = {}) {
  if (!evidenceSession) return createEvidenceSession(root, { metadataOverrides });
  if (evidenceSession.root !== realpathSync(root) || metadataOverrides !== undefined && metadataOverrides !== evidenceSession.metadataOverrides) throw new Error('Evidence session root or override context differs');
  return evidenceSession;
}
