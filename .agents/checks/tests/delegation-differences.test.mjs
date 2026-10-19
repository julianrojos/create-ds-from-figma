import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractObservations } from '../../skills/create-ds-from-figma/scripts/lib/capture-figma.mjs';
import { delegationDifferences, delegationChecks, delegationNextActions } from '../lib/delegation-differences.mjs';
import { verifyEvidence } from '../lib/figma-evidence.mjs';
import { assertConfirmationChecks, COMPARATOR_VERSION, checkSummary } from '../lib/render-comparison.mjs';
import { delegationFixture } from './fixtures/delegation-fixture.mjs';

const derive = f => delegationDifferences(f.capture, f.metadata, f.mappedComponents);
const refresh = f => { f.capture.observations = extractObservations(f.capture.nodes).observations; };
const declare = (f, treatment = 'implemented') => {
  f.metadata.evidence.dispositions[0].differences = derive(f).records.filter(r => r.status === 'difference').map(r => ({ id: r.id, treatment, reason: 'Synthetic treatment, not actual evidence.', ...(treatment === 'implemented' ? { part: 'remove', cssProperty: 'background-color' } : {}) }));
};

test('delegation compares bindings and individual paints, never accounts an undeclared difference as resolved', () => {
  const f = delegationFixture(), d = derive(f);
  assert.equal(d.records.filter(r => r.status === 'difference').length, 1);
  assert.equal(d.records.find(r => r.status === 'difference').property, 'binding:strokes[0].color');
  assert.ok(d.records.some(r => r.property === 'fills' && r.status === 'same'));
  assert.match(d.errors[0], /Undeclared delegation difference/);
  assert.ok(verifyEvidence(f.metadata, f.capture, { mappedComponents: f.mappedComponents }).errors.some(e => /Undeclared delegation difference/.test(e)));
  assert.deepEqual(derive(delegationFixture({ changed: false })).errors, []);
  assert.deepEqual(delegationChecks(f.capture, f.metadata, { ...f.configuration, kind: 'behavior' }, f.mappedComponents), []);
});

test('omission blocks confirmation; implementation requires its own specific artifact-bound review', () => {
  const f = delegationFixture();
  for (const treatment of ['omitted', 'implemented']) {
    declare(f, treatment);
    assert.deepEqual(derive(f).errors, []);
    const checks = delegationChecks(f.capture, f.metadata, f.configuration, f.mappedComponents);
    const result = { policy: 'mapped-layout-v1', comparatorVersion: COMPARATOR_VERSION, checks, summary: checkSummary(checks) };
    const review = { checkId: checks[0].id, result: 'PASS', reason: 'Synthetic contract fixture only.', artifacts: ['retained.png'] };
    if (treatment === 'omitted') {
      assert.equal(checks[0].status, 'NOT RUN');
      assert.throws(() => assertConfirmationChecks(result, [], ['retained.png']), /Confirmation blocked/);
      assert.throws(() => assertConfirmationChecks(result, [review], ['retained.png']));
      assert.equal(delegationNextActions('parent.json', derive(f).records)[0].code, 'IMPLEMENT_DELEGATION_DIFFERENCE');
    } else {
      assert.equal(checks[0].status, 'NOT COMPARABLE');
      assert.throws(() => assertConfirmationChecks(result, [], ['retained.png']), /Specific rendered review required/);
      assert.throws(() => assertConfirmationChecks(result, [{ ...review, checkId: 'another-difference' }], ['retained.png']));
      assert.throws(() => assertConfirmationChecks(result, [review], ['unrelated.png']));
      assert.doesNotThrow(() => assertConfirmationChecks(result, [review], ['retained.png']));
    }
  }
});

test('missing or mismatched snapshots, keys, names, ordered structure and nested instances stay pending', () => {
  for (const mutate of [
    f => { delete f.mappedComponents[0].capture; },
    f => { f.capture.nodes[1].properties.mainComponent.key = 'wrong-key'; },
    f => { f.capture.nodes[2].name = 'Renamed'; },
    f => { f.capture.nodes[2].id = 'I2:1;unrelated'; f.capture.nodes[1].children = ['I2:1;unrelated']; },
    f => { f.capture.nodes[2].type = 'INSTANCE'; },
  ]) {
    const f = delegationFixture(); mutate(f); refresh(f);
    assert.ok(derive(f).records.some(r => r.status === 'unmatched'));
    assert.ok(delegationChecks(f.capture, f.metadata, f.configuration, f.mappedComponents).some(c => c.status === 'NOT RUN'));
  }
});

test('mode mismatch preserves binding differences but cannot approve resolved colors', () => {
  const f = delegationFixture(); f.capture.nodes[2].properties.resolvedVariableModes.COL = 'dark';
  const d = derive(f);
  assert.ok(d.records.some(r => r.property === 'binding:strokes[0].color' && r.status === 'difference'));
  assert.ok(d.records.some(r => r.property === 'strokes[0].color' && r.status === 'unmatched'));
});

test('unrelated collection modes do not invalidate paints, and literal colors need no variable-mode assumption', () => {
  const f = delegationFixture({ changed: false });
  f.capture.collections.push({ id: 'UNRELATED', defaultModeId: 'other', modes: [{ modeId: 'other' }] });
  f.capture.nodes[2].properties.resolvedVariableModes.UNRELATED = 'other';
  assert.ok(derive(f).records.some(r => r.property === 'strokes[0].color' && r.status === 'same'));
  delete f.capture.nodes[2].properties.strokes[0].boundVariables; refresh(f);
  f.capture.nodes[2].properties.resolvedVariableModes.COL = 'dark';
  assert.ok(derive(f).records.some(r => r.property === 'strokes[0].color' && r.status === 'same'));
});

test('remote baselines cannot equate file-local variable IDs or mode IDs without stable-key correspondence', () => {
  const f = delegationFixture({ changed: false });
  f.capture.nodes[1].properties.mainComponent.remote = true;
  f.baseline.source.fileKey = 'LIBRARY';
  f.mappedComponents[0].refs = ['componentKey:child-key'];
  const records = derive(f).records;
  assert.ok(records.some(r => r.property === 'binding:strokes[0].color' && r.status === 'unmatched'));
  assert.ok(records.some(r => r.property === 'strokes[0].color' && r.status === 'unmatched'));
});

test('missing bindings, multiple paints, unavailable fields and not-applicable fields are distinct', () => {
  const f = delegationFixture({ changed: false });
  delete f.capture.nodes[2].properties.strokes[0].boundVariables; refresh(f);
  assert.ok(derive(f).records.some(r => r.status === 'difference' && r.property.startsWith('binding:')));
  f.capture.nodes[2].properties.strokes.push({ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }); refresh(f);
  assert.ok(derive(f).records.some(r => r.status === 'unmatched' && r.property === 'strokes'));
  const g = delegationFixture(); g.capture.nodes[2].properties.strokes = { unavailable: true }; refresh(g);
  assert.ok(derive(g).records.some(r => r.status === 'unreadable' && r.property === 'strokes'));
  assert.ok(derive(g).records.some(r => r.status === 'unreadable' && r.property === 'binding:strokes[0].color'));
  assert.ok(!derive(g).records.some(r => r.status === 'difference'), 'a binding lost to a paint read failure is not an absent binding');
  const h = delegationFixture(); delete h.capture.nodes[2].properties.fills; h.capture.nodes[2].inspected = h.capture.nodes[2].inspected.filter(k => k !== 'fills'); h.capture.nodes[2].notApplicable.push('fills');
  delete h.baseline.nodes[1].properties.fills; h.baseline.nodes[1].inspected = h.baseline.nodes[1].inspected.filter(k => k !== 'fills'); h.baseline.nodes[1].notApplicable.push('fills');
  assert.ok(derive(h).records.some(r => r.status === 'not applicable' && r.property === 'fills'));
  delete g.capture.nodes[2].properties.strokes; g.capture.coverage.issues.push({ node: g.capture.nodes[2].id, field: 'strokes', reason: 'Read failed' });
  assert.ok(derive(g).records.some(r => r.status === 'unreadable' && r.property === 'strokes'));
});

test('reordered paint stacks stay unmatched instead of attributing identity to an index', () => {
  const f = delegationFixture({ changed: false });
  const red = { type: 'SOLID', color: { r: 1, g: 0, b: 0 } };
  f.baseline.nodes[1].properties.strokes.push(red);
  f.capture.nodes[2].properties.strokes.unshift(structuredClone(red)); refresh(f);
  f.baseline.observations = extractObservations(f.baseline.nodes).observations;
  assert.ok(derive(f).records.some(r => r.status === 'unmatched' && r.property === 'strokes'));
  assert.ok(!derive(f).records.some(r => r.property.startsWith('strokes[') && r.status === 'same'));
  assert.ok(!derive(f).records.some(r => r.property.startsWith('binding:strokes[') && r.status === 'difference'));
});

test('stale, duplicated or malformed treatment cannot approve a different property', () => {
  const f = delegationFixture(); declare(f);
  const d = f.metadata.evidence.dispositions[0].differences;
  d.push(structuredClone(d[0])); assert.ok(derive(f).errors.length);
  d.pop(); d[0].id += '-other'; assert.ok(derive(f).errors.some(e => /Undeclared/.test(e)));
});
