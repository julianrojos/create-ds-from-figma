import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyCorrespondences } from '../lib/correspondences.mjs';
import { readCorrespondences } from '../lib/correspondences.mjs';
import { sha256 } from '../lib/render-plan.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts } from './fixtures/rendered-artifacts.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';

test('confirmed is tied to an exact fidelity configuration, durable rendered report and current input/artifact bytes', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), value); return { path: file, sha256: sha256(Buffer.from(value)) }; };
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath), 'utf8'));
  const configuration = metadata.verification.cases[0];
  const report = comparisonReport(root, metadata, configuration.id, { result: 'PASS',
    comparison: { method: 'agent-rendered-review', reason: 'Synthetic schema judgment, not real Figma evidence.' },
    figmaRevision: { id: null, reason: 'Synthetic source.' }, codeRevision: { id: null, reason: 'Fixture files hashed.' }, artifacts: renderedArtifacts(root, metadata, configuration) }, 'src/PreviewGlyph.module.css', metadataPath);
  let evidence = write('design-system/verification/report.json', JSON.stringify(report));
  const check = row => {
    row = { ...row, caseId: row.caseId === 'small' ? configuration.id : row.caseId };
    const markdown = `## Figma to code correspondences\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: 1, correspondences: [row] })}\n\`\`\``;
    const prose = markdown.split('\n').map((line, i) => i === 0 ? line : '');
    return verifyCorrespondences(root, metadata, markdown, prose, { style: 'src/PreviewGlyph.module.css', metadataPath });
  };
  assert.deepEqual(check({ caseId: 'small', status: 'confirmed', evidence }).errors, []);
  assert.ok(check({ caseId: 'small', status: 'confirmed' }).errors.length);
  assert.ok(check({ caseId: 'small', status: 'candidate', evidence }).errors.length);
  assert.ok(check({ caseId: 'other', status: 'confirmed', evidence }).errors.length);
  report.kind = 'measurement'; evidence = write(evidence.path, JSON.stringify(report));
  assert.ok(check({ caseId: 'small', status: 'confirmed', evidence }).errors.length);
  report.kind = 'rendered-comparison'; report.configuration = { ...configuration, props: { size: 'large' } }; evidence = write(evidence.path, JSON.stringify(report));
  assert.ok(check({ caseId: 'small', status: 'confirmed', evidence }).errors.length);
  report.configuration = configuration; evidence = write(evidence.path, JSON.stringify(report));
  metadata.description = 'Changed prose only.'; metadata.verification.cases[1].props.initial = 'MMMM';
  writeFileSync(path.join(root, metadataPath), JSON.stringify(metadata));
  assert.deepEqual(check({ caseId: 'small', status: 'confirmed', evidence }).warnings, []);
  metadata.measuredLiterals[0].value = '999px';
  const stale = check({ caseId: 'small', status: 'confirmed', evidence });
  assert.equal(stale.errors.length, 0); assert.equal(stale.current[0].status, 'candidate');
  assert.ok(stale.warnings.some(e => e.includes('Stale verification')));
  metadata.measuredLiterals[0].value = JSON.parse(readFileSync(path.join(root, metadataPath), 'utf8')).measuredLiterals[0].value;
  const token = path.join(root, 'design-system/tokens/Colors.json'), tokenBytes = readFileSync(token);
  writeFileSync(token, '{}');
  assert.equal(check({ caseId: 'small', status: 'confirmed', evidence }).warnings.length, 0); // Unused collection.
  writeFileSync(token, tokenBytes);
  const extra = path.join(root, 'src/NewDependency.tsx');
  writeFileSync(extra, 'export const value = 1;');
  assert.equal(check({ caseId: 'small', status: 'confirmed', evidence }).warnings.length, 0); // Unrelated source.
  rmSync(extra);
  writeFileSync(path.join(root, 'src/PreviewGlyph.tsx'), 'changed');
  assert.ok(check({ caseId: 'small', status: 'confirmed', evidence }).warnings.some(e => e.includes('input changed')));
  assert.equal(sha256(readFileSync(path.join(root, evidence.path))), evidence.sha256);
});

test('a new report cannot refresh a stale original browser measurement', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath))), c = m.verification.cases[0];
  const artifacts = renderedArtifacts(root, m, c);
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic judgment only.' },
    figmaRevision: { id: null, reason: 'Synthetic fixture.' }, codeRevision: { id: null, reason: 'Synthetic fixture.' }, artifacts };
  const prior = comparisonReport(root, m, c.id, review, undefined, metadataPath);
  const css = path.join(root, 'src/PreviewGlyph.module.css'), original = readFileSync(css);
  writeFileSync(css, original.toString().replace('width: 48px', 'width: 999px'));
  assert.throws(() => comparisonReport(root, m, c.id, review), /Measurement input changed/);
  // Even refreshed report hashes cannot make the original receipt's old inputs current.
  for (const input of prior.files) input.sha256 = sha256(readFileSync(path.join(root, input.path)));
  const reportPath = 'design-system/verification/refreshed.json', bytes = Buffer.from(JSON.stringify(prior));
  writeFileSync(path.join(root, reportPath), bytes);
  const markdown = `## Figma to code correspondences\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: 1, correspondences: [{ caseId: c.id, status: 'confirmed', evidence: { path: reportPath, sha256: sha256(bytes) } }] })}\n\`\`\``;
  const result = verifyCorrespondences(root, m, markdown, markdown.split('\n').map((line, i) => i === 0 ? line : ''), { metadataPath });
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some(e => e.includes('Measurement input changed')));
  writeFileSync(css, original);
  m.measuredLiterals[0].value = '999px';
  assert.throws(() => comparisonReport(root, m, c.id, review), /Stale measurement decisions/);
});

test('the documented correspondence example conforms to the canonical JSON contract', () => {
  const reference = readFileSync(new URL('../../skills/create-ds-from-figma/references/component-metadata.md', import.meta.url), 'utf8');
  const example = reference.split('Ejemplo ficticio de formato')[1].match(/```json\n([\s\S]*?)\n```/)[1];
  const markdown = `## Figma to code correspondences\n\n\`\`\`json\n${example}\n\`\`\``;
  const prose = markdown.split('\n').map((line, i) => i === 0 ? line : '');
  assert.deepEqual(readCorrespondences(markdown, prose), { schemaVersion: 1, correspondences: [{ caseId: 'large-source', status: 'candidate' }] });
  assert.doesNotMatch(reference, /\| Figma variant\/ref \| Code props \|/);
});
