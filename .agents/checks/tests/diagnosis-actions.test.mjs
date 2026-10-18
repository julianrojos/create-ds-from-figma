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

test('experimental composition failures produce a distinct action without promoting inconclusive results', () => {
  const cases = [{ caseId: 'exact', kind: 'fidelity', checks: [], composition: { checks: [check('composition:stroke', 'FAIL'), check('composition:fill', 'NOT COMPARABLE')] } }];
  const actions = diagnosisActions('.', 'm.json', cases);
  assert.deepEqual(actions.map(a => a.code), ['REVIEW_COMPOSITION_DIAGNOSTICS']);
  assert.deepEqual(actions[0].cases, [{ caseId: 'exact', checks: ['composition:stroke'] }]);
  assert.match(actions[0].reason, /experimental/i);
  cases[0].composition.checks[0].status = 'NOT COMPARABLE';
  assert.deepEqual(diagnosisActions('.', 'm.json', cases), []);
});

test('unrun composition requests an explicit execution retry, distinct from visual differences and abstention', () => {
  const cases = [{ caseId: 'exact', kind: 'fidelity', checks: [], composition: { checks: [check('composition:collection', 'NOT RUN', 'Page timed out.')] } }];
  const [action] = diagnosisActions('/project', 'm.json', cases);
  assert.ok(action);
  assert.equal(action.code, 'RETRY_COMPOSITION_DIAGNOSTICS');
  assert.deepEqual(action.cases, [{ caseId: 'exact', checks: [{ id: 'composition:collection', status: 'NOT RUN', reason: 'Page timed out.' }] }]);
  assert.deepEqual(action.permissions, ['project-read', 'browser-execution', 'temporary-write']);
  assert.deepEqual(action.command, { executable: 'npm', args: ['run', 'finalize:import', '--', '/project', 'm.json', '--diagnose'] });
  assert.match(action.reason, /not an observed visual difference/);
  cases[0].composition.checks.push(check('composition:stroke', 'FAIL'));
  assert.deepEqual(diagnosisActions('/project', 'm.json', cases).map(a => a.code), ['RETRY_COMPOSITION_DIAGNOSTICS', 'REVIEW_COMPOSITION_DIAGNOSTICS']);
  cases[0].composition.checks = [check('composition:stroke', 'NOT COMPARABLE')];
  assert.deepEqual(diagnosisActions('/project', 'm.json', cases), []);
});
