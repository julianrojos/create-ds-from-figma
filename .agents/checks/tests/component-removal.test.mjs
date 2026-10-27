import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, chmodSync, statSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { standardRemovalProject, sharedRemovalExport } from './fixtures/standard-removal-project.mjs';
import { planRemoval, archiveRemoval, restoreRemoval, recoverRemoval, purgeRemovalArchive } from '../lib/component-removal.mjs';
import { removalCommand } from '../../skills/create-ds-from-figma/scripts/component-removal.mjs';
import { generateTokensCss } from '../lib/tokens-css.mjs';
import { sha256 } from '../lib/render-plan.mjs';
import ts from 'typescript';
import { verifyProps } from '../verify-props.mjs';

const gate = async () => ({ status: 'PASS', scope: 'Synthetic test double, not browser proof.' });
function fixture(t) {
  const f = createPreviewProject();
  const archives = mkdtempSync(path.join(os.tmpdir(), 'removal-backups-'));
  mkdirSync(path.join(f.root, '.agents'));
  writeFileSync(path.join(f.root, '.agents/prop-vocabulary.json'), readFileSync('.agents/prop-vocabulary.json'));
  t.after(() => { rmSync(f.root, { recursive: true, force: true }); rmSync(archives, { recursive: true, force: true }); });
  return { ...f, archives };
}
const json = (f, file) => JSON.parse(readFileSync(path.join(f.root, file), 'utf8'));
const write = (f, file, value) => { mkdirSync(path.dirname(path.join(f.root, file)), { recursive: true }); writeFileSync(path.join(f.root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
const blockedBy = (source, target, retention) => error => {
  assert.equal(error.code, 'COMPONENT_REMOVAL_BLOCKED');
  assert.match(error.message, /^Removal blocked:/);
  assert.ok(error.message.includes(source) && error.message.includes(target), error.message);
  assert.ok(error.details.dependencies.some(dependency => dependency.source === source && dependency.target === target && dependency.sourceRetention === retention), error.message);
  return true;
};

test('standard component with its own barrel archives and restores without manual file decisions', async t => {
  const f = standardRemovalProject(fixture(t)), before = tree(f.root);
  const plan = planRemoval(f.root, f.metadataPath);
  assert.ok(plan.operations.some(op => op.path === f.barrel && op.after === null));
  assert.ok(plan.operations.some(op => op.path === f.code && op.after === null));
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  assert.ok(!existsSync(path.join(f.root, f.directory)));
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  assert.deepEqual(tree(f.root), before);
});

test('an external consumer through the component barrel blocks even explicit barrel retirement', t => {
  const f = standardRemovalProject(fixture(t));
  write(f, 'src/Consumer.tsx', 'export { PreviewGlyph } from "./components/PreviewGlyph";');
  const before = tree(f.root);
  assert.throws(() => planRemoval(f.root, f.metadataPath), blockedBy('src/Consumer.tsx', f.code, 'external-consumer'));
  assert.throws(() => planRemoval(f.root, f.metadataPath, { retirePaths: [f.barrel] }), blockedBy('src/Consumer.tsx', f.code, 'external-consumer'));
  assert.deepEqual(tree(f.root), before);
});

test('keeping the standard barrel reports the kept importer and CLI failures preserve structured causes', t => {
  const f = standardRemovalProject(fixture(t)), before = tree(f.root);
  assert.throws(() => planRemoval(f.root, f.metadataPath, { keepPaths: [f.barrel] }), blockedBy(f.barrel, f.code, 'explicit-keep'));
  const cli = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/component-removal.mjs', 'plan', f.root, f.metadataPath, '--keep', f.barrel], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  const diagnostic = JSON.parse(cli.stderr);
  assert.equal(diagnostic.code, 'COMPONENT_REMOVAL_BLOCKED');
  assert.ok(diagnostic.details.dependencies.some(dependency => dependency.source === f.barrel && dependency.target === f.code && dependency.sourceRetention === 'explicit-keep'));
  assert.deepEqual(tree(f.root), before);
});

test('mixed barrels require explicit retirement and a kept internal importer remains blocking', async t => {
  const f = standardRemovalProject(fixture(t), { barrel: 'export { PreviewGlyph } from "./PreviewGlyph";\nexport { Other } from "../Other/Other";\nexport const unrelated = 42;\n' });
  write(f, 'src/components/Other/Other.tsx', 'export const Other = () => null;');
  assert.throws(() => planRemoval(f.root, f.metadataPath), /Explicit keep\/retire/);
  assert.throws(() => planRemoval(f.root, f.metadataPath, { keepPaths: [f.barrel] }), blockedBy(f.barrel, f.code, 'explicit-keep'));
  const before = tree(f.root), plan = planRemoval(f.root, f.metadataPath, { retirePaths: [f.barrel] });
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  assert.equal(readFileSync(path.join(f.root, 'src/components/Other/Other.tsx'), 'utf8'), 'export const Other = () => null;');
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  assert.deepEqual(tree(f.root), before);
});

test('mixed exports of another mapped component require a decision and preserve that component through archive/restore', async t => {
  const f = sharedRemovalExport(standardRemovalProject(fixture(t)), { throughBarrel: true });
  const before = tree(f.root);
  assert.throws(() => planRemoval(f.root, f.metadataPath), /Explicit keep\/retire decision required: .*index\.ts/);
  assert.deepEqual(tree(f.root), before);
  const plan = planRemoval(f.root, f.metadataPath, { retirePaths: [f.barrel] });
  assert.ok(plan.operations.some(operation => operation.path === f.barrel && operation.after === null));
  assert.ok(!plan.operations.some(operation => operation.path === f.sharedCode));
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  assert.ok(existsSync(path.join(f.root, f.sharedCode)));
  assert.deepEqual(json(f, 'design-system/inventory.json').components, ['Other']);
  assert.ok(json(f, 'design-system/relationships/figma-code-map.json')['OTHER:2:3']);
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  assert.deepEqual(tree(f.root), before);
});

test('an unmapped helper consumed outside the component also prevents automatic barrel retirement', t => {
  const f = sharedRemovalExport(standardRemovalProject(fixture(t)), { mapped: false });
  write(f, 'src/Consumer.tsx', 'export { Other } from "./components/PreviewGlyph/Other";');
  assert.throws(() => planRemoval(f.root, f.metadataPath), /Explicit keep\/retire decision required: .*index\.ts/);
  const plan = planRemoval(f.root, f.metadataPath, { retirePaths: [f.barrel] });
  assert.ok(plan.keptFiles.includes(f.sharedCode));
  assert.ok(!plan.operations.some(operation => operation.path === f.sharedCode || operation.path === 'src/Consumer.tsx'));
});

for (const configured of [false, true]) test(`explicit declarations in linked node_modules are reused with config=${configured}`, async t => {
  const f = fixture(t);
  write(f, 'src/dep-reference.d.ts', '/// <reference path="../node_modules/typescript/lib/lib.es5.d.ts" />\n');
  write(f, 'src/PreviewGlyph.tsx', 'export interface PreviewGlyphProps { disabled?: boolean }; export function PreviewGlyph(props: PreviewGlyphProps) { return null; }');
  if (configured) write(f, 'tsconfig.json', { compilerOptions: { skipLibCheck: true, module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx' }, include: ['src'] });
  const before = tree(f.root), actual = verifyProps(f.root, ts).errors;
  assert.deepEqual(actual, []);
  const plan = planRemoval(f.root, f.metadataPath);
  assert.deepEqual(plan.validation.before.props, actual);
  assert.ok(!plan.source.files.some(file => file.path.startsWith('node_modules/')));
  assert.ok(!plan.operations.some(operation => operation.path.startsWith('node_modules/')));
  assert.deepEqual(tree(f.root), before);
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  assert.deepEqual(tree(f.root), before);
});
function tree(root) {
  return readdirSync(root, { withFileTypes: true }).filter(e => e.name !== 'node_modules').sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => {
    const full = path.join(root, e.name);
    return e.isDirectory() ? [[e.name + '/', statSync(full).mode & 0o777], ...tree(full).map(([name, ...rest]) => [`${e.name}/${name}`, ...rest])]
      : [[e.name, sha256(readFileSync(full)), statSync(full).mode & 0o777]];
  });
}
test('plan, archive and restore preserve exact original bytes and permissions without deleting shared data', async t => {
  const f = fixture(t);
  chmodSync(path.join(f.root, f.metadataPath), 0o640);
  chmodSync(path.join(f.root, 'design-system/components/PreviewGlyph'), 0o700);
  const before = tree(f.root), plan = planRemoval(f.root, f.metadataPath);
  assert.deepEqual(tree(f.root), before, 'planning never writes the project');
  await assert.rejects(archiveRemoval(f.root, plan, { archiveRoot: f.archives }), /approval/);
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  assert.equal(result.status, 'ARCHIVED');
  assert.ok(!existsSync(path.join(f.root, f.metadataPath)));
  assert.deepEqual(json(f, 'design-system/inventory.json').components, []);
  assert.ok(existsSync(path.join(f.root, 'design-system/tokens/Colors.json')));
  assert.ok(existsSync(path.join(f.root, plan.preserved.snapshot)));
  assert.ok(!existsSync(path.join(f.root, 'design-system/components/PreviewGlyph')));
  const restored = await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  assert.equal(restored.status, 'RESTORED');
  assert.deepEqual(tree(f.root), before);
});
test('stale plans reject edits and new consumers before making an archive or changing the project', async t => {
  const f = fixture(t), plan = planRemoval(f.root, f.metadataPath);
  write(f, 'src/New.tsx', 'export { PreviewGlyph } from "./PreviewGlyph";');
  const before = tree(f.root);
  await assert.rejects(archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate }), /blocked|Stale/);
  assert.deepEqual(tree(f.root), before);
  assert.deepEqual(readdirSync(f.archives), []);
});
test('a concrete demo proposal is simulated and rechecked, without rewriting unrelated logic', async t => {
  const f = fixture(t), original = 'import { PreviewGlyph } from "./PreviewGlyph"; export const App = () => <PreviewGlyph initial="F" />;';
  write(f, 'src/App.tsx', original);
  write(f, 'src/main.tsx', 'export { App } from "./App";');
  assert.throws(() => planRemoval(f.root, f.metadataPath), /Removal blocked:/);
  const proposed = 'export const App = () => <main data-user-content="preserved" />;';
  const plan = planRemoval(f.root, f.metadataPath, { demoReplacement: { path: 'src/App.tsx', text: proposed } });
  assert.equal(readFileSync(path.join(f.root, 'src/App.tsx'), 'utf8'), original);
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  assert.equal(readFileSync(path.join(f.root, 'src/App.tsx'), 'utf8'), proposed);
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  assert.equal(readFileSync(path.join(f.root, 'src/App.tsx'), 'utf8'), original);
});
test('unknown files need explicit decisions and shared file claims cannot be overridden', t => {
  const f = fixture(t);
  write(f, 'design-system/components/PreviewGlyph/notes.md', 'User notes');
  assert.throws(() => planRemoval(f.root, f.metadataPath), /Explicit keep\/retire/);
  const plan = planRemoval(f.root, f.metadataPath, { retirePaths: ['design-system/components/PreviewGlyph/notes.md'] });
  assert.ok(plan.operations.some(op => op.path.endsWith('/notes.md') && op.after === null));
  assert.throws(() => planRemoval(f.root, f.metadataPath, { keepPaths: [f.metadataPath], retirePaths: ['design-system/components/PreviewGlyph/notes.md'] }), error => {
    assert.equal(error.code, 'COMPONENT_REMOVAL_BLOCKED');
    assert.ok(error.details.fileConflicts.some(conflict => conflict.path === f.metadataPath && conflict.reason === 'explicit-keep'));
    return true;
  });
});
test('an interrupted apply rolls back its own changes and preserves concurrent user edits for recovery', async t => {
  const f = fixture(t), plan = planRemoval(f.root, f.metadataPath), before = tree(f.root);
  let steps = 0;
  await assert.rejects(archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate,
    beforeStep: () => { if (++steps === 2) throw new Error('Injected interruption'); } }), /Injected/);
  assert.deepEqual(tree(f.root), before);
  const rolled = path.join(f.archives, readdirSync(f.archives)[0]);
  assert.equal(JSON.parse(readFileSync(path.join(rolled, 'manifest.json'))).status, 'ROLLED_BACK');
  let failedArchive;
  try {
    await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate,
      beforeStep: op => { if (op.path === plan.operations[1].path) write(f, op.path, 'Concurrent work'); } });
  } catch (error) { failedArchive = error.archive; }
  assert.ok(failedArchive);
  assert.equal(readFileSync(path.join(f.root, plan.operations[1].path), 'utf8'), 'Concurrent work');
  assert.equal(JSON.parse(readFileSync(path.join(failedArchive, 'manifest.json'))).status, 'RECOVERY_REQUIRED');
  assert.throws(() => recoverRemoval(f.root, failedArchive, { approved: true }), /operation has stopped/);
  const conflict = recoverRemoval(f.root, failedArchive, { approved: true, operationStopped: true });
  assert.equal(conflict.status, 'RECOVERY_REQUIRED');
  writeFileSync(path.join(f.root, plan.operations[1].path), readFileSync(path.join(failedArchive, 'originals', plan.operations[1].path)));
  const recovered = recoverRemoval(f.root, failedArchive, { approved: true, operationStopped: true });
  assert.equal(recovered.status, 'RESTORED');
  assert.deepEqual(tree(f.root), before);
});
test('restore refuses later edits or corrupted backups, and the purge requires irreversible-loss acknowledgement', async t => {
  const f = fixture(t), plan = planRemoval(f.root, f.metadataPath);
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  const inventory = 'design-system/inventory.json', current = readFileSync(path.join(f.root, inventory));
  write(f, inventory, '{"components":[],"screens":[],"user":"later"}');
  const changed = tree(f.root);
  await assert.rejects(restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate }), /conflict/);
  assert.deepEqual(tree(f.root), changed);
  writeFileSync(path.join(f.root, inventory), current);
  const backup = path.join(result.archive, 'originals', f.metadataPath), original = readFileSync(backup);
  writeFileSync(backup, 'Corrupted');
  await assert.rejects(restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate }), /corrupt/);
  writeFileSync(backup, original);
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  assert.throws(() => purgeRemovalArchive(f.root, result.archive, { approved: true }), /irreversible/);
  writeFileSync(path.join(result.archive, 'user-notes.txt'), 'Unrelated');
  assert.throws(() => purgeRemovalArchive(f.root, result.archive, { approved: true, backupNotNeeded: true }), /Unrecognized/);
  rmSync(path.join(result.archive, 'user-notes.txt'));
  for (const relative of ['user-created-empty-directory', 'originals/design-system/extra-empty-directory']) {
    const directory = path.join(result.archive, relative);
    mkdirSync(directory, { recursive: true });
    const contents = tree(result.archive);
    assert.throws(() => purgeRemovalArchive(f.root, result.archive, { approved: true, backupNotNeeded: true }), /Unrecognized archive directory/);
    assert.deepEqual(tree(result.archive), contents, 'Reject unknown directories before deleting any backup data');
    rmSync(directory, { recursive: true });
  }
  assert.equal(purgeRemovalArchive(f.root, result.archive, { approved: true, backupNotNeeded: true }).status, 'PURGED');
});

test('implicit typeRoots and their transitive declarations reproduce the real props baseline', t => {
  const f = fixture(t);
  write(f, 'types/project/index.d.ts', 'import type { Flag } from "./nested"; declare global { type SharedFlag = Flag; }');
  write(f, 'types/project/nested.d.ts', 'export type Flag = boolean;');
  write(f, 'tsconfig.json', { compilerOptions: { typeRoots: ['./types'], types: ['project'], module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2020', jsx: 'react-jsx' }, include: ['src'] });
  write(f, 'src/PreviewGlyph.tsx', 'export interface PreviewGlyphProps { disabled?: SharedFlag }; export function PreviewGlyph(props: PreviewGlyphProps) { return null; }');
  const actual = verifyProps(f.root, ts).errors;
  assert.deepEqual(actual, []);
  const before = tree(f.root), plan = planRemoval(f.root, f.metadataPath);
  assert.deepEqual(plan.validation.before.props, actual);
  for (const file of ['types/project/index.d.ts', 'types/project/nested.d.ts']) {
    assert.ok(plan.source.files.some(input => input.path === file));
    assert.ok(!plan.operations.some(operation => operation.path === file));
  }
  assert.deepEqual(tree(f.root), before);
});

test('readonly shared directories can be staged without altering active permissions or retiring their files', async t => {
  const f = fixture(t), directory = path.join(f.root, 'design-system/tokens');
  chmodSync(directory, 0o555);
  try {
    const before = tree(f.root), plan = planRemoval(f.root, f.metadataPath);
    assert.deepEqual(tree(f.root), before);
    const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
    assert.equal(statSync(directory).mode & 0o777, 0o555);
    assert.ok(existsSync(path.join(directory, 'Colors.json')));
    await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
    assert.deepEqual(tree(f.root), before);
  } finally { chmodSync(directory, 0o755); }
});
test('external serialization cleanup is explicit, exclusive, backed up and restored', async t => {
  const f = fixture(t), metadata = json(f, f.metadataPath), state = json(f, 'design-system/relationships/figma-state.json');
  metadata.externalVariables = [{ id: 'external-size', cssName: '--external-size', type: 'FLOAT', value: 4 }];
  state.externalSerialization = { 'external-size': { css: { kind: 'unit', unit: 'px' }, source: { type: 'user' } } };
  write(f, f.metadataPath, metadata); write(f, 'design-system/relationships/figma-state.json', state);
  write(f, 'src/styles/tokens.css', generateTokensCss(f.root).css);
  assert.throws(() => planRemoval(f.root, f.metadataPath), /blocked/);
  const before = tree(f.root), plan = planRemoval(f.root, f.metadataPath, { retireSerializationIds: ['external-size'] });
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  assert.deepEqual(json(f, 'design-system/relationships/figma-state.json').externalSerialization, {});
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  assert.deepEqual(tree(f.root), before);
});
test('CLI never treats a generic removal request or a missing approval flag as permission', async t => {
  const f = fixture(t), before = tree(f.root);
  await assert.rejects(removalCommand(['archive', f.root, 'missing.json', f.archives]), /approve-removal/);
  await assert.rejects(removalCommand(['restore', f.root, f.archives]), /approve-restore/);
  await assert.rejects(removalCommand(['purge', f.root, f.archives]), /approve-purge/);
  assert.deepEqual(tree(f.root), before);
});

test('a terminated process leaves a journal that restores the original tree after explicit stopped-process confirmation', t => {
  const f = fixture(t), before = tree(f.root), plan = planRemoval(f.root, f.metadataPath);
  const planFile = path.join(f.archives, 'approved.json');
  writeFileSync(planFile, JSON.stringify(plan));
  const moduleUrl = pathToFileURL(path.resolve('.agents/checks/lib/component-removal.mjs')).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { readFileSync } from 'node:fs';
    import { archiveRemoval } from ${JSON.stringify(moduleUrl)};
    let steps = 0;
    await archiveRemoval(process.argv[1], JSON.parse(readFileSync(process.argv[2])), {
      archiveRoot: process.argv[3], approved: true,
      beforeStep() { if (++steps === 2) process.exit(77); }
    });`, f.root, planFile, f.archives], { encoding: 'utf8' });
  assert.equal(child.status, 77, child.stderr);
  const archive = path.join(f.archives, readdirSync(f.archives).find(name => name.startsWith('component-removal-')));
  assert.equal(JSON.parse(readFileSync(path.join(archive, 'manifest.json'))).status, 'APPLYING');
  const recovered = recoverRemoval(f.root, archive, { approved: true, operationStopped: true });
  assert.equal(recovered.status, 'RESTORED');
  assert.deepEqual(tree(f.root), before);
});

test('pending delivery stays pending and an interrupted restore rolls back to the archived state', async t => {
  const f = fixture(t), plan = planRemoval(f.root, f.metadataPath);
  await assert.rejects(archiveRemoval(f.root, plan, { archiveRoot: f.root, approved: true }), /outside/);
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true,
    verifyGate: async () => ({ status: 'NOT RUN', reason: 'Runtime unavailable in test double' }) });
  assert.equal(result.delivery, 'PENDING_VERIFICATION');
  const archived = tree(f.root);
  let steps = 0;
  await assert.rejects(restoreRemoval(f.root, result.archive, { approved: true, beforeStep() {
    if (++steps === 2) throw new Error('Restore interrupted');
  } }), /Restore interrupted/);
  assert.deepEqual(tree(f.root), archived);
  assert.equal(JSON.parse(readFileSync(path.join(result.archive, 'manifest.json'))).status, 'ARCHIVED');
});

test('an incomplete backup can only be abandoned while the active project is still the original source', async t => {
  const f = fixture(t), plan = planRemoval(f.root, f.metadataPath), before = tree(f.root);
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  const journal = path.join(result.archive, 'manifest.json'), manifest = JSON.parse(readFileSync(journal));
  manifest.status = 'PREPARING'; writeFileSync(journal, JSON.stringify(manifest));
  rmSync(path.join(result.archive, 'originals', f.metadataPath));
  write(f, 'src/later.txt', 'User work');
  assert.throws(() => recoverRemoval(f.root, result.archive, { approved: true, operationStopped: true }), /untouched planned source/);
  assert.equal(readFileSync(path.join(f.root, 'src/later.txt'), 'utf8'), 'User work');
  rmSync(path.join(f.root, 'src/later.txt'));
  assert.equal(recoverRemoval(f.root, result.archive, { approved: true, operationStopped: true }).status, 'ABANDONED');
  assert.deepEqual(tree(f.root), before);
  assert.equal(purgeRemovalArchive(f.root, result.archive, { approved: true, backupNotNeeded: true }).status, 'PURGED');
});

test('analysis excludes environment files and unrelated assets and links, but includes inherited configs and source dependencies', async t => {
  const f = fixture(t);
  write(f, '.env', 'SECRET=never-stage');
  write(f, 'unrelated/large.bin', Buffer.alloc(4096).toString('base64'));
  symlinkSync('/does-not-exist', path.join(f.root, 'unrelated-link'));
  write(f, 'config/base.json', { compilerOptions: { strict: true } });
  write(f, 'tsconfig.json', { extends: './config/base.json', compilerOptions: { jsx: 'react-jsx' }, include: ['src', 'globals'] });
  write(f, 'globals/ambient.d.ts', '/// <reference path="../types/referenced.d.ts" />\ndeclare interface RemovalGlobal { value: number }');
  write(f, 'types/referenced.d.ts', 'declare interface RemovalReference { value: number }');
  write(f, 'public/evidence-input.txt', 'Recorded public input');
  const metadata = json(f, f.metadataPath);
  metadata.verification.inputs.push('public/evidence-input.txt');
  write(f, f.metadataPath, metadata);
  write(f, 'lib/utility.ts', 'export const value = 1;');
  write(f, 'src/Other.ts', 'export { value } from "../lib/utility";');
  const plan = planRemoval(f.root, f.metadataPath);
  assert.ok(plan.source.files.some(file => file.path === 'config/base.json'));
  assert.ok(plan.source.files.some(file => file.path === 'lib/utility.ts'));
  assert.ok(plan.source.files.some(file => file.path === 'globals/ambient.d.ts'));
  assert.ok(plan.source.files.some(file => file.path === 'types/referenced.d.ts'));
  assert.ok(plan.source.files.some(file => file.path === 'public/evidence-input.txt'));
  assert.ok(!plan.operations.some(op => op.path === 'public/evidence-input.txt'));
  assert.ok(!plan.source.files.some(file => file.path === '.env' || file.path.startsWith('unrelated/')));
  write(f, '.env', 'SECRET=changed-unrelated');
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  assert.equal(readFileSync(path.join(f.root, '.env'), 'utf8'), 'SECRET=changed-unrelated');
  assert.equal(readFileSync(path.join(f.root, 'public/evidence-input.txt'), 'utf8'), 'Recorded public input');
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  symlinkSync(path.join(f.root, 'src/PreviewGlyph.tsx'), path.join(f.root, 'src/Linked.tsx'));
  assert.throws(() => planRemoval(f.root, f.metadataPath), /Symlink|symlink/);
});

test('Finder metadata is enumerated, backed up and restored without per-file ownership flags', async t => {
  const f = fixture(t), finder = 'design-system/components/PreviewGlyph/.DS_Store';
  write(f, finder, 'Finder metadata');
  write(f, '.DS_Store', 'Root Finder metadata');
  const before = tree(f.root), plan = planRemoval(f.root, f.metadataPath);
  assert.deepEqual(plan.filesystemMetadata, [finder]);
  assert.ok(!plan.source.files.some(file => file.path === '.DS_Store'));
  assert.ok(plan.operations.some(op => op.path === finder && op.after === null));
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  assert.ok(!existsSync(path.join(f.root, 'design-system/components/PreviewGlyph')));
  assert.equal(readFileSync(path.join(result.archive, 'originals', finder), 'utf8'), 'Finder metadata');
  await restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate });
  assert.deepEqual(tree(f.root), before);
});

test('a subsequent component registration blocks restoration without overwriting its files or shared records', async t => {
  const f = fixture(t), plan = planRemoval(f.root, f.metadataPath);
  const result = await archiveRemoval(f.root, plan, { archiveRoot: f.archives, approved: true, verifyGate: gate });
  const inventory = json(f, 'design-system/inventory.json'); inventory.components.push('Later');
  write(f, 'design-system/inventory.json', inventory);
  write(f, 'src/components/Later/Later.tsx', 'export const Later = () => null;');
  const before = tree(f.root);
  await assert.rejects(restoreRemoval(f.root, result.archive, { approved: true, verifyGate: gate }), /restore conflict/);
  assert.deepEqual(tree(f.root), before);
  assert.ok(!existsSync(path.join(f.root, f.metadataPath)));
});
