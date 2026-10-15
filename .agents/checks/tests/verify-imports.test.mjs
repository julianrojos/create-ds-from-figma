import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyImports, assessImportSummaries } from '../verify-imports.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts, renderedBehaviors, syntheticTypographyReviews } from './fixtures/rendered-artifacts.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { sha256 } from '../lib/render-plan.mjs';

function empty(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'import-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function scaffold(root) {
  for (const relative of ['inventory.json', 'relationships/figma-code-map.json', 'relationships/figma-state.json']) {
    const file = path.join(root, 'design-system', relative);
    mkdirSync(path.dirname(file), { recursive: true });
    cpSync(new URL(`../../skills/create-ds-from-figma/plantillas/design-system/${relative}`, import.meta.url), file);
  }
}
function fixture(t) {
  const f = createPreviewProject();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  return { ...f, metadata: JSON.parse(readFileSync(path.join(f.root, f.metadataPath))) };
}
function confirm(f) {
  const configuration = f.metadata.verification.cases[0];
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic schema test, not visual proof.' },
    checkReviews: syntheticTypographyReviews(f.root, f.metadata, configuration),
    figmaRevision: { id: null, reason: 'Synthetic fixture.' }, codeRevision: { id: null, reason: 'Synthetic fixture.' },
    artifacts: renderedArtifacts(f.root, f.metadata, configuration), behaviors: renderedBehaviors(f.root, f.metadata, configuration) };
  const report = comparisonReport(f.root, f.metadata, configuration.id, review, undefined, f.metadataPath);
  const relative = 'design-system/verification/confirmation.json', bytes = Buffer.from(JSON.stringify(report));
  writeFileSync(path.join(f.root, relative), bytes);
  writeFileSync(path.join(f.root, 'design-system/components/PreviewGlyph/usage.md'), '## Figma to code correspondences\n\n```json\n' + JSON.stringify({ schemaVersion: 1,
    correspondences: [{ caseId: configuration.id, status: 'confirmed', evidence: { path: relative, sha256: sha256(bytes) } }] }) + '\n```');
  return review;
}

test('bare kit and coherent zero-component scaffold pass, partial scaffold cannot pass by an empty inventory', async t => {
  const root = empty(t);
  mkdirSync(path.join(root, 'design-system/components'), { recursive: true });
  writeFileSync(path.join(root, 'design-system/components/.DS_Store'), 'Finder metadata is not a scaffold');
  const bare = await verifyImports(root);
  assert.equal(bare.status, 'PASS'); assert.equal(bare.structure.status, 'NOT APPLICABLE');
  assert.equal(bare.application.status, 'NOT APPLICABLE');
  scaffold(root);
  const coherent = await verifyImports(root);
  assert.equal(coherent.status, 'PASS', JSON.stringify(coherent)); assert.equal(coherent.structure.status, 'PASS');
  rmSync(path.join(root, 'design-system/inventory.json'));
  const incomplete = await verifyImports(root);
  assert.equal(incomplete.status, 'FAIL'); assert.ok(incomplete.structure.reason);
});

test('a nonexistent project root and orphan source files do not qualify as an empty kit', async t => {
  const root = empty(t);
  assert.equal((await verifyImports(path.join(root, 'missing'))).status, 'FAIL');
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src/Orphan.tsx'), 'export const Orphan=()=>null;');
  assert.equal((await verifyImports(root)).status, 'FAIL');
});

test('missing summaries and empty fidelity sets are delivery failures', () => {
  assert.equal(assessImportSummaries(['Missing'], new Map())[0].status, 'FAIL');
  const summary = { totalCases: 0, confirmed: 0, pending: 0, failedRecords: 0, unestablished: 0 };
  assert.equal(assessImportSummaries(['Empty'], new Map([['Empty', summary]]))[0].status, 'FAIL');
});

test('candidate imports fail without promoting or changing metadata or usage', async t => {
  const f = fixture(t), files = [f.metadataPath, 'design-system/components/PreviewGlyph/usage.md'];
  const before = files.map(file => readFileSync(path.join(f.root, file), 'utf8'));
  const result = await verifyImports(f.root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.status, 'FAIL'); assert.equal(result.components[0].summary.pending, 1);
  assert.deepEqual(files.map(file => readFileSync(path.join(f.root, file), 'utf8')), before);
});

test('current reports pass; changed inputs and corrupt artifacts fail without remeasuring', async t => {
  const f = fixture(t), review = confirm(f);
  const current = await verifyImports(f.root);
  assert.equal(current.status, 'PASS', JSON.stringify(current));
  const file = path.join(f.root, 'src/PreviewGlyph.module.css'), original = readFileSync(file);
  writeFileSync(file, original + '\n/* changed */');
  const stale = await verifyImports(f.root);
  assert.equal(stale.status, 'FAIL'); assert.equal(stale.components[0].summary.pending, 1);
  writeFileSync(file, original);
  writeFileSync(path.join(f.root, review.artifacts[0].path), '{}');
  const corrupt = await verifyImports(f.root);
  assert.equal(corrupt.status, 'FAIL'); assert.ok(corrupt.errors.length);
});

test('removing a mapped component from inventory cannot hide its delivery obligations', async t => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, 'design-system/inventory.json'), JSON.stringify({ components: [], screens: [] }));
  const result = await verifyImports(f.root);
  assert.equal(result.status, 'FAIL'); assert.ok(result.errors.some(e => /inventory/.test(e)));
});

test('a missing browser is NOT RUN and does not hide component failures', async t => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, 'src/App.tsx'), 'export const App=()=> <main style={{display:"flex"}}/>;');
  const result = await verifyImports(f.root, { applicationOptions: { playwright: { chromium: { launch: async () => { throw new Error('Missing test browser'); } } } } });
  assert.equal(result.status, 'FAIL'); assert.equal(result.application.status, 'NOT RUN');
  assert.equal(result.components[0].status, 'FAIL'); assert.match(result.application.reason, /Missing test browser/);
});

test('main/index entries and custom demos reached through index.html cannot silently skip browser diagnostics', async t => {
  const missingBrowser = { playwright: { chromium: { launch: async () => { throw new Error('Required diagnostic browser unavailable'); } } } };
  for (const entry of ['src/main.tsx', 'src/index.jsx', 'index.html']) {
    const root = empty(t); scaffold(root);
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, entry), entry.endsWith('.html') ? '<script type="module" src="/src/Showcase.tsx"></script>' : 'export const demo = null;');
    writeFileSync(path.join(root, 'src/Showcase.tsx'), 'export const Showcase=()=> <main style={{display:"\'flex\'"}}/>;');
    const result = await verifyImports(root, { applicationOptions: missingBrowser });
    assert.equal(result.structure.status, 'PASS', JSON.stringify(result));
    assert.equal(result.status, 'FAIL'); assert.equal(result.application.status, 'NOT RUN');
    assert.ok(result.application.signals.includes(entry));
    assert.match(result.application.reason, /Required diagnostic browser/);
  }
});

test('root index.html without a design system is a partial application, not a bare kit', async t => {
  const root = empty(t);
  writeFileSync(path.join(root, 'index.html'), '<main>Partial scaffold</main>');
  const result = await verifyImports(root);
  assert.equal(result.status, 'FAIL'); assert.equal(result.structure.status, 'FAIL');
  assert.ok(result.structure.reason); assert.equal(result.application.status, 'NOT RUN');
});

test('browser cleanup failure preserves the gate component and structure results', async t => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, 'src/main.tsx'), 'export const demo = null;');
  const browser = { newPage: async () => { throw new Error('Page failed'); }, close: async () => { throw new Error('Browser cleanup failed'); } };
  const result = await verifyImports(f.root, { applicationOptions: { playwright: { chromium: { launch: async () => browser } } } });
  assert.equal(result.status, 'FAIL'); assert.equal(result.components[0].status, 'FAIL');
  assert.equal(result.structure.status, 'PASS'); assert.equal(result.application.status, 'NOT RUN');
  assert.match(result.application.reason, /Browser cleanup failed/);
});

test('confirmed reports cannot deliver a visible image whose source is unresolved', async t => {
  const f = createPreviewProject({ image: { kind: 'unresolved', reason: 'No authorized image' } });
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  f.metadata = JSON.parse(readFileSync(path.join(f.root, f.metadataPath)));
  confirm(f);
  const result = await verifyImports(f.root);
  assert.equal(result.status, 'FAIL', JSON.stringify(result));
  assert.equal(result.components[0].summary.confirmed, 1, 'the correspondence itself is current; the image source is the blocker');
  assert.equal(result.components[0].assetGaps.length, 1); assert.deepEqual(result.components[0].resourceGaps, []);
  assert.ok(result.components[0].errors.some(error => /DS_GAP: essential image sources/.test(error)));
  const bytes = readFileSync(path.join(f.root, 'src/base.css'));
  f.metadata.verification.assets[0].source = { kind: 'file', path: 'src/base.css', sha256: sha256(bytes) };
  writeFileSync(path.join(f.root, f.metadataPath), JSON.stringify(f.metadata, null, 2));
  confirm(f);
  const resolved = await verifyImports(f.root);
  assert.deepEqual(resolved.components[0].assetGaps, []); assert.equal(resolved.status, 'PASS', JSON.stringify(resolved));
});
