import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { componentCapture } from './fixtures/component-capture.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { canonicalJson } from '../lib/figma-evidence.mjs';
import { renderRequirements, sha256, verifyRenderPlan } from '../lib/render-plan.mjs';
import { assertConfirmationChecks, compareRendered } from '../lib/render-comparison.mjs';
import { deduplicateNextActions, inspectResourceMetadata, resourceNextActions, snapshotResources } from '../lib/resource-diagnostics.mjs';
import { registerResource } from '../../skills/create-ds-from-figma/scripts/verification-resources.mjs';
import { finalizeImport } from '../../skills/create-ds-from-figma/scripts/finalize-import.mjs';
import { verifyImports } from '../verify-imports.mjs';

function fixture(t) {
  const f = createPreviewProject();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const file = path.join(f.root, f.metadataPath), metadata = JSON.parse(readFileSync(file));
  const previous = JSON.parse(readFileSync(path.join(f.root, metadata.evidence.snapshot))).capture;
  previous.nodes[0].properties.fills = Array.from({ length: 6 }, () => ({ type: 'IMAGE', imageHash: 'shared-image' }));
  previous.nodes[1].properties.fontName = { family: 'Example', style: 'Regular' };
  const capture = componentCapture({ seeds: previous.nodes });
  const requirements = renderRequirements(capture);
  metadata.evidence = { ...metadata.evidence, ...persistCapture(f.root, capture) };
  metadata.verification.fonts = requirements.fonts.map(font => ({ id: font.id, css: { family: 'Example', style: 'normal', weight: '400' }, source: { kind: 'unresolved', reason: 'Synthetic source not provided' } }));
  metadata.verification.assets = requirements.assets.map(asset => ({ ...asset, source: { kind: 'unresolved', reason: 'Synthetic image not provided' } }));
  writeFileSync(file, JSON.stringify(metadata, null, 2));
  mkdirSync(path.join(f.root, 'src/assets'), { recursive: true });
  writeFileSync(path.join(f.root, 'src/assets/example font.woff2'), 'Synthetic resource bytes, not an actual font');
  writeFileSync(path.join(f.root, 'src/assets/shared.png'), 'Synthetic resource bytes, not an actual image');
  return { ...f, file, metadata, capture, fontId: requirements.fonts[0].id };
}
const withoutSources = metadata => {
  const result = structuredClone(metadata);
  for (const key of ['fonts', 'assets']) for (const resource of result.verification[key]) delete resource.source;
  return result;
};

test('early diagnostics derive observed identities, nodes and variants without deciding CSS, cases or essentiality', t => {
  const f = fixture(t), before = canonicalJson(f.capture);
  const result = snapshotResources(f.capture);
  assert.equal(result.resources.length, 2, 'six paints sharing an imageHash form one observed image candidate');
  const font = result.resources.find(resource => resource.kind === 'font'), image = result.resources.find(resource => resource.kind === 'image');
  assert.equal(font.id, f.fontId); assert.deepEqual(font.font, { family: 'Example', style: 'Regular' });
  assert.deepEqual(font.nodes, ['FILE:1:3']); assert.deepEqual(font.variants, ['FILE:1:2']);
  assert.equal(font.css.status, 'PENDING'); assert.equal(font.css.weight, undefined);
  for (const resource of result.resources) {
    assert.equal(resource.essentiality, 'UNCLASSIFIED'); assert.equal(resource.cases.status, 'PENDING');
    assert.equal(resource.configuration.status, 'NOT VERIFIED'); assert.equal(resource.loading.status, 'NOT RUN');
  }
  assert.equal(image.entries.length, 6); assert.equal(image.imageHash, 'shared-image');
  assert.equal(result.nextActions[0].code, 'REVIEW_OBSERVED_RESOURCES');
  assert.equal(canonicalJson(f.capture), before);
  const cli = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/verification-plan.mjs', 'requirements', path.join(f.root, f.metadata.evidence.snapshot)], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  const output = JSON.parse(cli.stdout);
  assert.deepEqual(output.resources, result.resources);
  assert.deepEqual(output.fonts, renderRequirements(f.capture).fonts, 'existing requirements output is preserved');
});

test('resource registration modifies only existing source fields, preserves CSS and is byte-idempotent', t => {
  const f = fixture(t), original = readFileSync(f.file), sourcePath = 'src/assets/example font.woff2';
  const result = registerResource(f.root, f.metadataPath, 'font', f.fontId, sourcePath);
  const next = JSON.parse(readFileSync(f.file));
  assert.deepEqual(withoutSources(next), withoutSources(f.metadata));
  assert.equal(result.affectedEntries, 1); assert.equal(result.source.path, sourcePath);
  assert.equal(result.source.sha256, sha256(readFileSync(path.join(f.root, sourcePath))));
  const resource = result.diagnostic.resources.find(resource => resource.kind === 'font');
  assert.equal(resource.registration.status, 'REGISTERED');
  assert.equal(resource.configuration.status, 'NOT VERIFIED'); assert.equal(resource.loading.status, 'NOT RUN');
  assert.notDeepEqual(readFileSync(f.file), original);
  const once = readFileSync(f.file);
  assert.equal(registerResource(f.root, f.metadataPath, 'font', f.fontId, sourcePath).changed, false);
  assert.deepEqual(readFileSync(f.file), once);
});

test('an image registration updates every captured occurrence without touching unrelated facts', t => {
  const f = fixture(t);
  const result = registerResource(f.root, f.metadataPath, 'image', 'shared-image', 'src/assets/shared.png');
  const metadata = JSON.parse(readFileSync(f.file));
  assert.equal(result.affectedEntries, 6);
  assert.ok(metadata.verification.assets.every(asset => canonicalJson(asset.source) === canonicalJson(result.source)));
  assert.deepEqual(withoutSources(metadata), withoutSources(f.metadata));
});

test('declared font linkage is surfaced without loading or confirming, and warnings cannot waive essential resources', async t => {
  const f = fixture(t), cssPath = path.join(f.root, 'src/base.css');
  writeFileSync(cssPath, '@font-face { font-family: Example; font-weight: 400; src: url("./assets/example%20font.woff2"); }');
  const plan = verifyRenderPlan(f.root, f.metadata, f.capture);
  assert.ok(plan.warnings.some(warning => warning.includes('resource loading NOT VERIFIED')));
  const configuration = f.metadata.verification.cases[0];
  const measurement = { parts: {}, fonts: [{ id: f.fontId, faces: [{ family: 'Example', weight: '400', style: 'normal', status: 'loaded' }] }] };
  const unresolved = compareRendered(f.capture, f.metadata, configuration, measurement);
  assert.equal(unresolved.checks.find(c => c.id === `font:${f.fontId}`).status, 'FAIL', 'a loaded face cannot waive missing authorization/registration');
  assert.throws(() => assertConfirmationChecks(unresolved, [], []));
  const blocked = await finalizeImport(f.root, f.metadataPath, { collect: true });
  assert.equal(blocked.status, 'FAIL'); assert.equal(blocked.collection, undefined);
  assert.ok(blocked.errors.some(error => error.includes('DS_GAP')));
  registerResource(f.root, f.metadataPath, 'font', f.fontId, 'src/assets/example font.woff2');
  const inspected = inspectResourceMetadata(f.root, f.metadataPath);
  assert.equal(inspected.resources.find(r => r.kind === 'font').configuration.status, 'DECLARED');
  assert.equal(inspected.resources.find(r => r.kind === 'font').loading.status, 'NOT RUN');
  const metadata = JSON.parse(readFileSync(f.file));
  const notLoaded = compareRendered(f.capture, metadata, configuration, { parts: {}, fonts: [] });
  assert.equal(notLoaded.checks.find(c => c.id === `font:${f.fontId}`).status, 'FAIL');
  let gate = await verifyImports(f.root);
  assert.equal(gate.status, 'FAIL'); assert.equal(gate.components[0].fontConfiguration.configurations[0].status, 'DECLARED');
  assert.ok(gate.components[0].assetGaps.length, 'resolving a font does not waive essential images');
  registerResource(f.root, f.metadataPath, 'image', 'shared-image', 'src/assets/shared.png');
  gate = await verifyImports(f.root);
  assert.equal(gate.status, 'FAIL', 'registration and CSS declarations do not confirm candidates');
  assert.equal(gate.components[0].summary.confirmed, 0);
  writeFileSync(cssPath, 'body { margin: 0; }');
  gate = await verifyImports(f.root);
  assert.ok(gate.nextActions.some(a => a.code === 'REVIEW_FONT_CONFIGURATION'));
});

test('changing either registered path or bytes requires explicit replacement, with no partial multi-entry update', t => {
  const f = fixture(t), image = 'src/assets/shared.png';
  registerResource(f.root, f.metadataPath, 'image', 'shared-image', image);
  const before = readFileSync(f.file);
  const alias = 'src/assets/same-bytes.png';
  writeFileSync(path.join(f.root, alias), readFileSync(path.join(f.root, image)));
  assert.throws(() => registerResource(f.root, f.metadataPath, 'image', 'shared-image', alias), /--replace/);
  writeFileSync(path.join(f.root, image), 'changed source bytes');
  assert.throws(() => registerResource(f.root, f.metadataPath, 'image', 'shared-image', image), /--replace/);
  assert.deepEqual(readFileSync(f.file), before);
  assert.equal(inspectResourceMetadata(f.root, f.metadataPath).resources.find(r => r.kind === 'image').registration.status, 'INVALID');
  assert.ok(inspectResourceMetadata(f.root, f.metadataPath).nextActions.some(action => action.code === 'RECHECK_REGISTERED_SOURCES'));
  assert.equal(registerResource(f.root, f.metadataPath, 'image', 'shared-image', image, { replace: true }).changed, true);
});

test('unknown identities, missing entries/files, invalid snapshots and escaping paths fail without writes', t => {
  const f = fixture(t), before = readFileSync(f.file);
  const attempt = (kind, id, file) => { assert.throws(() => registerResource(f.root, f.metadataPath, kind, id, file)); assert.deepEqual(readFileSync(f.file), before); };
  attempt('font', 'unknown-id', 'src/assets/example font.woff2');
  attempt('image', 'unknown-hash', 'src/assets/shared.png');
  attempt('image', '', 'src/assets/shared.png');
  attempt('font', f.fontId, 'missing.woff2');
  attempt('font', f.fontId, '../outside.woff2');
  attempt('font', f.fontId, f.metadataPath);
  symlinkSync(process.execPath, path.join(f.root, 'src/assets/outside'));
  attempt('font', f.fontId, 'src/assets/outside');
  const metadata = JSON.parse(before); metadata.verification.assets.pop();
  writeFileSync(f.file, JSON.stringify(metadata)); const incomplete = readFileSync(f.file);
  assert.throws(() => registerResource(f.root, f.metadataPath, 'image', 'shared-image', 'src/assets/shared.png'), /Every captured occurrence/);
  assert.deepEqual(readFileSync(f.file), incomplete);
  metadata.evidence.hash = '0'.repeat(64); writeFileSync(f.file, JSON.stringify(metadata)); const corrupt = readFileSync(f.file);
  assert.throws(() => registerResource(f.root, f.metadataPath, 'font', f.fontId, 'src/assets/example font.woff2'), /hash mismatch/);
  assert.deepEqual(readFileSync(f.file), corrupt);
});

test('early identities change with snapshot observations, while missing imageHash cannot produce a registration command', t => {
  const f = fixture(t), original = snapshotResources(f.capture);
  const seeds = structuredClone(f.capture.nodes); seeds[1].properties.fontName.family = 'Different';
  seeds[0].properties.fills[0].imageHash = null;
  const changed = snapshotResources(componentCapture({ seeds }));
  assert.notEqual(changed.resources.find(r => r.kind === 'font').id, original.resources.find(r => r.kind === 'font').id);
  for (const imageHash of [null, '', ' ', undefined]) {
    const actions = resourceNextActions(f.root, f.metadataPath, { assets: [{ observation: '1:2#fills#property', index: 0, imageHash, cases: ['source-0'] }] });
    assert.equal(actions[0].code, 'RECAPTURE_IMAGE_IDENTITY'); assert.equal(actions[0].command, null);
    assert.deepEqual(actions[0].permissions, ['figma-read']);
  }
});

test('malformed or conflicting records cannot partially register an image or font', t => {
  const f = fixture(t);
  const mutations = [
    m => { m.verification.assets.push(structuredClone(m.verification.assets[0])); },
    m => { m.verification.assets[0].imageHash = 'wrong-image'; },
    m => { m.verification.assets[0].source = { kind: 'file', path: 'src/assets/shared.png', sha256: '0'.repeat(64) }; },
    m => { delete m.verification.assets[0].source; },
    m => { m.verification.cases[0].figmaRef = 'FILE:missing'; },
    m => { m.verification.cases[0].id = ''; },
    m => { m.verification.cases[0] = null; },
  ];
  for (const mutate of mutations) {
    const metadata = structuredClone(f.metadata); mutate(metadata);
    writeFileSync(f.file, JSON.stringify(metadata)); const before = readFileSync(f.file);
    assert.throws(() => registerResource(f.root, f.metadataPath, 'image', 'shared-image', 'src/assets/shared.png'));
    assert.deepEqual(readFileSync(f.file), before);
  }
  const metadata = structuredClone(f.metadata); metadata.verification.fonts.push(structuredClone(metadata.verification.fonts[0]));
  writeFileSync(f.file, JSON.stringify(metadata)); const before = readFileSync(f.file);
  assert.throws(() => registerResource(f.root, f.metadataPath, 'font', f.fontId, 'src/assets/example font.woff2'), /Exactly one/);
  assert.deepEqual(readFileSync(f.file), before);
  metadata.verification.fonts = [{ ...metadata.verification.fonts[0], id: 'invented-font-id' }];
  writeFileSync(f.file, JSON.stringify(metadata)); const invented = readFileSync(f.file);
  assert.throws(() => registerResource(f.root, f.metadataPath, 'font', 'invented-font-id', 'src/assets/example font.woff2'), /Unknown font ID/);
  assert.deepEqual(readFileSync(f.file), invented);
});

test('CLI registration works before implementation and refuses invalid flags without writing', t => {
  const f = fixture(t);
  rmSync(path.join(f.root, 'src/components'), { recursive: true, force: true });
  const command = ['.agents/skills/create-ds-from-figma/scripts/verification-resources.mjs', 'register', f.root, f.metadataPath, 'font', f.fontId, 'src/assets/example font.woff2'];
  const success = spawnSync(process.execPath, command, { encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).diagnostic.resources.find(r => r.kind === 'font').registration.status, 'REGISTERED');
  const before = readFileSync(f.file);
  for (const flags of [['--force'], ['--replace', '--replace']]) {
    const result = spawnSync(process.execPath, [...command, ...flags], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /Usage:/);
    assert.deepEqual(readFileSync(f.file), before);
  }
});

test('gate, inspection and finalizer share deterministic resource actions, without granting authorization or fabricating CSS', async t => {
  const f = fixture(t), before = readFileSync(f.file);
  const diagnostic = inspectResourceMetadata(f.root, f.metadataPath);
  assert.equal(diagnostic.nextActions.filter(a => a.code === 'AUTHORIZE_IMAGE_SOURCE').length, 1);
  assert.equal(diagnostic.nextActions.filter(a => a.code === 'AUTHORIZE_FONT_SOURCE').length, 1);
  const gate = await verifyImports(f.root);
  assert.deepEqual(gate.errors, [], JSON.stringify(gate));
  const resourceActions = gate.nextActions.filter(action => action.code.startsWith('AUTHORIZE_'));
  assert.deepEqual(resourceActions, diagnostic.nextActions);
  const final = await finalizeImport(f.root, f.metadataPath, { collect: true });
  assert.equal(final.collection, undefined);
  assert.deepEqual(final.nextActions.filter(action => action.code.startsWith('AUTHORIZE_')), resourceActions);
  assert.ok(resourceActions.every(action => Array.isArray(action.command.args) && action.requiredArguments[0].name === 'sourcePath'));
  assert.ok(resourceActions.every(action => action.permissions.includes('project-write')));
  assert.deepEqual(readFileSync(f.file), before);
  const cli = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/verification-resources.mjs', 'inspect', f.root, f.metadataPath], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr); assert.deepEqual(JSON.parse(cli.stdout).nextActions, diagnostic.nextActions);
});

test('shared action deduplication merges targets without merging commands or mutating callers', () => {
  const first = { code: 'REVIEW', resources: [], command: null, targets: ['a.json'] };
  const second = { targets: ['b.json', 'a.json'], command: null, resources: [], code: 'REVIEW' };
  const command = { ...first, command: { executable: 'node', args: ['inspect', 'a.json'] } };
  const actions = [first, second, command], before = structuredClone(actions);
  const result = deduplicateNextActions(actions);
  assert.equal(result.length, 2); assert.deepEqual(result[0].targets, ['a.json', 'b.json']);
  assert.deepEqual(result[1], command); assert.deepEqual(actions, before);
});

test('two-component delivery groups generic actions with both targets and surfaces detailed font warnings', async t => {
  const f = fixture(t);
  const rebase = value => Array.isArray(value) ? value.map(rebase) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [rebase(key), rebase(item)]))
    : typeof value === 'string' ? value.replaceAll('1:', '2:').replaceAll('PreviewGlyph', 'OtherGlyph') : value;
  const other = rebase(f.metadata), otherPath = 'design-system/components/OtherGlyph/metadata.json';
  other.evidence = { ...other.evidence, ...persistCapture(f.root, componentCapture({ seeds: rebase(f.capture.nodes), rootNodeId: '2:2' })) };
  other.figma.url = 'https://www.figma.com/design/FILE?node-id=2-2';
  mkdirSync(path.join(f.root, 'design-system/components/OtherGlyph'), { recursive: true });
  writeFileSync(path.join(f.root, otherPath), JSON.stringify(other));
  writeFileSync(path.join(f.root, 'design-system/components/OtherGlyph/usage.md'), readFileSync(path.join(f.root, 'design-system/components/PreviewGlyph/usage.md')));
  for (const suffix of ['tsx', 'module.css']) writeFileSync(path.join(f.root, `src/OtherGlyph.${suffix}`), readFileSync(path.join(f.root, `src/PreviewGlyph.${suffix}`), 'utf8').replaceAll('PreviewGlyph', 'OtherGlyph'));
  const mapPath = path.join(f.root, 'design-system/relationships/figma-code-map.json'), map = JSON.parse(readFileSync(mapPath));
  map['FILE:2:2'] = rebase(map['FILE:1:2']); writeFileSync(mapPath, JSON.stringify(map));
  const statePath = path.join(f.root, 'design-system/relationships/figma-state.json'), state = JSON.parse(readFileSync(statePath));
  state.components.OtherGlyph = rebase(state.components.PreviewGlyph); writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(path.join(f.root, 'design-system/inventory.json'), JSON.stringify({ components: ['PreviewGlyph', 'OtherGlyph'], screens: [] }));
  writeFileSync(path.join(f.root, 'src/base.css'), '@import "./fonts.css" screen;');
  writeFileSync(path.join(f.root, 'src/fonts.css'), '/* conditional fixture, not loaded */');
  const gate = await verifyImports(f.root);
  assert.deepEqual(gate.errors, [], JSON.stringify(gate));
  const actions = gate.nextActions.filter(a => a.code === 'VERIFY_RESOURCE_CONFIGURATION');
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0].targets, [otherPath, f.metadataPath].sort());
  assert.equal(gate.nextActions.filter(a => a.code === 'AUTHORIZE_FONT_SOURCE').length, 2, 'different registration commands cannot be collapsed');
  for (const component of gate.components) for (const warning of component.fontConfiguration.warnings) {
    assert.ok(gate.warnings.includes(`${component.name}: font configuration: ${warning}`));
  }
  const final = await finalizeImport(f.root, f.metadataPath, { collect: true });
  assert.deepEqual(final.nextActions, gate.nextActions);
});

test('resource registration rejects ranges and invalid requested weights before writing source fields', t => {
  const f = fixture(t);
  for (const weight of ['400 700', '400 400', 'bolder', 'var(--weight)', '0', '1001', '0x190', '4e2', 400, null]) {
    const metadata = structuredClone(f.metadata); metadata.verification.fonts[0].css.weight = weight;
    writeFileSync(f.file, JSON.stringify(metadata)); const before = readFileSync(f.file);
    assert.throws(() => registerResource(f.root, f.metadataPath, 'font', f.fontId, 'src/assets/example font.woff2'), /concrete CSS weight/);
    assert.deepEqual(readFileSync(f.file), before);
  }
});
