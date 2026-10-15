import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts, renderedBehaviors } from './fixtures/rendered-artifacts.mjs';
import { componentCapture, fixtureRenderPlan } from './fixtures/component-capture.mjs';
import { persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { sha256 } from '../lib/render-plan.mjs';
import { verify } from '../verify-ds.mjs';

test('a second import leaves the first confirmation current; staleness warns without hiding corrupt artifacts', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, data) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)); };
  const read = file => JSON.parse(readFileSync(path.join(root, file)));
  const m = read(metadataPath), c = m.verification.cases[0], artifacts = renderedArtifacts(root, m, c);
  const report = comparisonReport(root, m, c.id, { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic test, not genuine fidelity.' },
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' }, artifacts, behaviors: renderedBehaviors(root, m, c) }, undefined, metadataPath);
  const bytes = Buffer.from(JSON.stringify(report)), reportPath = 'design-system/verification/confirmed.json'; write(reportPath, bytes);
  const usagePath = 'design-system/components/PreviewGlyph/usage.md';
  write(usagePath, '## Figma to code correspondences\n\n```json\n' + JSON.stringify({ schemaVersion: 1, correspondences: [{ caseId: c.id, status: 'confirmed', evidence: { path: reportPath, sha256: sha256(bytes) } }] }) + '\n```\n');
  const originalUsage = readFileSync(path.join(root, usagePath));
  const capture = componentCapture({ rootNodeId: '2:2', seeds: [{ id: '2:2', parentId: null, type: 'COMPONENT', name: 'Other', children: [], properties: { width: 24, height: 24 } }] });
  const otherPath = 'design-system/components/Other/metadata.json', otherCode = { path: 'src/components/Other/Other.tsx', component: 'Other', style: 'src/components/Other/Other.module.css' };
  const other = { ...m, name: 'Other', figma: { fileKey: 'FILE', nodeId: '2:2', url: 'https://www.figma.com/design/FILE?node-id=2-2' }, code: { path: otherCode.path, component: 'Other' },
    parts: { root: { selector: '.root', nodes: { default: 'FILE:2:2' } } }, measuredLiterals: [],
    evidence: { ...persistCapture(root, capture), decisions: [], textDimensions: [], translations: [], dispositions: [] }, verification: fixtureRenderPlan(capture) };
  write(otherPath, other);
  write('design-system/components/Other/usage.md', '## Figma to code correspondences\n\n```json\n{"schemaVersion":1,"correspondences":[{"caseId":"source-0","status":"candidate"}]}\n```\n');
  write(otherCode.path, 'import styles from "./Other.module.css"; export function Other() { return <span data-ds-part="root" className={styles.root} />; }');
  write(otherCode.style, '.root { width: 24px; height: 24px; }');
  const mapPath = 'design-system/relationships/figma-code-map.json', map = read(mapPath);
  map['FILE:2:2'] = { name: 'Other', code: otherCode, designSystem: { metadata: otherPath, usage: 'design-system/components/Other/usage.md' }, figma: { fileKey: 'FILE', nodeId: '2:2', refs: ['FILE:2:2'], variants: {} } }; write(mapPath, map);
  const statePath = 'design-system/relationships/figma-state.json', state = read(statePath); state.components.Other = { figmaNodeId: '2:2', nestedComponents: [] }; write(statePath, state);
  write('design-system/inventory.json', { components: ['PreviewGlyph', 'Other'], screens: [] });
  write('src/.DS_Store', 'Finder data');
  write(otherCode.path, readFileSync(path.join(root, otherCode.path), 'utf8') + '\n// Unrelated change\n');
  let result = verify(root);
  assert.deepEqual(result.errors, []);
  assert.ok(!result.warnings.some(w => w.includes('confirmed evidence is no longer current')), result.warnings.join('\n'));
  const css = 'src/PreviewGlyph.module.css'; write(css, readFileSync(path.join(root, css), 'utf8').replace('width: 48px', 'width: 999px'));
  result = verify(root); assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(w => w.includes('confirmed evidence is no longer current')));
  assert.deepEqual(readFileSync(path.join(root, usagePath)), originalUsage);
  write(artifacts[1].path, 'corrupt');
  result = verify(root); assert.ok(result.errors.some(e => e.includes('artifact') || e.includes('PNG')));
});
