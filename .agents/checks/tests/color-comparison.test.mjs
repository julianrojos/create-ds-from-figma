import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareColors, parseComputedColor } from '../lib/color-comparison.mjs';
import { assertConfirmationChecks, checkSummary, COMPARATOR_VERSION } from '../lib/render-comparison.mjs';
import { requirePassed } from '../lib/behavior-evidence.mjs';
import { componentCapture } from './fixtures/component-capture.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { renderedArtifacts, syntheticTypographyReviews } from './fixtures/rendered-artifacts.mjs';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const versioned = checks => ({ policy: 'mapped-layout-v1', comparatorVersion: COMPARATOR_VERSION, checks, summary: checkSummary(checks) });

function fixture() {
  const capture = componentCapture({ rootNodeId: '1:2', seeds: [{ id: '1:2', parentId: null, type: 'COMPONENT', name: 'Color fixture', children: [],
    properties: { visible: true, fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'semantic' } } }] } }],
  collections: ['semantic-col', 'palette'].map(id => ({ id, defaultModeId: 'light', modes: [{ modeId: 'light' }, { modeId: 'dark' }] })),
  variables: [{ id: 'semantic', type: 'COLOR', collectionId: 'semantic-col', valuesByMode: { light: { type: 'VARIABLE_ALIAS', id: 'red' }, dark: { type: 'VARIABLE_ALIAS', id: 'blue' } } },
    { id: 'red', type: 'COLOR', collectionId: 'palette', valuesByMode: { light: { r: 1, g: 0, b: 0 }, dark: { r: 0, g: 1, b: 0 } } },
    { id: 'blue', type: 'COLOR', collectionId: 'palette', valuesByMode: { light: { r: 0, g: 0, b: 1 }, dark: { r: 0, g: 0, b: 0 } } }] });
  const observation = capture.observations.find(o => o.kind === 'binding');
  const metadata = { parts: { root: { nodes: { default: 'FILE:1:2' } } }, bindings: [{ observation: observation.id, variant: 'default', part: 'root', cssProperty: 'background-color', value: 'WRONG', cssVariable: '--untrusted' }] };
  const configuration = { figmaRef: 'FILE:1:2', modes: { 'semantic-col': 'light', palette: 'light' } };
  const measurement = { parts: { root: { count: 1, elements: [{ computed: { 'background-color': 'rgb(255, 0, 0)' } }] } } };
  const scope = { nodes: new Map(capture.nodes.map(n => [n.id, n])), selected: new Set(['1:2']), rootId: '1:2', visible: () => true };
  const checks = () => { const result = []; compareColors(capture, metadata, configuration, measurement, scope, (id, status, reason, detail) => result.push({ id, status, reason, ...detail })); return result; };
  return { capture, metadata, configuration, measurement, scope, checks, node: capture.nodes[0] };
}

test('color comparisons resolve raw alias values in each collection mode, not declared CSS values', () => {
  const f = fixture();
  assert.equal(f.checks()[0].status, 'PASS');
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgb(0, 0, 255)';
  assert.equal(f.checks()[0].status, 'FAIL');
  assert.throws(() => assertConfirmationChecks({ checks: f.checks() }, [], []));
  f.configuration.modes['semantic-col'] = 'dark'; assert.equal(f.checks()[0].status, 'PASS');
  f.configuration.modes.palette = 'dark'; assert.equal(f.checks()[0].status, 'FAIL');
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgb(0, 0, 0)'; assert.equal(f.checks()[0].status, 'PASS');
  delete f.configuration.modes.palette; assert.equal(f.checks()[0].status, 'NOT COMPARABLE');
});

test('color comparison honors explicit source modes and raw color literals without inventing opacity decomposition', () => {
  const f = fixture(); f.node.properties.explicitVariableModes = { palette: 'dark' };
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgb(0, 255, 0)';
  assert.equal(f.checks()[0].status, 'PASS');
  f.node.properties.fills[0].opacity = 0.5;
  for (const color of ['rgb(0, 255, 0)', 'rgba(0, 255, 0, 0.5)']) {
    f.measurement.parts.root.elements[0].computed['background-color'] = color;
    assert.equal(f.checks()[0].status, 'NOT COMPARABLE');
  }
  const record = f.metadata.bindings.pop();
  const observation = f.capture.observations.find(o => o.field === 'fills' && o.kind === 'property');
  f.metadata.measuredLiterals = [{ ...record, observation: observation.id, value: 'invented blue' }];
  for (const color of ['rgb(255, 0, 0)', 'rgba(255, 0, 0, 0.5)']) {
    f.measurement.parts.root.elements[0].computed['background-color'] = color;
    assert.equal(f.checks()[0].status, 'NOT COMPARABLE');
  }
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgb(0, 255, 0)';
  f.node.properties.fills[0].opacity = 1; assert.equal(f.checks()[0].status, 'FAIL');
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgb(255, 0, 0)'; assert.equal(f.checks()[0].status, 'PASS');
});

test('zero or fractional bound paint opacity requires a specific review, never an opaque-color PASS', () => {
  const f = fixture();
  for (const opacity of [0, 0.5]) {
    f.node.properties.fills[0].opacity = opacity;
    for (const color of ['rgb(255, 0, 0)', `rgba(255, 0, 0, ${opacity})`]) {
      f.measurement.parts.root.elements[0].computed['background-color'] = color;
      const checks = f.checks();
      assert.equal(checks[0].status, 'NOT COMPARABLE');
      assert.throws(() => assertConfirmationChecks({ checks }, [], []));
    }
  }
  f.node.properties.fills[0].opacity = 1;
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgb(255, 0, 0)';
  assert.equal(f.checks()[0].status, 'PASS');
});

test('resolved variable alpha reflected in the paint is compared once, including required behavior', () => {
  for (const alpha of [0, 0.08, 0.5]) for (const kind of ['fidelity', 'behavior']) {
    const f = fixture(); f.configuration.kind = kind;
    f.capture.variables[1].valuesByMode.light.a = alpha;
    f.node.properties.fills[0].opacity = alpha;
    const computed = f.measurement.parts.root.elements[0].computed;
    computed.opacity = '1';
    computed['background-color'] = `rgba(255, 0, 0, ${alpha})`;
    let checks = f.checks();
    assert.equal(checks[0].status, 'PASS');
    assert.equal(checks[0].expected[3], alpha);
    assert.equal(checks[0].alphaSource, 'bound-variable-reflected-in-paint');
    assert.doesNotThrow(() => requirePassed(versioned(checks)));
    computed['background-color'] = 'rgb(255, 0, 0)';
    assert.equal(f.checks()[0].status, 'FAIL', 'lost alpha is not an opaque-color PASS');
    if (alpha > 0) {
      computed['background-color'] = `rgba(255, 0, 0, ${alpha * alpha})`;
      checks = f.checks();
      assert.equal(checks[0].status, 'FAIL', 'variable alpha and reflected paint opacity must not multiply');
      assert.throws(() => assertConfirmationChecks(versioned(checks), [], []), /Confirmation blocked: color:root:background-color FAIL/);
      assert.throws(() => requirePassed(versioned(checks)), /Required behavior blocked: color:root:background-color FAIL/);
    }
  }
});

test('reflected alpha requires the original binding, resolved RGB, readable alpha and unit CSS opacity', () => {
  const make = () => {
    const f = fixture(); f.capture.variables[1].valuesByMode.light.a = 0.5;
    f.node.properties.fills[0].opacity = 0.5;
    Object.assign(f.measurement.parts.root.elements[0].computed, { opacity: '1', 'background-color': 'rgba(255, 0, 0, 0.5)' });
    return f;
  };
  for (const change of [
    f => { delete f.node.properties.fills[0].boundVariables; },
    f => { f.node.properties.fills[0].boundVariables.color.id = 'other'; },
    f => { f.node.properties.fills[0].color.g = 1; },
    f => { f.node.properties.fills[0].opacity = 0.4; },
    f => { delete f.capture.variables[1].valuesByMode.light.a; },
    f => { f.configuration.modes.palette = 'dark'; },
  ]) { const f = make(); change(f); assert.equal(f.checks()[0].status, 'NOT COMPARABLE'); }
  for (const opacity of ['0.5', '0', 'invalid']) {
    const f = make(); f.measurement.parts.root.elements[0].computed.opacity = opacity;
    assert.equal(f.checks()[0].status, 'NOT COMPARABLE', 'separate opacity must not silently double alpha');
    assert.throws(() => requirePassed(versioned(f.checks())), /Required behavior blocked:.*NOT COMPARABLE/);
  }
  const f = make(); delete f.measurement.parts.root.elements[0].computed.opacity;
  assert.equal(f.checks()[0].status, 'NOT RUN');
  assert.throws(() => requirePassed(versioned(f.checks())), /Required behavior blocked:.*NOT RUN/);
  f.measurement.parts.root.elements[0].computed.opacity = '';
  assert.equal(f.checks()[0].status, 'NOT RUN');
  f.measurement.parts.root.elements[0].computed.opacity = '1';
  f.node.properties.fills[0].opacity = 0.500000001;
  assert.equal(f.checks()[0].status, 'PASS', 'captured floating-point precision does not add another alpha factor');
  const paint = f.node.properties.fills[0];
  f.node.properties.strokes = [paint];
  f.capture.observations.find(o => o.kind === 'binding').field = 'strokes[0].color';
  f.metadata.bindings[0].cssProperty = 'border-top-color';
  f.measurement.parts.root.elements[0].computed['border-top-color'] = 'rgba(255, 0, 0, 0.5)';
  assert.equal(f.checks()[0].status, 'PASS', 'the rule is not specific to fills or backgrounds');
  for (const property of ['fill', 'stroke']) {
    f.metadata.bindings[0].cssProperty = property;
    const computed = f.measurement.parts.root.elements[0].computed;
    computed[property] = 'rgba(255, 0, 0, 0.5)';
    assert.equal(f.checks()[0].status, 'NOT RUN');
    computed[`${property}-opacity`] = '1';
    assert.equal(f.checks()[0].status, 'PASS');
    computed[`${property}-opacity`] = '0.5';
    assert.equal(f.checks()[0].status, 'NOT COMPARABLE', 'SVG paint opacity must not double the variable alpha');
  }
});

test('a mode changing an opaque variable to transparent still requires original unit CSS opacity', () => {
  const f = fixture();
  f.node.properties.fills[0].opacity = 1;
  f.capture.variables[1].valuesByMode.dark = { r: 1, g: 0, b: 0, a: 0.5 };
  f.configuration.modes.palette = 'dark';
  const computed = f.measurement.parts.root.elements[0].computed;
  computed['background-color'] = 'rgba(255, 0, 0, 0.5)';
  assert.equal(f.checks()[0].status, 'NOT RUN');
  computed.opacity = '1'; assert.equal(f.checks()[0].status, 'PASS');
  computed.opacity = '0.5'; assert.equal(f.checks()[0].status, 'NOT COMPARABLE');
});

test('ambiguous, unsupported and unreadable colors never become a guessed PASS', () => {
  for (const change of [
    f => { f.node.properties.fills.push(structuredClone(f.node.properties.fills[0])); },
    f => { f.node.properties.fills[0].type = 'GRADIENT_LINEAR'; },
    f => { f.node.properties.fills[0].visible = false; },
    f => { f.node.properties.explicitVariableModes = { unavailable: true }; },
    f => { f.capture.variables[1].valuesByMode.light = { type: 'VARIABLE_ALIAS', id: 'semantic' }; },
    f => { f.metadata.bindings[0].cssProperty = '--supplier'; },
    f => { f.metadata.parts.root.nodes.default = 'FILE:another'; },
    f => { f.measurement.parts.root.elements[0].computed['background-color'] = 'color(display-p3 1 0 0)'; },
    f => { f.measurement.parts.root.count = 2; f.measurement.parts.root.elements.push(f.measurement.parts.root.elements[0]); },
  ]) { const f = fixture(); change(f); assert.notEqual(f.checks()[0]?.status, 'PASS'); }
  const f = fixture(); delete f.measurement.parts.root.elements[0].computed['background-color']; assert.equal(f.checks()[0].status, 'NOT RUN');
  f.measurement.parts.root = { count: 0, elements: [] }; assert.equal(f.checks()[0].status, 'FAIL');
  f.scope.visible = () => false; assert.deepEqual(f.checks(), []);
});

test('behavior colors compare revealed optional parts and skip only measured absence or hidden elements', () => {
  const f = fixture();
  f.node.properties.visible = false; f.node.properties.componentPropertyReferences = { visible: 'Show' };
  f.scope.visible = () => false;
  f.measurement.parts.root.elements[0].geometry = { visible: true };
  f.configuration.kind = 'fidelity'; assert.deepEqual(f.checks(), []);
  f.configuration.kind = 'behavior'; assert.equal(f.checks()[0]?.status, 'PASS');
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgb(0, 0, 255)';
  assert.equal(f.checks()[0].status, 'FAIL');
  f.measurement.parts.root.elements[0].geometry.visible = false; assert.deepEqual(f.checks(), []);
  f.measurement.parts.root = { count: 0, elements: [] }; assert.deepEqual(f.checks(), []);
  delete f.measurement.parts.root; assert.equal(f.checks()[0].status, 'NOT RUN');
  f.measurement.parts.root = { count: 1, elements: [{ computed: { 'background-color': 'rgb(255, 0, 0)' } }] };
  assert.equal(f.checks()[0].status, 'NOT RUN', 'missing visibility is not proof of absence');
  f.measurement.parts.root.elements[0].geometry = { visible: true };
  f.node.properties.componentPropertyReferences = {}; assert.equal(f.checks()[0].status, 'NOT COMPARABLE');
  f.node.properties.componentPropertyReferences = { visible: 'Show' }; f.node.properties.opacity = 0;
  assert.equal(f.checks()[0].status, 'NOT COMPARABLE', 'a visibility prop does not override permanent zero opacity');
});

test('sRGB parsing and bounded channel/alpha tolerances are explicit', () => {
  assert.deepEqual(parseComputedColor('rgb(100% 0% 0% / 50%)').map(Math.round), [255, 0, 0, 1]);
  for (const value of ['red', '', 'rgb(300,0,0)', 'rgba(0,0,0,2)', 'rgb(NaN,0,0)']) assert.equal(parseComputedColor(value), null);
  const f = fixture();
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgb(254, 1, 0)'; assert.equal(f.checks()[0].status, 'PASS');
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgb(253, 0, 0)'; assert.equal(f.checks()[0].status, 'FAIL');
  f.measurement.parts.root.elements[0].computed['background-color'] = 'rgba(255, 0, 0, 0.99)'; assert.equal(f.checks()[0].status, 'FAIL');
});

test('persisted report production recomputes color from the original measurement and refuses a visual PASS over a wrong color', t => {
  const { root, metadataPath } = createPreviewProject(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath)));
  const original = JSON.parse(readFileSync(path.join(root, metadata.evidence.snapshot))).capture;
  original.nodes[0].properties.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
  const capture = componentCapture({ seeds: original.nodes, rootNodeId: original.source.rootNodeId });
  Object.assign(metadata.evidence, persistCapture(root, capture));
  const observation = capture.observations.find(o => o.node === '1:2' && o.field === 'fills');
  metadata.measuredLiterals.push({ observation: observation.id, source: 'FILE:1:2', figmaProperty: 'fills', part: 'root', variant: 'default', cssProperty: 'background-color', value: 'red' });
  const configuration = metadata.verification.cases[0];
  const make = color => c => renderedArtifacts(root, metadata, c, { mutateBody: body => { body.parts.root.elements[0].computed['background-color'] = color; } });
  const review = color => ({ result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic fixture, not an actual visual comparison.' },
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' },
    artifacts: make(color)(configuration), checkReviews: syntheticTypographyReviews(root, metadata, configuration),
    behaviors: metadata.verification.cases.filter(c => c.kind === 'behavior').map(c => ({ caseId: c.id, artifact: make(color)(c)[0] })) });
  assert.equal(comparisonReport(root, metadata, configuration.id, review('rgb(255, 0, 0)'), undefined, metadataPath).renderChecks.checks.find(c => c.id === 'color:root:background-color').status, 'PASS');
  assert.throws(() => comparisonReport(root, metadata, configuration.id, review('rgb(0, 0, 255)'), undefined, metadataPath), /color:root:background-color.*FAIL/);
});
