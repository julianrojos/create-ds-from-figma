import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importReport } from '../lib/import-report.mjs';
import { correspondenceSummary } from '../lib/correspondences.mjs';
import { verifyImports } from '../verify-imports.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const metadata = { verification: { cases: [
  { id: 'light', kind: 'fidelity', modes: { color: 'light', theme: 'slate' } },
  { id: 'dark', kind: 'fidelity', modes: { color: 'dark', theme: 'slate' } },
  { id: 'long', kind: 'behavior', modes: { color: 'light', theme: 'slate' } },
], unestablished: [{ reason: 'Other theme pending.' }] },
evidence: { decisions: [{ target: 'title', rule: 'integration', reason: 'Declared, not proof of authorization.', observations: ['source'] }], dispositions: [{ kind: 'excluded', reason: 'Editor-only metadata.', observations: ['editor'] }] }, unresolved: [{ reason: 'Design contrast unresolved.' }] };

test('final report derives exact mode and behavior coverage from current revalidation, not global PASS', () => {
  const summary = correspondenceSummary(metadata, { current: [{ caseId: 'light', status: 'confirmed', behaviorCaseIds: ['long'],
    computedColors: [{ id: 'color:icon:background-color', status: 'PASS' }], behaviorColors: [{ caseId: 'long', checks: [{ id: 'color:icon:background-color', status: 'PASS' }] }] },
    { caseId: 'dark', status: 'candidate', registeredStatus: 'confirmed' }] });
  const report = importReport({ status: 'FAIL', components: [{ name: 'Synthetic', status: 'FAIL', summary }], documents: [{ name: 'Synthetic', metadata }],
    nextActions: [{ code: 'AUTHORIZE_FONT_SOURCE' }, { code: 'RECORD_RENDERED_REVIEWS' }], warningCount: 29 });
  const c = report.components[0];
  assert.equal(c.coverage.confirmed, 1); assert.equal(c.coverage.pending, 1); assert.equal(c.coverage.stale, 1);
  assert.deepEqual(c.modeCoverage.find(m => m.modes.color === 'light').confirmedFidelity, ['light']);
  assert.deepEqual(c.modeCoverage.find(m => m.modes.color === 'dark').confirmedFidelity, []);
  assert.deepEqual(c.modeCoverage.find(m => m.modes.color === 'light').verifiedBehavior, ['long']);
  assert.equal(c.cases[0].computedColors[0].status, 'PASS'); assert.equal(c.cases[2].computedColors[0].status, 'PASS');
  assert.equal(c.declaredDecisions.length, 1); assert.equal(c.excludedObservations.length, 1); assert.equal(c.unresolvedDesign.length, 1);
  assert.equal(report.pendingAuthorizations.length, 1); assert.equal(report.obligations.length, 1); assert.equal(report.warningCount, 29);
  assert.match(report.headline, /1 of 2/);
  const changedDocument = structuredClone(metadata); changedDocument.verification.cases[0].modes.color = 'different';
  const stable = importReport({ status: 'FAIL', components: [{ name: 'Synthetic', status: 'FAIL', summary }], documents: [{ name: 'Synthetic', metadata: changedDocument }] });
  assert.equal(stable.components[0].cases[0].modes.color, 'light', 'Coverage consumes the revalidated configuration, not a later narrative metadata read');
});

test('temporary diagnostics report color checks and specific review obligations without promoting confirmations', () => {
  const report = importReport({ status: 'NOT VERIFIED', diagnostic: true, documents: [{ name: 'Synthetic', metadata }], diagnosticCases: [
    { caseId: 'light', summary: { PASS: 1 }, checks: [{ id: 'color:icon:background-color', status: 'PASS' }, { id: 'geometry:icon', status: 'NOT COMPARABLE', reason: 'Rotated.' }] },
    { caseId: 'long', checks: [{ id: 'behavior:0', status: 'NOT COMPARABLE', reason: 'Relation pending.' }] },
  ] });
  const c = report.components[0];
  assert.equal(c.coverage.confirmed, null); assert.equal(c.coverage.confirmationsRevalidated, false);
  assert.equal(c.cases[0].status, 'not-revalidated'); assert.equal(c.cases[0].computedColors[0].status, 'PASS');
  assert.equal(c.cases[0].requiredReviews[0].id, 'geometry:icon');
  assert.equal(c.cases[2].requiredReviews.length, 0); assert.equal(c.cases[2].requiredExecution[0].id, 'behavior:0');
  assert.match(report.headline, /does not revalidate/);
});

test('report never disguises an unreadable fiche or absent summary as an empty successful component', () => {
  const report = importReport({ status: 'FAIL', components: [{ name: 'Broken', status: 'FAIL' }], documents: [{ name: 'Broken', unavailable: 'Unreadable' }], errors: ['Static failure'] });
  assert.equal(report.status, 'FAIL'); assert.equal(report.components[0].unavailable, 'Unreadable'); assert.deepEqual(report.errors, ['Static failure']);
  const empty = importReport({ status: 'PASS', structure: { status: 'NOT APPLICABLE' } });
  assert.match(empty.headline, /No generated components/);
});

test('invalid nested records remain structured failures, not uncaught report exceptions or empty successes', async t => {
  for (const metadata of [{ verification: { cases: [null] } }, { evidence: { decisions: [null], dispositions: [null] } },
    { unresolved: [null], verification: { unestablished: [null] } }, { evidence: { decisions: 'not an array' } }]) {
    let report;
    assert.doesNotThrow(() => { report = importReport({ status: 'FAIL', documents: [{ name: 'Broken', metadata }], errors: ['Original static failure'] }); });
    assert.equal(report.status, 'FAIL'); assert.equal(report.components[0].status, 'FAIL');
    assert.ok(report.components[0].invalidInputs.length); assert.ok(report.errors.includes('Original static failure'));
    assert.equal(report.components[0].coverage.confirmationsRevalidated, false);
  }
  const { root, metadataPath } = createPreviewProject(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, metadataPath), original = JSON.parse(readFileSync(file));
  for (const corrupt of [m => { m.evidence.decisions = [null]; }, m => { m.verification.cases = [null]; }]) {
    const metadata = structuredClone(original); corrupt(metadata); writeFileSync(file, JSON.stringify(metadata));
    const result = await verifyImports(root);
    assert.equal(result.status, 'FAIL'); assert.equal(result.report.status, 'FAIL');
    assert.ok(result.report.components[0].invalidInputs.length);
    assert.ok(result.errors.length, 'the existing static failure remains available');
  }
});

test('only provisional PASS and noncomparable fidelity checks request specific reviews', () => {
  const tolerance = { requiresRenderedReview: true };
  const report = importReport({ status: 'FAIL', diagnostic: true, documents: [{ name: 'Synthetic', metadata }], diagnosticCases: [{ caseId: 'light', checks: [
    { id: 'geometry:bad', status: 'FAIL', typographyTolerance: tolerance },
    { id: 'geometry:missing', status: 'NOT RUN', typographyTolerance: tolerance },
    { id: 'geometry:provisional', status: 'PASS', typographyTolerance: tolerance },
    { id: 'geometry:ordinary', status: 'PASS', typographyTolerance: {} },
    { id: 'geometry:shape', status: 'NOT COMPARABLE' },
  ] }] });
  const c = report.components[0].cases[0];
  assert.deepEqual(c.requiredReviews.map(c => c.id), ['geometry:provisional', 'geometry:shape']);
  assert.deepEqual(c.requiredCorrections.map(c => c.id), ['geometry:bad']);
  assert.deepEqual(c.requiredExecution.map(c => c.id), ['geometry:missing']);
});
