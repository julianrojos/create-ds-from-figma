import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function runMutations({ root, name, scope, tests, mutants }) {
  const directory = mkdtempSync(path.join(os.tmpdir(), `ds-${name}-mutations-`));
  const report = { scope, baseline: null, mutants: [] };
  const run = () => spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: directory, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  try {
    cpSync(path.join(root, '.agents'), path.join(directory, '.agents'), { recursive: true, filter: source => !source.split(path.sep).includes('browser-tests') });
    cpSync(path.join(root, 'package.json'), path.join(directory, 'package.json'));
    symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'));
    const baseline = run();
    if (baseline.error || baseline.status !== 0) throw new Error(`Mutation baseline failed: ${baseline.error?.message || baseline.stdout + baseline.stderr}`);
    report.baseline = 'PASS';
    for (const [relative, id, before, after] of mutants) {
      const file = path.join(directory, relative), original = readFileSync(file, 'utf8');
      if (original.split(before).length !== 2) throw new Error(`Mutation anchor must occur once: ${id}`);
      writeFileSync(file, original.replace(before, after));
      try {
        const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        if (syntax.error || syntax.status !== 0) throw new Error(`Invalid mutation syntax: ${id}: ${syntax.error?.message || syntax.stderr}`);
        const result = run();
        if (result.error || ![0, 1].includes(result.status) || result.status === 1 && !result.stdout.includes("code: 'ERR_ASSERTION'")) throw new Error(`Mutation infrastructure/non-assertion failure: ${id}: ${result.error?.message || result.stdout + result.stderr}`);
        const status = result.status === 1 ? 'KILLED' : 'SURVIVED';
        report.mutants.push({ id, file: relative, status });
        console.log(`${status}: ${id}`);
      } finally { writeFileSync(file, original); }
    }
    const survivors = report.mutants.filter(m => m.status === 'SURVIVED');
    report.summary = { total: report.mutants.length, killed: report.mutants.length - survivors.length, survived: survivors.length };
    console.log(JSON.stringify(report.summary));
    if (survivors.length) process.exitCode = 1;
  } catch (error) { report.error = error.message; console.error(error.message); process.exitCode = 1; }
  finally {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    writeFileSync(path.join(root, 'test-results', `${name}-mutations.json`), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
