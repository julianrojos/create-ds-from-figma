import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { standardRemovalProject, sharedRemovalExport } from './fixtures/standard-removal-project.mjs';
import { removalReport } from '../lib/removal-report.mjs';
import { createDependencySession } from '../lib/local-dependencies.mjs';
import { generateTokensCss } from '../lib/tokens-css.mjs';
import { sha256 } from '../lib/render-plan.mjs';

const read = (f, file) => JSON.parse(readFileSync(path.join(f.root, file), 'utf8'));
const write = (f, file, data) => {
  mkdirSync(path.dirname(path.join(f.root, file)), { recursive: true });
  writeFileSync(path.join(f.root, file), typeof data === 'string' ? data : JSON.stringify(data));
};
const mapFile = 'design-system/relationships/figma-code-map.json', stateFile = 'design-system/relationships/figma-state.json';
function fixture(t) {
  const f = createPreviewProject();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  return f;
}
function tree(root) {
  return readdirSync(root, { withFileTypes: true }).filter(e => e.name !== 'node_modules').sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => {
    const file = path.join(root, e.name);
    return e.isDirectory() ? tree(file).map(([key, hash]) => [`${e.name}/${key}`, hash]) : [[e.name, sha256(readFileSync(file))]];
  });
}

test('a pure component-local reexport is part of the proposal, while external barrel consumers block', t => {
  const f = standardRemovalProject(fixture(t)), before = tree(f.root);
  let report = removalReport(f.root, f.metadataPath);
  assert.equal(report.removalAssessment, 'REQUIRES_EXPLICIT_PLAN_AND_AUTHORIZATION');
  assert.equal(report.files.find(file => file.path === f.barrel).attribution, 'candidate-to-retire');
  assert.ok(!report.blockers.length);
  assert.deepEqual(tree(f.root), before);
  write(f, 'src/Consumer.tsx', 'export { PreviewGlyph } from "./components/PreviewGlyph";');
  report = removalReport(f.root, f.metadataPath);
  assert.equal(report.removalAssessment, 'BLOCKED');
  assert.ok(report.blockers.some(b => b.source === 'src/Consumer.tsx' && b.target === f.barrel));
  assert.equal(report.files.find(file => file.path === f.code).attribution, 'shared-identified');
});
function addComponent(f, { name = 'Parent', nested = [], externalVariables = [] } = {}) {
  const metadata = `design-system/components/${name}/metadata.json`, code = `src/components/${name}/${name}.tsx`;
  write(f, metadata, { name, code: { path: code, component: name }, bindings: [], externalVariables, verification: { inputs: [], stylesheets: [], fonts: [], assets: [] } });
  write(f, code, `export function ${name}() { return null; }`);
  write(f, `design-system/components/${name}/usage.md`, '# Usage');
  const map = read(f, mapFile);
  map[`OTHER:${name}`] = { name, code: { path: code, component: name }, designSystem: { metadata, usage: `design-system/components/${name}/usage.md` }, figma: { refs: [`OTHER:1:2`], variants: {} } };
  write(f, mapFile, map);
  const state = read(f, stateFile);
  state.components[name] = { figmaNodeId: '1:2', nestedComponents: nested };
  write(f, stateFile, state);
  const inventory = read(f, 'design-system/inventory.json');
  inventory.components.push(name);
  write(f, 'design-system/inventory.json', inventory);
}

test('a barrel claimed by another mapped component cannot hide its dependency on the retiring implementation', t => {
  const f = standardRemovalProject(fixture(t));
  addComponent(f);
  const parent = 'design-system/components/Parent/metadata.json', metadata = read(f, parent);
  metadata.verification.inputs.push(f.barrel); write(f, parent, metadata);
  const report = removalReport(f.root, f.metadataPath);
  assert.equal(report.removalAssessment, 'BLOCKED');
  assert.equal(report.files.find(file => file.path === f.barrel).attribution, 'shared-identified');
  assert.equal(report.files.find(file => file.path === f.code).attribution, 'shared-identified');
  assert.ok(report.blockers.some(b => b.source === f.barrel && b.target === f.code));
});

test('a mixed barrel stays undecided even when its shared destination and barrel are reachable from the component', t => {
  const f = sharedRemovalExport(standardRemovalProject(fixture(t)), { throughBarrel: true });
  const before = tree(f.root), report = removalReport(f.root, f.metadataPath);
  assert.equal(report.files.find(file => file.path === f.sharedCode).attribution, 'shared-identified');
  assert.equal(report.files.find(file => file.path === f.barrel).attribution, 'attribution-unknown');
  assert.equal(report.removalAssessment, 'BLOCKED');
  assert.deepEqual(tree(f.root), before);
});

test('isolated component produces candidates and registry proposals without writing or authorizing removal', t => {
  const f = fixture(t), before = tree(f.root), report = removalReport(f.root, f.metadataPath);
  assert.equal(report.analysis.status, 'COMPLETE_WITHIN_SCOPE', JSON.stringify(report.analysis));
  assert.equal(report.removalAssessment, 'REQUIRES_EXPLICIT_PLAN_AND_AUTHORIZATION');
  assert.equal(report.execution, 'NOT_EXECUTED_READ_ONLY');
  assert.equal(report.files.length, 4);
  assert.ok(report.files.every(file => file.attribution === 'candidate-to-retire' && /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.equal(report.historicalEvidence.action, 'PRESERVE_ALL');
  assert.ok(!report.files.some(file => file.path.includes('/snapshots/') || file.path.includes('/tokens/')));
  assert.equal(report.proposedRegistryEdits.length, 3);
  assert.equal(report.projectedEffects.generatedCss.generatedOutputWouldChange, false);
  assert.deepEqual(tree(f.root), before);
});

test('nested dependencies use qualified refs and unresolved identity blocks rather than implying absence', t => {
  const f = fixture(t);
  addComponent(f, { nested: [{ status: 'mapped', resolvedComponent: 'PreviewGlyph', mainComponentRef: 'FILE:1:2' }] });
  let report = removalReport(f.root, f.metadataPath);
  assert.ok(report.blockers.some(b => b.kind === 'nested-reference'));
  assert.equal(report.removalAssessment, 'BLOCKED');
  const state = read(f, stateFile);
  state.components.Parent.nestedComponents = [{ status: 'mapped', resolvedComponent: 'Parent', mainComponentRef: 'OTHER:1:2' }];
  write(f, stateFile, state);
  report = removalReport(f.root, f.metadataPath);
  assert.ok(!report.blockers.some(b => b.kind === 'nested-reference'), 'same node ID in another source file is not the target');
  state.components.Parent.nestedComponents = [{ status: 'external', mainComponentNodeId: '1:2' }];
  write(f, stateFile, state);
  report = removalReport(f.root, f.metadataPath);
  assert.ok(report.analysis.uncertainties.some(i => i.code === 'UNRESOLVED_NESTED'));
  assert.equal(report.removalAssessment, 'BLOCKED');
});

test('demo references require an explicit edit plan; other imports and screen compositions block', t => {
  const f = fixture(t);
  write(f, 'src/App.tsx', 'import { PreviewGlyph } from "./PreviewGlyph"; export const App = () => <PreviewGlyph initial="A" />;');
  let report = removalReport(f.root, f.metadataPath);
  assert.ok(report.demoReferences.some(r => r.target === 'src/PreviewGlyph.tsx'));
  assert.ok(report.demoReferences.every(r => r.treatment === 'REQUIRES_EXPLICIT_EDIT_PLAN'));
  assert.equal(report.removalAssessment, 'REQUIRES_EXPLICIT_PLAN_AND_AUTHORIZATION', JSON.stringify(report.analysis));
  write(f, 'src/main.tsx', 'export { App } from "./App";');
  report = removalReport(f.root, f.metadataPath);
  assert.ok(report.blockers.some(b => b.source === 'src/main.tsx' && b.scope.includes('may be transitive')));
  write(f, 'src/Consumer.tsx', 'export { PreviewGlyph } from "./PreviewGlyph";');
  const inventory = read(f, 'design-system/inventory.json');
  inventory.screens.push({ name: 'Home', composition: { description: 'Synthetic', components: ['PreviewGlyph'] } });
  write(f, 'design-system/inventory.json', inventory);
  report = removalReport(f.root, f.metadataPath);
  assert.equal(report.removalAssessment, 'BLOCKED');
  assert.ok(report.blockers.some(b => b.kind === 'screen-composition'));
  assert.ok(report.blockers.some(b => b.source === 'src/Consumer.tsx'));
});

test('shared files, unknown nearby files and unresolved imports remain blocking uncertainties', t => {
  const f = fixture(t);
  write(f, 'src/Shared.ts', 'import css from "./PreviewGlyph.module.css"; export const shared = css;');
  write(f, 'src/Dynamic.ts', 'const modulePath = "./PreviewGlyph"; export const load = () => import(modulePath);');
  write(f, 'design-system/components/PreviewGlyph/notes.md', 'User content, ownership not established.');
  const before = tree(f.root), report = removalReport(f.root, f.metadataPath);
  assert.equal(report.removalAssessment, 'BLOCKED');
  assert.equal(report.files.find(f => f.path === 'src/PreviewGlyph.module.css').attribution, 'shared-identified');
  assert.equal(report.files.find(f => f.path.endsWith('/notes.md')).attribution, 'attribution-unknown');
  assert.ok(report.analysis.uncertainties.some(i => i.code === 'DEPENDENCY_UNCERTAINTY' && i.location === 'src/Dynamic.ts'));
  assert.deepEqual(tree(f.root), before);
});

test('external token CSS changes are projected without deleting local tokens, evidence or shared resources', t => {
  const f = fixture(t), metadata = read(f, f.metadataPath);
  const external = { id: 'remote-color', cssName: '--remote-color', type: 'COLOR', value: '#ff0000' };
  metadata.externalVariables = [external];
  write(f, f.metadataPath, metadata);
  const baseline = generateTokensCss(f.root);
  assert.deepEqual(baseline.errors, []);
  write(f, 'src/styles/tokens.css', baseline.css);
  const before = tree(f.root), report = removalReport(f.root, f.metadataPath);
  assert.equal(report.projectedEffects.generatedCss.status, 'PROJECTED', JSON.stringify(report.analysis));
  assert.equal(report.projectedEffects.generatedCss.generatedOutputWouldChange, true);
  assert.deepEqual(tree(f.root), before);
  addComponent(f, { externalVariables: [external] });
  const shared = removalReport(f.root, f.metadataPath);
  assert.equal(shared.projectedEffects.generatedCss.generatedOutputWouldChange, false);
});

test('dependency reachability includes barrels without claiming a direct import or authorizing cascading edits', t => {
  const f = fixture(t);
  write(f, 'src/Barrel.ts', 'export { PreviewGlyph } from "./PreviewGlyph";');
  write(f, 'src/Entry.ts', 'export { PreviewGlyph } from "./Barrel";');
  const session = createDependencySession(f.root);
  const full = session.resolve(['src/Entry.ts']);
  assert.ok(full.files.includes('src/PreviewGlyph.tsx'));
  assert.ok(full.files.includes('src/Barrel.ts'));
  const report = removalReport(f.root, f.metadataPath);
  assert.ok(report.blockers.some(b => b.source === 'src/Entry.ts' && b.scope.startsWith('dependency-closure')));
  assert.ok(report.blockers.some(b => b.source === 'src/Barrel.ts'));
  assert.equal(report.execution, 'NOT_EXECUTED_READ_ONLY');
});

test('CLI returns a read-only blocked report and rejects execution flags', t => {
  const f = fixture(t), command = '.agents/skills/create-ds-from-figma/scripts/report-component-removal.mjs';
  write(f, 'src/Consumer.tsx', 'export { PreviewGlyph } from "./PreviewGlyph";');
  const before = tree(f.root), run = spawnSync(process.execPath, [command, f.root, f.metadataPath], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).removalAssessment, 'BLOCKED');
  assert.notEqual(spawnSync(process.execPath, [command, f.root, f.metadataPath, '--apply'], { encoding: 'utf8' }).status, 0);
  assert.deepEqual(tree(f.root), before);
});

test('incompatible surviving external serialization is reported, never silently deleted to generate CSS', t => {
  const f = fixture(t), metadata = read(f, f.metadataPath), state = read(f, stateFile);
  metadata.externalVariables = [{ id: 'remote-size', cssName: '--remote-size', type: 'FLOAT', value: 4 }];
  state.externalSerialization = { 'remote-size': { css: { kind: 'unit', unit: 'px' }, source: { type: 'user' } } };
  write(f, f.metadataPath, metadata);
  write(f, stateFile, state);
  const baseline = generateTokensCss(f.root);
  assert.deepEqual(baseline.errors, []);
  write(f, 'src/styles/tokens.css', baseline.css);
  const before = tree(f.root), report = removalReport(f.root, f.metadataPath);
  assert.equal(report.projectedEffects.generatedCss.status, 'NOT DETERMINED');
  assert.match(report.projectedEffects.generatedCss.error, /remote-size/);
  assert.equal(report.removalAssessment, 'BLOCKED');
  assert.ok(report.analysis.uncertainties.some(i => i.code === 'TOKEN_PROJECTION_UNAVAILABLE'));
  assert.deepEqual(tree(f.root), before);
});

test('malformed unrelated registrations and source symlinks stay explicit uncertainties', t => {
  const f = fixture(t), map = read(f, mapFile);
  map.broken = { designSystem: { metadata: 'missing.json' } };
  write(f, mapFile, map);
  symlinkSync(path.join(f.root, 'src/PreviewGlyph.tsx'), path.join(f.root, 'src/Linked.tsx'));
  const report = removalReport(f.root, f.metadataPath);
  assert.equal(report.analysis.status, 'PARTIAL');
  assert.equal(report.removalAssessment, 'BLOCKED');
  assert.ok(report.analysis.uncertainties.some(i => i.code === 'UNREADABLE_COMPONENT'));
  assert.ok(report.analysis.uncertainties.some(i => i.code === 'SYMLINK_INPUT'));
  assert.ok(!report.files.some(f => f.path === 'src/Linked.tsx'));
});

test('target traversal paths are rejected before component directory discovery', t => {
  const f = fixture(t), metadata = read(f, f.metadataPath), map = read(f, mapFile);
  metadata.code.path = 'src/components/../../../../outside.tsx';
  map['FILE:1:2'].code.path = metadata.code.path;
  write(f, f.metadataPath, metadata);
  write(f, mapFile, map);
  const before = tree(f.root);
  assert.throws(() => removalReport(f.root, f.metadataPath), /project-relative file path/);
  assert.deepEqual(tree(f.root), before);
});
