import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts, syntheticTypographyReviews } from './fixtures/rendered-artifacts.mjs';
import { closeVerification } from '../lib/verification-closure.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { sha256 } from '../lib/render-plan.mjs';

const artifacts = (root, metadata, configuration, options) => renderedArtifacts(root, metadata, configuration, options)
  .map(a => ({ ...a, sha256: sha256(readFileSync(path.join(root, a.path))) }));

function fixture(t) {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath)));
  const manifest = { schemaVersion: 1, cases: metadata.verification.cases.map(c => ({ caseId: c.id, artifacts: artifacts(root, metadata, c), ...(c.kind === 'fidelity' ? { checkReviews: syntheticTypographyReviews(root, metadata, c) } : {}) })) };
  const close = () => closeVerification(root, metadataPath, manifest);
  return { root, metadataPath, metadata, manifest, close };
}

test('closure requires all published fidelity and behavior measurements, without promoting candidates or writing files', t => {
  const f = fixture(t), before = readFileSync(path.join(f.root, f.metadataPath));
  const measured = f.close();
  assert.equal(measured.state, 'measured', JSON.stringify(measured));
  assert.equal(measured.complete, false);
  assert.equal(measured.cases.length, f.metadata.verification.cases.length);
  assert.deepEqual(readFileSync(path.join(f.root, f.metadataPath)), before);
  f.manifest.cases.pop();
  assert.equal(f.close().state, 'pending');
  assert.ok(f.close().pending.some(p => p.reason.includes('missing')));
  f.manifest.cases = [];
  assert.equal(f.close().pending.length, f.metadata.verification.cases.length);
});

test('objective failures take precedence over pending measurements and no general review rescues behavior', t => {
  const f = fixture(t), baseline = f.metadata.verification.cases[0];
  f.manifest.cases[0].artifacts = artifacts(f.root, f.metadata, baseline, { mutateBody: b => { b.parts.root.elements[0].rect.width += 20; } });
  f.manifest.cases.pop();
  const result = f.close();
  assert.equal(result.state, 'failed'); assert.ok(result.failures.length); assert.ok(result.pending.length);
  f.manifest.cases[0].artifacts = artifacts(f.root, f.metadata, baseline);
  const behavior = f.metadata.verification.cases[1];
  f.manifest.cases[1].artifacts = artifacts(f.root, f.metadata, behavior, { mutateBody: b => { b.parts.initial.elements[0].geometry.axisAligned = false; } });
  const pending = f.close();
  assert.equal(pending.state, 'pending');
  assert.ok(pending.pending.some(p => p.reason.includes('Required behavior blocked')));
});

test('closure distinguishes stale original inputs from corrupt publications and rejects unknown/duplicate cases', t => {
  const f = fixture(t);
  const css = path.join(f.root, 'src/PreviewGlyph.module.css');
  writeFileSync(css, readFileSync(css, 'utf8') + '\n/* changed input */\n');
  const stale = f.close();
  assert.equal(stale.state, 'pending', JSON.stringify(stale)); assert.equal(stale.failures.length, 0); assert.ok(stale.stale.length);
  writeFileSync(path.join(f.root, f.manifest.cases[0].artifacts[0].path), '{}');
  assert.equal(f.close().state, 'failed', 'corruption is not hidden by stale source files');
  f.manifest.cases.push(f.manifest.cases[0]);
  assert.ok(f.close().failures.some(f => f.reason.includes('unique')));
});

test('static failures retain missing measurements and do not pretend existing records were checked', t => {
  const f = fixture(t);
  f.manifest.cases.pop();
  writeFileSync(path.join(f.root, 'src/PreviewGlyph.module.css'), '.initial { width: 12px; }');
  const result = f.close();
  assert.equal(result.state, 'failed', JSON.stringify(result));
  assert.ok(result.failures.length);
  assert.ok(result.pending.some(p => p.reason === 'Published measurement missing'));
  assert.ok(result.pending.some(p => p.reason.includes('not evaluated because static validation failed')));
  assert.equal(result.cases.length, 0, 'unsafe rendered comparisons are not executed');
  f.manifest.cases = [];
  assert.equal(f.close().pending.filter(p => p.reason === 'Published measurement missing').length, f.metadata.verification.cases.length);
});

test('closure retains static partial-border diagnostics without treating implicit CSS as an objective visual failure', t => {
  const f = fixture(t), file = path.join(f.root, 'src/PreviewGlyph.module.css');
  writeFileSync(file, readFileSync(file, 'utf8') + '\n.beak { border-style: solid; border-top-width: 1px; border-right-width: 1px; }');
  const result = f.close();
  assert.ok(result.warnings.some(warning => warning.includes('border widths may retain initial values')));
  assert.ok(result.warnings.some(warning => warning.includes('border color may be implicit')));
  assert.ok(!result.failures.some(failure => failure.reason.includes('border widths may retain')));
});

test('only current confirmed reports make closure complete; close CLI exits nonzero for measured candidates', t => {
  const f = fixture(t), configuration = f.metadata.verification.cases[0];
  const input = path.join(f.root, 'closure.json');
  writeFileSync(input, JSON.stringify(f.manifest));
  const cli = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/verification-plan.mjs', 'close', f.root, f.metadataPath, input], { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr); assert.equal(JSON.parse(cli.stdout).state, 'measured');
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic gate test, not fidelity proof.' },
    checkReviews: syntheticTypographyReviews(f.root, f.metadata, configuration),
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' },
    artifacts: f.manifest.cases[0].artifacts, behaviors: f.manifest.cases.slice(1).map(c => ({ caseId: c.caseId, artifact: c.artifacts[0] })) };
  const report = comparisonReport(f.root, f.metadata, configuration.id, review, undefined, f.metadataPath);
  const relative = 'design-system/verification/confirmation.json', bytes = Buffer.from(JSON.stringify(report));
  writeFileSync(path.join(f.root, relative), bytes);
  const usage = '## Figma to code correspondences\n\n```json\n' + JSON.stringify({ schemaVersion: 1, correspondences: [{ caseId: configuration.id, status: 'confirmed', evidence: { path: relative, sha256: sha256(bytes) } }] }) + '\n```';
  writeFileSync(path.join(f.root, 'design-system/components/PreviewGlyph/usage.md'), usage);
  assert.equal(f.close().state, 'confirmed', JSON.stringify(f.close()));
  assert.equal(f.close().complete, true);
  writeFileSync(path.join(f.root, 'src/PreviewGlyph.module.css'), 'changed');
  assert.equal(f.close().complete, false);
});
