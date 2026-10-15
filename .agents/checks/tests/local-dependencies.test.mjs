import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDependencySession, localDependencies } from '../lib/local-dependencies.mjs';

test('local dependency closure follows imports, CSS URLs, aliases and internal symlinks without scanning unrelated files', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dependency-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), value); };
  write('package.json', '{}');
  write('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['shared/*'] } } }));
  write('src/Root.tsx', 'import "./styles.css"; import "@shared/helper"; import "./linked/helper"; import("./dynamic"); new URL("../assets/local.png", import.meta.url);');
  write('src/styles.css', '@import "../shared/base.css"; .root { background: url("/image.png"); }');
  write('shared/base.css', '.root { color: black; }');
  write('shared/helper.ts', 'import "../src/Root";');
  write('src/dynamic.ts', 'export const x = 1;');
  write('assets/local.png', 'synthetic'); write('public/image.png', 'synthetic');
  write('src/Other.tsx', 'unrelated'); write('src/.DS_Store', 'system'); write('src/.legitimate.ts', 'export const x = 1;');
  symlinkSync(path.join(root, 'shared'), path.join(root, 'src/linked'));
  const result = localDependencies(root, ['src/Root.tsx']);
  assert.equal(result.warnings.length, 0, result.warnings.join('\n'));
  for (const file of ['src/Root.tsx', 'src/styles.css', 'shared/helper.ts', 'shared/base.css', 'src/dynamic.ts', 'assets/local.png', 'public/image.png']) assert.ok(result.files.includes(file), file);
  assert.ok(!result.files.includes('src/Other.tsx')); assert.ok(!result.files.includes('src/.DS_Store'));
  assert.ok(localDependencies(root, ['src/.legitimate.ts']).files.includes('src/.legitimate.ts'));
});

test('external symlinks and nonliteral imports stay unverified, rather than claiming complete dependency coverage', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dependency-test-')), outside = mkdtempSync(path.join(os.tmpdir(), 'external-dependency-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  writeFileSync(path.join(root, 'package.json'), '{}'); writeFileSync(path.join(outside, 'helper.ts'), 'export const x = 1;');
  symlinkSync(outside, path.join(root, 'linked'));
  writeFileSync(path.join(root, 'Root.ts'), 'import "./linked/helper"; import(name);');
  const result = localDependencies(root, ['Root.ts']);
  assert.ok(result.warnings.some(w => w.includes('outside the project')));
  assert.ok(result.warnings.some(w => w.includes('nonliteral import')));
});

test('dependency configuration ignores parent tsconfigs and records local inheritance', t => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'config-boundary-')), root = path.join(parent, 'project');
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  mkdirSync(root); writeFileSync(path.join(parent, 'tsconfig.json'), 'invalid parent JSON that must not be read');
  writeFileSync(path.join(root, 'package.json'), '{}'); writeFileSync(path.join(root, 'Root.ts'), 'export const x = 1;');
  let result = localDependencies(root, ['Root.ts']);
  assert.deepEqual(result.warnings, []); assert.ok(!result.files.some(f => f.includes('tsconfig')));
  mkdirSync(path.join(root, 'config')); mkdirSync(path.join(root, 'shared'));
  writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ extends: './config/base.json' }));
  writeFileSync(path.join(root, 'config/base.json'), JSON.stringify({ extends: './deep.json' }));
  writeFileSync(path.join(root, 'config/deep.json'), JSON.stringify({ compilerOptions: { baseUrl: '..', paths: { '@shared/*': ['shared/*'] } } }));
  writeFileSync(path.join(root, 'Root.ts'), 'import "@shared/helper";'); writeFileSync(path.join(root, 'shared/helper.ts'), 'export const x = 1;');
  result = localDependencies(root, ['Root.ts']); assert.deepEqual(result.warnings, []);
  for (const file of ['tsconfig.json', 'config/base.json', 'config/deep.json', 'shared/helper.ts']) assert.ok(result.files.includes(file), file);
});

test('external extends and config symlinks are bounded and produce controlled warnings', t => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'config-boundary-')), root = path.join(parent, 'project');
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  mkdirSync(root); writeFileSync(path.join(root, 'package.json'), '{}'); writeFileSync(path.join(root, 'Root.ts'), 'export const x = 1;');
  writeFileSync(path.join(parent, 'external.json'), 'invalid external JSON');
  writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ extends: '../external.json' }));
  let result = localDependencies(root, ['Root.ts']);
  assert.ok(result.warnings.some(w => w.includes('outside the project')));
  assert.ok(result.files.every(f => !f.startsWith('../')));
  rmSync(path.join(root, 'tsconfig.json')); symlinkSync(path.join(parent, 'external.json'), path.join(root, 'tsconfig.json'));
  result = localDependencies(root, ['Root.ts']);
  assert.ok(result.warnings.some(w => w.includes('symlink outside')));
  assert.ok(!result.files.includes('tsconfig.json'));
});

test('dependency caching is isolated to one execution and never shares mutable results', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dependency-session-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'package.json'), '{}'); writeFileSync(path.join(root, 'Root.ts'), 'export const x = 1;');
  const session = createDependencySession(root), original = session.resolve(['Root.ts']);
  original.files.push('mutated');
  assert.ok(!session.resolve(['Root.ts']).files.includes('mutated'));
  assert.deepEqual(session.stats, { analyses: 1, cacheHits: 1 });
  writeFileSync(path.join(root, 'New.ts'), 'export const y = 1;');
  writeFileSync(path.join(root, 'Root.ts'), 'import "./New";');
  const next = createDependencySession(root);
  assert.ok(next.resolve(['Root.ts']).files.includes('New.ts'));
  assert.ok(!next.resolve(['Root.ts'], { runtimeOnly: true }).warnings.length);
  assert.equal(next.stats.analyses, 2); // Runtime and audit graphs are different cache entries.
});

const project = t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dependency-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), value); };
  return { root, write };
};

test('package.json imports aliases are followed as modules, while URL fragments are not', t => {
  const { root, write } = project(t);
  write('package.json', JSON.stringify({ imports: { '#shared': './src/shared.ts' } }));
  write('src/shared.ts', 'export const shared = 1;');
  write('src/Root.tsx', 'import { shared } from "#shared";');
  write('src/styles.css', '.root { fill: url(#gradient); }');
  const aliased = localDependencies(root, ['src/Root.tsx']);
  assert.ok(aliased.files.includes('src/shared.ts'));
  assert.deepEqual(aliased.warnings, []);
  assert.deepEqual(localDependencies(root, ['src/styles.css']).warnings, [], 'a fragment-only reference is not a dependency');
  write('src/Missing.tsx', 'import "#missing";');
  assert.ok(localDependencies(root, ['src/Missing.tsx']).warnings.some(w => w.includes('#missing could not be resolved')), 'an unresolvable alias is reported, not dropped');
});

test('URL strings in markup resolve against the page (public/ then project root), not against the importing file', t => {
  const { root, write } = project(t);
  write('package.json', '{}');
  write('public/avatar.png', 'public');
  write('src/avatar.png', 'source');
  write('src/Root.tsx', 'export const a = <img src="./avatar.png" />; export const b = <img src="/avatar.png" />;');
  const result = localDependencies(root, ['src/Root.tsx']);
  assert.ok(result.files.includes('public/avatar.png'));
  assert.ok(!result.files.includes('src/avatar.png'), 'a sibling file is not what the browser requests');
  write('src/OnlyRoot.tsx', 'export const c = <img src="/src/avatar.png" />;');
  assert.ok(localDependencies(root, ['src/OnlyRoot.tsx']).files.includes('src/avatar.png'), 'the dev server also serves the project root');
  write('src/Missing.tsx', 'export const d = <img src="./nowhere.png" />;');
  assert.ok(localDependencies(root, ['src/Missing.tsx']).warnings.some(w => w.includes('nowhere.png')));
  // CSS url() stays relative to the stylesheet that contains it.
  write('src/styles.css', '.root { background: url("./avatar.png"); }');
  assert.ok(localDependencies(root, ['src/styles.css']).files.includes('src/avatar.png'));
});

test('root-absolute module imports resolve from the project root before public/', t => {
  const { root, write } = project(t);
  write('package.json', '{}');
  write('src/shared.ts', 'export const shared = 1;');
  write('public/logo.svg', '<svg/>');
  write('src/Root.tsx', 'import "/src/shared.ts"; import logo from "/logo.svg";');
  const result = localDependencies(root, ['src/Root.tsx']);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.files.includes('src/shared.ts'));
  assert.ok(result.files.includes('public/logo.svg'), 'public/ remains the fallback for asset imports');
});

test('dynamic imports count as dependencies but never as proof that styles load at runtime', t => {
  const { root, write } = project(t);
  write('package.json', '{}');
  write('src/styles/tokens.css', ':root { --ds-token: 1; }');
  write('src/Root.tsx', 'export function neverCalled() { return import("./styles/tokens.css"); }');
  const audited = localDependencies(root, ['src/Root.tsx']);
  assert.ok(audited.files.includes('src/styles/tokens.css'), 'a change must still expire a confirmation');
  const loaded = localDependencies(root, ['src/Root.tsx'], { runtimeOnly: true });
  assert.ok(!loaded.files.includes('src/styles/tokens.css'));
  assert.ok(loaded.warnings.some(w => w.includes('not credited as loaded')));
  write('src/Static.tsx', 'import "./styles/tokens.css";');
  assert.ok(localDependencies(root, ['src/Static.tsx'], { runtimeOnly: true }).files.includes('src/styles/tokens.css'));
});

test('document URLs normalize like a browser URL, so ../ cannot select a different file', t => {
  const { root, write } = project(t);
  write('package.json', '{}');
  write('public/avatar.png', 'served at /avatar.png');
  write('avatar.png', 'project root file that the page does not request');
  write('src/Root.tsx', 'export const a = <img src="../avatar.png" />; export const b = <img src="./../avatar.png" />;');
  const result = localDependencies(root, ['src/Root.tsx']);
  assert.ok(result.files.includes('public/avatar.png'));
  assert.ok(!result.files.includes('avatar.png'), 'the root-level file is not what /avatar.png serves');
  write('src/Deep.tsx', 'export const c = <img src="../../../../avatar.png" />;');
  assert.ok(localDependencies(root, ['src/Deep.tsx']).files.includes('public/avatar.png'), 'a URL cannot climb above the origin root');
});

test('bare URLs and CSS imports are file-relative, while JS module specifiers stay package names', t => {
  const { root, write } = project(t);
  write('package.json', JSON.stringify({ dependencies: { lodash: '1.0.0' } }));
  write('src/styles/tokens.css', ':root { --ds-x: 1; }');
  write('src/picture.png', 'image');
  write('src/main.css', '@import "styles/tokens.css";');
  write('src/Asset.tsx', 'export const url = new URL("picture.png", import.meta.url);');
  write('src/Pkg.tsx', 'import "styles/tokens.css";');
  write('src/Vendor.css', '@import "lodash/lodash.css";');
  const css = localDependencies(root, ['src/main.css']);
  assert.deepEqual(css.warnings, []);
  assert.ok(css.files.includes('src/styles/tokens.css'), 'a CSS @import without ./ is relative to the stylesheet');
  const asset = localDependencies(root, ['src/Asset.tsx']);
  assert.deepEqual(asset.warnings, []);
  assert.ok(asset.files.includes('src/picture.png'), 'new URL() resolves against the module URL');
  const pkg = localDependencies(root, ['src/Pkg.tsx']);
  assert.ok(!pkg.files.includes('src/styles/tokens.css'), 'a JS import of a bare name is a package, not a sibling file');
  assert.ok(pkg.warnings.some(w => w.includes('styles/tokens.css could not be resolved')));
  assert.deepEqual(localDependencies(root, ['src/Vendor.css']).warnings, [], 'a declared package keeps its CSS import out of the project closure');
});
