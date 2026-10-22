import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadSuite, blindPrompts, scoreRouting } from '../../scripts/evaluate-routing.mjs';

const suite = loadSuite();
function syntheticRun() {
  return { schemaVersion: 1, executor: 'synthetic scorer unit test; not an agent evaluation', model: 'none', createdAt: '2026-10-22T12:00:00.000Z', catalogHashVersion: suite.catalogHashVersion, catalogHash: suite.catalogHash, suiteHash: suite.suiteHash,
    observations: suite.cases.map(c => ({ id: c.id, primary: c.expectedPrimary, reason: 'Synthetic scorer fixture' })) };
}
test('four skills have disjoint test identities and blind prompts do not expose answer labels', () => {
  assert.equal(suite.catalog.length, 4);
  assert.equal(suite.cases.length, 24);
  const blind = blindPrompts(suite);
  assert.ok(blind.cases.every(c => Object.keys(c).sort().join() === 'context,id,prompt'));
  assert.ok(!JSON.stringify(blind).includes('expectedPrimary'));
  assert.ok(!JSON.stringify(blind).includes('forbiddenActions'));
});
test('scorer detects misrouting instead of just checking fixture structure', () => {
  const run = syntheticRun();
  assert.equal(scoreRouting(suite, run).passed, 24);
  run.observations[0].primary = 'none';
  const result = scoreRouting(suite, run);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.passed, 23);
});
test('scorer rejects stale, partial, duplicate, fabricated IDs and missing provenance', () => {
  for (const mutate of [r => { r.catalogHash = 'old'; }, r => { r.suiteHash = 'old'; }, r => { r.observations.pop(); }, r => { r.observations[0] = r.observations[1]; }, r => { r.observations[0].id = 'unknown'; }, r => { delete r.executor; }, r => { r.observations[0].reason = ''; }]) {
    const run = syntheticRun(); mutate(run);
    assert.throws(() => scoreRouting(suite, run));
  }
});

test('a perfect selection run remains a smoke test, including when model provenance is unavailable', () => {
  const run = syntheticRun(); run.model = 'unreported';
  const result = scoreRouting(suite, run);
  assert.equal(result.status, 'PASS');
  assert.equal(result.evidenceLevel, 'smoke-selection');
  assert.equal(result.modelRecorded, false);
  assert.equal(result.runtimeDiscovery, 'NOT RUN');
});

test('catalog identity covers exactly the metadata shown to the evaluator', () => {
  assert.equal(suite.catalogHash, createHash('sha256').update(JSON.stringify(blindPrompts(suite).catalog)).digest('hex'));
  const directory = mkdtempSync(path.join(tmpdir(), 'routing-hash-'));
  const original = fileURLToPath(new URL('../../..', import.meta.url));
  try {
    for (const { name } of suite.catalog) {
      const target = path.join(directory, '.agents/skills', name);
      mkdirSync(path.join(target, 'evals'), { recursive: true });
      for (const file of ['SKILL.md', 'evals/routing.json']) writeFileSync(path.join(target, file), readFileSync(path.join(original, '.agents/skills', name, file)));
    }
    const skill = path.join(directory, '.agents/skills', suite.catalog[0].name, 'SKILL.md');
    writeFileSync(skill, readFileSync(skill, 'utf8') + '\nBody-only clarification.\n');
    const changed = loadSuite(directory);
    assert.equal(changed.catalogHash, suite.catalogHash);
    assert.equal(scoreRouting(changed, syntheticRun()).status, 'PASS');
    writeFileSync(skill, readFileSync(skill, 'utf8').replace(/description:[\s\S]*?\n---/, 'description: "Changed metadata."\n---'));
    assert.notEqual(loadSuite(directory).catalogHash, suite.catalogHash);
    assert.throws(() => scoreRouting(loadSuite(directory), syntheticRun()), /stale/);
    const legacy = syntheticRun(); delete legacy.catalogHashVersion;
    assert.throws(() => scoreRouting(suite, legacy), /historical/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
