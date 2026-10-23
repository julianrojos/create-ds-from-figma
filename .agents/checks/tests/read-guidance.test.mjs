import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sectionRange, readGuidance, checkReadingPlan, diagnosticReadingFeatures } from '../../scripts/read-guidance.mjs';

test('section selection ignores headings inside fenced examples and bounds descendants explicitly', () => {
  const text = '# Top\n\n## Core\nalpha\n```md\n## Fake\n```\n### Child\nbeta\n## Next\ngamma\n';
  const own = sectionRange(text, 'Core');
  assert.equal(text.slice(own.start, own.end), '## Core\nalpha\n```md\n## Fake\n```\n');
  const full = sectionRange(text, 'Core', true);
  assert.ok(text.slice(full.start, full.end).includes('beta'));
  assert.ok(!text.slice(full.start, full.end).includes('gamma'));
  assert.throws(() => sectionRange(text, 'Fake'), /Missing/);
  assert.throws(() => sectionRange('## Same\na\n## Same\nb', 'Same'), /ambiguous/);
});

test('every conditional reading pointer resolves; unknown phases/features fail without full-file fallback', () => {
  assert.equal(checkReadingPlan().status, 'PASS');
  assert.throws(() => readGuidance(['unknown']), /Unknown phase/);
  assert.throws(() => readGuidance(['import-code'], ['invented']), /Unknown feature/);
});

test('simple intake omits metadata/transport bulk and code-only branches are explicit', () => {
  const intake = readGuidance(['import-intake']);
  assert.ok(intake.excerpts.length);
  assert.ok(!intake.excerpts.some(e => e.file.endsWith('component-metadata.md')));
  assert.ok(intake.stats.selectedBytes < intake.stats.wholeReferencedFilesBytes);
  const ordinary = readGuidance(['import-code']);
  assert.ok(!ordinary.sections.some(s => s.section === 'Estados Nativos Configurados'));
  const native = readGuidance(['import-code'], ['native-states']);
  assert.ok(native.sections.some(s => s.section === 'Estados Nativos Configurados'));
  assert.ok(native.stats.selectedBytes > ordinary.stats.selectedBytes);
});

test('shared and overlapping guidance is emitted once across phases', () => {
  const one = readGuidance(['import-code'], ['delegation']);
  const twice = readGuidance(['import-code', 'import-code'], ['delegation']);
  assert.equal(twice.stats.selectedBytes, one.stats.selectedBytes);
  assert.equal(twice.sourceHash, one.sourceHash);
  assert.deepEqual(twice.excerpts, one.excerpts);
});

function fixture(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'reading-coverage-'));
  const file = '.agents/skills/example/references/contract.md';
  const plan = { schemaVersion: 2, phases: { read: { sections: [{ file, section: 'Core' }] } }, scenarios: { one: { phases: ['read'], features: [] } }, exclusions: [] };
  mkdirSync(path.join(root, '.agents/skills/example/references'), { recursive: true });
  const save = (text = '# Core\nRequired contract.\n') => {
    writeFileSync(path.join(root, file), text);
    writeFileSync(path.join(root, '.agents/reading-plan.json'), JSON.stringify(plan));
  };
  try { save(); fn({ root, file, plan, save }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test('coverage catches new headings, preambles and entirely unreferenced files', () => fixture(({ root, save }) => {
  assert.equal(checkReadingPlan(root).selectedSections, 1);
  save('# Core\nRequired contract.\n## Forgotten\nNew obligation.\n');
  assert.throws(() => checkReadingPlan(root), /Unaccounted.*Forgotten/);
  save('Forgotten preamble.\n# Core\nRequired contract.\n');
  assert.throws(() => checkReadingPlan(root), /Unaccounted.*preamble/);
  save();
  writeFileSync(path.join(root, '.agents/skills/example/references/new.md'), '# New\nNew obligation.\n');
  assert.throws(() => checkReadingPlan(root), /Unaccounted.*new.md/);
}));

test('exclusions require reasons, remain disjoint/current and cannot hide content as navigation', () => fixture(({ root, file, plan, save }) => {
  const text = '# Core\nRequired contract.\n## Navigation\n';
  plan.exclusions = [{ file, section: 'Navigation', kind: 'navigation', reason: 'Children are separately selected.' }];
  save(text); assert.equal(checkReadingPlan(root).excludedSections, 1);
  plan.exclusions[0].reason = ''; save(text);
  assert.throws(() => checkReadingPlan(root), /Missing exclusion reason/);
  plan.exclusions[0].reason = 'Children separately selected'; save(text + 'A new obligation.\n');
  assert.throws(() => checkReadingPlan(root), /Navigation exclusion contains content/);
  save(); assert.throws(() => checkReadingPlan(root), /Unused exclusion/);
  plan.exclusions[0].section = 'Core'; save();
  assert.throws(() => checkReadingPlan(root), /Selected and excluded/);
}));

test('content cannot be exempted as duplicate or out of scope even with a selected replacement', () => fixture(({ root, file, plan, save }) => {
  const text = '# Core\nContract.\n## Duplicate\nRepeated contract.\n';
  for (const kind of ['duplicate', 'out-of-scope']) {
    plan.exclusions = [{ file, section: 'Duplicate', kind, reason: 'Reviewed repeated contract.', replacements: [{ file, section: 'Core' }] }];
    save(text);
    assert.throws(() => checkReadingPlan(root), /Invalid exclusion kind/);
  }
}));

test('pre-code guidance includes API decisions and applicable delegation treatments', () => {
  const ordinary = readGuidance(['import-code']);
  const delegated = readGuidance(['import-code'], ['delegation']);
  const text = ordinary.excerpts.map(e => e.text).join('\n');
  assert.ok(text.includes('decisions contiene'));
  assert.ok(text.includes('translations contiene'));
  assert.ok(!text.includes('DECLARE_DELEGATION_TREATMENT'));
  const full = delegated.excerpts.map(e => e.text).join('\n');
  assert.ok(full.includes('DECLARE_DELEGATION_TREATMENT'));
  assert.ok(full.includes('IMPLEMENT_DELEGATION_DIFFERENCE'));
});

test('disabled conditional files do not inflate the full-file comparison baseline', () => fixture(({ root, file, plan, save }) => {
  const optional = '.agents/skills/example/references/optional.md';
  plan.phases.read.sections.push({ file: optional, section: 'Optional', when: ['optional'] });
  writeFileSync(path.join(root, optional), '# Optional\nA distinct optional contract.\n');
  const text = '# Core\nRequired contract.\n'; save(text);
  const minimum = readGuidance(['read'], [], { root, plan });
  const expanded = readGuidance(['read'], ['optional'], { root, plan });
  assert.equal(minimum.stats.wholeReferencedFilesBytes, Buffer.byteLength(text));
  assert.ok(expanded.stats.wholeReferencedFilesBytes > minimum.stats.wholeReferencedFilesBytes);
}));

test('composition documentation is selected from actual post-diagnosis signals', () => {
  const result = { status: 'NOT VERIFIED', complete: false, errors: [], nextActions: [], diagnosis: { mode: 'diagnostic', diagnostics: { compositionSummary: { PASS: 0, FAIL: 0, 'NOT RUN': 0, 'NOT COMPARABLE': 0 }, cases: [] } } };
  assert.deepEqual(diagnosticReadingFeatures(result), []);
  for (const key of ['PASS', 'FAIL', 'NOT RUN', 'NOT COMPARABLE']) {
    const actual = structuredClone(result); actual.diagnosis.diagnostics.compositionSummary[key] = 1;
    const flags = diagnosticReadingFeatures(actual);
    assert.deepEqual(flags, ['composition']);
    const selected = readGuidance(['import-diagnose-results'], flags);
    assert.ok(selected.sections.some(s => s.section === 'Diagnóstico experimental de composición'));
  }
  const retry = structuredClone(result); retry.nextActions.push({ code: 'RETRY_COMPOSITION_DIAGNOSTICS' });
  assert.deepEqual(diagnosticReadingFeatures(retry), ['composition']);
  const collected = structuredClone(result); collected.diagnosis.diagnostics.cases.push({ composition: { checks: [] } });
  assert.deepEqual(diagnosticReadingFeatures(collected), ['composition']);
  assert.ok(!readGuidance(['import-diagnose']).sections.some(s => s.section === 'Diagnóstico experimental de composición'));
});

test('post-diagnosis selector rejects publication or malformed results without silently omitting contracts', () => {
  assert.throws(() => diagnosticReadingFeatures({ status: 'PASS', complete: true }), /Expected/);
  assert.throws(() => diagnosticReadingFeatures({ status: 'NOT VERIFIED', complete: false, errors: [], nextActions: [] }), /missing/);
  assert.deepEqual(diagnosticReadingFeatures({ status: 'FAIL', complete: false, errors: ['preflight'], nextActions: [] }), []);
});

test('code phase selects typography and external bindings only from established observations',()=>{
 const base=readGuidance(['import-code']),text=readGuidance(['import-code'],['text']),remote=readGuidance(['import-code'],['external-bindings']);
 const titles=r=>r.sections.map(s=>s.section);
 for(const title of ['Literales tipográficos','Registro de fuentes del plan','Cobertura tipográfica del plan','Casos de contenido alternativo','CSS intrínseco al materializar']) {assert.ok(!titles(base).includes(title));assert.ok(titles(text).includes(title));}
 assert.ok(!titles(base).includes('Bindings externos'));assert.ok(titles(remote).includes('Bindings externos'));
 for(const title of ['Archivos y carga del plan','Configuración de casos','Cobertura De Nodos','Literales medidos']) assert.ok(titles(base).includes(title));
 assert.ok(titles(readGuidance(['import-code'],['resources'])).includes('Registro de imágenes del plan'));
 const api=titles(readGuidance(['import-api']));assert.ok(!api.includes('Verificación Y Comparación'));
 assert.ok(titles(readGuidance(['import-capture'])).includes('Verificación Y Comparación'));
 assert.ok(titles(readGuidance(['import-diagnose'])).includes('Interpretar el informe de bindings'));
});
