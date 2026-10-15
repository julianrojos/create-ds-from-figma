import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { publishMeasurement } from '../lib/publish-measurement.mjs';
import { checkedArtifacts } from '../lib/comparison-evidence.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts, renderedBehaviors } from './fixtures/rendered-artifacts.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';

test('publication preserves original bytes, is immutable/idempotent and rejects changed inputs or transport', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath))), c = m.verification.cases[0];
  const artifacts = renderedArtifacts(root, m, c);
  const receiptPath = path.join(root, 'design-system/verification/artifacts', c.id, 'browser.receipt.json');
  const bodyPath = path.join(path.dirname(receiptPath), 'browser.json');
  assert.deepEqual(publishMeasurement(root, m, c.id, receiptPath), artifacts[0]);
  assert.deepEqual(readFileSync(path.join(root, artifacts[0].path)), readFileSync(bodyPath));
  assert.deepEqual(readFileSync(path.join(root, artifacts[0].publication.path)), readFileSync(receiptPath));
  writeFileSync(bodyPath, '{}');
  assert.throws(() => publishMeasurement(root, m, c.id, receiptPath), /hash\/size/);
  writeFileSync(bodyPath, readFileSync(path.join(root, artifacts[0].path)));
  const extra = path.join(root, 'src/NewDependency.tsx');
  writeFileSync(extra, 'export const value = 1;');
  assert.deepEqual(publishMeasurement(root, m, c.id, receiptPath), artifacts[0]);
  rmSync(extra);
  writeFileSync(path.join(root, m.code.path), 'changed');
  assert.throws(() => publishMeasurement(root, m, c.id, receiptPath), /input changed/);
  writeFileSync(path.join(root, artifacts[0].publication.path), '{}');
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /receipt hash/);
});

test('publish and report both require mapped component CSS outside the enumerated src tree', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath))), c = m.verification.cases[0];
  const mapPath = path.join(root, 'design-system/relationships/figma-code-map.json');
  const map = JSON.parse(readFileSync(mapPath)), css = 'styles/PreviewGlyph.module.css';
  mkdirSync(path.join(root, 'styles')); writeFileSync(path.join(root, css), '.root { display: inline-flex; }');
  map['FILE:1:2'].code.style = css; writeFileSync(mapPath, JSON.stringify(map));
  const artifacts = renderedArtifacts(root, m, c);
  const receiptPath = path.join(root, 'design-system/verification/artifacts', c.id, 'browser.receipt.json');
  const receipt = JSON.parse(readFileSync(receiptPath));
  assert.ok(receipt.files.some(f => f.path === css));
  const report = comparisonReport(root, m, c.id, { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic test only.' },
    figmaRevision: { id: null, reason: 'Synthetic source.' }, codeRevision: { id: null, reason: 'Synthetic source.' }, artifacts, behaviors: renderedBehaviors(root, m, c) });
  assert.ok(report.files.some(f => f.path === css));
  receipt.files = receipt.files.filter(f => f.path !== css); writeFileSync(receiptPath, JSON.stringify(receipt));
  assert.throws(() => publishMeasurement(root, m, c.id, receiptPath), /input not recorded: styles\/PreviewGlyph.module.css/);
});
