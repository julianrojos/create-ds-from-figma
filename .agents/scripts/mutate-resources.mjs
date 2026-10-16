import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const register = '.agents/skills/create-ds-from-figma/scripts/verification-resources.mjs';
const diagnostic = '.agents/checks/lib/resource-diagnostics.mjs';
const fonts = '.agents/checks/lib/font-configuration.mjs';
const dependencies = '.agents/checks/lib/local-dependencies.mjs';
const gate = '.agents/checks/verify-imports.mjs';
const cssResolution = '.agents/checks/lib/css-import-resolution.mjs';
const tests = ['.agents/checks/tests/verification-resources.test.mjs', '.agents/checks/tests/font-configuration.test.mjs', '.agents/checks/tests/css-import-resolution.test.mjs'];
const mutants = [
  [register, 'unknown-font', "if (!requirements.fonts.some(font => font.id === identity))", 'if (false)'],
  [register, 'missing-image-occurrence', "if (selected.length !== expected.length || new Set(selected.map(asset => `${asset.observation}:${asset.index}`)).size !== expected.length || selected.some(asset => asset.imageHash !== identity || !keys.has(`${asset.observation}:${asset.index}`)))", 'if (false)'],
  [register, 'silent-replacement', 'if (!replace && selected.some', 'if (false && !replace && selected.some'],
  [register, 'first-image-only', 'for (const record of selected) record.source', 'for (const record of selected.slice(0, 1)) record.source'],
  [register, 'wrong-source-hash', 'sha256: sha256(sourceBytes)', "sha256: '0'.repeat(64)"],
  [register, 'unrelated-metadata-write', 'const diagnostic = describeResourceMetadata', "next.description = 'Unauthorized mutation'; const diagnostic = describeResourceMetadata"],
  [diagnostic, 'ignore-snapshot-hash', 'if (metadata.evidence.hash !== snapshot.hash)', 'if (false)'],
  [diagnostic, 'ignore-registered-bytes', 'if (sha256(readFileSync(projectFile(root, record.source.path))) !== record.source.sha256)', 'if (false)'],
  [diagnostic, 'invent-essentiality', "essentiality: 'UNCLASSIFIED'", "essentiality: 'ESSENTIAL'"],
  [diagnostic, 'invent-image-identity', "const needsCapture = resource.kind === 'image' && !hasImageIdentity(resource);", 'const needsCapture = false;'],
  [diagnostic, 'omit-font-action', '...fonts.map(font =>', '...[].map(font =>'],
  [fonts, 'ignore-font-file', 'face.sources.includes(source) && ', ''],
  [fonts, 'ignore-font-weight', 'face.weight[0] <= expected && face.weight[1] >= expected', 'true'],
  [fonts, 'credit-conditional-rule', "if (rule.parent.type !== 'root')", 'if (false)'],
  [cssResolution, 'credit-css-string-query', "return specifier.includes('?') ?", 'return false ?'],
  [dependencies, 'credit-type-only-import', 'runtimeOnly && (node.isTypeOnly || node.importClause?.isTypeOnly || onlyNamedTypes)', 'false && (node.isTypeOnly || node.importClause?.isTypeOnly || onlyNamedTypes)'],
  [dependencies, 'warn-css-for-remote-assets', " && ['module', 'css-import', 'dynamic'].includes(kind)", ''],
  [diagnostic, 'lose-action-targets', 'const { targets, ...facts } = action, key = canonicalJson(facts);', 'const { targets, ...facts } = action, key = canonicalJson(action);'],
  [diagnostic, 'accept-resource-weight-range', 'if (metadata.verification.fonts.some(font => concreteFontWeight(font.css?.weight) === null))', 'if (false)'],
  [gate, 'omit-global-font-warnings', '...component.fontConfiguration.warnings.map', '...[].map'],
  [cssResolution, 'use-require-export-condition', '{ unsafe: true, conditions }', "{ unsafe: true, conditions: ['require'] }"],
  [cssResolution, 'guess-conditional-css-target', 'new Set(candidates).size !== 1', 'false'],
  [dependencies, 'credit-worker-query', 'if (stylesheetDiscovery && cssImportProblem(specifier))', 'if (false)'],
  [fonts, 'credit-queried-css-import', 'if (problem) throw new Error(problem);', 'if (false) throw new Error(problem);'],
];
const directory = mkdtempSync(path.join(os.tmpdir(), 'ds-resource-mutations-'));
const report = { scope: 'Targeted resource mutations, not exhaustive mutation coverage or real Figma fidelity.', baseline: null, mutants: [] };
const run = () => spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: directory, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
try {
  // Mechanical mutations run in a disposable copy, never against the active checkout.
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
      if (syntax.status !== 0) throw new Error(`Invalid mutation syntax: ${id}: ${syntax.stderr}`);
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
  writeFileSync(path.join(root, 'test-results/resource-mutations.json'), JSON.stringify(report, null, 2) + '\n');
}
