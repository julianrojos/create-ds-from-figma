import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { componentCapture } from './fixtures/component-capture.mjs';
import { sealCapture, verifyEvidence } from '../lib/figma-evidence.mjs';
import { textDimensionRequirements, verifyTextDimensions } from '../lib/figma-dimensions.mjs';

function fixture(text = {}) {
  const properties = { width: 12, height: 24, textAutoResize: 'WIDTH_AND_HEIGHT', characters: 'F', segments: [], ...text };
  for (const field of Object.keys(properties)) if (properties[field] === undefined) delete properties[field];
  return componentCapture({ seeds: [
    { id: '1:2', parentId: null, type: 'COMPONENT', name: 'Example', children: ['1:3'], properties: {} },
    { id: '1:3', parentId: '1:2', type: 'TEXT', name: 'Initial', children: [],
      properties },
  ] });
}

function metadata(capture) {
  const m = { figma: { fileKey: 'FILE', nodeId: '1:2' }, figmaCoverage: { variants: [] }, variants: {}, variantClassification: {},
    parts: { root: { nodes: { default: 'FILE:1:2' } }, initial: { nodes: { default: 'FILE:1:3' } } },
    bindings: [], measuredLiterals: [], styles: [], notBuilt: [], unresolved: [],
    evidence: { decisions: [], dispositions: [], translations: [], textDimensions: [] } };
  for (const requirement of textDimensionRequirements(capture)) {
    const { observation, behavior, rule, observations } = requirement;
    const record = { observation, behavior, rule, observations };
    if (behavior === 'fixed') {
      Object.assign(record, { treatment: 'declaration', cssSelector: '.initial', cssProperty: requirement.field });
      const value = capture.observations.find(o => o.id === observation).value;
      m.measuredLiterals.push({ observation, source: requirement.node, figmaProperty: requirement.field,
        cssSelector: record.cssSelector, cssProperty: record.cssProperty, value: `${value}px`, translation: 'direct' });
    } else if (behavior === 'content') {
      Object.assign(record, { treatment: 'translation', cssSelector: '.initial', cssProperty: requirement.field });
      m.evidence.translations.push({ observations: [observation, ...observations], cssSelector: record.cssSelector,
        cssProperty: record.cssProperty, reason: 'Intrinsic text sizing preserves content-dependent geometry; requires rendered behavior checks.' });
    } else {
      record.treatment = 'unresolved';
      m.unresolved.push({ field: `textDimensions.${observation}`, reason: requirement.reason, source: requirement.node, blocking: false });
    }
    m.evidence.textDimensions.push(record);
  }
  return m;
}

test('WIDTH_AND_HEIGHT derives both dimensions from content without interpreting the example letter as a fixed size', () => {
  for (const characters of ['F', 'W', 'M', '']) {
    const c = fixture({ characters }), m = metadata(c);
    assert.deepEqual(textDimensionRequirements(c).map(r => [r.field, r.behavior]), [['height', 'content'], ['width', 'content']]);
    assert.deepEqual(verifyEvidence(m, c).errors, []);
    assert.equal(verifyEvidence(m, c).coverage.textDimensions, 2);
    assert.ok(verifyEvidence(m, c).warnings.some(w => w.includes('CSS behavior and rendering NOT VERIFIED')));
  }
});

test('HEIGHT permits a fixed width but requires content-dependent height; NONE and TRUNCATE fix both dimensions', () => {
  for (const auto of ['HEIGHT', 'NONE', 'TRUNCATE']) {
    const c = fixture({ textAutoResize: auto });
    assert.deepEqual(textDimensionRequirements(c).map(r => r.behavior), auto === 'HEIGHT' ? ['content', 'fixed'] : ['fixed', 'fixed']);
    assert.deepEqual(verifyEvidence(metadata(c), c).errors, []);
  }
});

test('matching a snapshot dimension is not permission to freeze intrinsic text, even with an approximate literal', () => {
  for (const field of ['width', 'height']) for (const translation of ['direct', 'approximate']) {
    const c = fixture(), m = metadata(c), observation = c.observations.find(o => o.node === '1:3' && o.field === field);
    m.measuredLiterals.push({ observation: observation.id, source: 'FILE:1:3', figmaProperty: field,
      value: `${observation.value}px`, cssSelector: '.initial', cssProperty: field, translation,
      ...(translation === 'approximate' ? { figmaValue: { source: 'PLUGIN', field, value: observation.value } } : {}) });
    assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('content-dependent text dimension cannot be recorded')));
  }
});

test('essential text dimensions cannot disappear from metadata or be bypassed with an empty coverage array', () => {
  const c = fixture(), m = metadata(c);
  m.evidence.textDimensions = [];
  assert.equal(verifyTextDimensions(m, c).errors.filter(e => e.includes('Missing text dimension coverage')).length, 2);
  delete m.evidence.textDimensions;
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('evidence.textDimensions must be an array')));
});

test('coverage validates unique facts, dimensional semantics, rules and supporting observations', () => {
  for (const mutate of [
    m => m.evidence.textDimensions.push(m.evidence.textDimensions[0]),
    m => m.evidence.textDimensions[0].observation = '1:3#characters#property',
    m => m.evidence.textDimensions[0].behavior = 'fixed',
    m => m.evidence.textDimensions[0].rule = 'manual',
    m => m.evidence.textDimensions[0].observations = [],
    m => m.evidence.textDimensions[0].observations.push(m.evidence.textDimensions[0].observations[0]),
    m => m.evidence.textDimensions[0].observations = ['1:3#characters#property'],
    m => m.evidence.textDimensions[0].cssProperty = 'color',
    m => m.evidence.textDimensions[0].cssSelector = '',
  ]) {
    const c = fixture(), m = metadata(c); mutate(m);
    assert.ok(verifyTextDimensions(m, c).errors.length);
  }
});

test('a dimension declaration must identify a matching existing implementation record', () => {
  const c = fixture({ textAutoResize: 'NONE' }), m = metadata(c);
  m.measuredLiterals.pop();
  assert.ok(verifyTextDimensions(m, c).errors.some(e => e.includes('matching binding or measured literal')));
  const content = fixture(), intrinsic = metadata(content);
  intrinsic.evidence.textDimensions[0].treatment = 'declaration';
  assert.ok(verifyTextDimensions(intrinsic, content).errors.some(e => e.includes('declaration requires fixed behavior')));
});

test('intrinsic translation needs the dimension and sizing evidence, not only an explanation', () => {
  for (const mutate of [
    m => m.evidence.translations = [],
    m => m.evidence.translations[0].observations = ['1:3#height#property'],
    m => m.evidence.translations[0].reason = '',
    m => m.evidence.translations[0].cssProperty = 'color',
  ]) {
    const c = fixture(), m = metadata(c); mutate(m);
    assert.ok(verifyTextDimensions(m, c).errors.some(e => e.includes('translation must reference')));
  }
});

test('missing or unsupported sizing evidence stays unknown; declarations cannot silently assume fixed sizing', () => {
  for (const text of [{ textAutoResize: undefined }, { textAutoResize: 'FUTURE' }, { layoutSizingHorizontal: 'FILL' },
    { layoutSizingVertical: { mixed: true } }, { layoutSizingHorizontal: 'FUTURE' }, { width: { mixed: true } }]) {
    const c = fixture(text), m = metadata(c), requirement = textDimensionRequirements(c).find(r => r.behavior === 'unknown');
    assert.ok(requirement);
    assert.deepEqual(verifyTextDimensions(m, c).errors, []);
    const record = m.evidence.textDimensions.find(r => r.observation === requirement.observation);
    Object.assign(record, { treatment: 'translation', cssSelector: '.initial', cssProperty: requirement.field });
    assert.ok(verifyTextDimensions(m, c).errors.some(e => e.includes('unknown behavior cannot')));
  }
});

test('unknown behavior requires an explicit unresolved entry and cannot excuse supported intrinsic sizing', () => {
  const c = fixture({ textAutoResize: 'FUTURE' }), m = metadata(c);
  m.unresolved = [];
  assert.ok(verifyTextDimensions(m, c).errors.some(e => e.includes('explicit nonblocking unresolved entry')));
  const known = fixture(), n = metadata(known);
  n.evidence.textDimensions[0].treatment = 'unresolved';
  assert.ok(verifyTextDimensions(n, known).errors.length);
});

test('a bound intrinsic dimension is not silently treated as either a fixed value or content sizing', () => {
  const c = fixture({ boundVariables: { width: { type: 'VARIABLE_ALIAS', id: 'width-variable' } } });
  const requirements = textDimensionRequirements(c);
  assert.equal(requirements.find(r => r.field === 'height').behavior, 'content');
  const width = requirements.find(r => r.field === 'width');
  assert.equal(width.behavior, 'unknown');
  assert.ok(width.observations.includes('1:3#width#binding'));
  assert.deepEqual(verifyTextDimensions(metadata(c), c).errors, []);
});

test('logical dimensional declarations preserve the required axis and null records produce diagnostics', () => {
  const c = fixture({ textAutoResize: 'NONE' }), m = metadata(c);
  for (const record of m.evidence.textDimensions) {
    const property = record.cssProperty === 'width' ? 'inline-size' : 'block-size';
    const literal = m.measuredLiterals.find(l => l.observation === record.observation);
    record.cssProperty = literal.cssProperty = property;
  }
  assert.deepEqual(verifyTextDimensions(m, c).errors, []);
  m.evidence.textDimensions.push(null);
  assert.ok(verifyTextDimensions(m, c).errors.some(e => e.includes('invalid dimension record')));
});

test('hidden text and controlled visibility do not authorize excluding intrinsic dimensions', () => {
  const c = fixture({ visible: false, componentPropertyReferences: { visible: 'Visible#1:0' } }), m = metadata(c);
  assert.equal(textDimensionRequirements(c).length, 2);
  m.evidence.textDimensions[0].treatment = 'excluded';
  assert.ok(verifyTextDimensions(m, c).errors.some(e => e.includes('hidden text is not automatically excluded')));
});

test('mapped delegation covers descendant dimensions only after identity and configuration validation', () => {
  const c = componentCapture({ seeds: [
    { id: '1:2', parentId: null, type: 'COMPONENT', name: 'Parent', children: ['1:4'], properties: {} },
    { id: '1:4', parentId: '1:2', type: 'INSTANCE', name: 'Child', children: ['1:3'], properties: { mainComponent: { id: '9:9', key: 'child', remote: false }, componentProperties: {} } },
    { id: '1:3', parentId: '1:4', type: 'TEXT', name: 'Label', children: [], properties: { width: 12, height: 24, textAutoResize: 'WIDTH_AND_HEIGHT', segments: [] } },
  ] }), m = metadata(c);
  const delegation = { kind: 'delegated', instance: 'FILE:1:4', resolvedComponent: 'Child', configuration: {}, reason: 'Reuse mapped Child; content behavior needs rendered review.' };
  m.evidence.dispositions.push(delegation);
  for (const record of m.evidence.textDimensions) Object.assign(record, { treatment: 'delegation', instance: delegation.instance });
  m.evidence.translations = [];
  const options = { mappedComponents: [{ name: 'Child', refs: ['FILE:9:9'] }] };
  assert.deepEqual(verifyEvidence(m, c, options).errors, []);
  assert.ok(verifyEvidence(m, c).errors.some(e => e.includes('validated mapped delegation')));
  delegation.configuration = { changed: true };
  assert.ok(verifyEvidence(m, c, options).errors.some(e => e.includes('validated mapped delegation')));
});

test('dimensions CLI deterministically reports snapshot semantics and refuses tampered captures', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'text-dimensions-'));
  try {
    const file = path.join(root, 'snapshot.json'), c = fixture(), snapshot = sealCapture(c);
    writeFileSync(file, JSON.stringify(snapshot));
    const script = path.resolve('.agents/skills/create-ds-from-figma/scripts/figma-capture.mjs');
    const invoke = () => spawnSync(process.execPath, [script, 'dimensions', file], { encoding: 'utf8' });
    const first = invoke(), second = invoke();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(JSON.parse(first.stdout), textDimensionRequirements(c));
    assert.equal(readFileSync(file, 'utf8'), JSON.stringify(snapshot));
    snapshot.capture.nodes[1].properties.width = 99;
    writeFileSync(file, JSON.stringify(snapshot));
    assert.notEqual(invoke().status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
