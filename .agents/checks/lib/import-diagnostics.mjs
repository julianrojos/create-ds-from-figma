import { existsSync, readFileSync } from 'node:fs';
import { projectFile } from './render-plan.mjs';
import { loadSnapshot } from './figma-evidence.mjs';
import { verifyTokenStyles } from './token-styles.mjs';

export function captureRecoveryAction(metadataPath, snapshot, diagnostic) {
  const recapture = ['EMPTY', 'INCOMPATIBLE'].includes(diagnostic.kind);
  return { code: diagnostic.kind === 'INVALID_REFERENCE' ? 'REVIEW_CAPTURE_REFERENCE' : recapture ? 'OBTAIN_VALID_CAPTURE' : 'RESTORE_OR_INSPECT_CAPTURE', targets: [metadataPath], resources: [],
    capture: { path: snapshot ?? null, ...diagnostic }, command: null,
    permissions: ['project-read'],
    prerequisites: recapture
      ? ['Inspect whether this is a historical snapshot first; restore a known valid original when appropriate.', 'Otherwise obtain a fresh capture with a reviewed, explicitly authorized transport in a temporary session, then save explicitly. Never hand-write, patch or overwrite historical evidence; do not add --approve-connection without authorization.']
      : ['Inspect the path, permissions and retained original. Restore missing or corrupt historical bytes from a trusted backup or Git when available.', 'If restoration is impossible, obtain authorization for a new capture at a new path and revalidate affected metadata and confirmations. Never repair hashes or fabricate observations.'] };
}

// Recovery guidance is independent of snapshot validity. No writes, inference of units or approvals.
export function importDiagnostics(root, { metadataPath } = {}) {
  const nextActions = [], components = [], warnings = [];
  let entries;
  try {
    const relative = 'design-system/relationships/figma-code-map.json';
    if (!existsSync(`${root}/${relative}`)) return { components, warnings, nextActions };
    const map = JSON.parse(readFileSync(projectFile(root, relative), 'utf8'));
    entries = Object.entries(map).filter(([key, entry]) => !key.startsWith('_') && entry?.designSystem?.metadata && (!metadataPath || entry.designSystem.metadata === metadataPath));
  } catch (error) { return { components, warnings: [`Import diagnostics incomplete: ${error.message}`], nextActions }; }
  for (const [, entry] of entries) {
    const target = entry.designSystem.metadata;
    let metadata;
    try {
      metadata = JSON.parse(readFileSync(projectFile(root, target), 'utf8'));
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Metadata must be an object');
    }
    catch (error) { warnings.push(`${target}: import diagnostics incomplete; consumption and capture are unknown: ${error.message}`); continue; }
    const component = typeof entry.name === 'string' ? entry.name : typeof metadata.name === 'string' ? metadata.name : target;
    const record = { metadataPath: target, name: component };
    try {
      const snapshot = loadSnapshot(root, metadata.evidence?.snapshot);
      if (snapshot.hash !== metadata.evidence?.hash) {
        record.capture = { kind: 'CORRUPT', reason: 'Metadata snapshot hash differs from the retained snapshot; inspect the historical association, do not replace the hash blindly.' };
      }
    } catch (error) {
      record.capture = error.captureDiagnostic || { kind: 'INVALID_REFERENCE', reason: error.message };
    }
    if (record.capture) nextActions.push(captureRecoveryAction(target, metadata.evidence?.snapshot, record.capture));
    try {
      const tokens = verifyTokenStyles(root, metadata);
      warnings.push(...tokens.warnings.map(warning => `${component}: ${warning}`));
      record.serialization = { consumption: tokens.consumption, pending: tokens.pendingFloats, warnings: tokens.warnings };
      const identified = tokens.pendingFloats.filter(v => v.references.length);
      if (identified.length) nextActions.push({ code: 'RESOLVE_FLOAT_SERIALIZATION', targets: [target], resources: identified.map(v => v.id),
        variables: identified, component, consumption: tokens.consumption,
        prerequisites: ['Inspect each identified binding, literal style reference and alias chain. Record css serialization and its observed binding evidence or an explicit user decision in figma-state.json.',
          'Do not default to px, infer units from names or manufacture binding evidence. If evidence is missing, capture first. Alias-only variables inherit their targets.',
          'After recording valid decisions, regenerate tokens.css and rerun verification; generate-token-json save does not choose serializations.'],
        permissions: ['project-read'], command: null });
    } catch (error) {
      record.serialization = { consumption: { status: 'UNKNOWN' }, reason: error.message };
      warnings.push(`${target}: token consumption is unknown: ${error.message}`);
      nextActions.push({ code: 'REVIEW_TOKEN_CONSUMPTION', targets: [target], resources: [], command: null, permissions: ['project-read'],
        reason: error.message, prerequisites: ['Repair the unreadable input or unsupported analysis path and rerun diagnostics. Unknown consumption is never evidence that pending tokens are unused.'] });
    }
    components.push(record);
  }
  return { components, warnings, nextActions };
}
