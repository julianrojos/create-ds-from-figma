import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseArgs, makePlan, runPlan, relativeMetadataPath } from '../../scripts/verify-all.mjs';
import { projectFile } from '../lib/render-plan.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'verify-all-test-'));
  mkdirSync(path.join(root, 'components'));
  writeFileSync(path.join(root, 'components/metadata.json'), '{}');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const success = { status: 0, stdout: '', stderr: '' };
const bindingJSON = (pass = 1, fail = 0, pending = 1) => JSON.stringify({ schemaVersion: 1, results: [...Array(pass).fill({ status: 'PASS' }), ...Array(fail).fill({ status: 'FAIL' }), ...Array(pending).fill({ status: 'NOT_RUN' })], counts: { PASS: pass, FAIL: fail, NOT_RUN: pending, ADVISORY: 0 } });
const summary = () => ({ PASS: 1, FAIL: 0, 'NOT RUN': 0, 'NOT COMPARABLE': 0 });
const diagnostic = () => ({ status: 'NOT VERIFIED', complete: false, errors: [], diagnosis: {
  execution: { status: 'COMPLETED' }, blocked: [], diagnostics: { cases: [{ caseId: 'base' }], summary: summary(), compositionSummary: summary() }, application: { status: 'PASS' },
} });

test('profiles reject implicit scope, publication options and metadata escaping the project', t => {
  const root = fixture(t);
  for (const args of [[], ['import'], ['screen'], ['kit', '--root', root], ['screen', '--root', root, '--collect'], ['import', '--root', root], ['import', '--root', root, '--metadata', '../outside.json'], ['import', '--root', root, '--metadata', 'components/metadata.json', '--metadata', 'components/../components/metadata.json']]) assert.throws(() => parseArgs(args));
  const outside = fixture(t);
  symlinkSync(path.join(outside, 'components/metadata.json'), path.join(root, 'components/external.json'));
  assert.throws(() => parseArgs(['import', '--root', root, '--metadata', 'components/external.json']), /Unsafe/);
});

test('dry-run never launches tests, browsers or project code; profiles preserve mandatory coverage', t => {
  const root = fixture(t);
  const options = parseArgs(['import', '--root', root, '--metadata', 'components/metadata.json', '--dry-run']);
  const report = runPlan(options, { run: () => { throw new Error('must not run'); } });
  assert.equal(report.automationStatus, 'PLANNED');
  assert.equal(report.plan.filter(s => s.kind === 'diagnostic').length, 1);
  assert.ok(report.plan.some(s => s.id === 'imports'));
  assert.ok(report.plan.every(s => !s.args.includes('--collect') && !s.args.includes('--reviews')));
  const kit = makePlan(parseArgs(['kit']));
  assert.deepEqual(kit.find(s => s.id === 'tests').args, ['test']);
  assert.ok(kit.find(s => s.id === 'docs').args.includes('--strict'));
});

function runUI(t, alter = () => {}, extra = {}) {
  const root = fixture(t), calls = [];
  const options = parseArgs(['import', '--root', root, '--metadata', 'components/metadata.json']);
  const run = (executable, args) => {
    calls.push(args);
    if (args[0].endsWith('verify-bindings.mjs')) return { ...success, stdout: bindingJSON() };
    if (args.includes('--diagnose')) {
      const result = diagnostic(); alter(result);
      return { ...success, status: 1, stdout: JSON.stringify(result) };
    }
    return extra.staticFailure && args[0].endsWith('verify-ds.mjs') ? { ...success, status: 1 } : success;
  };
  return { report: runPlan(options, { run, log: () => {} }), calls };
}

test('expected diagnostic exit 1 never becomes delivery approval and static NOT_RUN stays explicit', t => {
  const { report } = runUI(t);
  assert.equal(report.exitCode, 0);
  assert.equal(report.checks.find(s => s.id.startsWith('diagnose:')).status, 'DIAGNOSTIC');
  assert.equal(report.checks.find(s => s.id === 'bindings').reviewRequired, true);
  assert.equal(report.deliveryStatus, 'NOT VERIFIED BY THIS COMMAND');
  assert.ok(report.pendingManualChecks.length);
});

test('diagnostic faults, missing summaries, blocked cases and execution failure cannot be normalized to success', t => {
  for (const alter of [r => { r.status = 'FAIL'; }, r => { delete r.diagnosis.diagnostics.summary; }, r => { r.diagnosis.diagnostics.compositionSummary['NOT RUN'] = 1; }, r => { r.diagnosis.blocked.push({ caseId: 'base' }); }, r => { r.diagnosis.execution.status = 'NOT RUN'; }, r => { r.diagnosis.application.status = 'FAIL'; }]) assert.equal(runUI(t, alter).report.exitCode, 1);
});

test('failed static preflight prevents project-code diagnosis but does not skip independent import gate', t => {
  const { report, calls } = runUI(t, () => {}, { staticFailure: true });
  assert.equal(report.exitCode, 1);
  assert.equal(report.checks.find(s => s.id.startsWith('diagnose:')).status, 'NOT RUN');
  assert.ok(!calls.some(args => args.includes('--diagnose')));
  assert.ok(calls.some(args => args[0].endsWith('verify-imports.mjs')));
});

test('informational binding CLI findings, timeouts and runner errors retain failures', t => {
  const root = fixture(t), options = parseArgs(['screen', '--root', root]);
  for (const child of [{ ...success, stdout: bindingJSON(0, 1, 0) }, { ...success, error: new Error('timeout') }, { ...success, stdout: JSON.stringify({ schemaVersion: 9, results: [], counts: {} }) }]) {
    const report = runPlan(options, { log: () => {}, run: (_exe, args) => args[0].endsWith('verify-bindings.mjs') ? child : success });
    assert.equal(report.exitCode, 1);
  }
});

test('timeout cleanup targets only the process group launched by the wrapper', t => {
  const root = fixture(t), options = parseArgs(['screen', '--root', root]), killed = [];
  const report = runPlan(options, { log: () => {}, kill: (...args) => killed.push(args), run: (_exe, _args, spawnOptions) => {
    assert.equal(spawnOptions.shell, false);
    return { status: null, error: new Error('ETIMEDOUT'), pid: 12345 };
  } });
  assert.equal(report.exitCode, 1);
  if (process.platform !== 'win32') assert.ok(killed.length > 0 && killed.every(args => args[0] === -12345 && args[1] === 'SIGKILL'));
});

test('binding JSON contract rejects tampering and is independent of human console formatting', t => {
  const root = fixture(t), options = parseArgs(['screen', '--root', root]);
  const cases = [
    { output: bindingJSON(1, 0, 0), code: 0 },
    { output: 'REPORT {"PASS":1,"FAIL":0,"NOT_RUN":0};', code: 1 },
    { output: JSON.stringify({ schemaVersion: 1, results: [{ status: 'FAIL' }], counts: { PASS: 1, FAIL: 0, NOT_RUN: 0, ADVISORY: 0 } }), code: 1 },
    { output: JSON.stringify({ schemaVersion: 1, results: [{ status: 'UNKNOWN' }], counts: { PASS: 0, FAIL: 0, NOT_RUN: 0, ADVISORY: 0 } }), code: 1 },
  ];
  for (const c of cases) {
    const result = runPlan(options, { log: () => {}, run: (_exe, args) => {
      if (args[0].endsWith('verify-bindings.mjs')) { assert.ok(args.includes('--json')); return { ...success, stdout: c.output }; }
      return success;
    } });
    assert.equal(result.exitCode, c.code);
  }
});

test('Windows drive and UNC metadata paths satisfy the finalizer contract', t => {
  const root = fixture(t), expected = 'components/metadata.json';
  const windowsRoots = ['C:\\project with spaces', '\\\\server\\share\\project'];
  for (const windowsRoot of windowsRoots) {
    const file = path.win32.join(windowsRoot, expected);
    const relative = relativeMetadataPath(windowsRoot, file, path.win32);
    assert.equal(relative, expected);
    assert.equal(projectFile(root, relative), projectFile(root, expected));
  }
  for (const profile of ['import', 'screen']) {
    const options = parseArgs([profile, '--root', root, '--metadata', expected]);
    const diagnosis = makePlan(options).find(step => step.kind === 'diagnostic');
    assert.equal(diagnosis.args[2], expected);
    assert.equal(projectFile(root, diagnosis.args[2]), projectFile(root, expected));
  }
});
