import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentCapture } from './fixtures/component-capture.mjs';
import { renderRequirements } from '../lib/render-plan.mjs';
import { essentialAssetGaps, essentialFontGaps } from '../lib/resource-gaps.mjs';

test('font source requests group requirements and affected cases without choosing a package', () => {
  const capture = componentCapture({ seeds: [
    { id: '1:2', parentId: null, type: 'COMPONENT', name: 'Root', children: ['1:3'], properties: {} },
    { id: '1:3', parentId: '1:2', type: 'TEXT', name: 'Text', children: [], properties: { characters: 'Title', fontName: { family: 'Example', style: 'Regular' } } },
  ] });
  const font = renderRequirements(capture).fonts[0];
  const metadata = { verification: { fonts: [{ id: font.id, css: { family: 'Example', weight: '400', style: 'normal' }, source: { kind: 'unresolved', reason: 'No licensed file supplied' } }],
    cases: [{ id: 'exact', kind: 'fidelity', figmaRef: 'FILE:1:2' }, { id: 'changed', kind: 'behavior', figmaRef: 'FILE:1:2', content: { 'FILE:1:3': 'W' } }] } };
  const gaps = essentialFontGaps(capture, metadata);
  assert.equal(gaps.length, 1); assert.deepEqual(gaps[0].cases, ['exact', 'changed']);
  assert.equal(gaps[0].font.family, 'Example'); assert.equal(gaps[0].css.weight, '400');
  assert.match(gaps[0].action, /Ask the user/);
  metadata.verification.fonts[0].source = { kind: 'file' };
  assert.deepEqual(essentialFontGaps(capture, metadata), []);
  metadata.verification.fonts[0].source = { kind: 'unresolved' };
  capture.nodes[1].properties.visible = false;
  capture.nodes[1].properties.componentPropertyReferences = {};
  assert.deepEqual(essentialFontGaps(capture, metadata), [], 'permanently hidden text does not require a rendered font');
});

test('image source requests cover only fills a case can render and never choose an image', () => {
  const seeds = (properties = {}, parent = {}) => [
    { id: '1:2', parentId: null, type: 'COMPONENT', name: 'Root', children: ['1:3'], properties: parent },
    { id: '1:3', parentId: '1:2', type: 'FRAME', name: 'Picture', children: [], properties: { fills: [{ type: 'IMAGE', imageHash: 'image-1' }], ...properties } },
  ];
  const plan = (capture, source) => ({ verification: { assets: renderRequirements(capture).assets.map(r => ({ ...r, source })),
    cases: [{ id: 'exact', kind: 'fidelity', figmaRef: 'FILE:1:2' }, { id: 'changed', kind: 'behavior', figmaRef: 'FILE:1:2' }] } });
  const unresolved = { kind: 'unresolved', reason: 'No licensed image supplied' };
  const capture = componentCapture({ seeds: seeds() }), metadata = plan(capture, unresolved);
  const gaps = essentialAssetGaps(capture, metadata);
  assert.equal(gaps.length, 1); assert.deepEqual(gaps[0].cases, ['exact', 'changed']);
  assert.equal(gaps[0].imageHash, 'image-1'); assert.equal(gaps[0].reason, 'No licensed image supplied'); assert.match(gaps[0].action, /Ask the user/);
  metadata.verification.assets = [];
  assert.equal(essentialAssetGaps(capture, metadata)[0].reason, 'No authorized image source recorded', 'an unaccounted image is still a gap');
  assert.deepEqual(essentialAssetGaps(capture, plan(capture, { kind: 'file', path: 'x.png', sha256: 'a'.repeat(64) })), []);
  const hidden = (properties, parent) => { const c = componentCapture({ seeds: seeds(properties, parent) }); return essentialAssetGaps(c, plan(c, unresolved)); };
  assert.deepEqual(hidden({ fills: [{ type: 'IMAGE', imageHash: 'image-1', visible: false }] }), [], 'a hidden paint is not rendered');
  assert.deepEqual(hidden({ fills: [{ type: 'IMAGE', imageHash: 'image-1', opacity: 0 }] }), [], 'a transparent paint is not rendered');
  assert.deepEqual(hidden({ opacity: 0 }), []);
  const permanent = hidden({ visible: false, componentPropertyReferences: {} });
  assert.deepEqual(permanent, [], 'permanently hidden content is never rendered');
  const controlled = hidden({ visible: false, componentPropertyReferences: { visible: 'Show#1:0' } });
  assert.deepEqual(controlled.map(g => g.cases), [['changed']], 'only a behavior case can reveal a layer through its visible property');
  const ancestor = hidden({}, { visible: false, componentPropertyReferences: {} });
  assert.deepEqual(ancestor, [], 'a hidden ancestor hides the image');
  const outside = componentCapture({ seeds: seeds() });
  assert.deepEqual(essentialAssetGaps(outside, { verification: { assets: [], cases: [{ id: 'elsewhere', kind: 'fidelity', figmaRef: 'FILE:9:9' }] } }), [], 'nodes outside every case are not required');
});
