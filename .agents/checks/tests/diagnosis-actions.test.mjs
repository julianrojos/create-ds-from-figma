import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnosisActions } from '../lib/diagnosis-actions.mjs';

const check = (id, status, reason = 'Reason') => ({ id, status, reason });

test('differences and unresolved behavior checks lead to different next actions', () => {
  const cases = [
    { caseId: 'exact', kind: 'fidelity', checks: [check('geometry:root', 'PASS'), check('position:beak', 'FAIL'), check('font:a', 'FAIL'), check('geometry:beak', 'NOT COMPARABLE')] },
    { caseId: 'longer', kind: 'behavior', checks: [check('behavior:0:intrinsic-size', 'NOT COMPARABLE', 'Declare a justified relation.'), check('behavior:1:centered', 'PASS'), check('font:a', 'NOT RUN')] },
    { caseId: 'ok', kind: 'behavior', checks: [check('behavior:0:intrinsic-size', 'PASS')] },
  ];
  const actions = diagnosisActions('.', 'design-system/components/X/metadata.json', cases);
  assert.deepEqual(actions.map(a => a.code), ['REVIEW_RENDERED_DIFFERENCES', 'RESOLVE_BEHAVIOR_CHECKS']);
  assert.deepEqual(actions[0].cases, [{ caseId: 'exact', checks: ['position:beak'] }], 'font results and noncomparable fidelity checks are not differences');
  const behavior = actions[1];
  assert.deepEqual(behavior.cases, [{ caseId: 'longer', checks: [{ id: 'behavior:0:intrinsic-size', status: 'NOT COMPARABLE', reason: 'Declare a justified relation.' }] }]);
  assert.match(behavior.reason, /no rendered review rescues/i);
  assert.equal(behavior.command, null, 'the decision is explicit, never generated');
  assert.deepEqual(behavior.permissions, ['project-write']);
});

test('nothing to resolve yields no action, and malformed input is not read as success', () => {
  assert.deepEqual(diagnosisActions('.', 'm.json', []), []);
  assert.deepEqual(diagnosisActions('.', 'm.json'), []);
  assert.deepEqual(diagnosisActions('.', 'm.json', [{ caseId: 'a', kind: 'fidelity', checks: [check('geometry:root', 'PASS')] }]), []);
  assert.deepEqual(diagnosisActions('.', 'm.json', [{ caseId: 'b', kind: 'behavior', checks: [check('behavior:0', 'NOT RUN')] }]).map(a => a.code), ['RESOLVE_BEHAVIOR_CHECKS'], 'a check that did not run also blocks');
});
