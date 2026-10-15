import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COMPARATOR_VERSION } from '../lib/render-comparison.mjs';
import { MEASUREMENT_VERSION } from '../lib/measurement-version.mjs';
import { ruleFingerprint } from './fixtures/rule-fingerprint.mjs';

const comparator = [{ file: new URL('../lib/render-comparison.mjs', import.meta.url), names: ['compareRendered', 'renderResultFacts', 'assertConfirmationChecks'] }];
const measurement = [{ file: new URL('../../skills/create-ds-from-figma/scripts/verification-preview.mjs', import.meta.url), names: ['previewModule', 'receiptHandler'] }];
const versions = {
  comparator: {
    'render-comparator-v3': '959a5916de6c1fdf6a2969c3cbfba2215be7c036faacd2c61374448b932d031c', // Historical two-file guard.
    'render-comparator-v4': '33075f234862ba7b5ba7953d234c7dbd093e5945162666374cf1e9b1572c6c1d',
    'render-comparator-v5': '16f31eed4f85d206e538ad3333cb0626bdc816b89b3b8fb3d88d4212190bc27d',
    'render-comparator-v6': 'aa3b2f718c3cff45704f34d3f28fed8de3a7f90d36a1a41eae1a8ed165e6eea1',
    'render-comparator-v7': 'e78dbc15a5661d69eb5c54119be2fe78f2f4b056a167de6daf74f82c15e76d16',
    'render-comparator-v8': 'aeefe61b56dffe983430699dd1a4f1170f29f50cfc63afa6c2af1dda68064583',
    'render-comparator-v9': '69b79945687245e57708bbe451db97bc7533829d554e11a84f80cb0d1600f568',
    'render-comparator-v10': 'd4d005cbe8ab874ffae258d73f9f7db0f4f23536ec4d2d038b69654e93cd160d',
  },
  measurement: { 'measurement-rules-v1': 'c5fc3f91d47851f0db30839789f3dbbf18c3eae6aee8c936342c6a2e93462a99' },
};
const altered = (entries, suffix, before, after) => {
  let changed = false;
  const result = ruleFingerprint(entries, { readSource: file => {
    const source = readFileSync(file, 'utf8');
    if (!file.endsWith(suffix)) return source;
    const next = source.replace(before, after); changed ||= next !== source; return next;
  } });
  assert.ok(changed, `Mutation must exercise ${suffix}`);
  return result.hash;
};

test('comparator and measurement rules have independent versioned dependency-closed fingerprints', () => {
  assert.equal(ruleFingerprint(comparator).hash, versions.comparator[COMPARATOR_VERSION], 'Increment COMPARATOR_VERSION and append its reviewed fingerprint.');
  assert.equal(ruleFingerprint(measurement).hash, versions.measurement[MEASUREMENT_VERSION], 'Increment MEASUREMENT_VERSION and append its reviewed fingerprint.');
});

test('the comparator guard follows requirements, dimension rules and canonicalization but excludes unused validators', () => {
  const result = ruleFingerprint(comparator);
  for (const declaration of ['render-plan.mjs#renderRequirements', 'figma-dimensions.mjs#textDimensionRequirements', 'figma-evidence.mjs#canonicalJson']) assert.ok(result.declarations.some(d => d.endsWith(declaration)), declaration);
  assert.ok(!result.declarations.some(d => d.endsWith('render-plan.mjs#verifyRenderPlan')));
  assert.notEqual(altered(comparator, 'render-plan.mjs', 'fontGroups.has(id)', 'fontGroups.has(id + "changed")'), result.hash);
  assert.notEqual(altered(comparator, 'figma-dimensions.mjs', "let behavior = 'unknown'", "let behavior = 'fixed'"), result.hash);
  assert.notEqual(altered(comparator, 'render-comparison.mjs', 'GEOMETRY_TOLERANCE = 1', 'GEOMETRY_TOLERANCE = 2'), result.hash);
  assert.notEqual(altered(comparator, 'behavior-comparison.mjs', 'delta > tolerance', 'delta >= tolerance'), result.hash);
  assert.equal(altered(comparator, 'render-plan.mjs', 'verification.geometryPolicy must be mapped-layout-v1', 'Unrelated validation wording'), result.hash);
  assert.equal(altered(comparator, 'render-comparison.mjs', "'NOT RUN', 'No browser measurement.'", "'NOT RUN', 'Reworded diagnostic.'"), result.hash);
});

test('conversion rule edits affect only the measurement producer guard, not comparator validity', () => {
  const original = ruleFingerprint(measurement);
  assert.ok(original.declarations.some(d => d.endsWith('render-values.mjs#renderedExpectation')));
  assert.ok(!ruleFingerprint(comparator).declarations.some(d => d.includes('render-values.mjs')));
  assert.notEqual(altered(measurement, 'render-values.mjs', 'fontSize * value.value / 100', 'fontSize * value.value / 200'), original.hash);
  assert.notEqual(altered(measurement, 'verification-preview.mjs', 'axisAligned = true', 'axisAligned = false'), original.hash);
});

test('new named helpers join the guard automatically; unsupported dynamic rule imports fail closed', () => {
  const fingerprint = change => ruleFingerprint(comparator, { readSource: file => {
    const source = readFileSync(file, 'utf8');
    if (!file.endsWith('render-plan.mjs')) return source;
    return source.replace('fontGroups.has(id)', 'newRule(fontGroups, id)') + `\nfunction newRule(groups, id) { return groups.has(${change ? 'id + "changed"' : 'id'}); }\n`;
  } });
  const first = fingerprint(false), second = fingerprint(true);
  assert.ok(first.declarations.some(d => d.endsWith('render-plan.mjs#newRule')));
  assert.notEqual(first.hash, second.hash);
  assert.throws(() => ruleFingerprint(comparator, { readSource: file => {
    const source = readFileSync(file, 'utf8');
    return file.endsWith('behavior-comparison.mjs') ? source.replace('const expectations =', 'void import("./new-rule.mjs"); const expectations =') : source;
  } }), /Dynamic rule import needs an explicit boundary/);
});

test('documentation never pins a comparator version other than the current one', () => {
  const root = new URL('../../../', import.meta.url);
  const files = [new URL('README.md', root), ...readdirSync(new URL('.agents/', root), { recursive: true }).filter(f => f.endsWith('.md')).map(f => new URL(`.agents/${f}`, root))];
  const stale = files.flatMap(file => [...readFileSync(file, 'utf8').matchAll(/render-comparator-v\d+/g)].filter(m => m[0] !== COMPARATOR_VERSION).map(() => file.pathname));
  assert.deepEqual(stale, [], 'Use the constant name instead of a version number, or update the document with the version bump.');
});
