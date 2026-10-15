import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts, renderedBehaviors } from './fixtures/rendered-artifacts.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { verifyCorrespondences } from '../lib/correspondences.mjs';
import { sha256 } from '../lib/render-plan.mjs';

function fixture(t) {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath))), configuration = metadata.verification.cases[0];
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic contract test, not genuine visual evidence.' },
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' },
    artifacts: renderedArtifacts(root, metadata, configuration), behaviors: renderedBehaviors(root, metadata, configuration) };
  const produce = () => comparisonReport(root, metadata, configuration.id, review, undefined, metadataPath);
  const check = report => {
    const bytes = Buffer.from(JSON.stringify(report)), file = 'design-system/verification/behavior-report.json';
    writeFileSync(path.join(root, file), bytes);
    const markdown = '## Figma to code correspondences\n\n```json\n' + JSON.stringify({ schemaVersion: 1, correspondences: [{ caseId: configuration.id, status: 'confirmed', evidence: { path: file, sha256: sha256(bytes) } }] }) + '\n```';
    return verifyCorrespondences(root, metadata, markdown, markdown.split('\n').map((line, i) => i === 0 ? line : ''), { metadataPath });
  };
  return { root, metadata, configuration, review, produce, check };
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
