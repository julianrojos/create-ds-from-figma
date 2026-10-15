import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { previewModule, receiptHandler, startPreview } from './verification-preview.mjs';
import { sha256 } from '../../../checks/lib/render-plan.mjs';
import { componentCapture, fixtureRenderPlan } from '../../../checks/tests/fixtures/component-capture.mjs';

test('preview mounts recorded props without editing App, escapes source content, imports explicit styles and exposes measurement limits', () => {
  const capture = componentCapture(), verification = fixtureRenderPlan(capture);
  verification.stylesheets = ['src/styles/tokens.css'];
  verification.cases[0].props.children = '</script><script>bad()</script>';
  const code = previewModule({ code: { component: 'Example', path: 'src/Example.tsx' }, verification, parts: {}, measuredLiterals: [] }, capture, 'secret');
  assert.match(code, /React.createElement\(Component, configuration.props\)/);
  assert.match(code, /import "\/src\/styles\/tokens.css"/);
  assert.match(code, /crypto.subtle.digest/);
  assert.match(code, /document.fonts.ready/);
  assert.match(code, /checkResult: document.fonts.check/);
  assert.doesNotMatch(code, /available:/);
  assert.match(code, /State activations and mode scopes require independent verification/);
  assert.doesNotMatch(code, /<script>|App.tsx/);
});

test('project Vite configuration cannot execute without explicit approval', async () => {
  await assert.rejects(() => startPreview(os.tmpdir(), 'missing.json', { viteConfig: 'vite.config.ts' }), /approve-config/);
});

test('generated collector scopes parts to the outer component and excludes nested roots and names', async () => {
  const element = (part, label, parent = null) => ({
    part, textContent: label, className: part, parentElement: parent, children: [],
    getAttribute() { return this.part; },
    closest() { return this.part === 'root' ? this : this.parentElement?.closest() ?? null; },
    querySelectorAll(selector) { const descendants = this.children.flatMap(c => [c, ...c.querySelectorAll('[data-ds-part]')]); return selector.includes('="root"') ? descendants.filter(c => c.part === 'root') : descendants; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 48, height: 48 }; },
  });
  const target = element(null, ''), outer = element('root', 'outer', target), initial = element('initial', 'F', outer);
  const inner = element('root', 'inner', outer), innerInitial = element('initial', 'M', inner);
  target.children = [outer]; outer.children = [initial, inner]; inner.children = [innerInitial]; target.setAttribute = () => {};
  const capture = componentCapture(), verification = fixtureRenderPlan(capture), bodies = [];
  const context = { React: { createElement() {} }, createRoot: () => ({ render() {} }), exports: { Example() {} }, URL, TextEncoder,
    location: { href: `http://127.0.0.1/?case=${verification.cases[0].id}` }, window: {},
    document: { getElementById: () => target, fonts: { ready: Promise.resolve() }, addEventListener() {} },
    requestAnimationFrame: callback => callback(), getComputedStyle: () => ({ getPropertyValue: () => '' }),
    innerWidth: 640, innerHeight: 480, devicePixelRatio: 1, crypto: webcrypto, console: { error() {} },
    fetch: async (_url, request) => { bodies.push(JSON.parse(new TextDecoder().decode(request.body))); return { ok: true, json: async () => ({ sha256: sha256(request.body), bytes: request.body.length }) }; },
  };
  const source = previewModule({ code: { component: 'Example', path: 'src/Example.tsx' }, evidence: { hash: 'a'.repeat(64) }, verification,
    parts: { root: {}, initial: {} } }, capture, 'session').replace(/^import .*;$/gm, '');
  vm.runInNewContext(source, context);
  await context.window.__dsVerification.collect();
  assert.equal(context.window.__dsVerification.status, 'recorded');
  assert.equal(bodies.at(-1).parts.root.count, 1);
  assert.deepEqual(bodies.at(-1).parts.initial.elements.map(e => e.text), ['F']);
  target.children.push(element('root', 'sibling', target));
  await assert.rejects(context.window.__dsVerification.collect(), /root part is missing or ambiguous/);
  target.children = [];
  await assert.rejects(context.window.__dsVerification.collect(), /root part is missing or ambiguous/);
});

test('percentage expectations do not reuse a bound font-size from another mode', () => {
  const capture = componentCapture();
  capture.observations.push({ id: 'height', node: '1:3', kind: 'property', field: 'lineHeight', value: { unit: 'PERCENT', value: 120 } },
    { id: 'size', node: '1:3', kind: 'property', field: 'fontSize', value: 20 }, { id: 'size-binding', node: '1:3', kind: 'binding', field: 'fontSize' });
  const module = previewModule({ code: { path: 'src/Example.tsx', component: 'Example' }, verification: fixtureRenderPlan(capture), parts: {}, measuredLiterals: [{ observation: 'height' }] }, capture, 'session');
  assert.match(module, /"comparable":false/);
  assert.doesNotMatch(module, /24px/);
});

test('HTTP receipt preserves original bytes, checks both hashes, rejects unsafe requests and never claims fidelity', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'receipt-test-'));
  const cases = [{ id: 'source', viewport: { width: 640, height: 480 } }];
  let files = [];
  const handler = receiptHandler({ session: 'secret', directory, manifest: { files: [], caseMetadataHashes: { source: 'a'.repeat(64) } }, currentFiles: () => files, cases, maxBytes: 512 });
  const server = createServer((req, res) => handler(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/__ds_verification/receipt`;
  const body = '{ "schemaVersion": 1, "caseId": "source", "phase": "measurement", "parts": {}, "fonts": [], "viewport": { "width": 640, "height": 480 }, "configuration": {"id":"source","viewport":{"width":640,"height":480}} }\n';
  const post = (value, session = 'secret', hash = sha256(Buffer.from(value))) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ds-session': session, 'x-body-sha256': hash }, body: value });
  assert.equal((await post(body, 'wrong')).status, 403);
  assert.equal((await post(body, 'secret', 'wrong')).status, 400);
  assert.equal((await post('a'.repeat(513))).status, 413);
  assert.equal((await post('{}')).status, 400);
  assert.equal((await post(body.replace('"id":"source"', '"id":"fabricated"'))).status, 400);
  const response = await post(body); assert.equal(response.status, 200);
  const receipt = await response.json();
  assert.equal(readFileSync(receipt.file, 'utf8'), body);
  assert.equal(receipt.sha256, sha256(readFileSync(receipt.file)));
  assert.equal(receipt.bytes, Buffer.byteLength(body));
  const report = JSON.parse(readFileSync(path.join(directory, 'source-1.receipt.json'), 'utf8'));
  assert.equal(report.status, 'NOT VERIFIED'); assert.equal(report.viewportMatches, true);
  assert.equal(report.metadataHash, 'a'.repeat(64));
  files = [{ path: 'component.tsx', sha256: 'changed-input-hash' }];
  await post(body); assert.equal(readdirSync(directory).length, 4);
  const changed = JSON.parse(readFileSync(path.join(directory, 'source-2.receipt.json'), 'utf8'));
  assert.equal(changed.inputsUnchangedSinceStart, false); assert.deepEqual(changed.files, files);
});

test('measurement waits for the mount and then for fonts, even when fonts.ready predates the render', async () => {
  const element = (part, parent = null) => ({
    part, textContent: 'F', className: part, parentElement: parent, children: [],
    getAttribute() { return this.part; },
    closest() { return this.part === 'root' ? this : this.parentElement?.closest() ?? null; },
    querySelectorAll(selector) { const descendants = this.children.flatMap(c => [c, ...c.querySelectorAll('[data-ds-part]')]); return selector.includes('="root"') ? descendants.filter(c => c.part === 'root') : descendants; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 48, height: 48 }; },
  });
  const target = element(null), outer = element('root', target);
  target.setAttribute = () => {};
  const capture = componentCapture(), verification = fixtureRenderPlan(capture), seen = [];
  let frames = 0;
  const fonts = { ready: Promise.resolve(), status: 'loaded' };
  const context = { React: { createElement() {} }, createRoot: () => ({ render() {} }), exports: { Example() {} }, URL, TextEncoder,
    location: { href: `http://127.0.0.1/?case=${verification.cases[0].id}` }, window: {},
    document: { getElementById: () => target, fonts, addEventListener() {} },
    // The component mounts on frame 3 and only then asks for a font, which finishes loading on frame 7.
    requestAnimationFrame: callback => {
      frames++;
      if (frames === 3) { target.children = [outer]; fonts.status = 'loading'; }
      if (frames === 7) fonts.status = 'loaded';
      callback();
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    innerWidth: 640, innerHeight: 480, devicePixelRatio: 1, crypto: webcrypto, console: { error() {} },
    fetch: async (_url, request) => { seen.push({ fonts: fonts.status, roots: target.children.length }); return { ok: true, json: async () => ({ sha256: sha256(request.body), bytes: request.body.length }) }; },
  };
  const source = previewModule({ code: { component: 'Example', path: 'src/Example.tsx' }, evidence: { hash: 'a'.repeat(64) }, verification,
    parts: { root: {} } }, capture, 'session').replace(/^import .*;$/gm, '');
  vm.runInNewContext(source, context);
  await context.window.__dsVerification.collect();
  assert.equal(context.window.__dsVerification.status, 'recorded');
  assert.ok(seen.length >= 1);
  for (const record of seen) assert.deepEqual(record, { fonts: 'loaded', roots: 1 }, 'recorded only after the mount and the font load');
  // A font that never finishes loading is an explicit failure, not a measurement taken on the fallback face.
  fonts.status = 'loading'; frames = 100;
  context.requestAnimationFrame = callback => callback();
  await assert.rejects(context.window.__dsVerification.collect(), /still loading|Fonts were/);
});
