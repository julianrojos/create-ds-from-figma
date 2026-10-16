import { mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../../checks/lib/figma-evidence.mjs';
import { projectFile, renderRequirements, sha256 } from '../../../checks/lib/render-plan.mjs';
import { describeResourceMetadata, inspectResourceMetadata, loadResourceMetadata } from '../../../checks/lib/resource-diagnostics.mjs';

export function registerResource(root, metadataPath, kind, identity, sourcePath, { replace = false } = {}) {
  root = path.resolve(root);
  if (!['font', 'image'].includes(kind) || typeof identity !== 'string' || !identity.trim()) throw new Error('An observed font ID or non-null imageHash is required');
  const context = loadResourceMetadata(root, metadataPath), { metadata, capture } = context;
  const requirements = renderRequirements(capture), next = structuredClone(metadata);
  let selected;
  if (kind === 'font') {
    if (!requirements.fonts.some(font => font.id === identity)) throw new Error('Unknown font ID');
    selected = next.verification.fonts.filter(font => font.id === identity);
    if (selected.length !== 1) throw new Error('Exactly one existing font record is required');
  } else {
    const expected = requirements.assets.filter(asset => asset.imageHash === identity);
    if (!expected.length) throw new Error('Unknown imageHash');
    const keys = new Set(expected.map(asset => `${asset.observation}:${asset.index}`));
    selected = next.verification.assets.filter(asset => keys.has(`${asset.observation}:${asset.index}`) || asset.imageHash === identity);
    if (selected.length !== expected.length || new Set(selected.map(asset => `${asset.observation}:${asset.index}`)).size !== expected.length || selected.some(asset => asset.imageHash !== identity || !keys.has(`${asset.observation}:${asset.index}`))) throw new Error('Every captured occurrence of this imageHash needs one existing matching asset record');
  }
  if (selected.some(record => !record.source || !['file', 'unresolved'].includes(record.source.kind))) throw new Error('Only existing valid source fields can be registered');
  const sourceFile = projectFile(root, sourcePath), sourceBytes = readFileSync(sourceFile);
  if (sourceFile === context.file) throw new Error('A source cannot be the metadata file being rewritten');
  const source = { kind: 'file', path: sourcePath, sha256: sha256(sourceBytes) };
  const changed = selected.some(record => canonicalJson(record.source) !== canonicalJson(source));
  if (!replace && selected.some(record => record.source.kind === 'file' && canonicalJson(record.source) !== canonicalJson(source))) throw new Error('Replacing an existing source path or hash requires --replace');
  for (const record of selected) record.source = structuredClone(source);
  const diagnostic = describeResourceMetadata(root, metadataPath, { ...context, metadata: next });
  if (changed) {
    const directory = mkdtempSync(path.join(path.dirname(context.file), '.resource-'));
    try {
      const temporary = path.join(directory, 'metadata.json');
      writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: statSync(context.file).mode });
      if (projectFile(root, metadataPath) !== context.file || !readFileSync(context.file).equals(context.bytes) || projectFile(root, metadata.evidence.snapshot) !== context.snapshotFile || !readFileSync(context.snapshotFile).equals(context.snapshotBytes) || projectFile(root, sourcePath) !== sourceFile || !readFileSync(sourceFile).equals(sourceBytes)) throw new Error('Metadata, snapshot or source changed during registration; retry without overwriting');
      renameSync(temporary, context.file);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
  return { schemaVersion: 1, status: 'REGISTERED', changed, affectedEntries: selected.length, resource: { kind, identity }, source,
    diagnostic,
    scope: 'Only existing source fields were updated. File identity, weight, licensing, CSS configuration, glyphs and rendered fidelity are not certified. Existing confirmations may become stale.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, root, metadataPath, ...args] = process.argv.slice(2);
    let result;
    if (command === 'inspect' && root && metadataPath && !args.length) result = inspectResourceMetadata(root, metadataPath);
    else if (command === 'register' && root && metadataPath && [3, 4].includes(args.length) && (args.length === 3 || args[3] === '--replace')) result = registerResource(root, metadataPath, args[0], args[1], args[2], { replace: args[3] === '--replace' });
    else throw new Error('Usage: verification-resources.mjs inspect ROOT METADATA | register ROOT METADATA font|image ID_OR_HASH SOURCE_PATH [--replace]');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
