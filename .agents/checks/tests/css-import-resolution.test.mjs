import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { cssImportProblem, resolveCssPackage } from '../lib/css-import-resolution.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'css-package-resolution-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (relative, value) => { const file = path.join(root, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  put('package.json', { type: 'module' }); put('src/entry.ts', ''); put('src/entry.css', '');
  const pkg = data => put('node_modules/example-font/package.json', { name: 'example-font', ...data });
  for (const name of ['import', 'require', 'style', 'default', 'development', 'production', 'browser']) put(`node_modules/example-font/${name}.css`, '/* synthetic CSS */');
  const resolve = (specifier = 'example-font/regular.css', cssImport = false) => resolveCssPackage(root, cssImport ? 'src/entry.css' : 'src/entry.ts', specifier, { cssImport });
  return { root, put, pkg, resolve };
}

test('CSS resolution selects import, never require/node, independent of condition key order', t => {
  const f = fixture(t);
  for (const branch of [{ require: './require.css', import: './import.css' }, { import: './import.css', require: './require.css' }, { node: './require.css', import: './import.css' }]) {
    f.pkg({ exports: { './regular.css': branch } });
    assert.equal(f.resolve(), path.join(f.root, 'node_modules/example-font/import.css'));
    assert.equal(f.resolve(undefined, true), path.join(f.root, 'node_modules/example-font/import.css'));
  }
});

test('exact and wildcard subpaths use the exports resolver, with exclusions never bypassed', t => {
  const f = fixture(t);
  f.pkg({ exports: { './*.css': './import.css', './regular.css': './default.css', './private.css': null } });
  assert.equal(f.resolve(), path.join(f.root, 'node_modules/example-font/default.css'));
  assert.equal(f.resolve('example-font/other.css'), path.join(f.root, 'node_modules/example-font/import.css'));
  f.put('node_modules/example-font/private.css', '/* existing but excluded */');
  assert.throws(() => f.resolve('example-font/private.css'));
  f.pkg({ exports: { './*.css': './themes/*.css' } }); f.put('node_modules/example-font/themes/regular.css', '');
  assert.equal(f.resolve(), path.join(f.root, 'node_modules/example-font/themes/regular.css'));
});

test('style is not assumed universal: CSS imports require consensus, JavaScript does not enable style', t => {
  const f = fixture(t);
  f.pkg({ exports: { './regular.css': { style: './style.css', import: './import.css' } } });
  assert.equal(f.resolve(), path.join(f.root, 'node_modules/example-font/import.css'));
  assert.throws(() => f.resolve(undefined, true), /conditions/);
  f.pkg({ exports: { './regular.css': { style: './import.css', import: './import.css' } } });
  assert.equal(f.resolve(undefined, true), path.join(f.root, 'node_modules/example-font/import.css'));
});

test('mode, browser/module differences and unsupported conditions remain unresolved rather than guessed', t => {
  const f = fixture(t);
  for (const branch of [
    { development: './development.css', production: './production.css', default: './default.css' },
    { browser: './browser.css', import: './import.css' }, { module: './style.css', import: './import.css' },
    { custom: './style.css', import: './import.css' }, { development: './development.css' },
  ]) { f.pkg({ exports: { './regular.css': branch } }); assert.throws(() => f.resolve()); }
  f.pkg({ exports: { './regular.css': { default: './import.css', browser: './browser.css' } } });
  assert.equal(f.resolve(), path.join(f.root, 'node_modules/example-font/import.css'), 'the resolver respects declaration key order, not a hard-coded priority');
});

test('nested conditions and arrays need one unique destination; malformed or missing CSS targets fail closed', t => {
  const f = fixture(t);
  for (const branch of [
    { import: { development: './import.css', default: './import.css' } }, ['./import.css', './import.css'],
  ]) { f.pkg({ exports: { './regular.css': branch } }); assert.equal(f.resolve(), path.join(f.root, 'node_modules/example-font/import.css')); }
  for (const branch of [null, ['./import.css', './require.css'], './missing.css', './other.js', '../outside.css', './node_modules/private.css', './import.css?inline', './%2e%2e/outside.css', 42]) {
    f.pkg({ exports: { './regular.css': branch } }); assert.throws(() => f.resolve(), JSON.stringify(branch));
  }
});

test('all import queries require review, including workers and ordinary cache parameters', t => {
  const f = fixture(t); f.pkg({ exports: { './regular.css': './import.css' } });
  assert.equal(cssImportProblem('example-font/regular.css'), null);
  for (const query of ['worker', 'sharedworker', 'worker&inline', 'raw', 'url', 'inline', 'v=1', 'future-option']) {
    assert.match(cssImportProblem(`./entry.ts?${query}`), /NOT VERIFIED/);
    assert.throws(() => f.resolve(`example-font/regular.css?${query}`), /queries/);
  }
});

test('legacy deep CSS, scoped packages and self references resolve without running a package entry', t => {
  const f = fixture(t); f.pkg({ main: './never-run.js' }); f.put('node_modules/example-font/regular.css', '');
  f.put('node_modules/example-font/never-run.js', 'throw new Error("Do not run");');
  assert.equal(f.resolve(), path.join(f.root, 'node_modules/example-font/regular.css'));
  f.pkg({ style: 'style.css' }); assert.equal(f.resolve('example-font', true), path.join(f.root, 'node_modules/example-font/style.css'));
  f.put('node_modules/@scope/font/package.json', { name: '@scope/font', exports: { './regular.css': './regular.css' } });
  f.put('node_modules/@scope/font/regular.css', '');
  assert.equal(f.resolve('@scope/font/regular.css'), path.join(f.root, 'node_modules/@scope/font/regular.css'));
  f.put('package.json', { name: 'self-font', exports: { './regular.css': './src/entry.css' } });
  assert.equal(f.resolve('self-font/regular.css'), path.join(f.root, 'src/entry.css'));
});

test('browser remapping, external symlinks and escaping specifiers do not receive declaration credit', t => {
  const f = fixture(t);
  f.pkg({ exports: { './regular.css': './import.css' }, browser: { './import.css': './browser.css' } });
  assert.throws(() => f.resolve(), /remapping/);
  f.pkg({ exports: { './regular.css': './escape.css' } });
  symlinkSync(process.execPath, path.join(f.root, 'node_modules/example-font/escape.css'));
  assert.throws(() => f.resolve(), /inside the project/);
  for (const specifier of ['../example-font/regular.css', 'example-font/../regular.css', 'example-font//regular.css', '#fonts', 'example-font/%2e/regular.css']) assert.throws(() => f.resolve(specifier));
});
