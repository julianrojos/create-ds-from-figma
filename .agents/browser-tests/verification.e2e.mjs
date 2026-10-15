import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { browserRuntime, repoRoot } from '../scripts/test-kit.mjs';
import { createPreviewProject } from '../checks/tests/fixtures/preview-project.mjs';
import { runBrowserVerification, browserVerificationExitCode } from '../skills/create-ds-from-figma/scripts/verification-browser.mjs';
import { sha256 } from '../checks/lib/render-plan.mjs';

const runtime = browserRuntime();
const playwright = await import(pathToFileURL(path.join(runtime, 'node_modules/playwright/index.mjs')).href);
const executablePath = playwright.chromium.executablePath();
if (!existsSync(executablePath)) throw new Error('Locked Chromium binary missing. Run npm run test:browser:setup. The real-browser regression is required, not skipped.');
const output = path.join(repoRoot, 'test-results/browser');
mkdirSync(output, { recursive: true });

test('real headless regression: geometry, transfer, publication and application syntax are checked separately', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const options = { playwright, executablePath, port: 5187 };
  writeFileSync(path.join(root, 'src/App.tsx'), 'export const App=()=> <main style={{display:"\'flex\'"}}/>;');
  const broken = await runBrowserVerification(root, metadataPath, options);
  t.after(() => rmSync(broken.directory, { recursive: true, force: true }));
  assert.equal(broken.blocked.length, 0, JSON.stringify(broken.blocked));
  assert.equal(broken.manifest.cases.length, 3);
  assert.equal(broken.closure.state, 'failed', JSON.stringify(broken.closure));
  assert.ok(broken.application.results.some(r => r.file === 'src/App.tsx' && !r.supported));
  const file = path.join(root, 'src/PreviewGlyph.module.css');
  writeFileSync(file, readFileSync(file, 'utf8').replace('border: 1px solid black;', 'border: none;'));
  const fixed = await runBrowserVerification(root, metadataPath, options);
  t.after(() => rmSync(fixed.directory, { recursive: true, force: true }));
  assert.equal(fixed.blocked.length, 0, JSON.stringify(fixed.blocked));
  assert.equal(fixed.closure.state, 'pending', JSON.stringify(fixed.closure));
  assert.equal(fixed.closure.pending.length, 1);
  assert.match(fixed.closure.pending[0].reason, /Specific typography review required/);
  assert.deepEqual(fixed.closure.stale, []);
  assert.equal(fixed.closure.failures.length, 0);
  assert.equal(fixed.closure.complete, false);
  assert.ok(fixed.application.results.some(r => !r.supported), 'application failure does not contaminate the component closure');
  assert.ok(fixed.application.checks.some(c => c.status === 'FAIL' && c.declaration.file === 'src/App.tsx'));
  assert.equal(fixed.application.status, 'FAIL');
  assert.ok(fixed.application.reason);
  writeFileSync(path.join(output, 'regression.json'), JSON.stringify({ schemaVersion: 1, broken: broken.closure, fixed: fixed.closure,
    applicationFailures: fixed.application.results.filter(r => !r.supported), scope: 'Real synthetic regression, not Figma fidelity confirmation.' }, null, 2));
});

test('real CSS diagnostics serialize React numbers and distinguish inactive feature queries from vendor support', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'src/App.tsx'), 'export const App=()=> <main style={{padding:48,marginTop:-2,opacity:0.5,lineHeight:1.2,width:0,WebkitLineClamp:3}}/>;');
  writeFileSync(path.join(root, 'src/vendor.css'), '@supports (-moz-appearance: none) {.x{display:"flex"}} .x{-moz-appearance:none;display:flex}');
  const result = await runBrowserVerification(root, metadataPath, { playwright, executablePath, port: 5187 });
  t.after(() => rmSync(result.directory, { recursive: true, force: true }));
  assert.deepEqual(result.application.errors, []);
  const inline = result.application.checks.filter(c => c.declaration?.file === 'src/App.tsx');
  assert.equal(inline.length, 6);
  assert.ok(inline.every(c => c.status === 'PASS'), JSON.stringify(inline));
  const React = (await import(pathToFileURL(path.join(runtime, 'node_modules/react/index.js')).href)).default;
  const { renderToStaticMarkup } = await import(pathToFileURL(path.join(runtime, 'node_modules/react-dom/server.node.js')).href);
  const rendered = renderToStaticMarkup(React.createElement('main', { style: { padding:48, marginTop:-2, opacity:0.5, lineHeight:1.2, width:0, WebkitLineClamp:3 } }));
  for (const check of inline) assert.ok(rendered.includes(`${check.declaration.property}:${check.declaration.value}`), rendered);
  const vendor = result.application.checks.filter(c => c.declaration?.file === 'src/vendor.css');
  assert.equal(vendor.find(c => c.declaration.supports).status, 'PASS');
  assert.equal(vendor.find(c => c.declaration.property === '-moz-appearance').status, 'NOT COMPARABLE');
  assert.ok(!vendor.some(c => c.status === 'FAIL'));
  assert.equal(result.application.status, 'NOT VERIFIED');
  assert.ok(result.application.reason);
  rmSync(path.join(root, 'src/vendor.css'));
  const passed = await runBrowserVerification(root, metadataPath, { playwright, executablePath, port: 5187 });
  t.after(() => rmSync(passed.directory, { recursive: true, force: true }));
  assert.equal(passed.application.status, 'PASS');
  assert.ok(passed.application.reason);
  assert.equal(passed.execution.status, 'COMPLETED');
});

test('browser launch failure preserves a structured pending closure and releases the preview port', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runBrowserVerification(root, metadataPath, { playwright, executablePath: path.join(root, 'missing-browser'), port: 5187 });
    t.after(() => rmSync(result.directory, { recursive: true, force: true }));
    assert.equal(result.execution.status, 'NOT RUN');
    assert.equal(result.execution.phase, 'browser-launch', JSON.stringify(result.execution));
    assert.equal(result.closure.state, 'pending');
    assert.ok(result.closure.pending.length);
    assert.equal(result.closure.failures.length, 0);
    assert.equal(result.application.status, 'NOT RUN');
    assert.ok(result.application.reason);
    assert.equal(browserVerificationExitCode(result), 2);
    assert.equal(JSON.parse(readFileSync(path.join(result.directory, 'result.json'))).execution.phase, 'browser-launch');
  }
});

test('controlled font corpus records loading and repeatability, never a universal Figma tolerance', async () => {
  const browser = await playwright.chromium.launch({ headless: true, executablePath, timeout: 20000 });
  try {
    const fonts = ['400', '600'].map(weight => {
      const file = path.join(runtime, `node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff2`), bytes = readFileSync(file);
      return { weight, sha256: sha256(bytes), url: 'data:font/woff2;base64,' + bytes.toString('base64') };
    });
    const measure = async () => {
      const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
      try {
        const page = await context.newPage();
        await page.setContent('<!doctype html><html><head><style>body{margin:0}span{display:inline-block;white-space:pre;font-family:Inter}</style></head><body></body></html>');
        await page.addStyleTag({ content: fonts.map(f => `@font-face{font-family:Inter;font-weight:${f.weight};font-style:normal;src:url("${f.url}") format("woff2")}`).join('\n') });
        await page.evaluate(() => { document.fonts.load('400 16px Inter'); document.fonts.load('600 16px Inter'); });
        await page.waitForFunction(() => document.fonts.status === 'loaded' && [...document.fonts].filter(f => f.status === 'loaded').length === 2, undefined, { timeout: 20000 });
        return await page.evaluate(() => {
      const result = [];
      for (const weight of ['400', '600']) for (const size of [12, 14, 16, 20]) for (const text of ['F', 'W', 'M', 'Title', 'Body text', 'Wide initials WWW', '1234567890']) {
        const e = document.createElement('span'); e.textContent = text; e.style.fontSize = size + 'px'; e.style.fontWeight = weight; e.style.lineHeight = '1.4'; document.body.append(e);
        const a = e.getBoundingClientRect();
        result.push({ weight, size, text, width: a.width, height: a.height }); e.remove();
      }
      return result;
        });
      } finally { await context.close(); }
    };
    const first = await measure(), second = await measure();
    const samples = first.map((sample, i) => ({ ...sample, repeatDelta: { width: second[i].width - sample.width, height: second[i].height - sample.height } }));
    assert.equal(samples.length, 56);
    for (const sample of samples) { assert.ok(sample.width > 0 && sample.height > 0); assert.deepEqual(sample.repeatDelta, { width: 0, height: 0 }); }
    writeFileSync(path.join(output, 'typography-corpus.json'), JSON.stringify({ schemaVersion: 1, browser: await browser.version(),
      platform: process.platform, architecture: process.arch, node: process.version, viewport: { width: 1000, height: 800 }, devicePixelRatio: 1,
      fonts: fonts.map(({ weight, sha256 }) => ({ family: 'Inter', weight, style: 'normal', package: '@fontsource/inter@5.3.0', sha256 })), samples,
      runs: 2, conclusion: 'Repeatability across two isolated contexts in one pinned renderer; no Figma ground truth, font-binary identity or universal tolerance is established.' }, null, 2));
  } finally { await browser.close(); }
});
