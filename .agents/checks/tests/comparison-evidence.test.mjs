import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { checkedArtifacts, caseInputs } from '../lib/comparison-evidence.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts } from './fixtures/rendered-artifacts.mjs';
import { componentCapture } from './fixtures/component-capture.mjs';
import { persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';

test('typed artifacts reject irrelevant files, another case, another viewport and missing source evidence', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath))), c = m.verification.cases[0];
  const artifacts = renderedArtifacts(root, m, c);
  assert.equal(checkedArtifacts(root, artifacts, m, c).length, 2);
  assert.throws(() => checkedArtifacts(root, [artifacts[0]], m, c), /Figma screenshot/);
  assert.throws(() => checkedArtifacts(root, [{ ...artifacts[0], path: 'package.json' }, artifacts[1]], m, c), /must live under/);
  const bad = structuredClone(artifacts); bad[1].provenance.figmaRef = 'FILE:other';
  assert.throws(() => checkedArtifacts(root, bad, m, c), /matching source/);
  const bodyPath = path.join(root, artifacts[0].path), original = readFileSync(bodyPath);
  const body = JSON.parse(original); body.viewport.width++;
  writeFileSync(bodyPath, JSON.stringify(body));
  delete artifacts[0].sha256;
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /receipt|exact case/);
  writeFileSync(bodyPath, original);
  writeFileSync(path.join(root, artifacts[1].path), 'not an image');
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /PNG header/);
});

test('Figma PNG must decode completely and stay within one pixel of the captured node bounds at its export scale', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath))), c = m.verification.cases[0];
  const artifacts = renderedArtifacts(root, m, c), image = path.join(root, artifacts[1].path), original = readFileSync(image);
  assert.deepEqual(artifacts[1].image, { width: 48, height: 48, dimensionComparison: 'WITHIN_ONE_PIXEL_OF_NODE_BOUNDS' });
  writeFileSync(image, original.subarray(0, 33));
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /fully decoded/);
  const corrupt = Buffer.from(original); corrupt[corrupt.length - 1] ^= 1;
  writeFileSync(image, corrupt);
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /fully decoded/);
  // A decodable image of the wrong size is not the captured node, whatever its declared record says.
  writeFileSync(image, PNG.sync.write(new PNG({ width: 1, height: 1 })));
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /outside 1px of the captured node bounds 48x48/);
  assert.throws(() => checkedArtifacts(root, artifacts, m, c, { derive: true }), /outside 1px/);
  writeFileSync(image, PNG.sync.write(new PNG({ width: 50, height: 48 })));
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /outside 1px/);
  writeFileSync(image, original);
  // The declared scale participates in the comparison.
  artifacts[1].export.scale = 2;
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /outside 1px of the captured node bounds 96x96 at scale 2/);
  writeFileSync(image, PNG.sync.write(new PNG({ width: 96, height: 96 })));
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /image record must match/);
  artifacts[1].image = { width: 96, height: 96, dimensionComparison: 'WITHIN_ONE_PIXEL_OF_NODE_BOUNDS' };
  assert.equal(checkedArtifacts(root, artifacts, m, c).length, 2);
  artifacts[1].export.scale = 0;
  assert.throws(() => checkedArtifacts(root, artifacts, m, c), /positive scale/);
});

test('examined inputs exclude unrelated sources/collections and include installation manifests', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath))), c = m.verification.cases[0];
  writeFileSync(path.join(root, 'src/Nested.tsx'), 'export const Nested = null;');
  writeFileSync(path.join(root, 'package-lock.json'), '{}');
  const files = caseInputs(root, m, c).files;
  for (const file of ['package.json', 'package-lock.json']) assert.ok(files.includes(file), file);
  for (const file of ['src/Nested.tsx', 'design-system/tokens/Colors.json']) assert.ok(!files.includes(file), file);
});

test('fractional Figma bounds accept floor, round and ceil exports without assuming one rounding rule', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath))), c = m.verification.cases[0];
  const capture = JSON.parse(readFileSync(path.join(root, m.evidence.snapshot))).capture;
  capture.nodes[0].properties.width = 33.5;
  capture.nodes[0].properties.height = 24.25;
  Object.assign(m.evidence, persistCapture(root, componentCapture({ seeds: capture.nodes })));
  const artifacts = renderedArtifacts(root, m, c);
  for (const [width, height] of [[33, 24], [34, 24], [34, 25]]) {
    writeFileSync(path.join(root, artifacts[1].path), PNG.sync.write(new PNG({ width, height })));
    const result = checkedArtifacts(root, artifacts, m, c, { derive: true });
    assert.deepEqual(result[1].image, { width, height, dimensionComparison: 'WITHIN_ONE_PIXEL_OF_NODE_BOUNDS' });
  }
  writeFileSync(path.join(root, artifacts[1].path), PNG.sync.write(new PNG({ width: 36, height: 24 })));
  assert.throws(() => checkedArtifacts(root, artifacts, m, c, { derive: true }), /outside 1px/);
});

test('an unreadable captured node size leaves the PNG dimension comparison NOT VERIFIED', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath))), c = m.verification.cases[0];
  const capture = JSON.parse(readFileSync(path.join(root, m.evidence.snapshot))).capture;
  capture.nodes[0].properties.width = { mixed: true };
  Object.assign(m.evidence, persistCapture(root, componentCapture({ seeds: capture.nodes })));
  const artifacts = renderedArtifacts(root, m, c);
  const result = checkedArtifacts(root, artifacts, m, c, { derive: true });
  assert.deepEqual(result[1].image, { width: 48, height: 48, dimensionComparison: 'NOT VERIFIED' });
});

test('configuration metadata fingerprint ignores prose and unrelated cases, but covers relevant implementation decisions', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath))), c = m.verification.cases[0];
  const hash = () => caseInputs(root, m, c, 'src/PreviewGlyph.module.css').metadataHash;
  const initial = hash();
  m.description = 'Different wording'; m.verification.cases[1].props.initial = 'MMMM'; m.evidence.translations[0].reason = 'Reworded explanation';
  assert.equal(hash(), initial);
  m.measuredLiterals[0].value = '999px'; assert.notEqual(hash(), initial);
});
