import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSnapshot, verifyEvidence } from './lib/figma-evidence.mjs';
import { entryRefs } from './lib/figma-map.mjs';
import { evidenceSessionFor } from './lib/evidence-session.mjs';
export { entryRefs } from './lib/figma-map.mjs';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function mappedDelegations(root, metadata, options = {}) {
  if (metadata && !(metadata.evidence?.dispositions || []).some(d => d.kind === 'delegated')) return [];
  const evidenceSession = evidenceSessionFor(root, options);
  const map = evidenceSession.json('design-system/relationships/figma-code-map.json');
  const names = metadata ? new Set(metadata.evidence.dispositions.filter(d => d.kind === 'delegated').map(d => d.resolvedComponent)) : undefined;
  return mappedComponentsOf(root, Object.entries(map).filter(([key]) => !key.startsWith('_')), { ...options, evidenceSession, names });
}

// Components with code on disk, with every ref that can identify them. Malformed entries are reported by the caller, never resolved.
export function mappedComponentsOf(root, entries, { names, ...options } = {}) {
  const evidenceSession = evidenceSessionFor(root, options);
  const base = realpathSync(root);
  return entries.filter(([, e]) => {
    if (!isObject(e) || names && !names.has(e.name) || typeof e.code?.path !== 'string' || path.isAbsolute(e.code.path) || e.code.path.split(/[\\/]/).includes('..')) return false;
    const code = path.join(root, e.code.path);
    return existsSync(code) && realpathSync(code).startsWith(base + path.sep);
  }).map(([ref, e]) => {
    const component = { name: e.name, refs: entryRefs(ref, e) };
    try {
      const relative = e.designSystem?.metadata;
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Mapped metadata path unavailable or unsafe');
      const file = realpathSync(path.resolve(base, relative));
      if (!file.startsWith(base + path.sep)) throw new Error('Mapped metadata escapes project');
      const metadata = evidenceSession.json(relative);
      if (metadata.code?.path !== e.code.path || metadata.code?.component !== e.code.component) throw new Error('Mapped metadata code identity differs');
      const snapshot = loadSnapshot(root, metadata.evidence?.snapshot, { evidenceSession });
      if (metadata.evidence?.hash !== snapshot.hash) throw new Error('Mapped metadata snapshot hash mismatch');
      Object.assign(component, { capture: snapshot.capture, hash: snapshot.hash, snapshot: metadata.evidence.snapshot });
    } catch (error) { component.snapshotProblem = error.message; }
    return component;
  });
}

export function verifyFigmaEvidence(root, { contexts = new Map(), ...options } = {}) {
  const errors = [], warnings = [], components = [];
  const mapFile = path.join(root, 'design-system/relationships/figma-code-map.json');
  if (!existsSync(mapFile)) return { errors, warnings: ['No generated DS; evidence check NOT RUN'], components };
  const evidenceSession = evidenceSessionFor(root, options);
  let map;
  try { map = evidenceSession.json('design-system/relationships/figma-code-map.json'); }
  catch (error) { return { errors: [error.message], warnings, components }; }
  if (!isObject(map)) return { errors: ['figma-code-map.json must be an object'], warnings, components };
  const entries = Object.entries(map).filter(([key]) => !key.startsWith('_'));
  let mappedComponents;
  try { mappedComponents = mappedComponentsOf(root, entries, { evidenceSession }); }
  catch (error) { return { errors: [`Cannot resolve mapped components: ${error.message}`], warnings, components }; }
  for (const [key, entry] of entries) {
    if (!isObject(entry)) { errors.push(`${key}: map entry must be an object`); continue; }
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name : key;
    try {
      const relative = entry.designSystem?.metadata;
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid metadata path');
      const base = realpathSync(root), file = realpathSync(path.join(base, relative));
      if (!file.startsWith(base + path.sep)) throw new Error('Metadata escapes project root');
      const metadata = evidenceSession.json(relative);
      if (!metadata.evidence) {
        errors.push(`${name}: import evidence is required`);
        continue;
      }
      const snapshot = loadSnapshot(root, metadata.evidence.snapshot, { evidenceSession });
      if (metadata.evidence.hash !== snapshot.hash) throw new Error('Metadata snapshot hash mismatch');
      const result = verifyEvidence(metadata, snapshot.capture, { mappedComponents });
      contexts.set(key, { metadata, capture: snapshot.capture, entry, result });
      errors.push(...result.errors.map(e => `${name}: ${e}`));
      warnings.push(...result.warnings.map(e => `${name}: ${e}`));
      components.push({ name, ...result.coverage, review: result.review });
    } catch (error) { errors.push(`${name}: ${error.message}`); }
  }
  return { errors, warnings, components };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyFigmaEvidence(path.resolve(process.argv[2] || '.'));
  console.log(JSON.stringify(result, null, 2));
  console.log(`${result.errors.length ? 'FAIL' : result.warnings.length ? 'NOT VERIFIED' : 'PASS'}: captured evidence only; rendering and live Figma completeness are separate checks`);
  if (result.errors.length) process.exitCode = 1;
}
