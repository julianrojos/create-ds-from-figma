import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browserRuntime, runTests, unitTestFiles } from '../../scripts/test-kit.mjs';
import summaryReporter from '../../scripts/test-summary-reporter.mjs';

test('default test profile cannot silently omit browser regression when runtime is absent or mismatched', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-test-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, '.agents/browser-tests'); mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ devDependencies: { playwright: '1.64.1' } }));
  let invoked = false;
  assert.throws(() => runTests('all', { root, log() {}, run() { invoked = true; return { status: 0 }; } }), /test:browser:setup.*No browser test was skipped/);
  assert.equal(invoked, false);
  mkdirSync(path.join(directory, 'node_modules/playwright'), { recursive: true });
  writeFileSync(path.join(directory, 'node_modules/playwright/package.json'), JSON.stringify({ version: '0.0.1' }));
  assert.throws(() => browserRuntime(root), /not locked/);
  writeFileSync(path.join(directory, 'node_modules/playwright/package.json'), JSON.stringify({ version: '1.64.1' }));
  assert.equal(browserRuntime(root), directory);
});

test('unit-only profile is explicit, discovers both canonical suites and propagates failures', () => {
  const files = unitTestFiles();
  assert.ok(files.some(f => f.startsWith('.agents/checks/tests/')));
  assert.ok(files.some(f => f.startsWith('.agents/skills/create-ds-from-figma/scripts/')));
  assert.ok(files.every(f => f.endsWith('.test.mjs')));
  let args;
  assert.equal(runTests('unit', { log() {}, run(_command, received) { args = received; return { status: 3 }; } }), 3);
  assert.equal(args[0], '--test'); assert.deepEqual(args.filter(arg => !arg.startsWith('--')), files);
  assert.throws(() => runTests('unknown'), /Usage/);
});

test('global summary aggregates structured counts and identifies browser work not run after unit failure', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-test-summary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const group of ['.agents/checks/tests', '.agents/skills/create-ds-from-figma/scripts', '.agents/browser-tests/node_modules/playwright']) mkdirSync(path.join(root, group), { recursive: true });
  writeFileSync(path.join(root, '.agents/browser-tests/package.json'), JSON.stringify({ devDependencies: { playwright: '1.64.1' } }));
  writeFileSync(path.join(root, '.agents/browser-tests/node_modules/playwright/package.json'), JSON.stringify({ version: '1.64.1' }));
  const logs = [];
  const summary = (args, counts, success) => writeFileSync(args.find(a => a.startsWith('--test-reporter-destination=') && a !== '--test-reporter-destination=stdout').split('=').slice(1).join('='), JSON.stringify({ schemaVersion:1, success, counts }));
  let calls = 0;
  const counts = tests => ({tests,passed:tests,failed:0,cancelled:0,skipped:0,todo:0});
  assert.equal(runTests('all', { root, log: line => logs.push(line), run(_command, args) {
    summary(args, counts(calls++ === 0 ? 399 : 4), true); return {status:0};
  } }), 0);
  assert.equal(calls, 2);
  assert.ok(logs.some(l => l.includes('unit=PASS (399 tests); browser=PASS (4 tests)')));
  assert.ok(logs.at(-1).includes('tests=403; passed=403; failed=0'));
  calls = 0; logs.length = 0;
  assert.equal(runTests('all', { root, log: line => logs.push(line), run(_command, args) {
    calls++; summary(args, {...counts(2),passed:1,failed:1}, false); return {status:5};
  } }), 5);
  assert.equal(calls, 1);
  assert.ok(logs.some(l => l.includes('unit=FAILED (2 tests); browser=NOT RUN')));
  assert.ok(logs.at(-1).includes('tests=2; passed=1; failed=1'));
  assert.throws(() => runTests('unit', { root, log() {}, run() { return {status:0}; } }), /structured test summary missing/);
  assert.throws(() => runTests('unit', { root, log() {}, run(_command, args) { summary(args, {tests:-1}, true); return {status:0}; } }), /invalid structured test summary/);
});

test('summary reporter emits only root counts, including nested tests, without parsing TAP text', async () => {
  const counts = {tests:3,passed:3,failed:0,cancelled:0,skipped:0,todo:0};
  const events = [{type:'test:diagnostic',data:{message:'tests 999'}}, {type:'test:summary',data:{file:'a.test.mjs',success:true,counts}}, {type:'test:summary',data:{success:true,counts,duration_ms:12}}];
  const result = [];
  for await (const record of summaryReporter(events)) result.push(JSON.parse(record));
  assert.deepEqual(result, [{schemaVersion:1,success:true,counts,durationMs:12}]);
});
