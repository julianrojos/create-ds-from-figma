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
const pseudo = (property = 'hover', value = true) => ({ name: property === 'focus-visible' ? 'focus' : property, activation: 'Activate the recorded real browser action.', verification: { kind: 'pseudo', selector: 'button', property, value } });
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
  metadata.verification.cases[0].actions = [{ kind: 'focus', selector: 'input' }];
  assert.ok(verifyRenderPlan(root, metadata, capture).errors.some(e => e.includes('Unsupported browser action')));
  delete metadata.verification.cases[0].actions;
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
  configuration.actions = [{ kind: 'press', key: 'Tab' }];
  assert.notEqual(caseInputs(root, metadata, configuration).metadataHash, before);
  delete configuration.actions;
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

test('pseudo assertions are explicit browser readings, never an action result or a declared PASS', () => {
  for (const property of ['hover', 'focus', 'focus-visible']) {
    const state = pseudo(property);
    assert.equal(nativeStateProblem(state), null);
    const record = { name: state.name, property, expected: true, measured: false, count: 1, status: 'FAIL' };
    assert.equal(compare(state, [record])[0].status, 'FAIL');
    assert.equal(compare(state, [{ ...record, measured: true, status: 'PASS' }])[0].status, 'PASS');
    assert.equal(compare(state, [{ ...record, status: 'PASS' }])[0].status, 'NOT RUN');
    assert.equal(compare(state, [])[0].status, 'NOT RUN');
  }
  for (const state of [pseudo('active'), { ...pseudo(), name: 'checked' }, { ...pseudo(), verification: { ...pseudo().verification, kind: 'native' } }]) assert.ok(nativeStateProblem(state));
});

test('pseudo probe reads exact pseudoclasses and treats absent, ambiguous or unreadable targets as NOT RUN', () => {
  const button = { matches: selector => selector === ':focus', closest: () => root };
  const root = { matches: () => false, querySelectorAll: () => [button] };
  assert.equal(readNativeState(root, pseudo('focus')).status, 'PASS');
  assert.equal(readNativeState(root, pseudo('focus-visible')).status, 'FAIL');
  assert.equal(readNativeState(root, pseudo('hover', false)).status, 'PASS');
  root.querySelectorAll = () => [];
  assert.equal(readNativeState(root, pseudo()).status, 'NOT RUN');
  root.querySelectorAll = () => [button, button];
  assert.equal(readNativeState(root, pseudo()).status, 'NOT RUN');
  root.querySelectorAll = () => [button]; button.matches = () => { throw new Error('Unavailable'); };
  assert.equal(readNativeState(root, pseudo()).status, 'NOT RUN');
});

test('a rendered review cannot rescue a false pseudo reading in required behavior', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath)));
  for (const c of metadata.verification.cases) { c.states = [pseudo()]; c.actions = [{ kind: 'hover', selector: 'button' }]; }
  const source = metadata.verification.cases[0];
  const artifact = (c, measured) => renderedArtifacts(root, metadata, c, { mutateBody: body => {
    body.nativeStates = [{ name: 'hover', property: 'hover', expected: true, measured, count: 1, status: measured ? 'PASS' : 'FAIL' }];
  } });
  const review = { result: 'PASS', comparison: { method: 'agent-rendered-review', reason: 'Synthetic schema fixture, not genuine interaction evidence.' },
    figmaRevision: { id: null, reason: 'Synthetic.' }, codeRevision: { id: null, reason: 'Synthetic.' },
    checkReviews: syntheticTypographyReviews(root, metadata, source), artifacts: artifact(source, true),
    behaviors: metadata.verification.cases.filter(c => c.kind === 'behavior').map(c => ({ caseId: c.id, artifact: artifact(c, false)[0] })) };
  assert.throws(() => comparisonReport(root, metadata, source.id, review, undefined, metadataPath), /Required behavior blocked: state:hover FAIL/);
});
