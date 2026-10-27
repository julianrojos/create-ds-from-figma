import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts, syntheticTypographyReviews } from './fixtures/rendered-artifacts.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { sha256 } from '../lib/render-plan.mjs';
import { sealCapture } from '../lib/figma-evidence.mjs';
import { persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { captureDifferences, updateReport } from '../lib/update-report.mjs';

function fixture(t) {
  const f = createPreviewProject();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(f.root, f.metadataPath), 'utf8'));
  const snapshot = JSON.parse(readFileSync(path.join(f.root, metadata.evidence.snapshot), 'utf8'));
  return { ...f, metadata, snapshot };
}

function tree(root) {
  return readdirSync(root, { withFileTypes: true }).filter(e => e.name !== 'node_modules').sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => {
    const file = path.join(root, e.name);
    return e.isDirectory() ? tree(file).map(([key, hash]) => [`${e.name}/${key}`, hash]) : [[e.name, sha256(readFileSync(file))]];
  });
}

function confirm(f) {
  const configuration = f.metadata.verification.cases[0];
  const artifacts = c => renderedArtifacts(f.root, f.metadata, c).map(a => ({ ...a, sha256: sha256(readFileSync(path.join(f.root, a.path))) }));
  const report = comparisonReport(f.root, f.metadata, configuration.id, {
    result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic test only, not real fidelity evidence.' },
    checkReviews: syntheticTypographyReviews(f.root, f.metadata, configuration),
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' },
    artifacts: artifacts(configuration), behaviors: f.metadata.verification.cases.slice(1).map(c => ({ caseId: c.id, artifact: artifacts(c)[0] })),
  }, undefined, f.metadataPath);
  const relative = 'design-system/verification/confirmation.json', bytes = Buffer.from(JSON.stringify(report));
  writeFileSync(path.join(f.root, relative), bytes);
  writeFileSync(path.join(f.root, 'design-system/components/PreviewGlyph/usage.md'), '## Figma to code correspondences\n\n```json\n' + JSON.stringify({ schemaVersion: 1,
    correspondences: [{ caseId: configuration.id, status: 'confirmed', evidence: { path: relative, sha256: sha256(bytes) } }] }) + '\n```');
}

test('update report leaves the entire project unchanged and does not present candidates as newly stale', t => {
  const f = fixture(t), before = tree(f.root);
  const report = updateReport(f.root, f.metadataPath, f.snapshot);
  assert.deepEqual(report.changes, []);
  assert.deepEqual(report.projectedEvidence.newlyStaleCaseIds, []);
  assert.equal(report.currentEvidence.cases[0].status, 'candidate');
  assert.equal(report.review.regression, 'NOT MEASURED');
  assert.equal(report.analysis.status, 'COMPLETE_WITHIN_SCOPE');
  assert.deepEqual(report.analysis.reasons, []);
  assert.equal(report.consumerCoverage.status, 'COMPLETE_WITHIN_SCOPE');
  assert.equal(report.captureCoverage.status, 'COMPLETE_WITHIN_SCOPE');
  assert.deepEqual(tree(f.root), before);
});

test('exact diff keys records by ID but retains child order, decimals, additions and removals', () => {
  const before = { observations: [], collections: [], styles: [], variants: [], nodes: [{ id: '1', name: 'Old', children: ['2', '3'], properties: { opacity: 0.08 } }, { id: '2' }], variables: [] };
  const after = { ...before, nodes: [{ id: '2' }, { id: '1', name: 'New', children: ['3', '2'], properties: { opacity: 0.080001 } }], variables: [{ id: 'v', name: 'V' }] };
  const changes = captureDifferences(before, after);
  assert.ok(changes.some(c => c.path === '/nodes/1/name' && c.before === 'Old' && c.after === 'New'));
  assert.ok(changes.some(c => c.path === '/nodes/1/children' && c.after[0] === '3'));
  assert.ok(changes.some(c => c.path === '/nodes/1/properties/opacity' && c.before === 0.08 && c.after === 0.080001));
  assert.ok(changes.some(c => c.path === '/nodes/$recordOrder'));
  assert.ok(changes.some(c => c.path === '/variables/v' && c.operation === 'added'));
  assert.ok(captureDifferences(after, before).some(c => c.path === '/variables/v' && c.operation === 'removed'));
});

test('report rejects corrupt snapshots and different root identities before producing a projection', t => {
  const f = fixture(t);
  assert.throws(() => updateReport(f.root, f.metadataPath, { ...f.snapshot, hash: '0'.repeat(64) }), /hash/);
  const capture = structuredClone(f.snapshot.capture);
  capture.source.fileKey = 'OTHER';
  assert.throws(() => updateReport(f.root, f.metadataPath, sealCapture(capture)), /different component identities/);
});

test('new capture projects currency loss without modifying a current confirmation; existing stale remains distinct', t => {
  const f = fixture(t);
  confirm(f);
  const before = tree(f.root);
  assert.equal(updateReport(f.root, f.metadataPath, f.snapshot).currentEvidence.cases[0].status, 'confirmed');
  const capture = structuredClone(f.snapshot.capture);
  capture.nodes[0].name = 'Renamed';
  const report = updateReport(f.root, f.metadataPath, sealCapture(capture));
  assert.equal(report.currentEvidence.cases[0].status, 'confirmed');
  assert.deepEqual(report.projectedEvidence.newlyStaleCaseIds, ['source-0']);
  assert.deepEqual(tree(f.root), before);
  const css = path.join(f.root, 'src/PreviewGlyph.module.css');
  writeFileSync(css, readFileSync(css, 'utf8') + '\n/* changed */');
  const stale = updateReport(f.root, f.metadataPath, sealCapture(capture));
  assert.equal(stale.currentEvidence.cases[0].verification, 'NOT VERIFIED');
  assert.deepEqual(stale.projectedEvidence.newlyStaleCaseIds, []);
});

test('CLI requires explicit inputs and never runs application code', t => {
  const f = fixture(t), command = '.agents/skills/create-ds-from-figma/scripts/report-component-update.mjs';
  const before = tree(f.root);
  const run = spawnSync(process.execPath, [command, f.root, f.metadataPath, path.join(f.root, f.metadata.evidence.snapshot)], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).kind, 'component-update-report');
  assert.deepEqual(tree(f.root), before);
  assert.notEqual(spawnSync(process.execPath, [command], { encoding: 'utf8' }).status, 0);
});

test('consumers are direct recorded bindings, not a verdict or complete dependency graph', t => {
  const f = fixture(t), capture = structuredClone(f.snapshot.capture);
  capture.collections.push({ id: 'COL', name: 'Colors', defaultModeId: 'm', modes: [{ modeId: 'm', name: 'Default' }] });
  capture.variables.push({ id: 'color-id', collectionId: 'COL', name: 'Foreground', type: 'COLOR', valuesByMode: { m: { r: 0, g: 0, b: 0, a: 1 } } });
  const mapFile = path.join(f.root, 'design-system/relationships/figma-code-map.json');
  const map = JSON.parse(readFileSync(mapFile));
  // Minimal lookup-only record: this does not assert that Consumer is a valid import.
  const consumerPath = 'consumer.json';
  writeFileSync(path.join(f.root, consumerPath), JSON.stringify({ name: 'Consumer', bindings: [{ variableId: 'color-id' }, { variableId: 'unrelated' }] }));
  map.consumer = { designSystem: { metadata: consumerPath } };
  writeFileSync(mapFile, JSON.stringify(map));
  const before = tree(f.root), report = updateReport(f.root, f.metadataPath, sealCapture(capture));
  assert.deepEqual(report.review.changedVariableIds, ['color-id']);
  assert.deepEqual(report.consumers, [{ metadata: consumerPath, component: 'Consumer', variableIds: ['color-id'], changedVariableIds: ['color-id'], collectionAffectedVariableIds: ['color-id'], relationship: 'direct-recorded-binding', impact: 'NOT DETERMINED' }]);
  assert.deepEqual(tree(f.root), before);
  writeFileSync(path.join(f.root, consumerPath), JSON.stringify({ name: 'Consumer', bindings: {} }));
  const partial = updateReport(f.root, f.metadataPath, sealCapture(capture));
  assert.equal(partial.analysis.status, 'PARTIAL');
  assert.equal(partial.consumerCoverage.status, 'PARTIAL');
  assert.match(partial.consumerCoverage.diagnostics[0].reason, /Invalid bindings/);
  assert.deepEqual(partial.analysis.reasons, [{ code: 'CONSUMER_LOOKUP_INCOMPLETE', kind: 'coverage', section: 'consumerCoverage', diagnostics: 1 }]);
  assert.deepEqual(partial.changes, report.changes);
});

test('diff rejects malformed sections with contract errors instead of TypeErrors', () => {
  const capture = { nodes: [], observations: [], variables: [], collections: [], styles: [], variants: [] };
  for (const section of Object.keys(capture)) {
    const invalid = { ...capture };
    delete invalid[section];
    assert.throws(() => captureDifferences(capture, invalid), new RegExp(`proposed capture: ${section} must be an array`));
    assert.throws(() => captureDifferences(invalid, capture), new RegExp(`retained capture: ${section} must be an array`));
  }
  assert.throws(() => captureDifferences(null, capture), /retained capture: object required/);
});

test('the subject is separated and unreadable/missing unrelated metadata yields partial lookup without writes', t => {
  const f = fixture(t), capture = structuredClone(f.snapshot.capture);
  capture.collections.push({ id: 'COL', name: 'Colors', defaultModeId: 'm', modes: [{ modeId: 'm', name: 'Default' }] });
  capture.variables.push({ id: 'color-id', collectionId: 'COL', name: 'Foreground', type: 'COLOR', valuesByMode: { m: '#000000' } });
  f.metadata.bindings.push({ variableId: 'color-id' });
  writeFileSync(path.join(f.root, f.metadataPath), JSON.stringify(f.metadata));
  const mapFile = path.join(f.root, 'design-system/relationships/figma-code-map.json'), map = JSON.parse(readFileSync(mapFile));
  map.missing = { designSystem: { metadata: 'missing.json' } };
  map.malformed = { designSystem: { metadata: 'malformed.json' } };
  map.noPath = {};
  writeFileSync(path.join(f.root, 'malformed.json'), '{ invalid');
  writeFileSync(mapFile, JSON.stringify(map));
  const before = tree(f.root), report = updateReport(f.root, f.metadataPath, sealCapture(capture));
  assert.deepEqual(report.consumers, []);
  assert.equal(report.subjectConsumer.metadata, f.metadataPath);
  assert.deepEqual(report.subjectConsumer.variableIds, ['color-id']);
  assert.equal(report.consumerCoverage.diagnostics.length, 3);
  assert.equal(report.analysis.status, 'PARTIAL');
  assert.deepEqual(tree(f.root), before);
  const cli = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/report-component-update.mjs', f.root, f.metadataPath,
    path.join(f.root, f.metadata.evidence.snapshot)], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).analysis.status, 'PARTIAL');
  assert.deepEqual(tree(f.root), before);
});

test('captured external variables participate in the diff while unavailable external values leave explicit partial coverage', t => {
  const f = fixture(t), capture = structuredClone(f.snapshot.capture);
  capture.collections.push({ id: 'REMOTE', name: 'Remote', defaultModeId: 'm', modes: [{ modeId: 'm', name: 'Default' }], remote: true });
  capture.variables.push({ id: 'external-id', collectionId: 'REMOTE', name: 'Radius', type: 'FLOAT', remote: true, valuesByMode: { m: 4 } });
  const report = updateReport(f.root, f.metadataPath, sealCapture(capture));
  assert.deepEqual(report.review.changedVariableIds, ['external-id']);
  assert.deepEqual(report.captureCoverage.variables.proposed.capturedExternalVariableIds, ['external-id']);
  assert.equal(report.captureCoverage.status, 'COMPLETE_WITHIN_SCOPE');
  const unavailable = structuredClone(f.snapshot.capture);
  unavailable.coverage.issues.push({ node: '1:2', field: 'variables.external-id', reason: 'External variable unavailable' });
  const partial = updateReport(f.root, f.metadataPath, sealCapture(unavailable));
  assert.deepEqual(partial.review.changedVariableIds, []);
  assert.equal(partial.analysis.status, 'PARTIAL');
  assert.deepEqual(partial.captureCoverage.variables.proposed.unavailableVariableIds, ['external-id']);
  assert.match(partial.captureCoverage.issues[0].reason, /unavailable/);
  assert.deepEqual(partial.analysis.reasons, [{ code: 'CAPTURE_COVERAGE_INCOMPLETE', kind: 'coverage', section: 'captureCoverage', issues: 1, unavailableVariableSnapshotPairs: 1 }]);
  Object.assign(f.metadata.evidence, persistCapture(f.root, unavailable));
  writeFileSync(path.join(f.root, f.metadataPath), JSON.stringify(f.metadata));
  const both = updateReport(f.root, f.metadataPath, sealCapture(unavailable));
  assert.deepEqual(both.changes, []);
  assert.deepEqual(both.captureCoverage.variables.retained.unavailableVariableIds, ['external-id']);
  assert.deepEqual(both.captureCoverage.variables.proposed.unavailableVariableIds, ['external-id']);
  assert.equal(both.analysis.reasons[0].unavailableVariableSnapshotPairs, 2, 'the same variable in two snapshots is two pairs, not two distinct variables');
});

test('partial reasons distinguish evidence errors from coverage gaps and retain simultaneous causes', t => {
  const f = fixture(t);
  const usage = path.join(f.root, 'design-system/components/PreviewGlyph/usage.md');
  writeFileSync(usage, 'No canonical correspondences section.');
  const report = updateReport(f.root, f.metadataPath, f.snapshot);
  assert.equal(report.analysis.status, 'PARTIAL');
  assert.ok(report.currentEvidence.errors.length > 0);
  assert.deepEqual(report.analysis.reasons, [{ code: 'CURRENT_EVIDENCE_ERRORS', kind: 'validation', section: 'currentEvidence.errors', errors: report.currentEvidence.errors.length }]);
  assert.equal(report.consumerCoverage.status, 'COMPLETE_WITHIN_SCOPE');
  assert.equal(report.captureCoverage.status, 'COMPLETE_WITHIN_SCOPE');
  const mapFile = path.join(f.root, 'design-system/relationships/figma-code-map.json'), map = JSON.parse(readFileSync(mapFile));
  map.missing = { designSystem: { metadata: 'missing.json' } };
  writeFileSync(mapFile, JSON.stringify(map));
  const capture = structuredClone(f.snapshot.capture);
  capture.coverage.issues.push({ node: '1:2', field: 'variables.external-id', reason: 'Unavailable' });
  const before = tree(f.root), combined = updateReport(f.root, f.metadataPath, sealCapture(capture));
  assert.deepEqual(combined.analysis.reasons.map(r => r.code), ['CONSUMER_LOOKUP_INCOMPLETE', 'CAPTURE_COVERAGE_INCOMPLETE', 'CURRENT_EVIDENCE_ERRORS']);
  assert.deepEqual(tree(f.root), before);
});

test('collection mode changes include direct consumers without claiming their variable records or effective values changed', t => {
  const f = fixture(t), capture = structuredClone(f.snapshot.capture);
  capture.collections = [
    { id: 'COL', name: 'Space', defaultModeId: 'small', modes: [{ modeId: 'small', name: 'Small' }, { modeId: 'large', name: 'Large' }] },
    { id: 'OTHER', name: 'Other', defaultModeId: 'm', modes: [{ modeId: 'm', name: 'Default' }] },
  ];
  capture.variables = [
    { id: 'space-id', collectionId: 'COL', name: 'Gap', type: 'FLOAT', valuesByMode: { small: 4, large: 8 } },
    { id: 'other-id', collectionId: 'OTHER', name: 'Other', type: 'FLOAT', valuesByMode: { m: 1 } },
  ];
  Object.assign(f.metadata.evidence, persistCapture(f.root, capture));
  writeFileSync(path.join(f.root, f.metadataPath), JSON.stringify(f.metadata));
  const mapFile = path.join(f.root, 'design-system/relationships/figma-code-map.json'), map = JSON.parse(readFileSync(mapFile));
  map.consumer = { designSystem: { metadata: 'consumer.json' } };
  map.unrelated = { designSystem: { metadata: 'unrelated.json' } };
  writeFileSync(mapFile, JSON.stringify(map));
  writeFileSync(path.join(f.root, 'consumer.json'), JSON.stringify({ name: 'Consumer', bindings: [{ variableId: 'space-id', modeOverride: { collectionId: 'COL', modeId: 'small', modeName: 'Small' } }] }));
  writeFileSync(path.join(f.root, 'unrelated.json'), JSON.stringify({ name: 'Unrelated', bindings: [{ variableId: 'other-id' }] }));
  const before = tree(f.root), proposed = structuredClone(capture);
  proposed.collections[0].defaultModeId = 'large';
  const report = updateReport(f.root, f.metadataPath, sealCapture(proposed));
  assert.deepEqual(report.review.changedVariableIds, []);
  assert.deepEqual(report.review.changedModeCollectionIds, ['COL']);
  assert.deepEqual(report.review.collectionAffectedVariableIds, ['space-id']);
  assert.deepEqual(report.consumers, [{ metadata: 'consumer.json', component: 'Consumer', variableIds: ['space-id'],
    changedVariableIds: [], collectionAffectedVariableIds: ['space-id'], relationship: 'direct-recorded-binding', impact: 'NOT DETERMINED' }]);
  assert.equal(report.consumerCoverage.status, 'COMPLETE_WITHIN_SCOPE');
  // Names alone do not change mode selection. Mode names do change integration semantics.
  const rename = structuredClone(capture);
  rename.collections[0].name = 'Spacing';
  assert.deepEqual(updateReport(f.root, f.metadataPath, sealCapture(rename)).consumers, []);
  rename.collections[0].modes[0].name = 'Compact';
  assert.deepEqual(updateReport(f.root, f.metadataPath, sealCapture(rename)).review.collectionAffectedVariableIds, ['space-id']);
  proposed.variables[0].valuesByMode.large = 12;
  const mixed = updateReport(f.root, f.metadataPath, sealCapture(proposed));
  assert.deepEqual(mixed.consumers[0].changedVariableIds, ['space-id']);
  assert.deepEqual(mixed.consumers[0].collectionAffectedVariableIds, ['space-id']);
  assert.deepEqual(mixed.consumers[0].variableIds, ['space-id'], 'overlapping causes do not duplicate a consumer binding');
  assert.deepEqual(tree(f.root), before);
});
