import assert from 'node:assert/strict';
import { test } from 'node:test';
import { materializePlan, comparisonReport } from './verification-plan.mjs';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreviewProject } from '../../../checks/tests/fixtures/preview-project.mjs';
import { componentCapture } from '../../../checks/tests/fixtures/component-capture.mjs';
import { renderRequirements } from '../../../checks/lib/render-plan.mjs';
import { renderedArtifacts, renderedBehaviors, syntheticTypographyReviews } from '../../../checks/tests/fixtures/rendered-artifacts.mjs';

test('source requirements group equal fonts and full equivalent segments without losing provenance or distinct overrides', () => {
  const nodes = componentCapture().nodes; nodes[1].children = ['1:4'];
  const fontName = { family: 'Inter', style: 'Regular' };
  nodes.push({ id: '1:4', parentId: '1:3', type: 'TEXT', name: 'Initial', children: [], properties: { characters: 'F', fontName, fontSize: 20,
    width: 12, height: 24, textAutoResize: 'WIDTH_AND_HEIGHT', segments: [{ start: 0, end: 1, characters: 'F', fontName, fontSize: 20 }] } });
  const capture = componentCapture({ seeds: nodes }), requirements = renderRequirements(capture);
  assert.equal(requirements.fonts.length, 1); assert.equal(requirements.fonts[0].observations.length, 2);
  assert.equal(requirements.typography.length, 1); assert.equal(requirements.typography[0].observations.length, 2);
  const decisions = { fonts: [{ id: requirements.fonts[0].id, css: { family: 'Inter', weight: '400', style: 'normal' }, source: { kind: 'unresolved', reason: 'No authorized source.' } }], assets: [], stylesheets: [], unestablished: [],
    textDimensions: requirements.dimensions.map(r => ({ observation: r.observation, treatment: 'translation', cssSelector: '.initial', cssProperty: r.field })),
    cases: [{ id: 'source', kind: 'fidelity', figmaRef: 'FILE:1:3', props: { initial: 'F' } }] };
  const metadata = { evidence: {} }, result = materializePlan(metadata, capture, decisions);
  assert.equal(result.evidence.textDimensions[0].behavior, 'content');
  assert.deepEqual(result.verification.cases[0].content, { 'FILE:1:4': 'F' });
  assert.equal(result.verification.fonts[0].font, undefined);
  assert.deepEqual(metadata, { evidence: {} });
  const invalid = structuredClone(decisions); invalid.textDimensions[0].behavior = 'fixed';
  assert.throws(() => materializePlan(metadata, capture, invalid), /accepts only/);
  nodes[2].properties.segments[0].fontSize = 21;
  assert.equal(renderRequirements(componentCapture({ seeds: nodes })).typography.length, 2);
});

test('CLI derives, applies and persists reports against the same snapshot without source transcription', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = fileURLToPath(new URL('./verification-plan.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath), 'utf8'));
  const source = run('requirements', path.join(root, metadata.evidence.snapshot));
  assert.equal(source.status, 0, source.stderr);
  const requirements = JSON.parse(source.stdout);
  const decisions = { snapshotHash: requirements.snapshotHash, fonts: [], assets: [], stylesheets: metadata.verification.stylesheets, unestablished: [],
    cases: metadata.verification.cases.map(c => { const next = structuredClone(c); if (c.kind === 'fidelity') delete next.content; return next; }),
    textDimensions: requirements.dimensions.map(r => ({ observation: r.observation, treatment: 'translation', cssSelector: '.initial', cssProperty: r.field })) };
  const decisionFile = path.join(root, 'decisions.json'); writeFileSync(decisionFile, JSON.stringify(decisions));
  const applied = run('apply', root, metadataPath, decisionFile); assert.equal(applied.status, 0, applied.stderr);
  const updated = JSON.parse(readFileSync(path.join(root, metadataPath), 'utf8'));
  assert.deepEqual(updated.verification.cases[0].content, { 'FILE:1:3': 'F' });
  assert.deepEqual(updated.measuredLiterals, metadata.measuredLiterals);
  const original = readFileSync(path.join(root, metadataPath));
  decisions.snapshotHash = 'wrong'; writeFileSync(decisionFile, JSON.stringify(decisions));
  assert.notEqual(run('apply', root, metadataPath, decisionFile).status, 0);
  assert.deepEqual(readFileSync(path.join(root, metadataPath)), original);
  decisions.snapshotHash = requirements.snapshotHash;
  const invalid = structuredClone(decisions); invalid.cases[0].viewport.width = -1;
  writeFileSync(decisionFile, JSON.stringify(invalid));
  const refused = run('apply', root, metadataPath, decisionFile);
  assert.notEqual(refused.status, 0); assert.match(refused.stderr, /before writing/);
  assert.deepEqual(readFileSync(path.join(root, metadataPath)), original);
  const wrongCss = structuredClone(decisions); wrongCss.textDimensions[0].cssProperty = 'color';
  writeFileSync(decisionFile, JSON.stringify(wrongCss));
  assert.notEqual(run('apply', root, metadataPath, decisionFile).status, 0);
  assert.deepEqual(readFileSync(path.join(root, metadataPath)), original);
  const reviewFile = path.join(root, 'review.json');
  writeFileSync(reviewFile, JSON.stringify({ result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic CLI test judgment, not a real Figma fidelity claim.' },
    checkReviews: syntheticTypographyReviews(root, updated, updated.verification.cases[0]),
    figmaRevision: { id: null, reason: 'Synthetic source.' }, codeRevision: { id: null, reason: 'Fixture files hashed.' }, artifacts: renderedArtifacts(root, updated, updated.verification.cases[0]), behaviors: renderedBehaviors(root, updated, updated.verification.cases[0]) }));
  const recorded = run('report', root, metadataPath, 'source-0', reviewFile); assert.equal(recorded.status, 0, recorded.stderr);
  const reference = JSON.parse(recorded.stdout), bytes = readFileSync(path.join(root, reference.path));
  assert.equal(JSON.parse(bytes).kind, 'rendered-comparison');
  assert.equal(run('report', root, metadataPath, 'source-0', reviewFile).status, 0);
  assert.deepEqual(readFileSync(path.join(root, reference.path)), bytes);
});

test('report producer derives configuration and hashes without converting a measurement into a rendered judgment', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath), 'utf8'));
  const configuration = metadata.verification.cases[0];
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Compared exact configuration with source rendering.' },
    checkReviews: syntheticTypographyReviews(root, metadata, configuration),
    figmaRevision: { id: null, reason: 'Revision unavailable.' }, codeRevision: { id: null, reason: 'Uncommitted files hashed.' }, artifacts: renderedArtifacts(root, metadata, configuration), behaviors: renderedBehaviors(root, metadata, configuration) };
  const report = comparisonReport(root, metadata, configuration.id, review);
  assert.deepEqual(report.configuration, configuration); assert.ok(report.files.length >= 2);
  assert.equal(report.artifacts[0].sha256.length, 64);
  assert.throws(() => comparisonReport(root, metadata, configuration.id, { ...review, result: 'NOT VERIFIED' }));
  assert.throws(() => comparisonReport(root, metadata, configuration.id, { ...review, comparison: { method: 'measurement', reason: 'Only metrics.' } }));
});
