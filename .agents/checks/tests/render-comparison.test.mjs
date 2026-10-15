import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentCapture } from './fixtures/component-capture.mjs';
import { compareRendered, assertConfirmationChecks, caseFonts } from '../lib/render-comparison.mjs';
import { captureFigma } from '../../skills/create-ds-from-figma/scripts/lib/capture-figma.mjs';
import { captureProblems } from '../lib/figma-evidence.mjs';
import { AABB_SIZE_DIAGNOSTIC_THRESHOLD, renderDiagnostics } from '../lib/render-diagnostics.mjs';

function fixture() {
  const node = (id, parentId, type, box, children = []) => ({ id, parentId, type, name: id, children, properties: {
    visible: true, opacity: 1, absoluteBoundingBox: box, absoluteTransform: [[1, 0, box.x], [0, 1, box.y]],
    width: box.width, height: box.height, ...(type === 'TEXT' ? { characters: 'W', segments: [] } : {}),
  } });
  const capture = componentCapture({ seeds: [node('1:2', null, 'COMPONENT', { x: 100, y: 200, width: 80, height: 58 }, ['1:3']),
    node('1:3', '1:2', 'TEXT', { x: 110, y: 208, width: 20, height: 22 })] });
  const metadata = { parts: { root: { nodes: { default: 'FILE:1:2' } }, label: { nodes: { default: 'FILE:1:3' } } }, verification: { geometryPolicy: 'mapped-layout-v1', fonts: [] } };
  const configuration = { id: 'exact', figmaRef: 'FILE:1:2', kind: 'fidelity', modes: {} };
  const measurement = { fonts: [], parts: Object.fromEntries(['root', 'label'].map((part, i) => [part, { count: 1, elements: [{
    text: i ? 'W' : 'W', rect: { ...capture.nodes[i].properties.absoluteBoundingBox, x: i ? 20 : 10, y: i ? 18 : 10 },
    geometry: { visible: true, laidOut: true, axisAligned: true, affine2d: true }, computed: {},
  }] }])) };
  return { capture, metadata, configuration, measurement };
}
const compare = f => compareRendered(f.capture, f.metadata, f.configuration, f.measurement);

test('generic geometry uses root-relative layout bounds, not canvas or viewport offsets', () => {
  const f = fixture();
  assert.deepEqual(compare(f).summary, { PASS: 2, FAIL: 0, 'NOT COMPARABLE': 0, 'NOT RUN': 0 });
  f.measurement.parts.label.elements[0].rect.y = -10;
  assert.equal(compare(f).checks.find(c => c.id === 'geometry:label').status, 'FAIL'); // Wrong anchored edge.
  f.measurement.parts.label.elements[0].rect.y = 18;
  f.measurement.parts.label.elements[0].rect.x = 40;
  assert.equal(compare(f).summary.FAIL, 1); // Variant alignment changed.
});

test('INSIDE borders must preserve source outer bounds; border-box alone is not assumed to fix auto sizing', () => {
  const f = fixture(), root = f.capture.nodes[0].properties;
  root.strokes = [{ type: 'SOLID', visible: true }]; root.strokeAlign = 'INSIDE';
  f.measurement.parts.root.elements[0].rect.height += 2;
  assert.equal(compare(f).checks[0].status, 'FAIL');
  root.strokeAlign = 'OUTSIDE';
  assert.equal(compare(f).checks[0].status, 'NOT COMPARABLE');
});

test('fidelity catches frozen text widths; behavior never copies exact source dimensions', () => {
  const f = fixture(); f.measurement.parts.label.elements[0].rect.width = 12;
  assert.equal(compare(f).summary.FAIL, 1);
  f.configuration.kind = 'behavior';
  assert.equal(compare(f).checks[0].status, 'NOT COMPARABLE');
  assert.match(compare(f).checks[0].reason, /No explicit behavior invariant/);
});

test('a rotated vector has an independent center-position check that no shape review can override', () => {
  const f = fixture();
  f.capture.nodes[1].type = 'VECTOR';
  f.capture.nodes[1].properties.absoluteTransform = [[0.707, -0.707, 110], [0.707, 0.707, 208]];
  f.measurement.parts.label.elements[0].geometry.axisAligned = false;
  let result = compare(f);
  assert.equal(result.checks.find(c => c.id === 'geometry:label').status, 'NOT COMPARABLE');
  assert.equal(result.checks.find(c => c.id === 'position:label').status, 'PASS');
  const reviews = [{ checkId: 'geometry:label', result: 'PASS', reason: 'Synthetic shape review.', artifacts: ['figma.png'] }];
  assert.doesNotThrow(() => assertConfirmationChecks(result, reviews, ['figma.png']));
  f.measurement.parts.label.elements[0].rect.y -= 30;
  result = compare(f);
  assert.equal(result.checks.find(c => c.id === 'position:label').status, 'FAIL');
  assert.throws(() => assertConfirmationChecks(result, reviews, ['figma.png']), /position:label FAIL/);
  f.measurement.parts.label.elements[0].geometry.affine2d = false;
  assert.equal(compare(f).checks.find(c => c.id === 'position:label').status, 'NOT COMPARABLE');
  f.measurement.parts.label.elements[0].geometry.affine2d = true;
  f.capture.nodes[1].properties.strokes = { unavailable: true };
  assert.equal(compare(f).checks.find(c => c.id === 'position:label').status, 'NOT COMPARABLE');
});

test('noncomparable vector size deltas are explicit diagnostics, never an invented objective size failure', () => {
  const f = fixture(); f.capture.nodes[1].type = 'VECTOR';
  const actual = f.measurement.parts.label.elements[0].rect;
  actual.x -= 3; actual.width += 6;
  const checks = compare(f), diagnostics = renderDiagnostics(checks);
  assert.equal(checks.checks.find(c => c.id === 'position:label').status, 'PASS', 'center is unchanged');
  assert.equal(checks.checks.find(c => c.id === 'geometry:label').status, 'NOT COMPARABLE');
  assert.equal(diagnostics.length, 1); assert.equal(diagnostics[0].delta.width, 6);
  assert.equal(diagnostics[0].kind, 'noncomparable-size-difference');
  assert.equal(diagnostics[0].diagnosticThreshold, AABB_SIZE_DIAGNOSTIC_THRESHOLD);
  checks.checks.find(c => c.id === 'position:label').tolerance = 100;
  assert.equal(renderDiagnostics(checks).length, 1, 'position tolerance does not control size-difference diagnostics');
  assert.equal(checks.summary.FAIL, 0);
});

test('hidden ancestors allow absent or hidden DOM, not visible descendants', () => {
  const f = fixture(); f.capture.nodes[0].properties.visible = false;
  assert.equal(compare(f).summary.FAIL, 2);
  f.measurement.parts.root.elements[0].geometry.visible = false;
  f.measurement.parts.label = { count: 0, elements: [] };
  assert.equal(compare(f).summary.PASS, 2);
});

test('rotated vectors, rotated ancestors, reflections, skew and singular transforms are not silently comparable', () => {
  for (const transform of [[[0, -1, 0], [1, 0, 0]], [[-1, 0, 0], [0, 1, 0]], [[1, 0.5, 0], [0, 1, 0]], [[0, 0, 0], [0, 0, 0]]]) {
    const f = fixture(); f.capture.nodes[0].properties.absoluteTransform = transform;
    assert.equal(compare(f).summary['NOT COMPARABLE'], 2);
  }
  const f = fixture(); f.capture.nodes[1].type = 'VECTOR';
  assert.equal(compare(f).checks[1].status, 'NOT COMPARABLE');
  f.capture.nodes[1].type = 'GROUP';
  assert.equal(compare(f).checks[1].status, 'NOT COMPARABLE');
});

test('source and DOM ambiguity, missing bounds and missing measurements have distinct results', () => {
  const f = fixture(); delete f.capture.nodes[1].properties.absoluteBoundingBox;
  assert.equal(compare(f).checks[1].status, 'NOT COMPARABLE');
  f.measurement = undefined;
  assert.equal(compare(f).summary['NOT RUN'], 2);
  f.metadata.parts.label.nodes = {};
  assert.equal(compare(f).checks.find(c => c.id === 'geometry:label').status, 'NOT COMPARABLE');
  assert.ok(compare(f).checks.some(c => c.id.startsWith('coverage:') && c.status === 'FAIL'));
});

test('essential fonts are scoped to visible nonempty source text and need a loaded matching face', () => {
  const f = fixture(); f.capture.nodes[1].properties.fontName = { family: 'Example', style: 'Regular' };
  // Rebuild observations through the real extraction helper used by the collector.
  f.capture = componentCapture({ seeds: f.capture.nodes });
  let r = compare(f), fontId = r.checks.find(c => c.id.startsWith('font:')).id.slice(5);
  assert.equal(r.checks.at(-1).status, 'FAIL');
  f.metadata.verification.fonts = [{ id: fontId, source: { kind: 'file' }, css: { family: 'Example', weight: '400', style: 'normal' } }];
  f.measurement.fonts = [{ id: fontId, checkResult: true, faces: [] }];
  assert.equal(compare(f).checks.at(-1).status, 'FAIL');
  f.measurement.fonts[0].faces = [{ family: 'Example', weight: '400', style: 'normal', status: 'loaded' }];
  assert.equal(compare(f).checks.at(-1).status, 'PASS');
  f.measurement.fonts[0].faces[0].family = '"example"';
  f.measurement.fonts[0].faces[0].weight = 'normal';
  assert.equal(compare(f).checks.at(-1).status, 'PASS');
  f.measurement.fonts[0].faces[0].weight = '100 900';
  assert.equal(compare(f).checks.at(-1).status, 'PASS');
  f.measurement.fonts[0].faces[0].weight = '700';
  assert.equal(compare(f).checks.at(-1).status, 'FAIL');
  f.capture.nodes[1].properties.visible = false;
  assert.ok(!compare(f).checks.some(c => c.id.startsWith('font:')));
});

test('specific visual reviews can cover only noncomparable checks, never FAIL or NOT RUN', () => {
  const f = fixture(); f.capture.nodes[1].type = 'VECTOR'; const result = compare(f);
  assert.throws(() => assertConfirmationChecks(result, [], ['figma.png']), /Specific rendered review/);
  const reviews = [{ checkId: 'geometry:label', result: 'PASS', reason: 'Compared the exact shape and configuration.', artifacts: ['figma.png'] }];
  assert.doesNotThrow(() => assertConfirmationChecks(result, reviews, ['figma.png']));
  f.measurement.parts.root.elements[0].rect.height += 5;
  assert.throws(() => assertConfirmationChecks(compare(f), reviews, ['figma.png']), /Confirmation blocked/);
  reviews[0].artifacts = ['irrelevant.txt'];
  assert.throws(() => assertConfirmationChecks(result, reviews, ['figma.png']), /retained artifact/);
});

test('a provisional text tolerance cannot confirm typography by numerical agreement alone', () => {
  const f = fixture(), result = compare(f);
  const text = result.checks.find(c => c.id === 'geometry:label');
  assert.equal(text.status, 'PASS');
  assert.equal(text.typographyTolerance.status, 'provisional');
  assert.throws(() => assertConfirmationChecks(result, [], ['figma.png']), /Specific typography review required/);
  const review = [{ checkId: 'geometry:label', result: 'PASS', reason: 'Rendered exact typography compared independently; threshold is not assumed calibrated.', artifacts: ['figma.png'] }];
  assert.doesNotThrow(() => assertConfirmationChecks(result, review, ['figma.png']));
  f.measurement.parts.label.elements[0].rect.width += 2;
  assert.throws(() => assertConfirmationChecks(compare(f), [], ['figma.png']), /Confirmation blocked/);
});

test('behavior cases need the font of every text node they can render, including empty or hidden source text', () => {
  const node = (id, parentId, type, box, extra = {}, children = []) => ({ id, parentId, type, name: id, children, properties: {
    visible: true, opacity: 1, absoluteBoundingBox: box, absoluteTransform: [[1, 0, box.x], [0, 1, box.y]], width: box.width, height: box.height, ...extra } });
  const font = { family: 'Inter', style: 'Regular' };
  const build = (characters, visible) => componentCapture({ seeds: [node('1:2', null, 'COMPONENT', { x: 0, y: 0, width: 80, height: 40 }, {}, ['1:3']),
    node('1:3', '1:2', 'TEXT', { x: 0, y: 0, width: 20, height: 20 }, { characters, segments: [], fontName: font, visible })] });
  for (const [label, capture] of [['empty captured text', build('', true)], ['hidden captured text', build('W', false)]]) {
    const fidelity = { id: 'exact', figmaRef: 'FILE:1:2', kind: 'fidelity', modes: {} };
    const behavior = { id: 'alt', figmaRef: 'FILE:1:2', kind: 'behavior', baseline: 'exact', modes: {}, content: { 'FILE:1:3': 'Hello' } };
    assert.equal(caseFonts(capture, fidelity).length, 0, `${label}: nothing is rendered by an exact fidelity case`);
    assert.equal(caseFonts(capture, behavior).length, 1, `${label}: a behavior case can render it`);
    const id = caseFonts(capture, behavior)[0].id;
    const metadata = { parts: { root: { nodes: { default: 'FILE:1:2' } } }, verification: { geometryPolicy: 'mapped-layout-v1',
      fonts: [{ id, css: { family: 'Inter', weight: '400', style: 'normal' }, source: { kind: 'unresolved', reason: 'Inter is not installed.' } }] } };
    const measurement = { fonts: [], parts: { root: { count: 1, elements: [{ text: '', rect: { x: 0, y: 0, width: 80, height: 40 }, geometry: { visible: true, laidOut: true, axisAligned: true, affine2d: true }, computed: {} }] } } };
    const result = compareRendered(capture, metadata, behavior, measurement);
    assert.equal(result.checks.find(c => c.id === `font:${id}`)?.status, 'FAIL', `${label}: an unresolved essential font blocks the behavior case`);
    assert.ok(!compareRendered(capture, metadata, fidelity, measurement).checks.some(c => c.id.startsWith('font:')));
  }
});

test('a descendant that forces its own mode does not make the rest of the component incomparable', () => {
  const f = fixture();
  f.capture.collections = [{ id: 'COL', name: 'Theme', defaultModeId: 'light', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }], variableIds: [] }];
  f.capture.nodes[0].properties.resolvedVariableModes = { COL: 'light' };
  f.capture.nodes[1].properties.explicitVariableModes = { COL: 'dark' };
  f.capture.nodes[1].properties.resolvedVariableModes = { COL: 'dark' };
  f.configuration.modes = { COL: 'light' };
  assert.deepEqual(compare(f).summary, { PASS: 2, FAIL: 0, 'NOT COMPARABLE': 0, 'NOT RUN': 0 }, 'local override is measured as rendered');
  f.measurement.parts.label.elements[0].rect.x = 40;
  assert.equal(compare(f).checks.find(c => c.id === 'geometry:label').status, 'FAIL', 'a wrong box under a local override is still detected');
  f.measurement.parts.label.elements[0].rect.x = 20;
  f.configuration.modes = { COL: 'dark' };
  assert.equal(compare(f).checks.find(c => c.id === 'geometry:root').status, 'NOT COMPARABLE', 'a case that examines another global mode stays incomparable');
});

test('behavior fonts follow what the design lets a case render: properties and supplied content, not every hidden layer', () => {
  const node = (id, parentId, type, box, extra = {}, children = []) => ({ id, parentId, type, name: id, children, properties: {
    visible: true, opacity: 1, absoluteBoundingBox: box, absoluteTransform: [[1, 0, box.x], [0, 1, box.y]], width: box.width, height: box.height, ...extra } });
  const font = { family: 'Inter', style: 'Regular' }, box = { x: 0, y: 0, width: 20, height: 20 };
  const behavior = { id: 'alt', figmaRef: 'FILE:1:2', kind: 'behavior', baseline: 'exact', modes: {} };
  const required = (leaf, { content, wrapper } = {}) => {
    const seeds = wrapper
      ? [node('1:2', null, 'COMPONENT', { x: 0, y: 0, width: 80, height: 40 }, {}, ['1:4']), node('1:4', '1:2', 'FRAME', box, wrapper, ['1:3']), node('1:3', '1:4', 'TEXT', box, { fontName: font, segments: [], characters: 'W', componentPropertyReferences: null, ...leaf })]
      : [node('1:2', null, 'COMPONENT', { x: 0, y: 0, width: 80, height: 40 }, {}, ['1:3']), node('1:3', '1:2', 'TEXT', box, { fontName: font, segments: [], characters: 'W', componentPropertyReferences: null, ...leaf })];
    return caseFonts(componentCapture({ seeds }), { ...behavior, ...(content ? { content } : {}) }).length;
  };
  assert.equal(required({}), 1, 'visible text');
  assert.equal(required({ visible: false }), 0, 'a layer hidden with no property can never be shown');
  assert.equal(required({ visible: false, componentPropertyReferences: { visible: 'Show#1:1' } }), 1, 'a boolean property can reveal it');
  assert.equal(required({ characters: '' }), 0, 'empty text with no text property stays empty');
  assert.equal(required({ characters: '', componentPropertyReferences: { characters: 'Label#1:2' } }), 1, 'a text property can fill it');
  assert.equal(required({ characters: '' }, { content: { 'FILE:1:3': 'Hello' } }), 1, 'content supplied by the case renders it');
  assert.equal(required({ visible: false }, { content: { 'FILE:1:3': 'W' } }), 0, 'content inherited from the baseline cannot reveal a permanently hidden layer');
  assert.equal(required({ visible: false, componentPropertyReferences: { visible: 'Show#1:1' } }, { content: { 'FILE:1:3': 'W' } }), 1, 'the same content with a visibility property does reach it');
  assert.equal(required({ opacity: 0 }, { content: { 'FILE:1:3': 'W' } }), 0, 'zero opacity cannot be revealed by content');
  assert.equal(required({ visible: false, componentPropertyReferences: { characters: 'Label#1:2' } }), 0, 'a text property does not reveal a hidden layer');
  assert.equal(required({ visible: false, componentPropertyReferences: { __proto__: null } }), 0, 'an object without the visibility key reveals nothing');
  assert.equal(required({ visible: false, componentPropertyReferences: { unavailable: true } }), 1, 'unreadable references fail closed');
  assert.equal(required({}, { wrapper: { visible: false, componentPropertyReferences: null } }), 0, 'a permanently hidden ancestor hides its text');
  assert.equal(required({}, { wrapper: { visible: false, componentPropertyReferences: { visible: 'Show#1:1' } } }), 1, 'a controllable hidden ancestor can be revealed');
  assert.equal(required({}, { wrapper: { opacity: 0, componentPropertyReferences: { visible: 'Show#1:1' } } }), 0, 'zero opacity cannot be revealed by a visibility property');
});

test('local mode overrides are recorded beside the compared geometry without changing its status', () => {
  const f = fixture();
  f.capture.collections = [{ id: 'COL', name: 'Theme', defaultModeId: 'light', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }], variableIds: [] }];
  f.capture.nodes[0].properties.resolvedVariableModes = { COL: 'light' };
  f.configuration.modes = { COL: 'light' };
  assert.equal(compare(f).checks.find(c => c.id === 'geometry:label').localModes, undefined, 'no override, nothing to record');
  f.capture.nodes[1].properties.explicitVariableModes = { COL: 'dark' };
  f.capture.nodes[1].properties.resolvedVariableModes = { COL: 'dark' };
  const label = compare(f).checks.find(c => c.id === 'geometry:label');
  assert.equal(label.status, 'PASS');
  assert.deepEqual(label.localModes, [{ node: 'FILE:1:3', collection: 'COL', mode: 'dark' }]);
  assert.equal(compare(f).checks.find(c => c.id === 'geometry:root').localModes, undefined, 'the root keeps the global mode');
  f.capture.nodes[1].properties.explicitVariableModes = { COL: 'light' };
  assert.equal(compare(f).checks.find(c => c.id === 'geometry:label').localModes, undefined, 'an override equal to the global mode is not local');
});

test('unreadable strokes are unknown, never absent: geometry needs the stroke precondition established', () => {
  const root = f => f.capture.nodes[0].properties;
  const status = f => compare(f).checks.find(c => c.id === 'geometry:root');
  const absent = fixture();
  assert.equal(status(absent).status, 'PASS', 'a node without strokes compares');
  const none = fixture(); root(none).strokes = [];
  assert.equal(status(none).status, 'PASS', 'an empty list is a readable absence');
  for (const strokes of [{ unavailable: true }, { mixed: true }, 'broken', 7]) {
    const f = fixture(); root(f).strokes = strokes;
    const check = status(f);
    assert.equal(check.status, 'NOT COMPARABLE', JSON.stringify(strokes));
    assert.match(check.reason, /unreadable/);
  }
  const hidden = fixture(); root(hidden).strokes = [{ type: 'SOLID', visible: false }];
  assert.equal(status(hidden).status, 'PASS', 'a hidden stroke does not take space');
  const inside = fixture(); root(inside).strokes = [{ type: 'SOLID', visible: true }]; root(inside).strokeAlign = 'INSIDE';
  assert.equal(status(inside).status, 'PASS', 'a known INSIDE stroke keeps the outer bounds');
  const mixedAlign = fixture(); root(mixedAlign).strokes = [{ type: 'SOLID', visible: true }]; root(mixedAlign).strokeAlign = { mixed: true };
  assert.equal(status(mixedAlign).status, 'NOT COMPARABLE', 'an unreadable alignment is not INSIDE');
  // The partial position check applies the same rule.
  const vector = fixture(); vector.capture.nodes[1].type = 'VECTOR'; vector.capture.nodes[1].properties.strokes = { unavailable: true };
  vector.capture.nodes[1].properties.absoluteTransform = [[0.7071, -0.7071, 10], [0.7071, 0.7071, 8]];
  vector.measurement.parts.label.elements[0].geometry.axisAligned = false;
  assert.equal(compare(vector).checks.find(c => c.id === 'position:label')?.status, 'NOT COMPARABLE');
});

test('a failed read is unknown, not absent: only a field the node does not expose means "none"', async () => {
  const f = fixture(), root = f.capture.nodes[0];
  root.inspected = ['strokes'];                      // inspected, yet the property is missing: the collector recorded a failed read
  assert.equal(compare(f).checks.find(c => c.id === 'geometry:root').status, 'NOT COMPARABLE');
  root.inspected = []; root.notApplicable = ['strokes']; // not exposed by this node type: a genuine absence
  assert.equal(compare(f).checks.find(c => c.id === 'geometry:root').status, 'PASS');
  const text = fixture(); delete text.capture.nodes[1].properties.characters;
  assert.equal(compare(text).checks.find(c => c.id === 'geometry:label').status, 'NOT COMPARABLE', 'unreadable captured text is not a text difference');

  // The same through the real collector: a throwing getter yields a snapshot that passes structural validation.
  const box = { x: 0, y: 0, width: 80, height: 40 };
  const mock = { id: '1:2', type: 'COMPONENT', name: 'Root', key: 'k', children: [], absoluteBoundingBox: box, absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    width: 80, height: 40, visible: true, opacity: 1, componentPropertyDefinitions: {}, get strokes() { throw new Error('Figma could not read strokes'); } };
  const figma = { fileKey: 'FILE', skipInvisibleInstanceChildren: true, getNodeByIdAsync: async () => mock, variables: { getLocalVariableCollectionsAsync: async () => [] } };
  const capture = await captureFigma(figma, { fileKey: 'FILE', nodeId: '1:2' });
  assert.deepEqual(captureProblems(capture), [], 'the failed read is reported as an issue, not as a malformed capture');
  assert.ok(capture.coverage.issues.some(i => i.field === 'strokes'));
  const metadata = { parts: { root: { nodes: { default: 'FILE:1:2' } } }, verification: { geometryPolicy: 'mapped-layout-v1', fonts: [] } };
  const measurement = { fonts: [], parts: { root: { count: 1, elements: [{ text: '', rect: box, geometry: { visible: true, laidOut: true, axisAligned: true, affine2d: true }, computed: {} }] } } };
  const result = compareRendered(capture, metadata, { id: 'c', figmaRef: 'FILE:1:2', kind: 'fidelity', modes: {} }, measurement);
  assert.equal(result.checks.find(c => c.id === 'geometry:root').status, 'NOT COMPARABLE');
});

test('an unreadable resolved mode is never replaced by the default; a known explicit mode is still used', () => {
  const setup = (resolved, explicit, modes) => {
    const f = fixture();
    f.capture.collections = [{ id: 'COL', name: 'Theme', defaultModeId: 'light', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }], variableIds: [] }];
    const root = f.capture.nodes[0];
    if (resolved !== undefined) root.properties.resolvedVariableModes = resolved;
    if (explicit) root.properties.explicitVariableModes = explicit;
    f.configuration.modes = modes;
    return f;
  };
  const root = f => compare(f).checks.find(c => c.id === 'geometry:root');
  for (const resolved of [{ unavailable: true }, { mixed: true }, 'broken', null]) {
    assert.equal(root(setup(resolved, { COL: 'dark' }, { COL: 'light' })).status, 'NOT COMPARABLE', `Light is not presumed: ${JSON.stringify(resolved)}`);
    assert.equal(root(setup(resolved, { COL: 'dark' }, { COL: 'dark' })).status, 'PASS', `the known explicit mode is used: ${JSON.stringify(resolved)}`);
    for (const mode of ['light', 'dark']) {
      const unknown = root(setup(resolved, undefined, { COL: mode }));
      assert.equal(unknown.status, 'NOT COMPARABLE', 'with no explicit mode the context is unknown, whichever mode the case declares');
      assert.match(unknown.reason, /unreadable/);
    }
  }
  // A failed read (property omitted but inspected) behaves the same; a field the capture never inspected is a readable absence.
  const failed = setup(undefined, undefined, { COL: 'light' }); failed.capture.nodes[0].inspected = ['resolvedVariableModes'];
  assert.equal(root(failed).status, 'NOT COMPARABLE');
  assert.equal(root(setup(undefined, undefined, { COL: 'light' })).status, 'PASS', 'readable absence means the default mode');
  assert.equal(root(setup({}, undefined, { COL: 'light' })).status, 'PASS', 'a readable object without the collection means the default mode');
  assert.equal(root(setup({}, undefined, { COL: 'dark' })).status, 'NOT COMPARABLE');
  // With an unknown global mode the case is incomparable before any local mode is recorded. The guard inside localModes only
  // protects against a future reordering of the checks, and is not reachable through compareRendered today.
  const local = setup({ unavailable: true }, undefined, { COL: 'light' });
  local.capture.nodes[1].properties.explicitVariableModes = { COL: 'dark' };
  assert.equal(compare(local).checks.some(c => c.localModes), false);
});
