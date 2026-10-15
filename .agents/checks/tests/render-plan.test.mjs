import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { componentCapture, fixtureRenderPlan } from './fixtures/component-capture.mjs';
import { projectFile, renderRequirements, sha256, verifyRenderPlan } from '../lib/render-plan.mjs';
import { renderedExpectation } from '../lib/render-values.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'render-plan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const seeds = componentCapture().nodes;
  seeds[1].children = ['1:4'];
  seeds.push({ id: '1:4', parentId: '1:3', type: 'TEXT', name: 'Initial', children: [], properties: {
    characters: 'F', textAutoResize: 'WIDTH_AND_HEIGHT', width: 12, height: 24, fontName: { family: 'Inter', style: 'Regular' },
    fontSize: 20, lineHeight: { unit: 'PERCENT', value: 120 }, letterSpacing: { unit: 'PIXELS', value: 0 }, segments: [],
  } });
  const capture = componentCapture({ seeds });
  const requirements = renderRequirements(capture), verification = fixtureRenderPlan(capture);
  writeFileSync(path.join(root, 'font.woff2'), 'test font bytes, not a real font');
  verification.fonts = requirements.fonts.map(r => ({ id: r.id, css: { family: 'Inter', weight: '400', style: 'normal' }, source: { kind: 'file', path: 'font.woff2', sha256: sha256(readFileSync(path.join(root, 'font.woff2'))) } }));
  const source = verification.cases[0];
  source.props = { initial: 'F' }; source.content = { 'FILE:1:4': 'F' };
  verification.cases.push({ ...structuredClone(source), id: 'wide', kind: 'behavior', baseline: source.id, props: { initial: 'W' }, content: { 'FILE:1:4': 'W' },
    expectations: requirements.dimensions.map(d => ({ kind: 'intrinsic-size', observation: d.observation, part: 'initial', axis: d.field })) });
  const metadata = { verification, parts: { initial: { selector: '.initial', nodes: { 'Size=Small': 'FILE:1:4' } } }, bindings: [],
    measuredLiterals: requirements.typography.map(r => ({ observation: r.observation })), evidence: { translations: [] } };
  return { root, metadata, capture };
}

test('render plan covers fonts, exact source text, typography and alternate-content dimensions without a browser PASS', t => {
  const f = fixture(t), result = verifyRenderPlan(f.root, f.metadata, f.capture);
  assert.deepEqual(result.errors, []); assert.deepEqual(result.warnings, []);
  assert.equal(result.requirements.typography.length, 3);
});

test('omitting line-height is an essential coverage error', t => {
  const f = fixture(t); f.metadata.measuredLiterals = f.metadata.measuredLiterals.filter(l => !l.observation.includes('#lineHeight#'));
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.some(e => e.includes('lineHeight')));
});

test('font files must retain their hash and unsupported sources do not silently pass', t => {
  const f = fixture(t); writeFileSync(path.join(f.root, 'font.woff2'), 'changed');
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.some(e => e.includes('SHA-256')));
  f.metadata.verification.fonts[0].source = { kind: 'unresolved', reason: 'No authorized font source yet.' };
  assert.equal(verifyRenderPlan(f.root, f.metadata, f.capture).errors.length, 0);
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).warnings.some(w => w.includes('NOT VERIFIED')));
  f.metadata.verification.fonts[0].source = { kind: 'package', name: 'invented-inter' };
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.length);
});

test('case content and source variant coverage cannot be silently omitted', t => {
  const f = fixture(t); f.metadata.verification.cases[0].content['FILE:1:4'] = 'W';
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.some(e => e.includes('fidelity content')));
  f.metadata.verification.cases = [];
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.some(e => e.includes('Missing fidelity')));
});

test('behavior cases must vary content with the same source configuration and explicitly cover each intrinsic dimension', t => {
  const f = fixture(t), behavior = f.metadata.verification.cases[1];
  behavior.content['FILE:1:4'] = 'F';
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.some(e => e.includes('vary the content')));
  behavior.content['FILE:1:4'] = 'W'; behavior.viewport.width++;
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.some(e => e.includes('same ref and environment')));
  behavior.viewport.width--; behavior.expectations.pop();
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.some(e => e.includes('Missing alternate-content')));
});

test('intrinsic-size expectations cannot substitute the container for the mapped TEXT part', t => {
  const f = fixture(t); f.metadata.parts.root = { nodes: { 'Size=Small': 'FILE:1:3' } };
  f.metadata.verification.cases[1].expectations[0].part = 'root';
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.some(e => e.includes('mapped text part')));
});

test('all captured collections need independently specified active modes', t => {
  const f = fixture(t); f.capture.collections.push({ id: 'COL', defaultModeId: 'light', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }] });
  assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.some(e => e.includes('active captured mode')));
  for (const c of f.metadata.verification.cases) c.modes.COL = 'dark';
  assert.deepEqual(verifyRenderPlan(f.root, f.metadata, f.capture).errors, []);
});

test('image resources include hidden paints and require observed hash, paint index and durable file', t => {
  const f = fixture(t), nodes = componentCapture().nodes;
  nodes[1].properties = { fills: [{ type: 'IMAGE', imageHash: 'img-1', visible: false }, { type: 'IMAGE', imageHash: 'img-2' }] };
  const capture = componentCapture({ seeds: nodes });
  const metadata = { verification: fixtureRenderPlan(capture), parts: {} };
  assert.equal(renderRequirements(capture).assets.length, 2);
  assert.equal(verifyRenderPlan(f.root, metadata, capture).errors.length, 2);
  metadata.verification.assets = renderRequirements(capture).assets.map(r => ({ ...r, source: { kind: 'file', path: 'font.woff2', sha256: sha256(readFileSync(path.join(f.root, 'font.woff2'))) } }));
  assert.deepEqual(verifyRenderPlan(f.root, metadata, capture).errors, []);
  metadata.verification.assets[0].imageHash = 'different';
  assert.ok(verifyRenderPlan(f.root, metadata, capture).errors.length);
});

test('path containment rejects traversal, absolute paths and escaping symlinks', t => {
  const f = fixture(t), outside = mkdtempSync(path.join(os.tmpdir(), 'render-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(path.join(outside, 'font'), 'outside'); symlinkSync(path.join(outside, 'font'), path.join(f.root, 'escape'));
  for (const p of ['../font', '/tmp/font', 'escape', '.', 'font\\file']) assert.throws(() => projectFile(f.root, p));
  mkdirSync(path.join(f.root, 'directory')); assert.throws(() => projectFile(f.root, 'directory'));
});

test('malformed plans and cases yield controlled errors', t => {
  const f = fixture(t);
  for (const v of [undefined, null, [], { schemaVersion: 2 }]) assert.ok(verifyRenderPlan(f.root, { verification: v }, f.capture).errors.length);
  for (const v of [null, 1, [], {}, { id: 'broken', expectations: null }, { id: 'broken', kind: 'behavior', figmaRef: 5, expectations: [] }]) {
    f.metadata.verification.cases = [v]; assert.doesNotThrow(() => verifyRenderPlan(f.root, f.metadata, f.capture));
    assert.ok(verifyRenderPlan(f.root, f.metadata, f.capture).errors.length);
  }
});

test('shared conversions use independent raw values and keep AUTO or unknown contexts unresolved', () => {
  assert.equal(renderedExpectation('lineHeight', { unit: 'PERCENT', value: 120 }, { fontSize: 20 }).css, '24px');
  assert.equal(renderedExpectation('segments[0].lineHeight', { unit: 'PIXELS', value: 24 }).css, '24px');
  assert.equal(renderedExpectation('letterSpacing', { unit: 'PERCENT', value: 5 }, { fontSize: 20 }).css, '1px');
  assert.equal(renderedExpectation('color', { r: 1, g: 0, b: 0, a: 0.5 }).css, 'rgba(255, 0, 0, 0.5)');
  for (const raw of [{ unit: 'AUTO' }, { unit: 'PERCENT', value: 120 }, { unit: 'PIXELS', value: '24' }]) assert.equal(renderedExpectation('lineHeight', raw).comparable, false);
  assert.equal(renderedExpectation('color', { r: 2, g: 0, b: 0 }).comparable, false);
});

test('unestablished correspondence does not force invented fidelity or behavior configurations', t => {
  const f = fixture(t); f.metadata.verification.cases = [];
  f.metadata.verification.unestablished = [{ figmaRef: 'FILE:1:3', reason: 'No exact code correspondence established yet.' }];
  const result = verifyRenderPlan(f.root, f.metadata, f.capture);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(w => w.includes('behavior NOT VERIFIED')));
});

test('a missing image hash cannot be turned into a fabricated durable asset mapping', t => {
  const f = fixture(t), nodes = componentCapture().nodes;
  nodes[1].properties.fills = [{ type: 'IMAGE', imageHash: null }];
  const capture = componentCapture({ seeds: nodes }), verification = fixtureRenderPlan(capture);
  verification.assets = [{ ...renderRequirements(capture).assets[0], source: { kind: 'file', path: 'font.woff2', sha256: sha256(readFileSync(path.join(f.root, 'font.woff2'))) } }];
  assert.ok(verifyRenderPlan(f.root, { verification }, capture).errors.some(e => e.includes('missing captured image hash')));
});
