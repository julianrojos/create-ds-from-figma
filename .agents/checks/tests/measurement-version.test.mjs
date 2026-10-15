import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts, renderedBehaviors, syntheticTypographyReviews } from './fixtures/rendered-artifacts.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { verifyCorrespondences } from '../lib/correspondences.mjs';
import { sha256 } from '../lib/render-plan.mjs';
import { publishMeasurement } from '../lib/publish-measurement.mjs';

function fixture(t) {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath))), configuration = metadata.verification.cases[0];
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic version contract only.' },
    checkReviews: syntheticTypographyReviews(root, metadata, configuration),
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' },
    artifacts: renderedArtifacts(root, metadata, configuration), behaviors: renderedBehaviors(root, metadata, configuration) };
  const produce = () => comparisonReport(root, metadata, configuration.id, review, undefined, metadataPath);
  const report = produce();
  const check = () => {
    const bytes = Buffer.from(JSON.stringify(report)), file = 'design-system/verification/version-report.json';
    writeFileSync(path.join(root, file), bytes);
    const markdown = '## Figma to code correspondences\n\n```json\n' + JSON.stringify({ schemaVersion: 1, correspondences: [{ caseId: configuration.id, status: 'confirmed', evidence: { path: file, sha256: sha256(bytes) } }] }) + '\n```';
    return verifyCorrespondences(root, metadata, markdown, markdown.split('\n').map((line, i) => i === 0 ? line : ''), { metadataPath });
  };
  // Synthetic historical bytes, never a claim that these were produced by an old browser.
  const changeVersion = (artifact, bodyVersion, receiptVersion = bodyVersion) => {
    const body = JSON.parse(readFileSync(path.join(root, artifact.path)));
    body.measurementVersion = bodyVersion;
    const bytes = Buffer.from(JSON.stringify(body));
    writeFileSync(path.join(root, artifact.path), bytes); artifact.sha256 = sha256(bytes);
    const receipt = JSON.parse(readFileSync(path.join(root, artifact.publication.path)));
    receipt.measurementVersion = receiptVersion; receipt.body.sha256 = sha256(bytes); receipt.body.bytes = bytes.length;
    const original = Buffer.from(JSON.stringify(receipt));
    writeFileSync(path.join(root, artifact.publication.path), original); artifact.publication.sha256 = sha256(original);
  };
  return { root, metadata, configuration, review, produce, report, check, changeVersion };
}

test('a historical measurement rules version makes fidelity confirmation stale, not corrupt', t => {
  const f = fixture(t);
  f.changeVersion(f.report.artifacts[0], 'measurement-rules-v999');
  const result = f.check();
  assert.deepEqual(result.errors, []); assert.equal(result.current[0].status, 'candidate');
  assert.ok(result.warnings.some(w => w.includes('Measurement rules version changed')));
  f.review.artifacts = f.report.artifacts;
  assert.throws(f.produce, /Measurement rules version changed/);
});

test('behavior measurements also require current rules; a comparator version change cannot hide version corruption', t => {
  const f = fixture(t), artifact = f.report.behaviors[0].artifact;
  f.changeVersion(artifact, 'measurement-rules-v999');
  const result = f.check();
  assert.deepEqual(result.errors, []); assert.equal(result.current[0].status, 'candidate');
  f.report.renderChecks.comparatorVersion = 'render-comparator-v3';
  f.changeVersion(artifact, 'measurement-rules-v999', 'measurement-rules-v998');
  assert.ok(f.check().errors.some(e => e.includes('version differs from original receipt')));
});

test('unversioned or malformed original measurements are invalid, not a compatibility exception', t => {
  const f = fixture(t);
  for (const version of [undefined, 'unknown']) {
    f.changeVersion(f.report.artifacts[0], version);
    assert.ok(f.check().errors.length);
  }
});

test('publication rejects stale producer rules even when body and receipt hashes are internally valid', t => {
  const f = fixture(t), artifact = f.report.artifacts[0];
  f.changeVersion(artifact, 'measurement-rules-v999');
  const receiptPath = path.join(f.root, artifact.publication.path), receipt = JSON.parse(readFileSync(receiptPath));
  // The original receipt names its sibling browser.json, not the published hashed body filename.
  writeFileSync(path.join(path.dirname(receiptPath), receipt.body.file), readFileSync(path.join(f.root, artifact.path)));
  assert.throws(() => publishMeasurement(f.root, f.metadata, f.configuration.id, receiptPath), /Measurement rules version changed/);
});
