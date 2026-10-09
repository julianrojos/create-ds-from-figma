import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { captureFigma, transportChecksum } from '../../skills/create-ds-from-figma/scripts/lib/capture-figma.mjs';
import { captureCode, assembleChunks, persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { canonicalJson, captureHash, captureProblems, sealCapture, loadSnapshot, verifyEvidence, classificationProposals } from '../lib/figma-evidence.mjs';
import { verifyFigmaEvidence, entryRefs, mappedComponentsOf } from '../verify-figma-evidence.mjs';
import { bridgeCode, captureViaBridge } from '../../skills/create-ds-from-figma/scripts/lib/capture-bridge.mjs';

function mockFigma() {
  const mixed = Symbol('mixed');
  const root = { id: '1:1', type: 'COMPONENT_SET', name: 'Example', key: 'set-key', children: [],
    componentPropertyDefinitions: { State: { type: 'VARIANT', variantOptions: ['Hover', 'Disabled'], defaultValue: 'Hover' },
      'Visible#1:0': { type: 'BOOLEAN', defaultValue: true } } };
  const a = { id: '1:2', name: 'State=Hover', type: 'COMPONENT', key: 'hover-key', parent: root, children: [],
    variantProperties: { State: 'Hover' }, width: 32, height: 32, fills: [], boundVariables: { width: { type: 'VARIABLE_ALIAS', id: 'size' } },
    explicitVariableModes: {}, resolvedVariableModes: { COL: 'light' } };
  const b = { id: '1:3', name: 'State=Disabled', type: 'COMPONENT', key: 'disabled-key', parent: root, children: [], variantProperties: { State: 'Disabled' } };
  for (const variant of [a, b]) Object.defineProperty(variant, 'componentPropertyDefinitions', { get() { throw new Error('Must not read definitions on a variant'); } });
  const t = { id: '1:4', type: 'TEXT', name: 'Text', parent: a, visible: false, characters: 'A', fontSize: mixed,
    fontName: { family: 'Inter', style: 'Regular' }, lineHeight: { unit: 'PERCENT', value: 120.00000476837158 },
    textStyleId: 'S:body', fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'color' } } }],
    getStyledTextSegments() { return [{ start: 0, end: 1, characters: 'A', fontSize: 14, fontName: this.fontName,
      lineHeight: this.lineHeight, textStyleId: 'S:body', fills: this.fills,
      boundVariables: { fontSize: { type: 'VARIABLE_ALIAS', id: 'semantic-size' } } }]; } };
  const instance = { id: '1:5', type: 'INSTANCE', name: 'Nested', parent: b, children: [],
    getMainComponentAsync: async () => ({ id: '9:9', key: 'nested-key', remote: false }) };
  root.children = [a, b]; a.children = [t]; b.children = [instance];
  const nodes = new Map([root, a, b, t, instance].map(n => [n.id, n]));
  const collection = { id: 'COL', name: 'Example collection', defaultModeId: 'light', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }], variableIds: ['size', 'semantic-size', 'color', 'unused'] };
  const variables = {
    size: { id: 'size', name: 'Size', resolvedType: 'FLOAT', variableCollectionId: 'COL', remote: false, valuesByMode: { light: 32, dark: 40 } },
    'semantic-size': { id: 'semantic-size', name: 'Semantic size', resolvedType: 'FLOAT', variableCollectionId: 'COL', remote: false, valuesByMode: { light: { type: 'VARIABLE_ALIAS', id: 'size' }, dark: { type: 'VARIABLE_ALIAS', id: 'size' } } },
    color: { id: 'color', name: 'Color', resolvedType: 'COLOR', variableCollectionId: 'COL', remote: false, valuesByMode: { light: { r: 0, g: 0, b: 0, a: 1 }, dark: { r: 1, g: 1, b: 1, a: 1 } } },
  };
  return { fileKey: 'FILE', skipInvisibleInstanceChildren: false, mixed, nodes, getNodeByIdAsync: async id => nodes.get(id), getStyleByIdAsync: async () => ({ id: 'S:body', key: 'body-key', remote: false, name: 'Body', type: 'TEXT', fontSize: 14 }),
    variables: { getLocalVariableCollectionsAsync: async () => [collection], getVariableByIdAsync: async id => variables[id], getVariableCollectionByIdAsync: async () => collection } };
}

async function fixture() {
  return captureFigma(mockFigma(), { fileKey: 'FILE', nodeId: '1:1' });
}

function metadata(capture) {
  const rootObservation = '1:1#componentPropertyDefinitions#property';
  return { figma: { fileKey: 'FILE', nodeId: '1:1' }, figmaCoverage: { variants: ['State=Hover', 'State=Disabled'] }, variants: { State: ['Hover', 'Disabled'] },
    parts: { root: { nodes: { 'State=Hover': 'FILE:1:2', 'State=Disabled': 'FILE:1:3' } } },
    bindings: capture.observations.filter(o => o.kind === 'binding').map(o => ({ observation: o.id, node: 'FILE:' + o.node, variableId: o.variableId, figmaProperty: o.field })),
    measuredLiterals: [], styles: [{ id: 'S:body', key: 'body-key', name: 'Body', type: 'TEXT', nodes: [{ node: 'FILE:1:4' }, { node: 'FILE:1:4', start: 0, end: 1 }] }],
    variantClassification: { State: { Hover: { kind: 'interaction', state: 'hover' }, Disabled: { kind: 'state', state: 'disabled' } } },
    notBuilt: [], evidence: { translations: [], dispositions: [], decisions: [
      { target: 'variantClassification.State.Hover', rule: 'browser-interaction-v1', reason: 'Reviewed browser interaction semantics', observations: [rootObservation] },
      { target: 'variantClassification.State.Disabled', rule: 'manual', reason: 'Consumer-controlled state reviewed', observations: [rootObservation] },
    ] } };
}

test('collector captures all descendants, hidden text, nested identity, mixed values, segments and modes without canvas writes', async () => {
  const c = await fixture();
  assert.equal(c.nodes.length, 5);
  assert.equal(c.variants.length, 2);
  assert.equal(c.coverage.issues.length, 0);
  assert.deepEqual(c.nodes.find(n => n.id === '1:4').properties.fontSize, { mixed: true });
  assert.equal(c.nodes.find(n => n.id === '1:4').properties.visible, false);
  assert.equal(c.nodes.find(n => n.id === '1:5').properties.mainComponent.key, 'nested-key');
  assert.equal(c.observations.filter(o => o.kind === 'binding').length, 4);
  assert.equal(c.variables.length, 3);
  assert.equal(c.collections[0].variableIds.length, 4);
  assert.equal(c.source.revision, null);
  assert.deepEqual(captureProblems(c), []);
});

test('direct and embedded collectors include hidden instance descendants and restore the filter', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const embedded of [false, true]) for (const initialFilter of [false, true]) {
    const figma = mockFigma();
    figma.skipInvisibleInstanceChildren = initialFilter;
    const instance = figma.nodes.get('1:5');
    const text = { ...figma.nodes.get('1:4'), id: '1:7', parent: null };
    const hidden = { id: '1:6', type: 'FRAME', name: 'Hidden instance subtree', visible: false,
      parent: instance, children: [text] };
    text.parent = hidden;
    figma.nodes.set(hidden.id, hidden); figma.nodes.set(text.id, text);
    Object.defineProperty(instance, 'children', { get() { return figma.skipInvisibleInstanceChildren ? [] : [hidden]; } });
    const getNode = figma.getNodeByIdAsync;
    figma.getNodeByIdAsync = async id => {
      assert.equal(figma.skipInvisibleInstanceChildren, false, 'disable filtering before the first node lookup');
      return getNode(id);
    };
    const c = embedded
      ? assembleChunks([await new AsyncFunction('figma', captureCode('FILE', '1:1', 0, null))(figma)])
      : await captureFigma(figma, { fileKey: 'FILE', nodeId: '1:1' });
    assert.equal(c.nodes.length, 7);
    assert.ok(c.observations.some(o => o.node === text.id && o.kind === 'binding'));
    assert.ok(c.observations.some(o => o.node === text.id && o.kind === 'style'));
    assert.deepEqual(c.coverage.issues, []);
    assert.deepEqual(captureProblems(c), []);
    assert.equal(figma.skipInvisibleInstanceChildren, initialFilter);
  }
});

test('collector restores the instance filter on node lookup and extraction failures', async () => {
  for (const initialFilter of [false, true]) for (const failure of ['lookup', 'extraction']) {
    const figma = mockFigma();
    figma.skipInvisibleInstanceChildren = initialFilter;
    if (failure === 'lookup') figma.getNodeByIdAsync = async () => { throw new Error('Lookup failed'); };
    const extract = failure === 'extraction' ? () => { throw new Error('Extraction failed'); } : undefined;
    await assert.rejects(captureFigma(figma, { fileKey: 'FILE', nodeId: '1:1' }, extract), /failed/i);
    assert.equal(figma.skipInvisibleInstanceChildren, initialFilter);
  }
});

test('collector fails closed when the instance filter cannot be verified, disabled or restored', async () => {
  for (const behavior of ['missing', 'ignored', 'throws', 'restore-ignored']) {
    const figma = mockFigma();
    let value = true, lookups = 0;
    figma.getNodeByIdAsync = async id => { lookups++; return figma.nodes.get(id); };
    if (behavior === 'missing') delete figma.skipInvisibleInstanceChildren;
    else Object.defineProperty(figma, 'skipInvisibleInstanceChildren', {
      get() { return value; },
      set(next) {
        if (behavior === 'throws') throw new Error('Filter is read-only');
        if (behavior === 'restore-ignored' && next === false) value = next;
      },
    });
    await assert.rejects(captureFigma(figma, { fileKey: 'FILE', nodeId: '1:1' }), /skipInvisibleInstanceChildren|read-only/);
    if (behavior !== 'restore-ignored') assert.equal(lookups, 0, 'do not start an incomplete capture');
  }
});

test('variant URLs promote to the full set; standalone roots and invalid files are distinguished', async () => {
  const figma = mockFigma();
  const c = await captureFigma(figma, { fileKey: 'FILE', nodeId: '1:2' });
  assert.equal(c.source.rootNodeId, '1:1');
  assert.equal(c.source.requestedNodeId, '1:2');
  await assert.rejects(captureFigma(figma, { fileKey: 'OTHER', nodeId: '1:1' }), /File key mismatch/);
  await assert.rejects(captureFigma(figma, { fileKey: 'FILE', nodeId: '1:4' }), /component/);
  figma.nodes.get('1:5').getMainComponentAsync = async () => ({ remote: true });
  await assert.rejects(captureFigma(figma, { fileKey: 'FILE', nodeId: '1:5' }), /origin URL/);
});

test('read failures are explicit, never silently dropped or interpreted as absent styles', async () => {
  const figma = mockFigma();
  Object.defineProperty(figma.nodes.get('1:2'), 'height', { get() { throw new Error('Unavailable height'); } });
  figma.getStyleByIdAsync = async () => null;
  figma.variables.getVariableByIdAsync = async () => null;
  const c = await captureFigma(figma, { fileKey: 'FILE', nodeId: '1:1' });
  assert.ok(c.coverage.issues.some(i => i.field === 'height'));
  assert.ok(c.coverage.issues.some(i => i.field === 'styles.S:body'));
  assert.ok(c.coverage.issues.some(i => i.field === 'variables.size'));
  assert.deepEqual(captureProblems(c), []);
  assert.ok(verifyEvidence(metadata(c), c).warnings.some(w => w.includes('completeness NOT VERIFIED')));
});

test('capture schema detects graph omissions, raw observation omissions and field profile manipulation', async () => {
  for (const mutate of [
    c => c.nodes.pop(), c => c.observations.pop(), c => c.variants.pop(),
    c => c.nodes[0].notApplicable.pop(), c => c.profile.fields.pop(),
    c => c.nodes[1].children.push('1:1'), c => c.variables.pop(), c => c.styles.pop(),
  ]) { const c = await fixture(); mutate(c); assert.ok(captureProblems(c).length); }
});

test('transport embeds the canonical collector and rejects truncation, duplication, corruption or changing reads', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const first = await new AsyncFunction('figma', captureCode('FILE', '1:1', 0, 5000))(mockFigma());
  const chunks = [first];
  for (let offset = 5000; offset < first.total; offset += 5000) chunks.push(await new AsyncFunction('figma', captureCode('FILE', '1:1', offset, 5000))(mockFigma()));
  const assembled = assembleChunks([...chunks].reverse());
  assert.deepEqual(captureProblems(assembled), []);
  assert.throws(() => assembleChunks(chunks.slice(1)), /Missing/);
  assert.throws(() => assembleChunks([...chunks, first]), /duplicate/);
  assert.throws(() => assembleChunks(chunks.map((c, i) => i ? c : { ...c, checksum: 'changed' })), /changed/);
  assert.throws(() => assembleChunks(chunks.map((c, i) => i ? c : { ...c, payload: 'X' + c.payload.slice(1) })), /corrupted/);
  assert.throws(() => captureCode('FILE', '1:1', -1), /Invalid/);
  assert.throws(() => captureCode('../FILE', '1:1'), /Invalid/);
});

test('SHA-256 is deterministic for object order, preserves numeric precision and is not a Figma revision', async () => {
  const c = await fixture();
  assert.equal(captureHash(c), captureHash(JSON.parse(canonicalJson(c))));
  assert.equal(sealCapture(c, '2026-01-01T00:00:00.000Z').hash, sealCapture(c, '2026-02-01T00:00:00.000Z').hash);
  assert.ok(canonicalJson(c).includes('120.00000476837158'));
  const changed = structuredClone(c); changed.nodes[0].name = 'Changed';
  assert.notEqual(captureHash(c), captureHash(changed));
});

test('persistence is content-addressed, idempotent and refuses traversal, symlinks and tampering', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-'));
  const outside = mkdtempSync(path.join(os.tmpdir(), 'snapshot-outside-'));
  try {
    const c = await fixture(), saved = persistCapture(root, c);
    const original = readFileSync(path.join(root, saved.snapshot), 'utf8');
    assert.deepEqual(persistCapture(root, c), saved);
    assert.equal(readFileSync(path.join(root, saved.snapshot), 'utf8'), original);
    assert.equal(loadSnapshot(root, saved.snapshot).hash, saved.hash);
    assert.throws(() => loadSnapshot(root, '../capture.json'), /Invalid/);
    const parsed = JSON.parse(original); parsed.capture.nodes[0].name = 'Tampered';
    writeFileSync(path.join(root, saved.snapshot), JSON.stringify(parsed));
    assert.throws(() => loadSnapshot(root, saved.snapshot), /mismatch/);
    symlinkSync(outside, path.join(outside, 'design-system'));
    assert.throws(() => persistCapture(outside, c), /escapes/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('coverage compares recorded facts, variants, parts and style applications to the same capture', async () => {
  const c = await fixture();
  assert.deepEqual(verifyEvidence(metadata(c), c).errors, []);
  for (const mutate of [
    m => m.bindings.pop(), m => m.bindings[0].variableId = 'wrong',
    m => m.bindings[0].figmaProperty = 'invented', m => m.styles[0].nodes = [],
    m => m.styles[0].name = 'Invented', m => m.figmaCoverage.variants.pop(),
    m => m.parts.root.nodes['State=Hover'] = 'FILE:99:99',
    m => m.evidence.decisions.pop(), m => m.variantClassification.State.Hover.kind = 'prop',
    m => m.bindings[0].modeOverride = { collectionId: 'COL', modeName: 'Dark' },
  ]) { const m = metadata(c); mutate(m); assert.ok(verifyEvidence(m, c).errors.length); }
});

test('literal fidelity preserves raw values and refuses token substitution; rendering is a separate lane', async () => {
  const c = await fixture(), m = metadata(c);
  const observation = c.observations.find(o => o.node === '1:4' && o.field === 'lineHeight' && o.kind === 'property');
  const literal = { observation: observation.id, source: 'FILE:1:4', figmaProperty: 'lineHeight', value: '1.2000000476837158', translation: 'approximate', figmaValue: { source: 'PLUGIN', field: 'lineHeight', value: observation.value } };
  m.measuredLiterals.push(literal);
  assert.deepEqual(verifyEvidence(m, c).errors, []);
  literal.figmaValue.value = { unit: 'PERCENT', value: 120 };
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('raw Figma value')));
  literal.translation = 'direct';
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('approximate')));
  const width = c.observations.find(o => o.node === '1:2' && o.field === 'width' && o.kind === 'property');
  m.measuredLiterals = [{ observation: width.id, source: 'FILE:1:2', figmaProperty: 'width', value: '31px', translation: 'direct' }];
  const result = verifyEvidence(m, c);
  assert.ok(result.errors.some(e => e.includes('dimension differs')));
  assert.ok(result.errors.some(e => e.includes('cannot be replaced')));
});

test('approximate literals require the exact Plugin API source, field and raw value', async () => {
  const c = await fixture();
  const observation = c.observations.find(o => o.node === '1:4' && o.field === 'lineHeight' && o.kind === 'property');
  const makeMetadata = () => {
    const m = metadata(c);
    m.measuredLiterals = [{ observation: observation.id, source: 'FILE:1:4', figmaProperty: 'lineHeight',
      value: '1.2000000476837158', translation: 'approximate',
      figmaValue: { source: 'PLUGIN', field: observation.field, value: structuredClone(observation.value) } }];
    return m;
  };
  assert.deepEqual(verifyEvidence(makeMetadata(), c).errors, []);
  for (const unit of ['PERCENT', null, 125]) {
    const m = makeMetadata();
    m.measuredLiterals[0].figmaValue.unit = unit;
    assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('not figmaValue.unit')));
    m.measuredLiterals[0].translation = 'direct';
    assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('not figmaValue.unit')));
  }
  for (const mutate of [
    raw => raw.source = 'REST', raw => raw.source = 'use_figma',
    raw => raw.field = 'lineHeightPercentFontSize',
    raw => raw.value = observation.value.value,
    raw => raw.value = { unit: 'PIXELS', value: observation.value.value },
  ]) {
    const m = makeMetadata();
    mutate(m.measuredLiterals[0].figmaValue);
    assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('raw Figma value differs from snapshot')));
  }
});

test('composites and exclusions account for observations without silently declaring fidelity PASS', async () => {
  const c = await fixture(), m = metadata(c), b = m.bindings.pop();
  m.evidence.translations.push({ observations: [b.observation], cssSelector: '.root', cssProperty: 'box-shadow', reason: 'Composite translation needs rendering review' });
  const result = verifyEvidence(m, c);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(w => w.includes('NOT VERIFIED')));
  m.evidence.translations = []; m.evidence.dispositions = [{ observations: [b.observation], kind: 'excluded', reason: 'Nonessential observation reviewed' }];
  assert.deepEqual(verifyEvidence(m, c).errors, []);
  assert.ok(verifyEvidence(m, c).warnings.length);
});

test('classification rules only propose documented candidates; boolean and disabled semantics are not guessed', async () => {
  const proposals = classificationProposals(await fixture());
  assert.equal(proposals.length, 2);
  assert.equal(proposals.find(p => p.value === 'Hover').status, 'candidate');
  assert.equal(proposals.find(p => p.value === 'Disabled').status, 'ambiguous');
});

test('decision references cannot hide omitted bindings; partial style ranges cannot cover whole-node applications', async () => {
  const c = await fixture(), m = metadata(c), binding = m.bindings.pop();
  m.evidence.decisions[0].observations.push(binding.observation);
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('Unaccounted binding')));
  m.bindings.push(binding);
  m.styles[0].nodes = m.styles[0].nodes.filter(n => n.start !== undefined);
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('Unaccounted style')));
});

test('evidence runner checks mandatory captures, omissions and tampering', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'linked-evidence-'));
  try {
    const c = await fixture(), saved = persistCapture(root, c), m = metadata(c);
    Object.assign(m.evidence, saved);
    const relative = 'design-system/components/Example/metadata.json';
    mkdirSync(path.join(root, 'design-system/components/Example'), { recursive: true });
    mkdirSync(path.join(root, 'design-system/relationships'), { recursive: true });
    const map = { 'FILE:1:1': { name: 'Example', designSystem: { metadata: relative } } };
    writeFileSync(path.join(root, 'design-system/relationships/figma-code-map.json'), JSON.stringify(map));
    const writeMetadata = () => writeFileSync(path.join(root, relative), JSON.stringify(m));
    writeMetadata();
    assert.deepEqual(verifyFigmaEvidence(root).errors, []);
    assert.equal(verifyFigmaEvidence(root).components[0].capturedNodes, 5);
    const binding = m.bindings.pop(); writeMetadata();
    assert.ok(verifyFigmaEvidence(root).errors.some(e => e.includes('Unaccounted binding')));
    m.bindings.push(binding);
    const evidence = m.evidence; m.evidence = null; writeMetadata();
    assert.ok(verifyFigmaEvidence(root).errors.some(e => e.includes('import evidence is required')));
    m.evidence = evidence; writeMetadata();
    const snapshot = JSON.parse(readFileSync(path.join(root, saved.snapshot), 'utf8'));
    snapshot.capture.nodes[0].name = 'Tampered';
    writeFileSync(path.join(root, saved.snapshot), JSON.stringify(snapshot));
    assert.ok(verifyFigmaEvidence(root).errors.some(e => e.includes('SHA-256 mismatch')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('generated bridge transfers real tool envelopes through shell stdin, without interpolating payload into executable code', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const script = path.resolve('.agents/skills/create-ds-from-figma/scripts/figma-capture.mjs');
  const figma = mockFigma();
  figma.nodes.get('1:4').characters = "quotes '\"; $(echo SHOULD_NOT_RUN)\\n".repeat(600);
  const received = [], reports = [];
  let directory;
  const tools = {
    exec_command: async ({ cmd }) => {
      const r = spawnSync('/bin/sh', ['-c', cmd], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
      if (cmd.endsWith(' session')) directory = r.stdout.trim();
      return { exit_code: r.status, output: r.stdout + r.stderr };
    },
    mcp__codex_apps__figma_use_figma: async ({ code, skillNames }) => {
      assert.equal(skillNames, 'figma-use');
      const result = await new AsyncFunction('figma', code)(figma);
      received.push(result);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false };
    },
  };
  try {
    await new AsyncFunction('tools', 'text', bridgeCode(script, 'FILE', '1:1'))(tools, r => reports.push(r));
    assert.ok(received.length > 1);
    for (const chunk of received) assert.deepEqual(JSON.parse(readFileSync(path.join(directory, `${chunk.offset}.json`), 'utf8')), chunk);
    assert.equal(reports[0].persistedInProject, false);
    const firstDirectory = directory;
    await new AsyncFunction('tools', 'text', bridgeCode(script, 'FILE', '1:1'))(tools, () => {});
    assert.notEqual(directory, firstDirectory);
    rmSync(firstDirectory, { recursive: true, force: true });
  } finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
});

test('bridge rejects changed, malformed, failed or excessive responses and never stages a mixed chunk', async () => {
  let staged = 0;
  const first = { transportVersion: 1, offset: 0, total: 2, checksum: 'a', payload: 'x' };
  const run = responses => captureViaBridge({ fileKey: 'FILE', nodeId: '1:1', getCode: async () => '',
    runFigma: async () => responses.shift(), stage: async () => staged++, maxChunks: 2 });
  const wrap = chunk => ({ content: [{ type: 'text', text: JSON.stringify(chunk) }] });
  await assert.rejects(run([wrap(first), wrap({ ...first, offset: 1, checksum: 'b' })]), /NEW temporary session/);
  assert.equal(staged, 1);
  await assert.rejects(run([{ isError: true }]), /tool failed/);
  await assert.rejects(run([wrap({ ...first, payload: '' })]), /truncated/);
  await assert.rejects(run([wrap({ ...first, total: 3 }), wrap({ ...first, total: 3, offset: 1 })]), /chunk limit/);
});

test('failed generated bridge exposes the temporary session for diagnosis without exposing payloads', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor, reports = [];
  const tools = { exec_command: async ({ cmd }) => ({ exit_code: 0, output: cmd.endsWith(' session') ? '/tmp/failed-session' : 'read-only code' }),
    mcp__codex_apps__figma_use_figma: async () => ({ isError: true }) };
  await assert.rejects(new AsyncFunction('tools', 'text', bridgeCode('/tmp/collector.mjs', 'FILE', '1:1'))(tools, r => reports.push(r)), /tool failed/);
  assert.equal(reports[0].failedSession, '/tmp/failed-session');
  assert.equal(Object.hasOwn(reports[0], 'payload'), false);
});

test('instance delegation covers descendants only with mapped identity and exact captured configuration', async () => {
  const figma = mockFigma(), instance = figma.nodes.get('1:5');
  instance.componentProperties = { Label: { type: 'TEXT', value: 'Nested' } };
  const inner = { id: '1:6', type: 'FRAME', name: 'Inside', parent: instance, children: [], boundVariables: { width: { type: 'VARIABLE_ALIAS', id: 'size' } } };
  instance.children.push(inner);
  const c = await captureFigma(figma, { fileKey: 'FILE', nodeId: '1:1' }), m = metadata(c);
  m.bindings = m.bindings.filter(b => b.node !== 'FILE:1:6');
  m.evidence.dispositions = [{ kind: 'delegated', instance: 'FILE:1:5', resolvedComponent: 'Nested',
    configuration: instance.componentProperties, reason: 'Reuse mapped instance; overrides require rendered review' }];
  const context = { mappedComponents: [{ name: 'Nested', refs: ['FILE:9:9'] }] };
  assert.deepEqual(verifyEvidence(m, c, context).errors, []);
  assert.equal(verifyEvidence(m, c, context).review.delegations[0].descendants, 1);
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('delegation identity')));
  m.evidence.dispositions[0].configuration = {};
  assert.ok(verifyEvidence(m, c, context).errors.some(e => e.includes('configuration')));
});

test('manual decisions and literal review are explicit and grouped, with detail retained', async () => {
  const c = await fixture(), m = metadata(c), o = c.observations.find(o => o.field === 'fontName' && o.node === '1:4');
  m.measuredLiterals = Array.from({ length: 5 }, () => ({ observation: o.id, source: 'FILE:1:4', figmaProperty: o.field, translation: 'approximate',
    value: 'Inter', cssProperty: 'font-family', figmaValue: { source: 'PLUGIN', field: o.field, value: o.value } }));
  const result = verifyEvidence(m, c);
  assert.equal(result.warnings.filter(w => w.includes('literal translation')).length, 1);
  assert.equal(result.review.literals.length, 5);
  assert.ok(result.warnings.some(w => w.includes('justification NOT VERIFIED')));
  m.evidence.decisions[1].target = 'invented';
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('valid unique target')));
});

test('CLI roundtrip and empty repository report do not claim completeness', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'capture-cli-'));
  const script = path.resolve('.agents/skills/create-ds-from-figma/scripts/figma-capture.mjs');
  try {
    const c = await fixture(), payload = canonicalJson(c);
    const run = spawnSync(process.execPath, [script, 'save', root], { input: JSON.stringify({ chunks: [{ transportVersion: 1, offset: 0, total: payload.length, checksum: transportChecksum(payload), payload }] }), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const saved = JSON.parse(run.stdout), file = path.join(root, saved.snapshot);
    const propose = spawnSync(process.execPath, [script, 'propose', file], { encoding: 'utf8' });
    assert.equal(propose.status, 0, propose.stderr);
    assert.equal(JSON.parse(propose.stdout)[0].status, 'candidate');
    const compare = spawnSync(process.execPath, [script, 'compare', file, file], { encoding: 'utf8' });
    assert.equal(JSON.parse(compare.stdout).sameCapture, true);
    assert.equal(verifyFigmaEvidence(root).errors.length, 0);
    assert.ok(verifyFigmaEvidence(root).warnings.some(w => w.includes('No generated DS')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('mixed or unreadable raw values cannot be recorded as a single literal, directly or approximately', async () => {
  const c = await fixture();
  const fontSize = c.observations.find(o => o.node === '1:4' && o.field === 'fontSize' && o.kind === 'property');
  assert.deepEqual(fontSize.value, { mixed: true });
  for (const translation of ['direct', 'approximate']) {
    const m = metadata(c);
    m.measuredLiterals = [{ observation: fontSize.id, source: 'FILE:1:4', figmaProperty: 'fontSize', value: '999px', translation, cssProperty: 'font-size',
      ...(translation === 'approximate' ? { figmaValue: { source: 'PLUGIN', field: 'fontSize', value: fontSize.value } } : {}) }];
    assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('mixed or unavailable')), translation);
  }
  const unavailable = structuredClone(c);
  unavailable.observations.find(o => o.id === fontSize.id).value = { unavailable: true };
  const m = metadata(unavailable);
  m.measuredLiterals = [{ observation: fontSize.id, source: 'FILE:1:4', figmaProperty: 'fontSize', value: '14px', translation: 'direct', cssProperty: 'font-size' }];
  assert.ok(verifyEvidence(m, unavailable).errors.some(e => e.includes('mixed or unavailable')));
});

test('segment literals are compared like node literals', async () => {
  const c = await fixture(), m = metadata(c);
  const segment = c.observations.find(o => o.node === '1:4' && o.field === 'segments[0].fontSize' && o.kind === 'property');
  assert.equal(segment.value, 14);
  m.measuredLiterals = [{ observation: segment.id, source: 'FILE:1:4', figmaProperty: segment.field, value: '14px', translation: 'direct', cssProperty: 'font-size' }];
  assert.ok(!verifyEvidence(m, c).errors.some(e => e.includes('dimension')));
  m.measuredLiterals[0].value = '999px';
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('dimension differs')));
});

test('a literal cannot replace a binding nested under an array or object path', async () => {
  const c = await fixture();
  const fills = c.observations.find(o => o.node === '1:4' && o.field === 'fills' && o.kind === 'property');
  assert.ok(c.observations.some(o => o.kind === 'binding' && o.node === '1:4' && o.field === 'fills[0].color'));
  const m = metadata(c);
  m.measuredLiterals = [{ observation: fills.id, source: 'FILE:1:4', figmaProperty: 'fills', value: '#000', translation: 'approximate', cssProperty: 'background', figmaValue: { source: 'PLUGIN', field: 'fills', value: fills.value } }];
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('cannot be replaced')));
  const unrelated = c.observations.find(o => o.node === '1:4' && o.field === 'fontName' && o.kind === 'property');
  m.measuredLiterals = [{ observation: unrelated.id, source: 'FILE:1:4', figmaProperty: 'fontName', value: 'Inter', translation: 'approximate', cssProperty: 'font-family', figmaValue: { source: 'PLUGIN', field: 'fontName', value: unrelated.value } }];
  assert.ok(!verifyEvidence(m, c).errors.some(e => e.includes('cannot be replaced')), 'an unrelated property is not covered by a binding');
});

test('a node that forces a variable mode requires a matching modeOverride; inherited modes need review', async () => {
  const c = structuredClone(await fixture());
  const width = m => m.bindings.find(b => b.figmaProperty === 'width');
  c.nodes.find(n => n.id === '1:2').properties.explicitVariableModes = { COL: 'dark' };
  const m = metadata(c);
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('modeOverride is required')));
  width(m).modeOverride = { collectionId: 'COL', modeName: 'Dark' };
  assert.deepEqual(verifyEvidence(m, c).errors, []);
  width(m).modeOverride = { collectionId: 'COL', modeName: 'Light' };
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('explicit mode differs')));
  const inherited = structuredClone(await fixture());
  inherited.nodes.find(n => n.id === '1:1').properties.explicitVariableModes = { COL: 'dark' };
  const result = verifyEvidence(metadata(inherited), inherited);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(w => w.includes('inherited from an ancestor')));
});

test('variant axes, values and classifications must come from the captured variants', async () => {
  const c = await fixture();
  const cases = [
    ['invented axis', m => { m.variants.Invented = ['A']; }],
    ['invented value', m => { m.variants.State = ['Hover', 'Disabled', 'Pressed']; }],
    ['missing value', m => { m.variants.State = ['Hover']; }],
    ['missing variants record', m => { delete m.variants; }],
    ['classified invented axis', m => {
      m.variantClassification.Invented = { A: { kind: 'prop', codeProp: 'invented' } };
      m.evidence.decisions.push({ target: 'variantClassification.Invented.A', rule: 'manual', reason: 'Invented axis', observations: ['1:1#componentPropertyDefinitions#property'] });
    }],
    ['classified invented value', m => {
      m.variantClassification.State.Pressed = { kind: 'interaction', state: 'pressed' };
      m.evidence.decisions.push({ target: 'variantClassification.State.Pressed', rule: 'manual', reason: 'Invented value', observations: ['1:1#componentPropertyDefinitions#property'] });
    }],
    ['unclassified captured value', m => { delete m.variantClassification.State.Disabled; m.evidence.decisions.pop(); }],
  ];
  for (const [name, mutate] of cases) { const m = metadata(c); mutate(m); assert.ok(verifyEvidence(m, c).errors.length, name); }
  assert.deepEqual(verifyEvidence(metadata(c), c).errors, []);
});

test('modes inherited from outside the captured subtree are surfaced through resolvedVariableModes', async () => {
  const c = structuredClone(await fixture());
  assert.deepEqual(verifyEvidence(metadata(c), c).warnings.filter(w => w.includes('inherited')), []);
  c.nodes.find(n => n.id === '1:2').properties.resolvedVariableModes = { COL: 'dark' };
  assert.ok(!c.nodes.some(n => n.properties.explicitVariableModes && Object.keys(n.properties.explicitVariableModes).length));
  const result = verifyEvidence(metadata(c), c);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(w => w.includes('outside the captured subtree')));
  const index = metadata(c).bindings.findIndex(b => b.figmaProperty === 'width');
  assert.deepEqual(result.review.inheritedModes, [{ index, observation: '1:2#width#binding', node: 'FILE:1:2', nodeName: 'State=Hover',
    variableId: 'size', variableName: 'Size', collectionId: 'COL', collectionName: 'Example collection',
    resolvedMode: { id: 'dark', name: 'Dark' }, defaultMode: { id: 'light', name: 'Light' }, forcedBy: null }]);
  const warning = result.warnings.find(w => w.includes('outside the captured subtree'));
  for (const value of ['FILE:1:2', 'Size', 'size', 'COL', 'Example collection', 'Dark', 'dark', 'Light', 'light', 'NOT VERIFIED']) assert.ok(warning.includes(value), value);
});

test('inherited mode details retain the captured ancestor and do not invent an unavailable resolved mode', async () => {
  const c = structuredClone(await fixture());
  c.nodes.find(n => n.id === '1:1').properties.explicitVariableModes = { COL: 'dark' };
  delete c.nodes.find(n => n.id === '1:2').properties.resolvedVariableModes;
  const result = verifyEvidence(metadata(c), c);
  const detail = result.review.inheritedModes.find(d => d.variableId === 'size');
  assert.equal(detail.resolvedMode, null);
  assert.deepEqual(detail.forcedBy, { node: 'FILE:1:1', name: 'Example', mode: { id: 'dark', name: 'Dark' } });
  assert.deepEqual(detail.defaultMode, { id: 'light', name: 'Light' });
  assert.equal(result.warnings.filter(w => w.includes('need mode review')).length, 1);
  assert.ok(result.warnings.some(w => w.includes('resolved unavailable')));
  assert.deepEqual(result.errors, []);
});

test('a delegated instance whose main component is a mapped VARIANT resolves its mapped identity', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mapped-variant-'));
  try {
    mkdirSync(path.join(root, 'src/components/Nested'), { recursive: true });
    writeFileSync(path.join(root, 'src/components/Nested/Nested.tsx'), 'export const Nested = () => null;\n');
    const entries = [['FILE:20:1', { name: 'Nested', code: { path: 'src/components/Nested/Nested.tsx' },
      figma: { refs: ['FILE:20:1'], variants: { 'Size=Small': { refs: ['FILE:9:9', 'componentKey:nested-key'] } } } }],
      ['FILE:30:1', { name: 'Missing', code: { path: 'src/components/Missing/Missing.tsx' }, figma: { refs: ['FILE:30:1'] } }],
      ['FILE:40:1', { name: 'Escaping', code: { path: '../outside.tsx' }, figma: { refs: ['FILE:40:1'] } }]];
    const mapped = mappedComponentsOf(root, entries);
    assert.deepEqual(mapped.map(c => c.name), ['Nested']);
    assert.deepEqual(mapped[0].refs, ['FILE:20:1', 'FILE:9:9', 'componentKey:nested-key']);
    const figma = mockFigma(), instance = figma.nodes.get('1:5');
    instance.componentProperties = {};
    const c = await captureFigma(figma, { fileKey: 'FILE', nodeId: '1:1' }), m = metadata(c);
    m.evidence.dispositions = [{ kind: 'delegated', instance: 'FILE:1:5', resolvedComponent: 'Nested', configuration: {}, reason: 'Mapped variant reused' }];
    assert.deepEqual(verifyEvidence(m, c, { mappedComponents: mapped }).errors, []);
    assert.ok(verifyEvidence(m, c, { mappedComponents: [{ name: 'Nested', refs: ['FILE:20:1'] }] }).errors.some(e => e.includes('delegation identity')), 'set-level refs alone do not identify a variant instance');
    assert.deepEqual(entryRefs('componentKey:x', {}), ['componentKey:x']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('malformed code-map entries produce controlled errors instead of aborting the evidence check', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'malformed-map-'));
  try {
    mkdirSync(path.join(root, 'design-system/relationships'), { recursive: true });
    const mapFile = path.join(root, 'design-system/relationships/figma-code-map.json');
    const write = map => writeFileSync(mapFile, typeof map === 'string' ? map : JSON.stringify(map));
    write({ _schema: {}, 'FILE:1:2': null, 'FILE:1:3': 5, 'FILE:1:4': [], 'FILE:1:5': { name: 12, figma: { refs: 'FILE:1:5', variants: 'x' }, designSystem: {} } });
    let result;
    assert.doesNotThrow(() => { result = verifyFigmaEvidence(root); });
    for (const key of ['FILE:1:2', 'FILE:1:3', 'FILE:1:4']) assert.ok(result.errors.some(e => e.startsWith(`${key}: map entry must be an object`)), key);
    assert.ok(result.errors.some(e => e.startsWith('FILE:1:5: Invalid metadata path')), 'a non-string name falls back to the key');
    for (const map of ['null', '[]', '5']) { write(map); assert.ok(verifyFigmaEvidence(root).errors.length, map); }
    assert.deepEqual(entryRefs('K', { figma: { refs: 'abc', variants: 'xyz' } }), ['K']);
    assert.deepEqual(entryRefs('K', { figma: { variants: { A: null, B: { refs: [1, 'r'] } } } }), ['K', 'r']);
    assert.deepEqual(mappedComponentsOf(root, [['a', null], ['b', 'x']]), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
