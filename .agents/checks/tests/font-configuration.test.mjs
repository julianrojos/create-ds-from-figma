import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { fontConfigurations } from '../lib/font-configuration.mjs';

function fixture(t) {
  const f = createPreviewProject();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(f.root, f.metadataPath)));
  mkdirSync(path.join(f.root, 'public/fonts'), { recursive: true });
  writeFileSync(path.join(f.root, 'public/fonts/example.woff2'), 'Synthetic bytes, not a real font');
  writeFileSync(path.join(f.root, 'public/fonts/other.woff2'), 'Different synthetic bytes');
  metadata.verification.fonts = [{ id: 'example', css: { family: 'Example Font', weight: '400', style: 'normal' }, source: { kind: 'file', path: 'public/fonts/example.woff2', sha256: 'not examined by declaration linkage' } }];
  return { ...f, metadata, css: path.join(f.root, 'src/base.css') };
}
const face = (src = '/fonts/example.woff2', descriptors = '') => `@font-face { font-family: "Example Font"; src: url("${src}") format("woff2"); ${descriptors} }`;

test('static font linkage matches registered paths and descriptors without certifying loading or source identity', t => {
  const f = fixture(t);
  for (const css of [face(), face('../public/fonts/example.woff2?version=1'), face('/fonts/example.woff2', 'font-weight: 100 900; font-style: normal;')]) {
    writeFileSync(f.css, css);
    const { configurations } = fontConfigurations(f.root, f.metadata);
    assert.equal(configurations[0].status, 'DECLARED');
    assert.deepEqual(configurations[0].matches, [{ stylesheet: 'src/base.css', line: 1 }]);
    assert.match(configurations[0].scope, /not .*loading/);
  }
});

test('a different file, descriptor or malformed declaration cannot establish static font linkage', t => {
  const f = fixture(t);
  for (const css of [face('/fonts/other.woff2'), face('/fonts/example.woff2', 'font-weight: 600;'), face('/fonts/example.woff2', 'font-style: italic;'),
    face().replace('Example Font', 'Another Font'), face().replace('format("woff2")', 'nonsense'), face().replace('font-family:', 'font-family: var(--unknown); unused:'),
    face().replace('src:', 'src: local("Example Font"); unused:'), face().replace('font-family:', 'font-family: bad !important; unused:')]) {
    writeFileSync(f.css, css);
    assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'NOT VERIFIED', css);
  }
});

test('a face weight range can satisfy only a concrete requested resource weight', t => {
  const f = fixture(t);
  writeFileSync(f.css, face('/fonts/example.woff2', 'font-weight: 100 900;'));
  for (const weight of ['normal', 'bold', '450.5']) {
    f.metadata.verification.fonts[0].css.weight = weight;
    assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'DECLARED');
  }
  f.metadata.verification.fonts[0].css.weight = '400 700';
  const result = fontConfigurations(f.root, f.metadata).configurations[0];
  assert.equal(result.status, 'NOT VERIFIED'); assert.match(result.reason, /one concrete/);
});

test('only explicit entry points and unconditional local imports count, with cycles bounded', t => {
  const f = fixture(t), imported = path.join(f.root, 'src/fonts.css');
  writeFileSync(imported, '@import "./base.css";\n' + face());
  writeFileSync(f.css, '@import "./fonts.css";');
  assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'DECLARED');
  for (const css of ['', '@import "./fonts.css" screen;', '@import "https://example.com/font.css";', '@media screen {' + face() + '}', '@supports (display:grid) {' + face() + '}']) {
    writeFileSync(f.css, css);
    const before = readFileSync(f.css);
    assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'NOT VERIFIED', css);
    assert.deepEqual(readFileSync(f.css), before);
  }
  f.metadata.verification.stylesheets = [];
  f.metadata.verification.inputs.push('src/fonts.css');
  assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'NOT VERIFIED', 'audited inputs are not CSS entry points');
});

test('unresolved or missing sources, escaping/external URLs and broken CSS remain diagnostic, not loaded', t => {
  const f = fixture(t);
  for (const css of [face('https://example.com/font.woff2'), face('../../outside.woff2'), '@font-face {', face('/fonts/missing.woff2'), face('/fonts/example%ZZ.woff2')]) {
    writeFileSync(f.css, css);
    const result = fontConfigurations(f.root, f.metadata);
    assert.equal(result.configurations[0].status, 'NOT VERIFIED'); assert.ok(result.warnings.length);
  }
  writeFileSync(f.css, face());
  f.metadata.verification.fonts[0].source = { kind: 'unresolved', reason: 'No approved file' };
  assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'NOT VERIFIED');
  f.metadata.verification.stylesheets.push('missing.css');
  assert.ok(fontConfigurations(f.root, f.metadata).warnings.some(w => w.includes('missing.css')));
});

test('static JavaScript imports and reexports discover CSS without executing project code or crediting dynamic imports', t => {
  const f = fixture(t), entry = path.join(f.root, f.metadata.code.path);
  writeFileSync(path.join(f.root, 'src/fonts.css'), face());
  writeFileSync(path.join(f.root, 'src/bridge.ts'), 'import "./fonts.css"; throw new Error("Must never execute"); export const marker = 1;');
  writeFileSync(entry, 'export { marker } from "./bridge";');
  assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'DECLARED');
  for (const code of ['import("./fonts.css");', 'if (true) require("./fonts.css");', 'import type { X } from "./bridge";',
    'import styles from "./fonts.css?inline";', 'const url = new URL("./fonts.css", import.meta.url);', 'import.meta.glob("./*.css");']) {
    writeFileSync(entry, code);
    assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'NOT VERIFIED', code);
  }
  writeFileSync(entry, 'import "./missing.css"; import("./fonts.css");');
  const result = fontConfigurations(f.root, f.metadata);
  assert.ok(result.warnings.some(w => w.includes('missing.css')));
  assert.ok(result.warnings.some(w => w.includes('dynamic import')));
});

test('remote images and asset URLs do not produce CSS warnings, but external module imports remain unverified', t => {
  const f = fixture(t), entry = path.join(f.root, f.metadata.code.path);
  writeFileSync(f.css, face());
  for (const url of ['https://example.com/avatar.png', '//example.com/avatar.png', 'data:image/png;base64,AA==']) {
    writeFileSync(entry, `export const Image = () => <img src=${JSON.stringify(url)} />; const asset = new URL(${JSON.stringify(url)}, import.meta.url);`);
    const result = fontConfigurations(f.root, f.metadata);
    assert.deepEqual(result.warnings, [], url);
    assert.equal(result.configurations[0].status, 'DECLARED');
  }
  for (const code of ['import "https://example.com/styles.css";', 'export * from "https://example.com/module.js";']) {
    writeFileSync(entry, code);
    assert.ok(fontConfigurations(f.root, f.metadata).warnings.some(w => w.includes('external import') && w.includes('NOT VERIFIED')), code);
  }
  for (const code of ['import("https://example.com/styles.css");', 'require("https://example.com/module.js");']) {
    writeFileSync(entry, code);
    assert.ok(fontConfigurations(f.root, f.metadata).warnings.some(w => w.includes('external dynamic import/require') && w.includes('NOT VERIFIED')), code);
  }
});

test('installed package CSS and unconditional CSS package imports resolve locally, respecting exports', t => {
  const f = fixture(t);
  unlinkSync(path.join(f.root, 'node_modules')); // Isolate package fixtures from the kit's installed dependencies.
  const pkg = path.join(f.root, 'node_modules/example-font'); mkdirSync(pkg, { recursive: true });
  writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'example-font', exports: { './regular.css': './face.css' } }));
  writeFileSync(path.join(pkg, 'face.css'), face('./font.woff2'));
  writeFileSync(path.join(pkg, 'font.woff2'), 'Synthetic installed font bytes');
  f.metadata.verification.fonts[0].source.path = 'node_modules/example-font/font.woff2';
  writeFileSync(path.join(f.root, f.metadata.code.path), 'import "example-font/regular.css";');
  let result = fontConfigurations(f.root, f.metadata);
  assert.equal(result.configurations[0].status, 'DECLARED');
  assert.equal(result.configurations[0].matches[0].stylesheet, 'node_modules/example-font/face.css');
  writeFileSync(path.join(f.root, f.metadata.code.path), 'export const unused = 1;');
  writeFileSync(f.css, '@import "example-font/regular.css";');
  assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'DECLARED');
  for (const css of ['@import "example-font/regular.css" screen;', '@import "example-font/private.css";', '@import "missing-font/regular.css";']) {
    writeFileSync(f.css, css);
    result = fontConfigurations(f.root, f.metadata);
    assert.equal(result.configurations[0].status, 'NOT VERIFIED', css);
    assert.ok(result.warnings.length);
  }
});

test('conditional package exports cannot credit the require face for an import or guess mode/style destinations', t => {
  const f = fixture(t), entry = path.join(f.root, f.metadata.code.path);
  unlinkSync(path.join(f.root, 'node_modules'));
  const pkg = path.join(f.root, 'node_modules/example-font'); mkdirSync(pkg, { recursive: true });
  for (const name of ['import', 'require', 'style']) {
    writeFileSync(path.join(pkg, `${name}.css`), face(`./${name}.woff2`));
    writeFileSync(path.join(pkg, `${name}.woff2`), 'Synthetic font bytes');
  }
  const manifest = branch => writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'example-font', exports: { './regular.css': branch } }));
  manifest({ require: './require.css', import: './import.css' });
  writeFileSync(entry, 'import "example-font/regular.css";');
  f.metadata.verification.fonts[0].source.path = 'node_modules/example-font/require.woff2';
  assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'NOT VERIFIED');
  f.metadata.verification.fonts[0].source.path = 'node_modules/example-font/import.woff2';
  assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'DECLARED');
  writeFileSync(entry, 'export const unused = 1;');
  writeFileSync(f.css, '@import "example-font/regular.css";');
  assert.equal(fontConfigurations(f.root, f.metadata).configurations[0].status, 'DECLARED');
  for (const branch of [{ style: './style.css', import: './import.css' }, { development: './require.css', production: './import.css', default: './style.css' }]) {
    manifest(branch);
    const result = fontConfigurations(f.root, f.metadata);
    assert.equal(result.configurations[0].status, 'NOT VERIFIED'); assert.ok(result.warnings.length);
  }
});

test('worker and unknown queries never credit worker CSS or queried @import declarations', t => {
  const f = fixture(t), entry = path.join(f.root, f.metadata.code.path);
  writeFileSync(path.join(f.root, 'src/worker.ts'), 'import "./worker-fonts.css";');
  writeFileSync(path.join(f.root, 'src/worker-fonts.css'), face());
  for (const query of ['worker', 'sharedworker', 'worker&inline', 'raw', 'url', 'inline', 'v=1', 'future-option']) {
    writeFileSync(entry, `import Worker from "./worker.ts?${query}";`);
    let result = fontConfigurations(f.root, f.metadata);
    assert.equal(result.configurations[0].status, 'NOT VERIFIED', query);
    assert.ok(result.warnings.some(w => w.includes('queries') && w.includes('NOT VERIFIED')), query);
    writeFileSync(entry, 'export const unused = 1;');
    writeFileSync(f.css, `@import "./worker-fonts.css?${query}";`);
    result = fontConfigurations(f.root, f.metadata);
    assert.equal(result.configurations[0].status, 'NOT VERIFIED', query);
    assert.ok(result.warnings.some(w => w.includes('queries')), query);
    writeFileSync(f.css, '');
  }
});
