import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createEvidenceSession, evidenceSessionFor } from '../lib/evidence-session.mjs';
import { loadSnapshot } from '../lib/figma-evidence.mjs';
import { caseInputs, renderedChecks, validateMeasurementInputs } from '../lib/comparison-evidence.mjs';
import { mappedDelegations, verifyFigmaEvidence } from '../verify-figma-evidence.mjs';
import { verify } from '../verify-ds.mjs';
import { createDelegationProject } from './fixtures/delegation-project.mjs';
import { persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { extractObservations } from '../../skills/create-ds-from-figma/scripts/lib/capture-figma.mjs';
import { renderedArtifacts } from './fixtures/rendered-artifacts.mjs';
import { comparisonReport, persistComparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';

function project(t) {
  const f = createDelegationProject(); t.after(() => rmSync(f.root, { recursive: true, force: true })); return f;
}

test('forty case lookups reuse parsing and snapshot validation, skip unrelated bases and preserve results', t => {
  const f = project(t), mapPath = 'design-system/relationships/figma-code-map.json';
  const map = JSON.parse(readFileSync(path.join(f.root, mapPath)));
  f.write('src/Unrelated.tsx', 'export const Unrelated = null;'); f.write('unrelated.json', 'malformed JSON');
  map.other = { name: 'Unrelated', code: { path: 'src/Unrelated.tsx' }, designSystem: { metadata: 'unrelated.json' } }; f.write(mapPath, map);
  const expected = caseInputs(f.root, f.metadata, f.configuration), evidenceSession = createEvidenceSession(f.root);
  for (let i = 0; i < 40; i++) assert.deepEqual(caseInputs(f.root, f.metadata, f.configuration, undefined, { evidenceSession }), expected);
  assert.equal(evidenceSession.stats.validations, 2, 'one parent snapshot and one delegated baseline, not 80 validations');
  assert.equal(evidenceSession.stats.parses, 5, 'map, state, child metadata and two snapshots parsed once');
  assert.ok(evidenceSession.stats.reads >= 40 * 5, 'current content is checked, not trusted from a stat-only cache');
});

test('candidate child overrides reach evidence, case inputs, rendered checks and measurement currency without writing metadata', t => {
  const f = project(t), disk = readFileSync(path.join(f.root, f.childPath));
  const originalInputs = caseInputs(f.root, f.metadata, f.configuration);
  const artifacts = renderedArtifacts(f.root, f.metadata, f.configuration);
  const receipt = JSON.parse(readFileSync(path.join(f.root, artifacts[0].publication.path)));
  f.baseline.nodes[1].properties.strokes[0].color.r = 0.2;
  f.baseline.observations = extractObservations(f.baseline.nodes).observations;
  const candidate = { ...f.child, evidence: persistCapture(f.root, f.baseline) };
  const metadataOverrides = new Map([[f.childPath, candidate]]), evidenceSession = createEvidenceSession(f.root, { metadataOverrides });
  const options = { metadataOverrides, evidenceSession };
  assert.equal(mappedDelegations(f.root, f.metadata, options)[0].hash, candidate.evidence.hash);
  const inputs = caseInputs(f.root, f.metadata, f.configuration, undefined, options);
  assert.notEqual(inputs.metadataHash, originalInputs.metadataHash); assert.ok(inputs.files.includes(candidate.evidence.snapshot));
  const evidence = verifyFigmaEvidence(f.root, options).components.find(c => c.name === f.metadata.name);
  const difference = evidence.review.delegationDifferences.find(r => r.property === 'strokes[0].color' && r.status === 'difference');
  assert.ok(difference);
  assert.ok(renderedChecks(f.root, f.metadata, f.configuration, artifacts, options).checks.some(c => c.id === difference.id && c.status === 'NOT RUN'));
  assert.throws(() => validateMeasurementInputs(f.root, receipt, f.metadata, f.configuration, options), /Stale measurement/);
  assert.deepEqual(readFileSync(path.join(f.root, f.childPath)), disk);
  assert.equal(caseInputs(f.root, f.metadata, f.configuration).metadataHash, originalInputs.metadataHash, 'the candidate does not leak into a disk-only operation');
  candidate.evidence.hash = '0'.repeat(64);
  assert.ok(mappedDelegations(f.root, f.metadata, options)[0].snapshotProblem, 'mutating the candidate is observed in the same session');
});

test('verify with a candidate dependency stales the parent confirmation rather than validating against disk', t => {
  const f = project(t), { root, metadata, configuration, metadataPath } = f;
  const artifacts = renderedArtifacts(root, metadata, configuration);
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic contract judgment only.' },
    figmaRevision: { id: null, reason: 'Fixture.' }, codeRevision: { id: null, reason: 'Fixture.' }, artifacts, behaviors: [],
    checkReviews: [{ checkId: metadata.evidence.dispositions[0].differences[0].id, result: 'PASS', reason: 'Explicit fake fixture judgment.', artifacts: [artifacts[1].path] }] };
  const report = comparisonReport(root, metadata, configuration.id, review, 'src/PreviewGlyph.module.css', metadataPath);
  const evidence = persistComparisonReport(root, report);
  f.write('design-system/components/PreviewGlyph/usage.md', `## Figma to code correspondences\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: 1, correspondences: [{ caseId: configuration.id, status: 'confirmed', evidence }] })}\n\`\`\``);
  const summary = options => { const visualSummaries = new Map(); verify(root, { ...options, visualSummaries }); return visualSummaries.get(metadata.name); };
  assert.equal(summary().confirmed, 1);
  f.baseline.nodes[0].properties.width = 17; f.baseline.observations = extractObservations(f.baseline.nodes).observations;
  const candidate = { ...f.child, evidence: persistCapture(root, f.baseline) };
  const overridden = summary({ metadataOverrides: new Map([[f.childPath, candidate]]) });
  assert.equal(overridden.confirmed, 0); assert.equal(overridden.pending, 1);
  const candidateValidation = verify(root, { metadataOverrides: new Map([[f.childPath, candidate]]) });
  assert.ok(candidateValidation.warnings.some(w => w.includes('Stale verification decisions for this configuration')),
    'confirmation fingerprints independently include the candidate dependency, even when receipt validation also detects staleness');
  assert.equal(summary().confirmed, 1, 'disk-only verification still uses the unmodified baseline');
});

test('same-size same-mtime metadata edits invalidate cached baselines and original receipts', t => {
  const f = project(t), artifacts = renderedArtifacts(f.root, f.metadata, f.configuration);
  const receipt = JSON.parse(readFileSync(path.join(f.root, artifacts[0].publication.path)));
  const evidenceSession = createEvidenceSession(f.root), options = { evidenceSession };
  validateMeasurementInputs(f.root, receipt, f.metadata, f.configuration, options);
  const file = path.join(f.root, f.childPath), before = statSync(file), bytes = readFileSync(file);
  const candidate = JSON.parse(bytes); candidate.evidence.hash = '0'.repeat(64); f.write(f.childPath, candidate);
  assert.equal(readFileSync(file).length, bytes.length); utimesSync(file, before.atime, before.mtime);
  assert.ok(mappedDelegations(f.root, f.metadata, options)[0].snapshotProblem);
  assert.throws(() => validateMeasurementInputs(f.root, receipt, f.metadata, f.configuration, options), /Stale measurement/);
});

test('cached snapshots are immutable and corruption/deletion are rechecked, not rescued by the cache', t => {
  const f = project(t), evidenceSession = createEvidenceSession(f.root), options = { evidenceSession };
  const relative = f.child.evidence.snapshot, file = path.join(f.root, relative), bytes = readFileSync(file), before = statSync(file);
  const snapshot = loadSnapshot(f.root, relative, options);
  assert.equal(loadSnapshot(f.root, relative, options), snapshot);
  assert.throws(() => { snapshot.capture.nodes[0].properties.key = 'wrong'; }, TypeError);
  const broken = bytes.toString('utf8').replace('child-key', 'other-key'); assert.notEqual(broken, bytes.toString('utf8')); assert.equal(Buffer.byteLength(broken), bytes.length);
  writeFileSync(file, broken); utimesSync(file, before.atime, before.mtime);
  assert.throws(() => loadSnapshot(f.root, relative, options), /SHA-256/);
  writeFileSync(file, bytes); assert.equal(loadSnapshot(f.root, relative, options).hash, snapshot.hash);
  rmSync(file); assert.throws(() => loadSnapshot(f.root, relative, options), /ENOENT/);
});

test('session data cannot be poisoned or shared across roots or override contexts', t => {
  const f = project(t), other = project(t), metadataOverrides = new Map(), evidenceSession = createEvidenceSession(f.root, { metadataOverrides });
  const copy = evidenceSession.json(f.childPath); copy.evidence.hash = '0'.repeat(64);
  assert.equal(evidenceSession.json(f.childPath).evidence.hash, f.child.evidence.hash);
  assert.throws(() => { evidenceSession.read(f.childPath).value = null; }, TypeError);
  assert.throws(() => evidenceSessionFor(other.root, { evidenceSession }), /context differs/);
  assert.throws(() => evidenceSessionFor(f.root, { evidenceSession, metadataOverrides: new Map() }), /context differs/);
  assert.throws(() => evidenceSession.json('../outside.json'), /Invalid evidence/);
  metadataOverrides.set(f.childPath, null);
  assert.ok(mappedDelegations(f.root, f.metadata, { evidenceSession })[0].snapshotProblem, 'an invalid explicit override does not silently fall back to disk');
});
