import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const groups = ['.agents/skills/create-ds-from-figma/scripts', '.agents/checks/tests'];

export function unitTestFiles(root = repoRoot) {
  return groups.flatMap(group => readdirSync(path.join(root, group)).filter(file => file.endsWith('.test.mjs')).sort().map(file => `${group}/${file}`));
}

export function browserRuntime(root = repoRoot) {
  const directory = path.join(root, '.agents/browser-tests');
  const expected = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).devDependencies;
  for (const [name, version] of Object.entries(expected)) {
    const file = path.join(directory, 'node_modules', name, 'package.json');
    if (!existsSync(file) || JSON.parse(readFileSync(file, 'utf8')).version !== version) throw new Error(`Browser runtime missing or not locked: ${name}@${version}. Run npm run test:browser:setup. No browser test was skipped.`);
  }
  return directory;
}

export function runTests(mode, { root = repoRoot, run = spawnSync, log = console.log } = {}) {
  if (!['unit', 'browser', 'all'].includes(mode)) throw new Error('Usage: test-kit.mjs unit | browser | all');
  const suites = { unit: { status: mode === 'browser' ? 'NOT REQUESTED' : 'NOT RUN' }, browser: { status: mode === 'unit' ? 'NOT REQUESTED' : 'NOT RUN' } };
  const keys = ['tests', 'passed', 'failed', 'cancelled', 'skipped', 'todo'];
  const invoke = (name, files) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'kit-summary-'));
    const summaryFile = path.join(directory, 'summary.json');
    suites[name].status = 'FAILED';
    try {
      const reporter = fileURLToPath(new URL('./test-summary-reporter.mjs', import.meta.url));
      const result = run(process.execPath, ['--test', '--test-reporter=tap', '--test-reporter-destination=stdout', `--test-reporter=${reporter}`, `--test-reporter-destination=${summaryFile}`, ...files], { cwd: root, stdio: 'inherit', env: process.env });
      if (result.error) throw result.error;
      const status = result.status ?? 1;
      if (!existsSync(summaryFile)) {
        if (status !== 0) return status;
        throw new Error(`${name}: structured test summary missing; cannot report a complete test run`);
      }
      const summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
      if (summary.schemaVersion !== 1 || typeof summary.success !== 'boolean' || keys.some(key => !Number.isSafeInteger(summary.counts?.[key]) || summary.counts[key] < 0)) throw new Error(`${name}: invalid structured test summary`);
      suites[name].counts = summary.counts;
      const exitCode = status || (summary.success ? 0 : 1);
      suites[name].status = exitCode === 0 ? 'PASS' : 'FAILED';
      return exitCode;
    } finally { rmSync(directory, { recursive: true, force: true }); }
  };
  try {
    // Fail before a lengthy unit run if the requested real-browser profile cannot run.
    if (mode !== 'unit') browserRuntime(root);
    if (mode !== 'browser') {
      log('UNIT: static contracts and simulated environments (not browser fidelity).');
      const status = invoke('unit', unitTestFiles(root));
      if (status !== 0) return status;
    }
    if (mode !== 'unit') {
      log('BROWSER: required real Chromium regressions; missing runtime/binary is an error.');
      return invoke('browser', ['.agents/browser-tests/verification.e2e.mjs']);
    }
    return 0;
  } finally {
    log(`KIT SUMMARY (${mode}): ${Object.entries(suites).map(([name, suite]) => `${name}=${suite.status}${suite.counts ? ` (${suite.counts.tests} tests)` : ''}`).join('; ')}`);
    const reported = Object.values(suites).filter(s => s.counts);
    const unavailable = Object.entries(suites).filter(([, s]) => s.status === 'FAILED' && !s.counts).map(([name]) => name);
    log(`TOTAL REPORTED: ${keys.map(key => `${key}=${reported.reduce((sum, suite) => sum + suite.counts[key], 0)}`).join('; ')}${unavailable.length ? `; counts unavailable for ${unavailable.join(', ')}` : ''}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runTests(process.argv[2] || 'all'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
