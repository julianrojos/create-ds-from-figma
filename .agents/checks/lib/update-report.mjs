import { readFileSync } from 'node:fs';
import { canonicalJson, loadSnapshot, sealCapture } from './figma-evidence.mjs';
import { projectFile } from './render-plan.mjs';
import { verifyCorrespondences } from './correspondences.mjs';
import { markdownProse } from './markdown-prose.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const json = (root, file) => JSON.parse(readFileSync(projectFile(root, file), 'utf8'));
const pointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');

// Record identity is used only within one source file/root, never to infer renames.
export function captureDifferences(before, after) {
  const identities = { nodes: 'id', observations: 'id', variables: 'id', collections: 'id', styles: 'id', variants: 'nodeId' };
  for (const [side, capture] of [['retained', before], ['proposed', after]]) {
    if (!object(capture)) throw new Error(`Invalid ${side} capture: object required`);
    for (const section of Object.keys(identities)) if (!Array.isArray(capture[section])) throw new Error(`Invalid ${side} capture: ${section} must be an array`);
  }
  const changes = [];
  function walk(a, b, location) {
    if (canonicalJson(a) === canonicalJson(b)) return;
    if (object(a) && object(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        const at = `${location}/${pointer(key)}`;
        if (!Object.hasOwn(a, key)) changes.push({ path: at, operation: 'added', after: b[key] });
        else if (!Object.hasOwn(b, key)) changes.push({ path: at, operation: 'removed', before: a[key] });
        else walk(a[key], b[key], at);
      }
    } else changes.push({ path: location, operation: 'changed', before: a, after: b });
  }
  for (const section of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const field = identities[section];
    if (!field) {
      walk({ ...(Object.hasOwn(before, section) ? { [section]: before[section] } : {}) },
        { ...(Object.hasOwn(after, section) ? { [section]: after[section] } : {}) }, '');
      continue;
    }
    const index = rows => {
      const entries = rows.map(row => {
        if (typeof row?.[field] !== 'string' || !row[field]) throw new Error(`Missing ${section} identity`);
        return [row[field], row];
      });
      if (new Set(entries.map(([id]) => id)).size !== entries.length) throw new Error(`Duplicate ${section} identity`);
      return Object.fromEntries(entries);
    };
    walk(index(before[section]), index(after[section]), `/${section}`);
    const a = before[section].map(row => row[field]), b = after[section].map(row => row[field]);
    if (canonicalJson(a) !== canonicalJson(b)) changes.push({ path: `/${section}/$recordOrder`, operation: 'changed', before: a, after: b });
  }
  return changes;
}

export function updateReport(root, metadataPath, proposedSnapshot) {
  const metadata = json(root, metadataPath);
  const before = loadSnapshot(root, metadata.evidence?.snapshot);
  if (metadata.evidence.hash !== before.hash) throw new Error('Metadata and retained snapshot hashes differ');
  if (proposedSnapshot?.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}T/.test(proposedSnapshot.capturedAt || '') || proposedSnapshot.hash !== sealCapture(proposedSnapshot.capture).hash) throw new Error('Proposed snapshot envelope or hash is invalid');
  const after = proposedSnapshot;
  if (before.capture.source.fileKey !== after.capture.source.fileKey || before.capture.source.rootNodeId !== after.capture.source.rootNodeId) throw new Error('Cannot compare different component identities');
  const map = json(root, 'design-system/relationships/figma-code-map.json');
  const entries = Object.entries(map).filter(([key, entry]) => !key.startsWith('_') && entry?.designSystem?.metadata === metadataPath);
  if (entries.length !== 1) throw new Error('Component metadata must have exactly one map entry');
  const entry = entries[0][1];
  const usage = readFileSync(projectFile(root, entry.designSystem.usage), 'utf8');
  const current = verifyCorrespondences(root, metadata, usage, markdownProse(usage), { metadataPath, style: entry.code.style });
  const changes = captureDifferences(before.capture, after.capture);
  const changedVariables = new Set(changes.filter(c => c.path.startsWith('/variables/') && !c.path.endsWith('/$recordOrder'))
    .map(c => c.path.split('/')[2].replaceAll('~1', '/').replaceAll('~0', '~')));
  const changedModeCollections = new Set(changes.filter(c => {
    const segments = c.path.split('/');
    return segments[1] === 'collections' && segments[2] !== '$recordOrder' &&
      (segments.length === 3 || ['defaultModeId', 'modes'].includes(segments[3]));
  }).map(c => c.path.split('/')[2].replaceAll('~1', '/').replaceAll('~0', '~')));
  const collectionAffectedVariables = new Set([...before.capture.variables, ...after.capture.variables]
    .filter(v => changedModeCollections.has(v.collectionId)).map(v => v.id));
  const consumers = [], consumerDiagnostics = [], inspected = new Set();
  let subjectConsumer = null;
  for (const [key, mapped] of Object.entries(map).filter(([key]) => !key.startsWith('_'))) {
    const file = mapped?.designSystem?.metadata;
    if (typeof file === 'string' && inspected.has(file)) continue;
    if (typeof file === 'string') inspected.add(file);
    try {
      if (typeof file !== 'string' || !file.trim()) throw new Error(`Missing metadata path for map entry ${key}`);
      const component = json(root, file);
      if (!Array.isArray(component?.bindings) || component.bindings.some(b => !object(b) || typeof b.variableId !== 'string' || !b.variableId.trim())) throw new Error(`Invalid bindings in ${file}`);
      const variableIds = [...new Set(component.bindings.filter(b => changedVariables.has(b.variableId) || collectionAffectedVariables.has(b.variableId)).map(b => b.variableId))].sort();
      if (variableIds.length) {
        const consumer = { metadata: file, component: component.name, variableIds,
          changedVariableIds: variableIds.filter(id => changedVariables.has(id)),
          collectionAffectedVariableIds: variableIds.filter(id => collectionAffectedVariables.has(id)),
          relationship: 'direct-recorded-binding', impact: 'NOT DETERMINED' };
        if (file === metadataPath) subjectConsumer = consumer;
        else consumers.push(consumer);
      }
    } catch (error) {
      consumerDiagnostics.push({ mapEntry: key, metadata: typeof file === 'string' ? file : null, reason: error.message });
    }
  }
  const captureIssues = [], variableCoverage = {};
  for (const [side, snapshot] of [['retained', before], ['proposed', after]]) {
    const capture = snapshot.capture, capturedIds = new Set(capture.variables.map(v => v.id));
    const referenced = new Set(capture.observations.filter(o => o.kind === 'binding').map(o => o.variableId));
    for (const variable of capture.variables) for (const value of Object.values(variable.valuesByMode)) if (value?.type === 'VARIABLE_ALIAS') referenced.add(value.id);
    for (const issue of capture.coverage.issues) {
      captureIssues.push({ snapshot: side, ...issue });
      if (issue.field?.startsWith('variables.')) referenced.add(issue.field.slice('variables.'.length));
    }
    variableCoverage[side] = {
      capturedExternalVariableIds: capture.variables.filter(v => v.remote === true).map(v => v.id).sort(),
      unavailableVariableIds: [...referenced].filter(id => !capturedIds.has(id)).sort(),
    };
  }
  const unavailableVariableSnapshotPairs = Object.values(variableCoverage).reduce((count, c) => count + c.unavailableVariableIds.length, 0);
  const reasons = [];
  if (consumerDiagnostics.length) reasons.push({ code: 'CONSUMER_LOOKUP_INCOMPLETE', kind: 'coverage', section: 'consumerCoverage', diagnostics: consumerDiagnostics.length });
  if (captureIssues.length || unavailableVariableSnapshotPairs) reasons.push({ code: 'CAPTURE_COVERAGE_INCOMPLETE', kind: 'coverage', section: 'captureCoverage', issues: captureIssues.length, unavailableVariableSnapshotPairs });
  if (current.errors.length) reasons.push({ code: 'CURRENT_EVIDENCE_ERRORS', kind: 'validation', section: 'currentEvidence.errors', errors: current.errors.length });
  const snapshotChanged = before.hash !== after.hash;
  return {
    schemaVersion: 1, kind: 'component-update-report', metadata: metadataPath,
    analysis: { status: reasons.length ? 'PARTIAL' : 'COMPLETE_WITHIN_SCOPE', reasons, scope: 'Declared snapshot diff, current correspondence checks and direct recorded consumer lookup only; not visual verification or complete impact analysis.' },
    scope: 'Read-only comparison of retained and proposed Figma captures; not an update authorization or fidelity verdict.',
    snapshots: { retained: before.hash, proposed: after.hash, changed: snapshotChanged },
    changes,
    currentEvidence: { cases: current.current, errors: current.errors, warnings: current.warnings },
    projectedEvidence: {
      condition: 'If the proposed snapshot replaces metadata.evidence with this hash; no other edits are simulated.',
      newlyStaleCaseIds: snapshotChanged ? current.current.filter(c => c.status === 'confirmed').map(c => c.caseId) : [],
      reason: snapshotChanged ? 'Source snapshot hash would change.' : 'No snapshot hash change; other proposed edits are not evaluated.',
    },
    consumers,
    subjectConsumer,
    consumerCoverage: { status: consumerDiagnostics.length ? 'PARTIAL' : 'COMPLETE_WITHIN_SCOPE', diagnostics: consumerDiagnostics },
    captureCoverage: { status: captureIssues.length || unavailableVariableSnapshotPairs ? 'PARTIAL' : 'COMPLETE_WITHIN_SCOPE', issues: captureIssues, variables: variableCoverage },
    review: {
      changedVariableIds: [...changedVariables].sort(),
      changedModeCollectionIds: [...changedModeCollections].sort(),
      collectionAffectedVariableIds: [...collectionAffectedVariables].sort(),
      note: 'Added/removed identities and name changes require review; no rename or public API mapping is inferred.',
      regression: 'NOT MEASURED',
      limits: [
        'The diff covers captured data, not the complete file-level token inventory or uncaptured Figma changes.',
        'Consumers include only direct bindings to captured variable records that changed or belong to collections whose modes/default changed, were added or removed. Collection effects are potential, not proven value changes; forced modes may keep a consumer unchanged. Alias propagation, imports, handwritten CSS and screens are not enumerated.',
        'External variables are compared when captured. Unavailable variables, including external ones represented only by coverage issues, have unknown value changes, not unchanged values.',
        'Record ordering and exact numeric values are retained; differences alone do not prove a new Figma revision or an implementation defect.',
        'No code baseline or three-way merge is available here; local modifications are not classified or overwritten.',
        'No future code, token, configuration or dependency edits are simulated. All stale evidence still requires the normal delivery contract.',
      ],
    },
  };
}
