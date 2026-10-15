import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { renderedArtifacts, renderedBehaviors, syntheticTypographyReviews } from './fixtures/rendered-artifacts.mjs';
import { finalizeImport, parseFinalizationArgs } from '../../skills/create-ds-from-figma/scripts/finalize-import.mjs';

test('finalizer CLI accepts an explicit collection port and rejects invalid, duplicate or irrelevant options before work', () => {
  const base = ['ROOT', 'METADATA'];
  assert.equal(parseFinalizationArgs([...base, '--collect']).port, undefined);
  assert.equal(parseFinalizationArgs([...base, '--collect', '--port', '5189']).port, 5189);
  assert.equal(parseFinalizationArgs([...base, '--port', '0', '--collect']).port, 0);
  assert.equal(parseFinalizationArgs([...base, '--reviews', 'review.json']).reviewFile, 'review.json');
  assert.equal(parseFinalizationArgs([...base, '--check']).mode, '--check');
  for (const flags of [[], ['--collect', '--port'], ['--collect', '--port', '-1'], ['--collect', '--port', '65536'],
    ['--collect', '--port', 'NaN'], ['--collect', '--port', '1.5'], ['--collect', '--port', '1e3'],
    ['--collect', '--port', '0', '--port', '5189'], ['--check', '--port', '5189'], ['--collect', '--check'],
    ['--reviews', '--port', '5189'], ['--reviews', 'review.json', '--port', '5189']]) assert.throws(() => parseFinalizationArgs([...base, ...flags]), /Usage|Port must/);
});

function fixture(t) {
  const f = createPreviewProject();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  f.metadata = JSON.parse(readFileSync(path.join(f.root, f.metadataPath)));
  const configuration = f.metadata.verification.cases[0];
  f.reviews = { schemaVersion: 1, cases: [{ caseId: configuration.id, review: {
    result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic schema fixture, never genuine visual evidence.' },
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' },
    checkReviews: syntheticTypographyReviews(f.root, f.metadata, configuration),
    artifacts: renderedArtifacts(f.root, f.metadata, configuration), behaviors: renderedBehaviors(f.root, f.metadata, configuration),
  } }] };
  f.usage = path.join(f.root, 'design-system/components/PreviewGlyph/usage.md');
  return f;
}

test('finalizer records supplied reviews, retains prose, persists reports and runs the repository gate', async t => {
  const f = fixture(t), metadataBytes = readFileSync(path.join(f.root, f.metadataPath));
  const prefix = '## Use\n\nSynthetic example.\n\n<!--\n```json\n{}\n```\n-->\n';
  const suffix = '\n## Do not\n\nDo not claim genuine fidelity from this fixture.\n';
  writeFileSync(f.usage, prefix + readFileSync(f.usage, 'utf8') + suffix);
  const result = await finalizeImport(f.root, f.metadataPath, { reviews: f.reviews });
  assert.equal(result.status, 'PASS', JSON.stringify(result));
  assert.equal(result.delivery.components[0].summary.confirmed, 1);
  const usage = readFileSync(f.usage, 'utf8');
  assert.ok(usage.startsWith(prefix)); assert.ok(usage.endsWith(suffix));
  assert.ok(readFileSync(path.join(f.root, result.correspondences[0].evidence.path)).length);
  assert.deepEqual(readFileSync(path.join(f.root, f.metadataPath)), metadataBytes);
  const again = await finalizeImport(f.root, f.metadataPath, { reviews: f.reviews });
  assert.equal(again.status, 'PASS', JSON.stringify(again));
  assert.equal(readFileSync(f.usage, 'utf8'), usage, 'repeating the same explicit review is idempotent');
});

test('missing, duplicate or failed reviews cannot create confirmation reports or alter usage', async t => {
  const f = fixture(t), before = readFileSync(f.usage);
  const reports = () => readdirSync(path.join(f.root, 'design-system/verification')).filter(file => file.endsWith('.json'));
  const initial = reports();
  for (const reviews of [{ schemaVersion: 1, cases: [] }, { ...f.reviews, cases: [...f.reviews.cases, ...f.reviews.cases] },
    { schemaVersion: 1, cases: [{ caseId: f.reviews.cases[0].caseId, review: { ...f.reviews.cases[0].review, result: 'FAIL' } }] }]) {
    const result = await finalizeImport(f.root, f.metadataPath, { reviews });
    assert.equal(result.status, 'FAIL'); assert.ok(result.errors.length);
    assert.deepEqual(readFileSync(f.usage), before); assert.deepEqual(reports(), initial);
  }
});

test('objective geometry failures cannot be promoted by a PASS review and CLI check fails on candidates', async t => {
  const f = fixture(t), configuration = f.metadata.verification.cases[0], before = readFileSync(f.usage);
  f.reviews.cases[0].review.artifacts = renderedArtifacts(f.root, f.metadata, configuration, { mutateBody: body => { body.parts.root.elements[0].rect.width += 30; } });
  const failed = await finalizeImport(f.root, f.metadataPath, { reviews: f.reviews });
  assert.equal(failed.status, 'FAIL'); assert.ok(failed.errors.some(error => /FAIL/.test(error)));
  assert.deepEqual(readFileSync(f.usage), before);
  const command = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/finalize-import.mjs', f.root, f.metadataPath, '--check'], { encoding: 'utf8' });
  assert.equal(command.status, 1, command.stderr); assert.equal(JSON.parse(command.stdout).status, 'FAIL');
  const unknown = await finalizeImport(f.root, 'design-system/components/Missing/metadata.json');
  assert.equal(unknown.status, 'FAIL'); assert.ok(unknown.errors.length);
});

test('a usage.md that is also a verification input is rejected before any report or usage is written', async t => {
  const f = fixture(t), usagePath = 'design-system/components/PreviewGlyph/usage.md', before = readFileSync(f.usage);
  const reports = () => readdirSync(path.join(f.root, 'design-system/verification')).filter(file => file.endsWith('.json'));
  const initial = reports();
  f.metadata.verification.inputs = [usagePath];
  writeFileSync(path.join(f.root, f.metadataPath), JSON.stringify(f.metadata, null, 2));
  const result = await finalizeImport(f.root, f.metadataPath, { reviews: f.reviews });
  assert.equal(result.status, 'FAIL'); assert.ok(result.errors.some(error => /cannot depend on itself/.test(error)), JSON.stringify(result.errors));
  assert.deepEqual(readFileSync(f.usage), before); assert.deepEqual(reports(), initial);
});

test('extra reviewer inputs cannot create a circular dependency on the usage file being written', async t => {
  const f = fixture(t), before = readFileSync(f.usage);
  const reports = () => readdirSync(path.join(f.root, 'design-system/verification')).filter(file => file.endsWith('.json'));
  const initial = reports();
  f.reviews.cases[0].review.inputs = ['design-system/components/PreviewGlyph/usage.md'];
  const result = await finalizeImport(f.root, f.metadataPath, { reviews: f.reviews });
  assert.equal(result.status, 'FAIL'); assert.ok(result.errors.some(error => /cannot depend on itself/.test(error)));
  assert.deepEqual(readFileSync(f.usage), before); assert.deepEqual(reports(), initial);
});

test('collection stops with a DS_GAP when a rendered image has no authorized source, before any browser starts', async t => {
  const f = createPreviewProject({ image: { kind: 'unresolved', reason: 'No authorized image' } });
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const result = await finalizeImport(f.root, f.metadataPath, { collect: true });
  assert.equal(result.status, 'FAIL'); assert.equal(result.collection, undefined);
  assert.ok(result.errors.some(error => /DS_GAP: .*image 1:2#fills#property\[0\]/.test(error)), JSON.stringify(result.errors));
});

test('a provided but invalid review is rejected even when earlier confirmations already pass the gate', async t => {
  const f = fixture(t), reports = () => readdirSync(path.join(f.root, 'design-system/verification')).filter(file => file.endsWith('.json'));
  const confirmed = await finalizeImport(f.root, f.metadataPath, { reviews: f.reviews });
  assert.equal(confirmed.status, 'PASS', JSON.stringify(confirmed));
  const usage = readFileSync(f.usage), initial = reports();
  assert.equal((await finalizeImport(f.root, f.metadataPath)).status, 'PASS', 'omitting reviews checks the current delivery');
  assert.equal((await finalizeImport(f.root, f.metadataPath, { reviews: undefined })).status, 'PASS');
  for (const reviews of [null, false, 0, '', [], {}, 'review']) {
    const result = await finalizeImport(f.root, f.metadataPath, { reviews });
    assert.equal(result.status, 'FAIL', `${JSON.stringify(reviews)} must not pass as an absent review`); assert.ok(result.errors.length);
    assert.equal(result.correspondences, undefined);
    assert.deepEqual(readFileSync(f.usage), usage); assert.deepEqual(reports(), initial);
  }
  const combined = await finalizeImport(f.root, f.metadataPath, { reviews: null, collect: true });
  assert.equal(combined.status, 'FAIL'); assert.equal(combined.collection, undefined);
  assert.ok(combined.errors.some(error => /Collect first/.test(error)), JSON.stringify(combined.errors));
  for (const [index, content] of ['null', 'false', '0', '""'].entries()) {
    const file = path.join(f.root, `review-${index}.json`); writeFileSync(file, content);
    const command = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/finalize-import.mjs', f.root, f.metadataPath, '--reviews', file], { encoding: 'utf8' });
    assert.equal(command.status, 1, `${content}: ${command.stderr}`); assert.equal(JSON.parse(command.stdout).status, 'FAIL');
    assert.ok(JSON.parse(command.stdout).errors.length);
  }
  assert.deepEqual(readFileSync(f.usage), usage);
});
