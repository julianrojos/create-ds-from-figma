import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createDelegationProject } from './fixtures/delegation-project.mjs';
import { renderedArtifacts } from './fixtures/rendered-artifacts.mjs';
import { persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { comparisonReport, persistComparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { caseInputs, validateMeasurementInputs } from '../lib/comparison-evidence.mjs';
import { verifyCorrespondences } from '../lib/correspondences.mjs';
import { mappedDelegations, verifyFigmaEvidence } from '../verify-figma-evidence.mjs';
import { extractObservations } from '../../skills/create-ds-from-figma/scripts/lib/capture-figma.mjs';
import { COMPARATOR_VERSION } from '../lib/render-comparison.mjs';
import { verifyImports } from '../verify-imports.mjs';

function project(t) {
  const f = createDelegationProject(); t.after(() => rmSync(f.root, { recursive: true, force: true })); return f;
}

test('real report pipeline cannot confirm a declared delegated difference without a specific same-case review', t => {
  const f = project(t), { root, metadata, configuration, metadataPath } = f;
  const artifacts = renderedArtifacts(root, metadata, configuration);
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic schema fixture, not real rendering evidence.' },
    figmaRevision: { id: null, reason: 'Synthetic source.' }, codeRevision: { id: null, reason: 'Synthetic code.' }, artifacts, behaviors: [] };
  const report = () => comparisonReport(root, metadata, configuration.id, review, 'src/PreviewGlyph.module.css', metadataPath);
  assert.throws(report, /Specific rendered review required: delegation:/);
  review.checkReviews = [{ checkId: metadata.evidence.dispositions[0].differences[0].id, result: 'PASS', reason: 'Explicit fake contract judgment.', artifacts: [artifacts[1].path] }];
  const saved = report();
  assert.ok(saved.renderChecks.checks.some(c => c.id.startsWith('delegation:')));
  const evidence = persistComparisonReport(root, saved);
  const check = (reference = evidence) => {
    const markdown = `## Figma to code correspondences\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: 1, correspondences: [{ caseId: configuration.id, status: 'confirmed', evidence: reference }] })}\n\`\`\``;
    return verifyCorrespondences(root, metadata, markdown, markdown.split('\n').map((line, i) => i === 0 ? line : ''), { style: 'src/PreviewGlyph.module.css', metadataPath });
  };
  assert.deepEqual(check().errors, []); assert.equal(check().current[0].status, 'confirmed');
  const original = readFileSync(path.join(root, evidence.path));
  const edited = JSON.parse(original); edited.renderChecks.comparatorVersion = `render-comparator-v${Number(COMPARATOR_VERSION.split('v').at(-1)) - 1}`;
  const oldVersion = persistComparisonReport(root, edited);
  assert.ok(oldVersion.sha256 !== evidence.sha256);
  assert.equal(check(oldVersion).current[0].status, 'candidate');
  assert.equal(check().current[0].status, 'confirmed');
  metadata.evidence.dispositions[0].differences[0].treatment = 'omitted';
  assert.equal(check().current[0].status, 'candidate');
  metadata.evidence.dispositions[0].differences[0].treatment = 'implemented';
  // Only the child's snapshot changes: the parent metadata and source snapshot remain untouched.
  f.baseline.nodes[1].properties.strokes[0].color.r = 0.2;
  f.baseline.observations = extractObservations(f.baseline.nodes).observations;
  Object.assign(f.child.evidence, persistCapture(root, f.baseline)); f.write(f.childPath, f.child);
  const stale = check(); assert.deepEqual(stale.errors, []); assert.equal(stale.current[0].status, 'candidate');
  assert.ok(stale.warnings.some(w => /Stale/.test(w)));
});

test('case fingerprints track both snapshots, correspondence and treatment but not treatment prose', t => {
  const f = project(t), hash = () => caseInputs(f.root, f.metadata, f.configuration).metadataHash;
  const initial = hash(), inputs = caseInputs(f.root, f.metadata, f.configuration);
  assert.ok(inputs.files.includes(f.child.evidence.snapshot));
  f.metadata.evidence.dispositions[0].differences[0].reason = 'Different explanation.';
  assert.equal(hash(), initial);
  // A baseline edit outside compared paints still changes its sealed identity.
  f.baseline.nodes[0].properties.width = 17;
  f.baseline.observations = extractObservations(f.baseline.nodes).observations;
  Object.assign(f.child.evidence, persistCapture(f.root, f.baseline)); f.write(f.childPath, f.child);
  assert.notEqual(hash(), initial);
  const before = hash(); f.metadata.evidence.dispositions[0].differences[0].cssProperty = 'color'; assert.notEqual(hash(), before);
  const beforeMapping = hash(); f.capture.nodes[2].name = 'Changed';
  Object.assign(f.metadata.evidence, persistCapture(f.root, f.capture)); assert.notEqual(hash(), beforeMapping);
});

test('missing baseline and missing treatment never get approved by evidence accounting', t => {
  const f = project(t);
  f.metadata.evidence.dispositions[0].differences = []; f.write(f.metadataPath, f.metadata);
  assert.ok(verifyFigmaEvidence(f.root).errors.some(e => /Undeclared delegation difference/.test(e)));
  const mapped = mappedDelegations(f.root); assert.ok(mapped.find(c => c.name === 'Child').capture);
  f.child.evidence.hash = '0'.repeat(64); f.write(f.childPath, f.child);
  const parent = verifyFigmaEvidence(f.root).components.find(c => c.name === 'PreviewGlyph');
  assert.ok(parent.review.delegationDifferences.some(r => r.status === 'unmatched'));
  const artifacts = renderedArtifacts(f.root, f.metadata, f.configuration), receipt = JSON.parse(readFileSync(path.join(f.root, artifacts[0].publication.path)));
  f.child.evidence.hash = f.mappedComponents[0].hash; f.write(f.childPath, f.child);
  assert.throws(() => validateMeasurementInputs(f.root, receipt, f.metadata, f.configuration), /Stale measurement/);
});

test('the delivery gate retains actionable delegation errors even when static conformance fails', async t => {
  const f = project(t);
  f.metadata.evidence.dispositions[0].differences = []; f.write(f.metadataPath, f.metadata);
  const result = await verifyImports(f.root);
  assert.equal(result.status, 'FAIL');
  const action = result.nextActions.find(a => a.code === 'DECLARE_DELEGATION_TREATMENT');
  assert.ok(action); assert.deepEqual(action.targets, [f.metadataPath]);
  assert.ok(action.differences.some(d => d.property === 'binding:strokes[0].color'));
});

test('delivery review actions respect current confirmations, pending shared cases and stale child inputs', async t => {
  const f = project(t), { root, metadata, configuration, metadataPath } = f;
  const artifacts = renderedArtifacts(root, metadata, configuration);
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic contract judgment.' },
    figmaRevision: { id: null, reason: 'Fixture.' }, codeRevision: { id: null, reason: 'Fixture.' }, artifacts, behaviors: [],
    checkReviews: [{ checkId: metadata.evidence.dispositions[0].differences[0].id, result: 'PASS', reason: 'Specific fixture review.', artifacts: [artifacts[1].path] }] };
  const evidence = persistComparisonReport(root, comparisonReport(root, metadata, configuration.id, review, 'src/PreviewGlyph.module.css', metadataPath));
  const confirmed = { caseId: configuration.id, status: 'confirmed', evidence };
  const usage = rows => f.write('design-system/components/PreviewGlyph/usage.md', `## Figma to code correspondences\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: 1, correspondences: rows })}\n\`\`\``);
  const check = async () => {
    const result = await verifyImports(root);
    return { parent: result.components.find(c => c.name === metadata.name), actions: result.nextActions.filter(a => a.code === 'REVIEW_DELEGATION_DIFFERENCE' && a.targets.includes(metadataPath)) };
  };
  usage([confirmed]);
  let result = await check();
  assert.equal(result.parent.summary.confirmed, 1); assert.deepEqual(result.actions, []);
  const extra = { ...configuration, id: 'another-fidelity-case' };
  metadata.verification.cases.push(extra); f.write(metadataPath, metadata);
  usage([confirmed, { caseId: extra.id, status: 'candidate' }]);
  result = await check();
  assert.equal(result.parent.summary.confirmed, 1); assert.equal(result.parent.summary.pending, 1);
  assert.equal(result.actions.length, 1, 'a review in one case never covers the same difference in a pending case');
  metadata.verification.cases.pop(); f.write(metadataPath, metadata); usage([confirmed]);
  assert.deepEqual((await check()).actions, []);
  usage([{ ...confirmed, evidence: { ...evidence, sha256: '0'.repeat(64) } }]);
  result = await check();
  assert.equal(result.parent.summary.failedRecords, 1); assert.equal(result.actions.length, 1, 'corrupt evidence is not a current review');
  metadata.verification.cases = []; f.write(metadataPath, metadata); usage([]);
  result = await check();
  assert.equal(result.actions.length, 1, 'missing cases never suppress review obligations');
  metadata.verification.cases = [configuration]; f.write(metadataPath, metadata); usage([confirmed]);
  f.baseline.nodes[0].properties.width = 17;
  f.baseline.observations = extractObservations(f.baseline.nodes).observations;
  Object.assign(f.child.evidence, persistCapture(root, f.baseline)); f.write(f.childPath, f.child);
  result = await check();
  assert.equal(result.parent.summary.confirmed, 0); assert.equal(result.actions.length, 1, 'stale confirmation requires review again');
});
