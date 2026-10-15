import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createPreviewProject } from '../../../checks/tests/fixtures/preview-project.mjs';
import { runBrowserVerification, calibrateTypography, browserVerificationExitCode, inspectRunReservation } from './verification-browser.mjs';

test('optional browser adapter needs an explicit module and calibration needs explicit font files', async () => {
  await assert.rejects(runBrowserVerification('.', 'missing.json'), /explicitly supplied/);
  await assert.rejects(calibrateTypography('.', 'missing.json', []), /explicit font descriptors/);
});

test('static evidence and plan failures produce a persisted closure before starting a browser', async t => {
  for (const failure of ['evidence', 'plan']) await t.test(failure, async t => {
    const { root, metadataPath } = createPreviewProject();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const file = path.join(root, metadataPath), metadata = JSON.parse(readFileSync(file));
    if (failure === 'evidence') metadata.evidence.hash = '0'.repeat(64);
    else metadata.verification.geometryPolicy = 'invalid-policy';
    writeFileSync(file, JSON.stringify(metadata));
    let launched = false;
    const directory = path.join(root, 'browser-output');
    const result = await runBrowserVerification(root, metadataPath, { directory, playwright: { chromium: { launch() { launched = true; throw new Error('Must not launch'); } } } });
    assert.equal(launched, false);
    assert.equal(result.execution.phase, 'static-validation');
    assert.equal(result.execution.status, 'NOT RUN');
    assert.equal(result.closure.state, 'failed');
    assert.equal(result.closure.complete, false);
    assert.ok(result.closure.failures.length);
    assert.equal(result.closure.pending.filter(p => p.reason === 'Published measurement missing').length, metadata.verification.cases.length);
    assert.equal(browserVerificationExitCode(result), 1);
    assert.deepEqual(JSON.parse(readFileSync(path.join(directory, 'result.json'))), result);
    assert.deepEqual(JSON.parse(readFileSync(path.join(directory, 'manifest.json'))), { schemaVersion: 1, cases: [] });
    assert.ok(!readdirSync(directory).includes('.verification-run.lock'));
    await assert.rejects(runBrowserVerification(root, metadataPath, { directory, playwright: { chromium: {} } }), /must be empty/);
  });
});

test('occupied or reserved output directories fail before metadata or browser work and preserve existing bytes', async t => {
  const { root } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'output'); mkdirSync(directory);
  const file = path.join(directory, 'manifest.json'); writeFileSync(file, 'keep original');
  const options = { directory, playwright: { chromium: { launch() { assert.fail('Browser must not start'); } } } };
  await assert.rejects(runBrowserVerification(root, 'missing.json', options), /must be empty/);
  assert.equal(readFileSync(file, 'utf8'), 'keep original');
  assert.deepEqual(readdirSync(directory), ['manifest.json']);
  rmSync(file);
  const lock = path.join(directory, '.verification-run.lock'); writeFileSync(lock, 'another run');
  await assert.rejects(runBrowserVerification(root, 'missing.json', options), /Cannot reserve browser output directory/);
  assert.equal(readFileSync(lock, 'utf8'), 'another run');
});

test('CLI emits structured static failure with exit 1 rather than a generic NOT RUN exit 2', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, metadataPath), metadata = JSON.parse(readFileSync(file));
  metadata.evidence.hash = '0'.repeat(64); writeFileSync(file, JSON.stringify(metadata));
  const module = path.join(root, 'browser.mjs');
  writeFileSync(module, 'export const chromium={launch(){throw new Error("Must not launch")}};');
  const cli = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/verification-browser.mjs', root, metadataPath, module], { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr);
  const result = JSON.parse(cli.stdout);
  t.after(() => rmSync(result.directory, { recursive: true, force: true }));
  assert.equal(result.closure.state, 'failed');
  assert.equal(result.execution.phase, 'static-validation');
});

test('reservation inspection is read-only and never treats a PID as proof that reclaiming is safe', t => {
  const { root } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'output'); mkdirSync(directory);
  const lock = path.join(directory, '.verification-run.lock');
  const owner = { schemaVersion:1, pid:process.pid, hostname:os.hostname(), startedAt:new Date().toISOString() };
  writeFileSync(lock, JSON.stringify(owner));
  const bytes = readFileSync(lock);
  const current = inspectRunReservation(directory);
  assert.equal(current.status, 'pid-present-identity-unverified');
  assert.deepEqual(current.owner, owner);
  assert.match(current.recovery, /different empty output directory/);
  assert.deepEqual(readFileSync(lock), bytes);
  writeFileSync(lock, JSON.stringify({...owner,hostname:owner.hostname+'-other-host'}));
  assert.equal(inspectRunReservation(directory).status, 'other-host-unverified');
  writeFileSync(lock, 'unrecognized');
  assert.equal(inspectRunReservation(directory).status, 'unrecognized-lock');
  assert.equal(readFileSync(lock,'utf8'), 'unrecognized');
  assert.equal(inspectRunReservation(path.join(root, 'missing')).status, 'missing');
  assert.ok(!readdirSync(root).includes('missing'));
});

test('a terminated process leaves a diagnosed reservation; recovery uses a fresh directory without deleting evidence', async t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'abandoned'); mkdirSync(directory);
  const lock = path.join(directory, '.verification-run.lock');
  const child = spawnSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1],JSON.stringify({schemaVersion:1,pid:process.pid,hostname:require("node:os").hostname(),startedAt:new Date().toISOString()}));process.exit(17);', lock], {encoding:'utf8'});
  assert.equal(child.status, 17, child.stderr);
  const bytes = readFileSync(lock);
  const inspection = inspectRunReservation(directory);
  assert.ok(['pid-not-visible','pid-present-identity-unverified'].includes(inspection.status));
  const options = {directory,playwright:{chromium:{}}};
  await assert.rejects(runBrowserVerification(root, metadataPath, options), error => error.code === 'DS_OUTPUT_RESERVED' && error.message.includes('Never reclaim') && Boolean(error.reservation));
  assert.deepEqual(readFileSync(lock), bytes);
  const cli = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/verification-browser.mjs','inspect-lock',directory], {encoding:'utf8'});
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).sha256, inspection.sha256);
  const metadataFile = path.join(root,metadataPath), metadata = JSON.parse(readFileSync(metadataFile));
  metadata.evidence.hash = '0'.repeat(64); writeFileSync(metadataFile,JSON.stringify(metadata));
  const recovered = await runBrowserVerification(root, metadataPath, {...options,directory:path.join(root,'fresh-output')});
  assert.equal(recovered.execution.phase, 'static-validation');
  assert.ok(readdirSync(recovered.directory).includes('result.json'));
  assert.deepEqual(readFileSync(lock), bytes);
});
