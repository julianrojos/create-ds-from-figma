import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealCapture } from '../../../checks/lib/figma-evidence.mjs';
import { renderRequirements } from '../../../checks/lib/render-plan.mjs';
import { checkResourceBytes, digest, localFile, validateResourcePolicy } from '../../../checks/lib/resource-policy.mjs';

// An explicit source choice produces a proposal, never a policy edit or a download.
export function prepareFontRule(snapshotPath, fontId, source, { root } = {}) {
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  if (sealCapture(snapshot.capture).hash !== snapshot.hash) throw new Error('Snapshot hash mismatch');
  const observed = renderRequirements(snapshot.capture).fonts.find(font => font.id === fontId);
  if (!observed) throw new Error('Font ID not observed; select it from requirements fonts');
  if (!source || typeof source !== 'object' || Array.isArray(source) || Object.keys(source).some(k => !['path', 'origin', 'format', 'version', 'license'].includes(k))) throw new Error('Explicit source path, origin, format, version and license required');
  const stat = statSync(source.path);
  if (!stat.isFile() || stat.size < 1 || stat.size > 33554432) throw new Error('Source must be a non-empty regular file within the size limit');
  const bytes = readFileSync(source.path);
  const rule = { id: fontId, kind: 'font', identity: fontId, origin: source.origin, format: source.format, version: source.version, license: source.license, sha256: digest(bytes) };
  validateResourcePolicy({ schemaVersion: 1, maxBytes: 33554432, rules: [rule] });
  checkResourceBytes(bytes, rule, 33554432);
  let originVerification = { status: 'NOT VERIFIED', reason: source.origin.kind === 'local' ? 'No ROOT supplied: only source.path was read; origin.path has not been checked.' : 'HTTPS origin was not contacted: only source.path was read and hashed.' };
  if (source.origin.kind === 'local' && root !== undefined) {
    const originFile = localFile(root, source.origin.path);
    if (statSync(originFile).size > 33554432 || digest(readFileSync(originFile)) !== rule.sha256) throw new Error(`Local origin ${JSON.stringify(source.origin.path)} differs from source.path bytes`);
    originVerification = { status: 'MATCHES_SOURCE_BYTES', path: source.origin.path, sha256: rule.sha256 };
  }
  return { status: 'PROPOSED', snapshotHash: snapshot.hash, font: observed.font, rule, bytes: bytes.length, originVerification,
    scope: 'Observed font identity and hash of source.path only; originVerification separately states whether local origin bytes were checked. Source choice, license and version are supplied declarations, not authenticated facts or proof of font equivalence. No policy was written or authorization granted.' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [snapshot, fontId, sourceFile, ...extra] = process.argv.slice(2);
    if (!snapshot || !fontId || !sourceFile || extra.length !== 0 && (extra.length !== 2 || extra[0] !== '--root' || !extra[1])) throw new Error('Usage: prepare-font-rule.mjs SNAPSHOT FONT_ID SOURCE_JSON [--root ROOT]');
    console.log(JSON.stringify(prepareFontRule(snapshot, fontId, JSON.parse(readFileSync(sourceFile, 'utf8')), { root: extra[1] }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
