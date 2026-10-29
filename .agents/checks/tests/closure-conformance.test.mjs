import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { componentClosure, cssTokenClosure, closureConformance, staleSummary } from '../lib/closure-conformance.mjs';
import { parseClosureArgs, parseImportArgs } from '../verify-closure.mjs';
import { verifyImports } from '../verify-imports.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'closure-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
  return { root, write };
}
test('empty project success explicitly has no implementation coverage; nonempty fixtures are counted', async t=> {
  const {root}=fixture(t), empty=closureConformance(root);
  assert.equal(empty.status,'PASS'); assert.equal(empty.coverage.status,'NOT APPLICABLE');
  assert.equal(empty.coverage.registeredComponents,0); assert.equal(empty.coverage.cssReferences,0);
  assert.equal((await verifyImports(root)).projectCoverage.status,'NOT APPLICABLE');
  const populated=createPreviewProject(); t.after(()=>rmSync(populated.root,{recursive:true,force:true}));
  const report=closureConformance(populated.root);
  assert.equal(report.status,'PASS'); assert.equal(report.coverage.status,'ASSESSED'); assert.equal(report.coverage.registeredComponents,1);
});
test('closure detects unregistered code and records without implementations in both directions', t => {
  const {root, write} = fixture(t);
  assert.equal(closureConformance(root).status, 'PASS');
  mkdirSync(path.join(root,'src/components/Empty'), {recursive:true});
  write('src/components/index.ts', '// barrel is not a component directory');
  assert.equal(closureConformance(root).status, 'PASS');
  write('src/components/AvatarGroup/AvatarGroup.tsx', 'export const AvatarGroup = () => null;');
  const orphan = componentClosure(root);
  assert.equal(orphan.status, 'FAIL');
  assert.ok(orphan.findings.some(f => f.reason.includes('inventory')));
  assert.ok(orphan.findings.some(f => f.reason.includes('map')));
  assert.ok(orphan.findings.some(f => f.reason.includes('metadata.json')));
  write('design-system/inventory.json', {components:['Missing']});
  assert.ok(componentClosure(root).findings.some(f => f.component === 'Missing' && f.reason.includes('implementation')));
});
test('coherent components pass; auxiliaries require explicit reasons and cannot conceal public records', t => {
  const {root, write} = fixture(t);
  write('src/components/Internal/helper.ts', 'export const helper = 1;');
  write('design-system/component-classification.json', {schemaVersion:1,auxiliaries:[{directory:'src/components/Internal',reason:'Private implementation helper'}]});
  assert.equal(componentClosure(root).status, 'PASS');
  assert.equal(componentClosure(root).changes.status, 'NOT_RUN');
  write('design-system/inventory.json', {components:['Internal']});
  assert.equal(componentClosure(root).status, 'FAIL');
  write('design-system/component-classification.json', {schemaVersion:1,auxiliaries:[{directory:'src/components/Internal',reason:''}]});
  assert.throws(() => componentClosure(root), /classification/);
});
test('same-rule definitions pass; missing tokens fail even with nested fallbacks and inline TSX', t => {
  const {root, write} = fixture(t);
  write('src/components/X/X.module.css', '.x { --ds-local: 8px; gap: var(--ds-local); color: var(--ds-missing, var(--ds-fallback, red)); }');
  write('src/components/X/X.tsx', 'const ignored = "text"; // var(--ds-comment)\nexport const style = { color: "var(--ds-inline, red)" };');
  const report = cssTokenClosure(root);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.findings.find(f=>f.token==='--ds-local').status, 'PASS');
  for (const token of ['--ds-missing','--ds-fallback','--ds-inline']) assert.equal(report.findings.find(f=>f.token===token).status, 'FAIL');
  assert.ok(!report.findings.some(f=>f.token==='--ds-comment'));
});
test('inert HTML and type-only import chains do not manufacture global token availability',t=> {
  const {root,write}=fixture(t);
  write('src/components/X/X.module.css','.x { color: var(--ds-color); }');
  write('src/styles/tokens.css',':root { --ds-color: red; }');
  write('src/main.ts','import "./styles/tokens.css";');
  for(const html of ['<script data-type=module data-src=/src/main.ts></script>','<template><script type=module src=/src/main.ts></script></template>']) {
    write('index.html',html); assert.equal(cssTokenClosure(root).status,'NOT_RUN');
  }
  write('index.html','<script type=module src=/src/main.ts></script>');
  write('src/main.ts','import { type Foo } from "./types";');
  write('src/types.ts','import "./styles/tokens.css"; export type Foo = string;');
  assert.equal(cssTokenClosure(root).status,'NOT_RUN');
  write('src/main.ts','import "./types";');
  assert.equal(cssTokenClosure(root).status,'PASS');
});
test('entry URL normalization cannot load a different main file',t=> {
  const {root,write}=fixture(t);
  write('index.html','<script type=module src="src/a//../main.ts"></script>');
  write('src/main.ts','import "./styles/tokens.css";');
  write('src/styles/tokens.css',':root {--ds-color:red}');
  write('src/components/X/X.module.css','.x {color:var(--ds-color)}');
  assert.equal(cssTokenClosure(root).status,'NOT_RUN');
  write('src/a/main.ts','import "../styles/tokens.css";');
  assert.equal(cssTokenClosure(root).status,'PASS');
});
test('definitions in unrelated scopes, conditional modes and unloaded files never imply PASS', t => {
  const {root, write} = fixture(t);
  write('src/styles/tokens.css', ':root { --ds-global: red; } @media (prefers-color-scheme: dark) { :root { --ds-dark: black; } }');
  write('src/components/X/X.module.css', '.other { --ds-local: blue; } .x { color: var(--ds-global); background: var(--ds-dark); border-color: var(--ds-local); }');
  assert.equal(cssTokenClosure(root).status, 'NOT_RUN');
  write('index.html','<script type="module" src="/src/main.tsx"></script>');
  write('src/main.tsx', 'import "./styles/tokens.css";');
  const report = cssTokenClosure(root);
  assert.equal(report.findings.find(f=>f.token==='--ds-global').status,'PASS');
  assert.equal(report.findings.find(f=>f.token==='--ds-dark').status,'NOT_RUN');
  assert.equal(report.findings.find(f=>f.token==='--ds-local').status,'NOT_RUN');
});
test('explicit Git baseline reports additions, removals and reasons; invalid revisions fail', t => {
  const {root, write} = fixture(t);
  const git = args => execFileSync('git', args, {cwd:root, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
  git(['init']);
  write('design-system/component-classification.json',{schemaVersion:1,auxiliaries:[{directory:'src/components/Old',reason:'Old helper'},{directory:'src/components/Changed',reason:'Before'}]});
  git(['add','.']); git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','Synthetic fixture baseline']);
  write('src/components/New/helper.ts',''); write('src/components/Changed/helper.ts','');
  write('design-system/component-classification.json',{schemaVersion:1,auxiliaries:[{directory:'src/components/New',reason:'New helper'},{directory:'src/components/Changed',reason:'After'}]});
  const report = componentClosure(root,{since:'HEAD'});
  assert.equal(report.status,'PASS');
  assert.deepEqual(report.changes.entries.map(e=>e.kind),['modified','added','removed']);
  assert.throws(()=>componentClosure(root,{since:'missing-revision'}));
  assert.throws(()=>componentClosure(root,{since:'--all'}),/Invalid/);
});
test('literal inline definitions and CSS registrations remain pending rather than falsely absent', t => {
  const {root,write}=fixture(t);
  write('src/components/X/X.tsx', 'const style = { "--ds-inline": "8px", gap: "var(--ds-inline)" }; element.style.setProperty("--ds-runtime", "red"); const color = "var(--ds-runtime)";');
  write('src/components/X/X.module.css', '@property --ds-registered { syntax: "<color>"; inherits: true; initial-value: red; } .x { color: var(--ds-registered); }');
  const report=cssTokenClosure(root);
  assert.equal(report.status,'NOT_RUN');
  for(const token of ['--ds-inline','--ds-runtime','--ds-registered']) assert.equal(report.findings.find(f=>f.token===token).status,'NOT_RUN');
});
test('dynamic template token names are pending and mandatory CLI closure exits nonzero', t => {
  const {root,write}=fixture(t);
  write('src/components/Internal/helper.ts', 'export const gap = `var(--ds-space-${size})`;');
  write('design-system/component-classification.json',{schemaVersion:1,auxiliaries:[{directory:'src/components/Internal',reason:'Private helper'}]});
  assert.equal(closureConformance(root).status,'NOT_RUN');
  const script=fileURLToPath(new URL('../verify-closure.mjs',import.meta.url));
  const consult=spawnSync(process.execPath,[script,root],{encoding:'utf8'});
  assert.equal(consult.status,0); assert.equal(JSON.parse(consult.stdout).status,'NOT_RUN');
  const close=spawnSync(process.execPath,[script,root,'--check'],{encoding:'utf8'});
  assert.equal(close.status,1); assert.equal(JSON.parse(close.stdout).status,'NOT_RUN');
});
test('closure gates fail while diagnostic CLI remains consultative; unknown arguments are rejected', async t => {
  const {root, write} = fixture(t);
  write('src/components/Orphan/Orphan.tsx','export const Orphan = () => null;');
  const report = await verifyImports(root);
  assert.equal(report.status,'FAIL'); assert.equal(report.closure.status,'FAIL');
  assert.equal(parseClosureArgs([root]).check,false);
  assert.equal(parseClosureArgs([root,'--check']).check,true);
  for (const args of [['--since'],['--since','--all'],['--wat'],['a','b']]) assert.throws(()=>parseClosureArgs(args));
});
test('stale confirmations are grouped without concealing changed files',()=> {
  const report = staleSummary(['Avatar: usage: no longer current; Measurement input changed: src/components/Avatar/Avatar.tsx','Avatar: usage: no longer current; Measurement input changed: src/components/Avatar/Avatar.tsx','Tab: no longer current; reason unknown','other warning']);
  assert.equal(report[0].count,2); assert.deepEqual(report[0].files,['src/components/Avatar/Avatar.tsx']); assert.equal(report[1].component,'Tab');
});
test('symlinks are structured failures and do not conceal independent component or token findings', async t=> {
  const {root,write}=fixture(t);
  write('src/components/Orphan/Orphan.tsx','export const Orphan = () => null;');
  write('src/components/Orphan/Orphan.module.css','.x { --ds-local: red; color: var(--ds-local); }');
  symlinkSync('missing-target',path.join(root,'src/components/Broken'));
  symlinkSync('.',path.join(root,'src/components/Loop'));
  symlinkSync('Orphan',path.join(root,'src/components/Linked'));
  const external=fixture(t); external.write('Private.module.css','.x { color: var(--ds-outside); }');
  symlinkSync(external.root,path.join(root,'src/components/External'));
  const report=closureConformance(root);
  assert.equal(report.status,'FAIL');
  for(const name of ['Broken','Loop','Linked','External']) assert.ok(report.components.findings.some(f=>f.file===`src/components/${name}` && f.code==='UNSUPPORTED_SYMLINK'));
  assert.ok(!report.tokens.findings.some(f=>f.token==='--ds-outside'));
  assert.ok(report.components.findings.some(f=>f.component==='Orphan'));
  assert.ok(report.tokens.findings.some(f=>f.token==='--ds-local' && f.status==='PASS'));
  const script=fileURLToPath(new URL('../verify-closure.mjs',import.meta.url));
  const check=spawnSync(process.execPath,[script,root,'--check'],{encoding:'utf8'});
  assert.equal(check.status,1); assert.equal(JSON.parse(check.stdout).status,'FAIL'); assert.equal(check.stderr,'');
  const consult=spawnSync(process.execPath,[script,root],{encoding:'utf8'});
  assert.equal(consult.status,0); assert.equal(JSON.parse(consult.stdout).status,'FAIL');
  const gate=await verifyImports(root); assert.equal(gate.closure.status,'FAIL'); assert.ok(gate.closure.components.findings.some(f=>f.code==='UNSUPPORTED_SYMLINK'));
});
test('a linked components root is reported while sibling CSS remains inspectable',t=> {
  const {root,write}=fixture(t), external=fixture(t);
  write('src/styles/local.css','.local { --ds-local: red; color: var(--ds-local); background: var(--ds-uninspected); }');
  symlinkSync(external.root,path.join(root,'src/components'));
  const report=closureConformance(root);
  assert.equal(report.status,'FAIL');
  assert.ok(report.components.findings.some(f=>f.file==='src/components' && f.code==='UNSUPPORTED_SYMLINK'));
  assert.ok(report.tokens.findings.some(f=>f.token==='--ds-local' && f.status==='PASS'));
  assert.ok(report.tokens.findings.some(f=>f.token==='--ds-uninspected' && f.status==='NOT_RUN'));
});
test('import gate rejects an irrelevant --check flag rather than silently accepting it',()=> {
  assert.deepEqual(parseImportArgs(['.','--since','HEAD']),{root:path.resolve('.'),since:'HEAD'});
  assert.throws(()=>parseImportArgs(['.','--check']),/verify-imports/);
  const command=spawnSync(process.execPath,[fileURLToPath(new URL('../verify-imports.mjs',import.meta.url)),'.','--check'],{encoding:'utf8'});
  assert.notEqual(command.status,0); assert.match(command.stderr,/always mandatory/);
});
test('an @import placed after a rule is ignored by browsers and never establishes token availability', t => {
  const {root, write} = fixture(t);
  write('index.html', '<script type="module" src="/src/main.tsx"></script>');
  write('src/main.tsx', 'import "./index.css";');
  write('src/styles/tokens.css', ':root { --ds-c: red; }');
  write('src/components/X/X.module.css', '.x { color: var(--ds-c); }');
  const status = css => { write('src/index.css', css); const report = cssTokenClosure(root); return report.findings.find(f => f.token === '--ds-c').status; };
  assert.equal(status('.unused { color: red; }\n@import "./styles/tokens.css";'), 'NOT_RUN');
  assert.equal(status('@media print { .p { color: red; } }\n@import "./styles/tokens.css";'), 'NOT_RUN');
  assert.equal(status('@layer base { .l { color: red; } }\n@import "./styles/tokens.css";'), 'NOT_RUN');
  // Allowed prefixes: comments, @charset, body-less @layer and earlier imports.
  assert.equal(status('@charset "utf-8";\n/* c */\n@layer a, b;\n@import "./styles/tokens.css";\n.after { color: red; }'), 'PASS');
  write('src/styles/other.css', '.o { color: blue; }');
  assert.equal(status('@import "./styles/other.css";\n@import "./styles/tokens.css";'), 'PASS');
  assert.equal(status('@import "./styles/other.css";\n.r { color: red; }\n@import "./styles/tokens.css";'), 'NOT_RUN');
});
test('ficha files and the mapped implementation must be regular files, not directories or unsafe paths', t => {
  const {root, write} = fixture(t);
  const register = codePath => {
    write('design-system/inventory.json', {components: ['Tab']});
    write('design-system/relationships/figma-code-map.json', {k: {name: 'Tab', code: {path: codePath, component: 'Tab'}}});
  };
  write('src/components/Tab/Tab.tsx', 'export const Tab = () => null;');
  write('design-system/components/Tab/metadata.json', '{}');
  write('design-system/components/Tab/usage.md', '# Tab');
  register('src/components/Tab/Tab.tsx');
  assert.equal(componentClosure(root).status, 'PASS');
  for (const bad of ['src/components/Tab', 'src/components/Tab/', '../outside.tsx', '/etc/hosts', 'src//components/Tab/Tab.tsx', 'src/components/Tab/../Tab/Tab.tsx', 'src\\components\\Tab\\Tab.tsx', '']) {
    register(bad);
    const report = componentClosure(root);
    assert.equal(report.status, 'FAIL', `code.path ${JSON.stringify(bad)} must fail`);
    assert.ok(report.findings.some(f => f.reason.startsWith('Missing mapped implementation')), `code.path ${JSON.stringify(bad)}`);
  }
  register('src/components/Tab/Tab.tsx');
  rmSync(path.join(root, 'design-system/components/Tab/metadata.json'));
  rmSync(path.join(root, 'design-system/components/Tab/usage.md'));
  mkdirSync(path.join(root, 'design-system/components/Tab/metadata.json/nested'), {recursive: true});
  mkdirSync(path.join(root, 'design-system/components/Tab/usage.md/nested'), {recursive: true});
  const report = componentClosure(root);
  assert.equal(report.status, 'FAIL');
  assert.ok(report.findings.some(f => f.reason.includes('Missing ficha file: design-system/components/Tab/metadata.json')));
  assert.ok(report.findings.some(f => f.reason.includes('Missing ficha file: design-system/components/Tab/usage.md')));
});
