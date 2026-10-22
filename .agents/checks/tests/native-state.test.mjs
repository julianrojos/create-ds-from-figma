import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeStateProblem, readNativeState, compareNativeStates } from '../lib/native-state.mjs';
import { assertConfirmationChecks } from '../lib/render-comparison.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { verifyRenderPlan } from '../lib/render-plan.mjs';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { renderedArtifacts, syntheticTypographyReviews } from './fixtures/rendered-artifacts.mjs';
import { comparisonReport } from '../../skills/create-ds-from-figma/scripts/verification-plan.mjs';
import { caseInputs } from '../lib/comparison-evidence.mjs';
import { diagnosisActions } from '../lib/diagnosis-actions.mjs';

const declared = (property = 'checked', value = true) => ({ name: property, activation: 'Configured through the native prop.', verification: { kind: 'native', selector: 'input', property, value } });
const compare = (state, records) => {
  const checks = []; compareNativeStates({ states: [state] }, records === undefined ? undefined : { nativeStates: records }, (id, status, reason, detail) => checks.push({ id, status, reason, ...detail })); return checks;
};

test('native assertions require explicit supported properties, matching names and booleans', () => {
  assert.equal(nativeStateProblem(declared()), null);
  assert.equal(nativeStateProblem({ name: 'hover', activation: 'Real pointer hover.' }), null);
  for (const verification of [null, [], {}, { ...declared().verification, value: 'true' }, { ...declared().verification, property: 'selected' },
    { ...declared().verification, selector: '' }, { ...declared().verification, extra: 'unknown' }]) assert.ok(nativeStateProblem({ ...declared(), verification }));
  assert.ok(nativeStateProblem({ ...declared(), name: 'loading' }));
});

test('native readings cannot be replaced by props, PASS text, another state or general visual review', () => {
  const state = declared(), record = { name: 'checked', property: 'checked', expected: true, measured: true, count: 1, status: 'PASS' };
  assert.equal(compare(state, [record])[0].status, 'PASS');
  assert.equal(compare(declared('checked', false), [{ ...record, expected: false, measured: false }])[0].status, 'PASS');
  assert.equal(compare(state, [{ ...record, measured: false, status: 'FAIL' }])[0].status, 'FAIL');
  for (const records of [undefined, {}, [], [null], [record, record], [{ ...record, property: 'disabled' }], [{ ...record, measured: false }]]) {
    const checks = compare(state, records); assert.equal(checks[0].status, 'NOT RUN');
    assert.throws(() => assertConfirmationChecks({ checks }, [], []));
  }
  assert.equal(compare(state, [{ ...record, status: 'NOT RUN', reason: 'Ambiguous target' }])[0].status, 'NOT RUN');
  assert.equal(compare(state, [{ ...record, count: 0, status: 'FAIL', measured: undefined }])[0].status, 'FAIL');
  assert.equal(compare({ name: 'hover' }, [record])[0].status, 'NOT COMPARABLE');
});

test('native probe handles unique, absent, ambiguous, nested and unsupported elements without DOM writes', () => {
  const root = { matches: () => false, closest: () => root, querySelectorAll: () => [input] };
  const input = { tagName: 'INPUT', type: 'checkbox', checked: true, closest: () => root, matches: selector => selector === ':disabled' };
  assert.equal(readNativeState(root, declared()).status, 'PASS');
  assert.equal(readNativeState(root, declared('disabled')).status, 'PASS');
  input.checked = false; assert.equal(readNativeState(root, declared()).status, 'FAIL');
  input.tagName = 'DIV'; input.checked = true; assert.equal(readNativeState(root, declared()).status, 'FAIL'); input.tagName = 'INPUT';
  root.querySelectorAll = () => [input, input]; assert.equal(readNativeState(root, declared()).status, 'NOT RUN');
  root.querySelectorAll = () => [input]; input.closest = () => ({}); assert.equal(readNativeState(root, declared()).count, 0);
  root.querySelectorAll = () => { throw new Error('Invalid selector'); }; assert.equal(readNativeState(root, declared()).status, 'NOT RUN');
});

test('render plan validates native declarations and rejects duplicate state names', t => {
  const { root, metadataPath } = createPreviewProject(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath))), { capture } = JSON.parse(readFileSync(path.join(root, metadata.evidence.snapshot)));
  for (const c of metadata.verification.cases) c.states = [declared()];
  assert.deepEqual(verifyRenderPlan(root, metadata, capture).errors, []);
  metadata.verification.cases[0].states.push(declared());
  assert.ok(verifyRenderPlan(root, metadata, capture).errors.some(e => /unique/.test(e)));
  for (const c of metadata.verification.cases) c.states = [{ ...declared(), verification: { kind: 'native', property: 'checked', value: 'true', selector: 'input' } }];
  assert.ok(verifyRenderPlan(root, metadata, capture).errors.some(e => /boolean/.test(e)));
});

test('confirmation rechecks original native readings and semantic hashes include assertion targets and values', t => {
  const { root, metadataPath } = createPreviewProject(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath)));
  for (const c of metadata.verification.cases) c.states = [declared()];
  const configuration = metadata.verification.cases[0];
  const before = caseInputs(root, metadata, configuration).metadataHash;
  configuration.states[0].verification.value = false;
  assert.notEqual(caseInputs(root, metadata, configuration).metadataHash, before);
  configuration.states[0].verification.value = true;
  configuration.states[0].verification.selector = 'input[type="checkbox"]';
  assert.notEqual(caseInputs(root, metadata, configuration).metadataHash, before);
  configuration.states[0].verification.selector = 'input';
  const make = measured => c => renderedArtifacts(root, metadata, c, { mutateBody: body => {
    body.nativeStates = [{ name: 'checked', property: 'checked', expected: true, measured, count: 1, status: measured ? 'PASS' : 'FAIL' }];
  } });
  const review = measured => ({ result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic review, not genuine fidelity.' },
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' },
    checkReviews: syntheticTypographyReviews(root, metadata, configuration), artifacts: make(measured)(configuration),
    behaviors: metadata.verification.cases.filter(c => c.kind === 'behavior').map(c => ({ caseId: c.id, artifact: make(measured)(c)[0] })) });
  assert.ok(comparisonReport(root, metadata, configuration.id, review(true), undefined, metadataPath).renderChecks.checks.some(c => c.id === 'state:checked' && c.status === 'PASS'));
  assert.throws(() => comparisonReport(root, metadata, configuration.id, review(false), undefined, metadataPath), /FAIL|failed|block/i);
});

test('missing native execution has its own next action even for fidelity-only cases', () => {
  const actions = diagnosisActions('.', 'metadata.json', [{ caseId: 'source', kind: 'fidelity', checks: [{ id: 'state:checked', status: 'NOT RUN', reason: 'Ambiguous target.' }] }]);
  assert.ok(actions.some(a => a.code === 'RESOLVE_STATE_VERIFICATION' && a.cases[0].caseId === 'source' && a.command === null));
});
