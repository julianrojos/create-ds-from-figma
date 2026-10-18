import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { compositionPlan, compareCompositionInk } from '../lib/composition-diagnostics.mjs';
import { compositionFixture } from './fixtures/composition-fixture.mjs';

test('composition uses captured sibling order including reversed auto-layout without dictating DOM order', () => {
  const f = compositionFixture(), plan = () => compositionPlan(f.capture, f.metadata, f.configuration);
  assert.deepEqual(plan().groups[0].parts.map(p => p.part), ['fill', 'stroke']);
  Object.assign(f.capture.nodes[0].properties, { layoutMode: 'VERTICAL', itemReverseZIndex: true });
  assert.deepEqual(plan().groups[0].parts.map(p => p.part), ['stroke', 'fill']);
  delete f.capture.nodes[0].properties.itemReverseZIndex;
  assert.equal(plan().groups.length, 0);
  assert.ok(plan().checks.every(c => c.status === 'NOT COMPARABLE'));
});

test('source ambiguity, text, translucency, effects and behavior cannot authorize a composition comparison', () => {
  for (const mutate of [
    f => { f.configuration.kind = 'behavior'; },
    f => { f.capture.collections = [{ id: 'COL', defaultModeId: 'light' }]; f.configuration.modes = { COL: 'dark' }; },
    f => { f.metadata.parts.stroke.nodes.other = 'FILE:1:4'; delete f.metadata.parts.stroke.nodes.default; },
    f => { f.capture.nodes[2].type = 'TEXT'; },
    f => { f.capture.nodes[2].properties.opacity = 0.5; },
    f => { f.capture.nodes[0].properties.effects = [{ type: 'LAYER_BLUR', visible: true }]; },
    f => { f.capture.nodes[2].properties.fills = [{ type: 'SOLID', opacity: 0.5 }]; },
    f => { f.metadata.parts.duplicate = structuredClone(f.metadata.parts.stroke); },
  ]) {
    const f = compositionFixture(); mutate(f);
    assert.equal(compositionPlan(f.capture, f.metadata, f.configuration).groups.length, 0);
  }
});

const image = rgb => { const png = new PNG({ width: 2, height: 2 }); for (let i = 0; i < 4; i++) { for (let c = 0; c < 3; c++) png.data[4 * i + c] = rgb[c]; png.data[4 * i + 3] = 255; } return PNG.sync.write(png); };
const layer = (part, rgb) => ({ part, first: image(rgb), second: image(rgb) });

test('opaque ink is accounted for without rescuing an upper layer hidden by lower paint', () => {
  const layers = [layer('fill', [255, 255, 255]), layer('stroke', [217, 217, 217])];
  const bad = compareCompositionInk(layers, image([255, 255, 255]));
  assert.equal(bad[1].status, 'FAIL'); assert.equal(bad[1].counts.occludedByLower, 4);
  const good = compareCompositionInk(layers, image([217, 217, 217]));
  assert.equal(good[1].status, 'PASS'); assert.equal(good[1].counts.visible, 4);
  assert.equal(good[0].status, 'PASS'); assert.equal(good[0].counts.legitimatelyCovered, 4);
  for (const check of [...bad, ...good]) {
    const c = check.counts;
    assert.equal(c.opaque, c.visible + c.occludedByLower + c.legitimatelyCovered + c.indeterminate);
    assert.equal(c.opaque + c.nonOpaque, 4);
    assert.equal(Object.hasOwn(c, 'excluded'), false);
  }
});

test('same color, translucent paint, excluded regions and unexplained pixels are indeterminate, not invented failures', () => {
  const layers = [layer('fill', [255, 255, 255]), layer('stroke', [217, 217, 217])];
  const same = compareCompositionInk([layer('a', [255, 255, 255]), layer('b', [255, 255, 255])], image([255, 255, 255]));
  assert.ok(same.every(c => c.status === 'NOT COMPARABLE' && c.counts.indeterminate === 4));
  const transparent = { part: 'stroke', first: image([255, 0, 255]), second: image([0, 255, 0]) };
  const noInk = compareCompositionInk([layers[0], transparent], image([255, 255, 255]));
  assert.equal(noInk[1].status, 'NOT COMPARABLE'); assert.equal(noInk[1].counts.nonOpaque, 4);
  const half = { part: 'stroke', first: image([200, 10, 200]), second: image([10, 200, 10]) };
  assert.equal(compareCompositionInk([layers[0], half], image([255, 255, 255]))[0].counts.indeterminate, 4);
  assert.equal(compareCompositionInk(layers, image([255, 255, 255]), { excluded: [{ x: 0, y: 0, width: 2, height: 2 }] })[1].status, 'NOT COMPARABLE');
  assert.equal(compareCompositionInk(layers, image([10, 20, 30]))[1].counts.indeterminate, 4);
});

test('exact opaque visibility survives lower antialiasing but never overrides expected upper paint or unknown regions', () => {
  const edge = { part: 'edge', first: image([200, 10, 200]), second: image([10, 200, 10]) };
  const stroke = layer('stroke', [217, 217, 217]), composite = image([217, 217, 217]);
  const visible = compareCompositionInk([edge, stroke], composite)[1];
  assert.equal(visible.status, 'PASS'); assert.equal(visible.counts.visible, 4);
  assert.equal(visible.counts.indeterminate, 0); assert.equal(visible.counts.occludedByLower, 0);
  const uncertain = [
    compareCompositionInk([edge, stroke], image([200, 10, 200]))[1],
    compareCompositionInk([stroke, edge], composite)[0],
    compareCompositionInk([edge, stroke, layer('upper', [0, 0, 255])], composite)[1],
    compareCompositionInk([edge, stroke], composite, { excluded: [{ x: 0, y: 0, width: 2, height: 2 }] })[1],
    compareCompositionInk([layer('same', [217, 217, 217]), stroke], composite)[1],
  ];
  for (const check of uncertain) {
    assert.equal(check.status, 'NOT COMPARABLE'); assert.equal(check.counts.visible, 0);
    assert.equal(check.counts.occludedByLower, 0); assert.equal(check.counts.indeterminate, 4);
  }
  for (const { counts: c } of [visible, ...uncertain]) assert.equal(c.opaque, c.visible + c.occludedByLower + c.legitimatelyCovered + c.indeterminate);
});
