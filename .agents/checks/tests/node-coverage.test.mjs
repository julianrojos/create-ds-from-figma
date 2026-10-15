import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentCapture, fixtureRenderPlan } from './fixtures/component-capture.mjs';
import { nodeCoverage } from '../lib/node-coverage.mjs';

function fixture() {
  const box = { x: 0, y: 0, width: 48, height: 48 }, transform = [[1, 0, 0], [0, 1, 0]];
  const capture = componentCapture({ seeds: [
    { id: '1:2', parentId: null, type: 'COMPONENT', name: 'Example', children: ['1:3'], properties: { absoluteBoundingBox: box, absoluteTransform: transform } },
    { id: '1:3', parentId: '1:2', type: 'FRAME', name: 'Container', children: ['1:4'], properties: { absoluteBoundingBox: box, absoluteTransform: transform } },
    { id: '1:4', parentId: '1:3', type: 'TEXT', name: 'Label', children: [], properties: { characters: 'Hello' } },
  ] });
  const metadata = { parts: { root: { nodes: { default: 'FILE:1:2' } }, label: { nodes: { default: 'FILE:1:4' } } }, verification: fixtureRenderPlan(capture) };
  const check = () => nodeCoverage(metadata, capture, metadata.verification.cases[0]);
  return { capture, metadata, check };
}

test('unmapped visual nodes and structural containers are obligations, not silently excluded', () => {
  const f = fixture();
  assert.match(f.check().errors[0], /1:3/);
  f.metadata.parts.container = { nodes: { default: 'FILE:1:3' } };
  assert.deepEqual(f.check().errors, []);
  delete f.metadata.parts.label;
  assert.match(f.check().errors[0], /1:4/);
});

test('same-layout-box requires coincident mapped bounds and a container without independent visual effects', () => {
  const f = fixture();
  f.metadata.verification.nodeCoverage = [{ node: 'FILE:1:3', rule: 'same-layout-box', part: 'root', reason: 'Same captured box in this exact configuration.' }];
  assert.deepEqual(f.check().errors, []);
  for (const [key, value] of [['clipsContent', true], ['opacity', 0.5], ['effects', [{ type: 'DROP_SHADOW' }]], ['componentPropertyReferences', { visible: 'Toggle' }]]) {
    const old = f.capture.nodes[1].properties[key]; f.capture.nodes[1].properties[key] = value;
    assert.ok(f.check().errors.length, key); if (old === undefined) delete f.capture.nodes[1].properties[key]; else f.capture.nodes[1].properties[key] = old;
  }
  f.capture.nodes[1].properties.absoluteBoundingBox = { x: 1, y: 0, width: 48, height: 48 };
  assert.ok(f.check().errors.length);
});

test('an unresolved node stays pending; permanently hidden exclusions cannot hide optional content', () => {
  const f = fixture();
  f.metadata.verification.nodeCoverage = [{ node: 'FILE:1:3', rule: 'unresolved', reason: 'Mapping needs a decision.' }];
  assert.equal(f.check().pending.length, 1); assert.deepEqual(f.check().errors, []);
  f.metadata.verification.nodeCoverage[0].rule = 'permanently-hidden';
  Object.assign(f.capture.nodes[1].properties, { visible: false, componentPropertyReferences: {} });
  assert.deepEqual(f.check().errors, []);
  f.capture.nodes[1].properties.componentPropertyReferences.visible = 'Optional';
  assert.ok(f.check().errors.length);
  f.capture.nodes[1].properties.componentPropertyReferences = { unavailable: true };
  assert.ok(f.check().errors.length, 'unreadable property references do not prove permanent hiding');
  f.capture.nodes[1].properties.componentPropertyReferences = {};
  f.capture.nodes[1].properties.boundVariables = { opacity: { type: 'VARIABLE_ALIAS', id: 'optional' } };
  assert.ok(f.check().errors.length, 'another variable mode could reveal the node');
});

test('delegation covers internals, never the mapped instance placement itself', () => {
  const f = fixture(); f.capture.nodes[1].type = 'INSTANCE';
  delete f.metadata.parts.label;
  const options = { delegations: [{ instance: 'FILE:1:3' }] };
  assert.match(nodeCoverage(f.metadata, f.capture, f.metadata.verification.cases[0], options).errors[0], /1:3/);
  f.metadata.parts.instance = { nodes: { default: 'FILE:1:3' } };
  assert.deepEqual(nodeCoverage(f.metadata, f.capture, f.metadata.verification.cases[0], options).errors, []);
});
