import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentCapture } from './fixtures/component-capture.mjs';
import { compareRendered } from '../lib/render-comparison.mjs';

function fixture() {
  const capture = componentCapture({ seeds: [
    { id: '1:2', parentId: null, type: 'COMPONENT', name: 'Example', children: ['1:3'], properties: { visible: true } },
    { id: '1:3', parentId: '1:2', type: 'TEXT', name: 'Label', children: [], properties: { visible: true, characters: 'W', segments: [] } },
  ] });
  const base = { id: 'source', kind: 'fidelity', figmaRef: 'FILE:1:2', props: { text: 'W' }, content: { 'FILE:1:3': 'W' },
    modes: {}, viewport: { width: 640, height: 480 }, environment: { attributes: {}, classes: [] }, states: [], expectations: [] };
  const current = { ...structuredClone(base), id: 'long-content', kind: 'behavior', baseline: base.id, props: { text: 'MMMM' }, content: { 'FILE:1:3': 'MMMM' }, expectations: [
    { kind: 'contained', part: 'label', container: 'root', inset: 8, reason: 'The consumer requires this minimum inset.' },
    { kind: 'anchored', part: 'label', container: 'root', edge: 'right', reason: 'Preserve the established right-edge distance.' },
    { kind: 'intrinsic-size', part: 'label', observation: '1:3#width#property', axis: 'width', relation: 'grow', reason: 'This declared test string must occupy more width.' },
  ] };
  const metadata = { parts: { root: { nodes: { default: 'FILE:1:2' } }, label: { nodes: { default: 'FILE:1:3' } } },
    verification: { geometryPolicy: 'mapped-layout-v1', fonts: [], cases: [base, current] } };
  const part = (box, text) => ({ count: 1, elements: [{ rect: box, text, computed: {}, geometry: { visible: true, laidOut: true, axisAligned: true, affine2d: true } }] });
  const baselineMeasurement = { configuration: structuredClone(base), snapshotHash: 'same', fonts: [], parts: {
    root: part({ x: 10, y: 10, width: 80, height: 58 }, 'W'), label: part({ x: 20, y: 18, width: 20, height: 22 }, 'W'),
  } };
  const measurement = { configuration: structuredClone(current), snapshotHash: 'same', fonts: [], parts: {
    root: part({ x: 10, y: 10, width: 100, height: 58 }, 'MMMM'), label: part({ x: 20, y: 18, width: 40, height: 22 }, 'MMMM'),
  } };
  const compare = () => compareRendered(capture, metadata, current, measurement, { baselineMeasurement });
  return { capture, metadata, current, measurement, baselineMeasurement, compare };
}

test('explicit containment, anchoring and intrinsic growth use measured relations, not source example boxes', () => {
  const f = fixture(); assert.equal(f.compare().summary.PASS, 3);
  assert.ok(f.compare().checks.every(c => c.id.startsWith('behavior:')));
  f.measurement.parts.label.elements[0].rect.x -= 20;
  assert.equal(f.compare().summary.FAIL, 2);
});

test('unchanged height is valid for changed content when that equality is explicitly required', () => {
  const f = fixture(); f.current.expectations[2].axis = 'height'; f.current.expectations[2].relation = 'equal';
  assert.equal(f.compare().summary.PASS, 3);
  f.current.expectations[2].relation = 'grow';
  assert.equal(f.compare().checks.at(-1).status, 'FAIL');
  delete f.current.expectations[2].relation;
  assert.equal(f.compare().checks.at(-1).status, 'NOT COMPARABLE');
});

test('centering distinguishes zero offset from preserving an existing signed offset on either axis', () => {
  for (const axis of ['x', 'y']) {
    const f = fixture();
    f.current.expectations = [{ kind: 'centered', part: 'label', container: 'root', axis, relation: 'center', reason: 'This consumer requires matching centers.' }];
    const box = f.measurement.parts.label.elements[0].rect, root = f.measurement.parts.root.elements[0].rect;
    const size = axis === 'x' ? 'width' : 'height';
    box[axis] = root[axis] + (root[size] - box[size]) / 2;
    assert.equal(f.compare().checks[0].status, 'PASS');
    f.measurement.parts.label.elements[0].geometry.axisAligned = false;
    assert.equal(f.compare().checks[0].status, 'PASS', 'a rotated 2D part retains an auditable AABB center');
    f.measurement.parts.label.elements[0].geometry.affine2d = false;
    assert.equal(f.compare().checks[0].status, 'NOT COMPARABLE');
    f.measurement.parts.label.elements[0].geometry.affine2d = true;
    root[size] += 20; box[axis] += 10;
    assert.equal(f.compare().checks[0].status, 'PASS');
    box[axis] -= 10;
    assert.equal(f.compare().checks[0].status, 'FAIL');
    f.current.expectations[0].relation = 'preserve-offset';
    f.baselineMeasurement.parts.label.elements[0].geometry.axisAligned = false;
    const prior = f.baselineMeasurement.parts.label.elements[0].rect, previousRoot = f.baselineMeasurement.parts.root.elements[0].rect;
    const offset = prior[axis] + prior[size] / 2 - previousRoot[axis] - previousRoot[size] / 2;
    box[axis] = root[axis] + (root[size] - box[size]) / 2 + offset;
    assert.equal(f.compare().checks[0].status, 'PASS');
    f.current.expectations[0].relation = 'center';
    assert.equal(f.compare().checks[0].status, 'FAIL', 'preserving a nonzero offset is not centering');
    delete f.current.expectations[0].relation;
    assert.equal(f.compare().checks[0].status, 'NOT COMPARABLE');
  }
});

test('baseline-dependent invariants report NOT RUN without the baseline and reject another context', () => {
  const f = fixture();
  const missing = compareRendered(f.capture, f.metadata, f.current, f.measurement);
  assert.equal(missing.summary.PASS, 1); assert.equal(missing.summary['NOT RUN'], 2);
  f.baselineMeasurement.snapshotHash = 'other';
  assert.equal(f.compare().summary['NOT COMPARABLE'], 2);
  f.baselineMeasurement.snapshotHash = 'same';
  f.baselineMeasurement.configuration.viewport.width++;
  assert.equal(f.compare().summary['NOT COMPARABLE'], 2);
});

test('unchanged props cannot pass when the browser still renders the baseline content', () => {
  const f = fixture(); f.measurement.parts.label.elements[0].text = 'W';
  assert.equal(f.compare().summary.FAIL, 3);
});

test('missing measurements and transformed or hidden invariant parts are never silently passing', () => {
  const f = fixture();
  assert.equal(compareRendered(f.capture, f.metadata, f.current).summary['NOT RUN'], 3);
  f.measurement.parts.label.elements[0].geometry.axisAligned = false;
  assert.equal(f.compare().summary['NOT COMPARABLE'], 3);
  f.measurement.parts.label.elements[0].geometry.visible = false;
  assert.equal(f.compare().summary.FAIL, 3);
});

test('hidden fidelity text needs a separately visible behavior reference, never its hidden box', () => {
  const f = fixture(), fidelity = f.metadata.verification.cases[0];
  const visible = { ...structuredClone(fidelity), id: 'revealed', kind: 'behavior', baseline: fidelity.id,
    props: { text: 'W', show: true }, expectations: [{ kind: 'contained', part: 'label', container: 'root', inset: 0, reason: 'Visible helper stays inside the component.' }] };
  f.metadata.verification.cases.push(visible);
  f.baselineMeasurement.parts.label.elements[0].geometry.visible = false;
  f.current.expectations = [f.current.expectations[2]];
  assert.equal(f.compare().checks[0].status, 'NOT COMPARABLE');
  const reference = structuredClone(f.baselineMeasurement);
  reference.configuration = structuredClone(visible);
  reference.parts.label.elements[0].geometry.visible = true;
  f.current.measurementBaseline = visible.id;
  const compare = () => compareRendered(f.capture, f.metadata, f.current, f.measurement, { baselineMeasurement: reference });
  assert.equal(compare().checks[0].status, 'PASS');
  reference.parts.label.elements[0].rect.width = 40;
  assert.equal(compare().checks[0].status, 'FAIL');
  reference.parts.label.elements[0].rect.width = 20;
  reference.parts.label.elements[0].geometry.visible = false;
  assert.equal(compare().checks[0].status, 'NOT COMPARABLE');
  reference.parts.label.elements[0].geometry.visible = true;
  reference.configuration.content['FILE:1:3'] = 'another';
  assert.equal(compare().checks[0].status, 'NOT COMPARABLE');
});

test('measurement references cannot be chained, self-referential or borrowed from another fidelity or context', () => {
  for (const mutate of [
    (r, c) => c.measurementBaseline = c.id,
    r => r.measurementBaseline = 'source',
    r => r.baseline = 'another-source',
    r => r.viewport.width++,
    r => r.kind = 'fidelity',
  ]) {
    const f = fixture(), reference = { ...structuredClone(f.current), id: 'revealed' };
    f.metadata.verification.cases.push(reference); f.current.measurementBaseline = reference.id;
    mutate(reference, f.current);
    assert.ok(f.compare().checks.every(c => c.status === 'NOT COMPARABLE'));
  }
});
