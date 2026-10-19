import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COMPARATOR_VERSION } from '../lib/render-comparison.mjs';
import { MEASUREMENT_VERSION } from '../lib/measurement-version.mjs';
import { ruleFingerprint } from './fixtures/rule-fingerprint.mjs';

const comparator = [{ file: new URL('../lib/render-comparison.mjs', import.meta.url), names: ['compareRendered', 'renderResultFacts', 'assertConfirmationChecks'] },
  { file: new URL('../lib/css-diagnostics.mjs', import.meta.url), names: ['collectCssDiagnostics', 'compareCssDiagnostics'] },
  { file: new URL('../lib/comparison-evidence.mjs', import.meta.url), names: ['caseInputs'] }];
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
    'render-comparator-v11': '7bdcf67976318c8fe0bcf6f5a77ed412284a1d7154527c12222b9900c34ff705',
    'render-comparator-v12': 'cd6f0b2d07128af54d3c44dae8c4b189cc7637d73f9eea820c0d39e791a9e44c',
    'render-comparator-v13': '6cf8fddf3dcb98689a562975e5b5ea21bf98d430512db62005f9baa1b6906320',
    'render-comparator-v14': 'ff34abf5e0d5d822cb37bf1254f58c00327d3acbca44c719db0c5fd39e339369',
    'render-comparator-v15': 'b9abb88fa8be5834bb17969f724d076c713d836a7272141e43537502684373a0',
    'render-comparator-v16': 'b37715259fd0ce14e9c4c7d3fd2f13d457aa1d42f77fe18638462a9398d462cf',
    'render-comparator-v17': '0673c45f540d7409cd59e5447483ab185c43c42167b73b6b58876af953eab8b5',
    'render-comparator-v18': '387e1be5de325964b46ff83a0e25bba96c4f1ea075ac6a855ffca1962ca04186',
    'render-comparator-v19': '751d8dbb7d6e66c622344315b09310471632c63d06014ff603a389f4e26595e9',
    'render-comparator-v20': '801d6d7be9246c9194dd126f74823d80d133f1c7770af3f2f3dbb5d1ef35cdab',
  },
  measurement: {
    'measurement-rules-v1': 'c5fc3f91d47851f0db30839789f3dbbf18c3eae6aee8c936342c6a2e93462a99',
    'measurement-rules-v2': '1b1e90895e055e8b3b7e167b16c8f98708b56517281e8d0d8490b60be562b005',
    'measurement-rules-v3': 'ac90008c34389942824dc88fbfae4e53bb8e6917e05aa3b6441067dd6f431517',
    'measurement-rules-v4': 'fd2f922ee2e2e606ef21276e177b7f599178b05330b23a4a86a8d9b33a83f9e4',
  },
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
  assert.ok(result.declarations.some(d => d.endsWith('delegation-differences.mjs#delegationChecks')));
  assert.ok(result.declarations.some(d => d.endsWith('verify-figma-evidence.mjs#mappedComponentsOf')));
  assert.notEqual(altered(comparator, 'delegation-differences.mjs', "record.treatment?.treatment === 'implemented' ? 'NOT COMPARABLE'", "record.treatment?.treatment === 'implemented' ? 'PASS'"), result.hash);
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

test('documentation never pins comparator or measurement rules other than the current versions', () => {
  const root = new URL('../../../', import.meta.url);
  const files = [new URL('README.md', root), ...readdirSync(new URL('.agents/', root), { recursive: true }).filter(f => f.endsWith('.md')).map(f => new URL(`.agents/${f}`, root))];
  const stale = files.flatMap(file => [...readFileSync(file, 'utf8').matchAll(/(?:render-comparator|measurement-rules)-v\d+/g)].filter(m => ![COMPARATOR_VERSION, MEASUREMENT_VERSION].includes(m[0])).map(() => file.pathname));
  assert.deepEqual(stale, [], 'Use the constant name instead of a version number, or update the document with the version bump.');
});
