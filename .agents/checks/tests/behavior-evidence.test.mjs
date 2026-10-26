import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts, renderedBehaviors, syntheticTypographyReviews } from './fixtures/rendered-artifacts.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { verifyCorrespondences } from '../lib/correspondences.mjs';
import { sha256 } from '../lib/render-plan.mjs';
import { closeVerification } from '../lib/verification-closure.mjs';

function fixture(t) {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath))), configuration = metadata.verification.cases[0];
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic contract test, not genuine visual evidence.' },
    checkReviews: syntheticTypographyReviews(root, metadata, configuration),
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' },
    artifacts: renderedArtifacts(root, metadata, configuration), behaviors: renderedBehaviors(root, metadata, configuration) };
  const produce = () => comparisonReport(root, metadata, configuration.id, review, undefined, metadataPath);
  const check = report => {
    const bytes = Buffer.from(JSON.stringify(report)), file = 'design-system/verification/behavior-report.json';
    writeFileSync(path.join(root, file), bytes);
    const markdown = '## Figma to code correspondences\n\n```json\n' + JSON.stringify({ schemaVersion: 1, correspondences: [{ caseId: configuration.id, status: 'confirmed', evidence: { path: file, sha256: sha256(bytes) } }] }) + '\n```';
    return verifyCorrespondences(root, metadata, markdown, markdown.split('\n').map((line, i) => i === 0 ? line : ''), { metadataPath });
  };
  return { root, metadataPath, metadata, configuration, review, produce, check };
}

test('confirmation requires every associated behavior measurement and all mandatory checks in PASS', t => {
  const f = fixture(t), good = structuredClone(f.review.behaviors);
  f.review.behaviors = [];
  assert.throws(f.produce, /Every associated behavior/);
  f.review.behaviors = [good[0], good[0]];
  assert.throws(f.produce, /Every associated behavior/);
  f.review.behaviors = good;
  const report = f.produce();
  assert.equal(report.behaviors.length, 2);
  assert.equal(f.check(report).current[0].status, 'confirmed');
  const omitted = structuredClone(report); omitted.behaviors = [];
  assert.ok(f.check(omitted).errors.some(e => e.includes('behavior evidence is missing')));
  const forged = structuredClone(report); forged.behaviors[0].renderChecks.checks[0].delta = 999;
  assert.ok(f.check(forged).errors.some(e => e.includes('behavior checks differ')));
  const c = f.metadata.verification.cases[1];
  f.review.behaviors[0].artifact = renderedArtifacts(f.root, f.metadata, c, { mutateBody: body => { body.parts.initial.elements[0].rect.width = 12; } })[0];
  assert.throws(f.produce, /Required behavior blocked: .* FAIL/);
});

test('unsupported required behavior cannot be rescued by the general visual review', t => {
  const f = fixture(t);
  delete f.metadata.verification.cases[1].expectations[0].relation;
  f.review.artifacts = renderedArtifacts(f.root, f.metadata, f.configuration);
  f.review.behaviors = renderedBehaviors(f.root, f.metadata, f.configuration);
  assert.throws(f.produce, /Required behavior blocked: .* NOT COMPARABLE; confirmation pending \(NOT VERIFIED\), not a demonstrated visual defect/);
});

test('visible behavior reference is mandatory, order independent and revalidated with its dependent case', t => {
  const f = fixture(t), cases = f.metadata.verification.cases;
  const reference = { ...structuredClone(cases[0]), id: 'visible-reference', kind: 'behavior', baseline: cases[0].id,
    props: { initial: 'F', show: true }, expectations: [{ kind: 'contained', part: 'initial', container: 'root', inset: 0, reason: 'Optional visible text must stay inside its root.' }] };
  for (const c of cases.filter(c => c.kind === 'behavior')) c.measurementBaseline = reference.id;
  cases.push(reference);
  f.review.artifacts = renderedArtifacts(f.root, f.metadata, f.configuration);
  f.review.behaviors = cases.filter(c => c.kind === 'behavior').map(c => ({ caseId: c.id,
    artifact: renderedArtifacts(f.root, f.metadata, c, { mutateBody: body => {
      if (c.id === reference.id) body.parts.initial.elements[0].rect.width = 16;
    } })[0] }));
  const report = f.produce();
  assert.equal(f.check(report).current[0].status, 'confirmed');
  writeFileSync(path.join(f.root, f.metadataPath), JSON.stringify(f.metadata));
  const manifest = { schemaVersion: 1, cases: [
    { caseId: f.configuration.id, artifacts: report.artifacts, checkReviews: f.review.checkReviews },
    ...f.review.behaviors.map(c => ({ caseId: c.caseId, artifacts: [c.artifact] })),
  ] };
  const closed = closeVerification(f.root, f.metadataPath, manifest);
  assert.deepEqual(closed.failures, []);
  assert.deepEqual(closed.pending, []);
  assert.equal(closed.cases.find(c => c.caseId === cases[1].id).checks.checks.find(c => c.axis === 'width').expected, 16);
  const incomplete = closeVerification(f.root, f.metadataPath, { ...manifest, cases: manifest.cases.filter(c => c.caseId !== reference.id) });
  assert.ok(incomplete.pending.some(c => c.caseId === reference.id));
  assert.ok(incomplete.cases.some(c => c.checks.checks.some(check => check.id.startsWith('behavior:') && check.status === 'NOT RUN')));
  report.behaviors.reverse();
  assert.equal(f.check(report).current[0].status, 'confirmed');
  const removed = structuredClone(report);
  removed.behaviors = removed.behaviors.filter(c => c.caseId !== reference.id);
  assert.ok(f.check(removed).errors.some(e => e.includes('baseline evidence is missing')));
  const original = structuredClone(reference.props);
  reference.props.show = false;
  const stale = f.check(report);
  assert.deepEqual(stale.errors, []);
  assert.equal(stale.current[0].status, 'candidate');
  reference.props = original;
  f.review.behaviors = f.review.behaviors.filter(c => c.caseId !== reference.id);
  assert.throws(f.produce, /Every associated behavior/);
});

test('behavior plan edits/additions/removals and comparator versions stale confirmations without hiding corruption', t => {
  const f = fixture(t), report = f.produce(), original = structuredClone(f.metadata.verification.cases);
  f.metadata.verification.cases[1].props.initial = 'MMMM';
  let result = f.check(report);
  assert.deepEqual(result.errors, []); assert.equal(result.current[0].status, 'candidate');
  f.metadata.verification.cases = structuredClone(original);
  f.metadata.verification.cases.push({ ...structuredClone(original[1]), id: 'new-behavior' });
  result = f.check(report);
  assert.deepEqual(result.errors, []); assert.equal(result.current[0].status, 'candidate');
  f.metadata.verification.cases = structuredClone(original).slice(0, 2);
  result = f.check(report);
  assert.deepEqual(result.errors, []); assert.equal(result.current[0].status, 'candidate');
  f.metadata.verification.cases = structuredClone(original);
  report.behaviors[0].renderChecks.comparatorVersion = 'render-comparator-v2';
  result = f.check(report);
  assert.deepEqual(result.errors, []); assert.equal(result.current[0].status, 'candidate');
  writeFileSync(path.join(f.root, report.behaviors[0].artifact.path), '{}');
  assert.ok(f.check(report).errors.some(e => e.includes('corrupted artifact')));
});
