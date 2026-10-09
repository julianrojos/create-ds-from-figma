import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSnapshot, verifyEvidence } from './lib/figma-evidence.mjs';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const refList = value => Array.isArray(value) ? value.filter(ref => typeof ref === 'string') : [];

// An entry is resolved by its key, figma.refs or any figma.variants[*].refs: an instance's main component is usually a variant.
export function entryRefs(key, entry) {
  const variants = isObject(entry?.figma?.variants) ? Object.values(entry.figma.variants) : [];
  return [...new Set([key, ...refList(entry?.figma?.refs), ...variants.flatMap(variant => refList(variant?.refs))])];
}

// Components with code on disk, with every ref that can identify them. Malformed entries are reported by the caller, never resolved.
export function mappedComponentsOf(root, entries) {
  const base = realpathSync(root);
  return entries.filter(([, e]) => {
    if (!isObject(e) || typeof e.code?.path !== 'string' || path.isAbsolute(e.code.path) || e.code.path.split(/[\\/]/).includes('..')) return false;
    const code = path.join(root, e.code.path);
    return existsSync(code) && realpathSync(code).startsWith(base + path.sep);
  }).map(([ref, e]) => ({ name: e.name, refs: entryRefs(ref, e) }));
}

export function verifyFigmaEvidence(root) {
  const errors = [], warnings = [], components = [];
  const mapFile = path.join(root, 'design-system/relationships/figma-code-map.json');
  if (!existsSync(mapFile)) return { errors, warnings: ['No generated DS; evidence check NOT RUN'], components };
  let map;
  try { map = JSON.parse(readFileSync(mapFile, 'utf8')); }
  catch (error) { return { errors: [error.message], warnings, components }; }
  if (!isObject(map)) return { errors: ['figma-code-map.json must be an object'], warnings, components };
  const entries = Object.entries(map).filter(([key]) => !key.startsWith('_'));
  let mappedComponents;
  try { mappedComponents = mappedComponentsOf(root, entries); }
  catch (error) { return { errors: [`Cannot resolve mapped components: ${error.message}`], warnings, components }; }
  for (const [key, entry] of entries) {
    if (!isObject(entry)) { errors.push(`${key}: map entry must be an object`); continue; }
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name : key;
    try {
      const relative = entry.designSystem?.metadata;
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid metadata path');
      const base = realpathSync(root), file = realpathSync(path.join(base, relative));
      if (!file.startsWith(base + path.sep)) throw new Error('Metadata escapes project root');
      const metadata = JSON.parse(readFileSync(file, 'utf8'));
      if (!metadata.evidence) {
        errors.push(`${name}: import evidence is required`);
        continue;
      }
      const snapshot = loadSnapshot(root, metadata.evidence.snapshot);
      if (metadata.evidence.hash !== snapshot.hash) throw new Error('Metadata snapshot hash mismatch');
      const result = verifyEvidence(metadata, snapshot.capture, { mappedComponents });
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
