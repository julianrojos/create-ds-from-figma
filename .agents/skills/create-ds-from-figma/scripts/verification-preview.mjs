import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer as createPortReservation } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSnapshot, verifyEvidence } from '../../../checks/lib/figma-evidence.mjs';
import { projectFile, sha256, verifyRenderPlan } from '../../../checks/lib/render-plan.mjs';
import { caseInputs } from '../../../checks/lib/comparison-evidence.mjs';
import { renderedExpectation } from '../../../checks/lib/render-values.mjs';
import { verifyIntrinsicCss } from '../../../checks/lib/intrinsic-css.mjs';
import { mappedComponentsOf } from '../../../checks/verify-figma-evidence.mjs';
import { verifyTokenStyles } from '../../../checks/lib/token-styles.mjs';
import { createDependencySession } from '../../../checks/lib/local-dependencies.mjs';
import { MEASUREMENT_VERSION } from '../../../checks/lib/measurement-version.mjs';
import { collectCssDiagnostics } from '../../../checks/lib/css-diagnostics.mjs';
import { previewLogger } from './lib/preview-logger.mjs';
import { evidenceSessionFor } from '../../../checks/lib/evidence-session.mjs';

const json = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const urlPath = relative => '/' + relative.split('/').map(encodeURIComponent).join('/');

export function previewModule(metadata, capture, session, { timeoutMs = 15000, cssDiagnostics = { declarations: [] } } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('Bounded positive collection timeout required');
  const data = { timeoutMs, cssDiagnostics, measurementVersion: MEASUREMENT_VERSION, verification: metadata.verification, parts: metadata.parts, snapshotHash: metadata.evidence?.hash, session, literals: [], bindings: metadata.bindings || [] };
  for (const literal of metadata.measuredLiterals || []) {
    const observation = capture.observations.find(o => o.id === literal.observation);
    const prefix = observation?.field.match(/^segments\[\d+\]\./)?.[0] || '';
    const size = capture.observations.find(o => o.kind === 'property' && o.node === observation?.node && o.field === `${prefix}fontSize`);
    const sizeBound = capture.observations.some(o => o.kind === 'binding' && o.node === observation?.node && o.field === `${prefix}fontSize`);
    data.literals.push({ ...literal, node: observation?.node, expectation: renderedExpectation(observation?.field || '', observation?.value, { fontSize: sizeBound ? undefined : size?.value }) });
  }
  return `import React from 'react';
import { createRoot } from 'react-dom/client';
import * as exports from ${json(urlPath(metadata.code.path))};
${metadata.verification.stylesheets.map(file => `import ${json(urlPath(file))};`).join('\n')}
const data = ${json(data)};
const id = new URL(location.href).searchParams.get('case');
const configuration = data.verification.cases.find(c => c.id === id);
const syntax = data.cssDiagnostics.byCase?.[id] || data.cssDiagnostics;
const target = document.getElementById('component');
if (!configuration) throw new Error('Select an established case id through ?case=ID');
const Component = exports[${json(metadata.code.component)}];
if (!Component) throw new Error('Recorded component export is missing');
for (const [name, value] of Object.entries(configuration.environment.attributes)) target.setAttribute(name, value);
target.className = configuration.environment.classes.join(' ');
createRoot(target).render(React.createElement(Component, configuration.props));
const componentRoot = () => {
  const roots = [...target.querySelectorAll('[data-ds-part="root"]')].filter(e => !e.parentElement?.closest('[data-ds-part="root"]'));
  if (roots.length !== 1) throw new Error('The rendered root part is missing or ambiguous');
  return roots[0];
};
const queryPart = (root, part) => part === 'root' ? [root] : [...root.querySelectorAll('[data-ds-part]')].filter(e => e.getAttribute('data-ds-part') === part && e.closest('[data-ds-part="root"]') === root);
const geometry = element => {
  let visible = true, laidOut = true, axisAligned = true, affine2d = true;
  if (['hidden', 'collapse'].includes(getComputedStyle(element).getPropertyValue('visibility'))) visible = false;
  for (let current = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.getPropertyValue('display') === 'none') { visible = false; laidOut = false; }
    if (Number.parseFloat(style.getPropertyValue('opacity')) === 0) visible = false;
    for (const property of ['rotate', 'scale', 'zoom']) {
      const value = style.getPropertyValue(property);
      if (value && !['none', 'normal', '1'].includes(value)) axisAligned = false;
      if (property === 'rotate' && value && value !== 'none' && !/^[+-]?[\\d.]+(?:deg|grad|rad|turn)$/.test(value)) affine2d = false;
      if (property === 'scale' && value && value !== 'none' && (value.trim().split(/\\s+/).length > 2 || value.trim().split(/\\s+/).some(v => !Number.isFinite(Number(v))))) affine2d = false;
    }
    const perspective = style.getPropertyValue('perspective'), translate = style.getPropertyValue('translate');
    if (perspective && perspective !== 'none' || translate && translate !== 'none' && translate.trim().split(/\\s+/).length > 2) { affine2d = false; axisAligned = false; }
    const transform = style.getPropertyValue('transform');
    if (transform && transform !== 'none') {
      const values = transform.startsWith('matrix(') ? transform.slice(7, -1).split(',').map(Number) : [];
      if (values.length !== 6 || values.some(v => !Number.isFinite(v))) affine2d = false;
      if (values.length !== 6 || values.some(v => !Number.isFinite(v)) || Math.abs(values[0] - 1) > 1e-8 || Math.abs(values[3] - 1) > 1e-8 || Math.abs(values[1]) > 1e-8 || Math.abs(values[2]) > 1e-8) axisAligned = false;
    }
  }
  return { visible, laidOut, axisAligned, affine2d };
};
let sequence = Promise.resolve();
// Hidden tabs may never produce a frame. The timer fallback allows diagnostics, not a claim of a painted frame.
const frames = () => new Promise(resolve => {
  const timer = setTimeout(resolve, 50);
  requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
});
const viewport = () => ({ expected: configuration.viewport, actual: { width: innerWidth, height: innerHeight },
  matches: innerWidth === configuration.viewport.width && innerHeight === configuration.viewport.height });
const showStatus = () => {
  const status = document.getElementById('verification-status'), v = viewport();
  window.__dsVerification.viewport = v;
  if (status) status.textContent = window.__dsVerification.status + ': viewport expected ' + v.expected.width + 'x' + v.expected.height + ', obtained ' + v.actual.width + 'x' + v.actual.height + (window.__dsVerification.error ? '. ' + window.__dsVerification.error : '');
};
const mounted = () => target.querySelectorAll('[data-ds-part="root"]').length > 0;
// React mounts asynchronously and a component asks for its fonts only once it has rendered, so fonts.ready is awaited
// after the mount and the loading state is re-checked after layout, instead of trusting a promise that may predate it.
async function settle(signal) {
  for (let attempt = 0; attempt < 120; attempt++) {
    await frames();
    if (signal.aborted) throw new Error('Collection cancelled');
    if (!mounted()) continue;
    await document.fonts.ready;
    await frames();
    if (document.fonts.status !== 'loading') return;
  }
  // Without a mounted root, componentRoot() reports the missing or ambiguous root precisely.
  if (mounted()) throw new Error('Fonts were still loading when the measurement was due');
}
async function collect(signal, diagnostic) {
  if (!viewport().matches && !diagnostic) throw new Error('Viewport mismatch: adjust the browser viewport to the expected CSS pixels, then collect again; use collect({ diagnostic: true }) only to retain diagnostics');
  await settle(signal);
  if (signal.aborted) throw new Error('Collection cancelled');
  const parts = {};
  const root = componentRoot();
  for (const name of Object.keys(data.parts)) {
    const elements = queryPart(root, name);
    parts[name] = { count: elements.length, elements: elements.map(element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      const properties = new Set(['width', 'height', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'overflow']);
      for (const r of [...data.literals, ...data.bindings].filter(r => r.part === name)) properties.add(r.cssProperty);
      return { text: element.textContent, className: element.className, geometry: geometry(element), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        computed: Object.fromEntries([...properties].map(p => [p, style.getPropertyValue(p).trim()])) };
    }) };
  }
  if (parts.root?.count !== 1) throw new Error('The rendered root part is missing or ambiguous');
  const fonts = data.verification.fonts.map(f => {
    const descriptor = f.css.style + ' ' + f.css.weight + ' 16px ' + JSON.stringify(f.css.family);
    return { id: f.id, descriptor, checkResult: document.fonts.check(descriptor),
      faces: [...document.fonts].filter(face => face.family.replace(/^['\"]|['\"]$/g, '').toLowerCase() === f.css.family.toLowerCase()).map(face => ({ family: face.family.replace(/^['\"]|['\"]$/g, ''), weight: face.weight, style: face.style, status: face.status })) };
  });
  const payload = JSON.stringify({ schemaVersion: 2, measurementVersion: data.measurementVersion, kind: 'browser-measurement', producer: 'verification-preview-v2', capturedAt: new Date().toISOString(), snapshotHash: data.snapshotHash, caseId: configuration.id, phase: 'measurement', url: location.href,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, configuration, parts, fonts,
    cssDiagnostics: { schemaVersion: 1, results: syntax.declarations.map(d => ({ id: d.id, supported: CSS.supports(d.property, d.value), ...(d.supports?.length ? { applicable: d.supports.every(query => CSS.supports(query)) } : {}) })) },
    images: [...target.querySelectorAll('img')].map(img => ({ src: img.currentSrc, complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })),
    limitations: ['Measurements are not visual fidelity or authenticity proof.', 'State activations and mode scopes require independent verification.', 'Font availability and matching faces do not prove the rendered glyph font.'] });
  const bytes = new TextEncoder().encode(payload);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  if (signal.aborted) throw new Error('Collection cancelled');
  const response = await fetch('/__ds_verification/receipt', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ds-session': data.session, 'x-body-sha256': hash }, body: bytes, signal });
  const receipt = await response.json();
  if (!response.ok || receipt.sha256 !== hash || receipt.bytes !== bytes.byteLength) throw new Error('Measurement transfer failed: ' + JSON.stringify(receipt));
  if (signal.aborted) throw new Error('Collection cancelled');
  window.__dsVerification.receipt = receipt;
  window.__dsVerification.status = viewport().matches ? 'recorded' : 'diagnostic-recorded';
  showStatus();
  return receipt;
}
async function boundedCollect(diagnostic) {
  const controller = new AbortController();
  let timer;
  window.__dsVerification.status = 'collecting';
  delete window.__dsVerification.error;
  delete window.__dsVerification.receipt;
  showStatus();
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    controller.abort(); reject(new Error('Collection timed out after ' + data.timeoutMs + 'ms; page visibility: ' + (document.visibilityState || 'unknown') + '. Keep the page active and inspect mount/font/network failures.'));
  }, data.timeoutMs); });
  try { return await Promise.race([collect(controller.signal, diagnostic), timeout]); }
  catch (error) { window.__dsVerification.status = 'failed'; window.__dsVerification.error = error.message; showStatus(); throw error; }
  finally { clearTimeout(timer); controller.abort(); }
}
window.__dsVerification = { status: 'loading', configuration, expectations: data.literals, collect: ({ diagnostic = false } = {}) => {
  sequence = sequence.catch(() => {}).then(() => boundedCollect(diagnostic));
  return sequence;
} };
showStatus();
window.addEventListener('resize', showStatus);
window.__dsVerification.collect().catch(console.error);
document.addEventListener('keydown', event => {
  if (event.key === 'F8') { event.preventDefault(); window.__dsVerification.collect().catch(console.error); }
});
`;
}

export function receiptHandler({ session, directory, manifest, cases, currentFiles, maxBytes = 256 * 1024 }) {
  let sequence = 0;
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/__ds_verification/receipt') return next();
    const send = (code, value) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.method !== 'POST' || req.headers['x-ds-session'] !== session || req.headers['content-type'] !== 'application/json') { req.resume(); return send(403, { error: 'Invalid session or request' }); }
    const chunks = []; let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) { send(413, { error: 'Body exceeds limit' }); return; }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks), hash = sha256(bytes);
      if (req.headers['x-body-sha256'] !== hash) return send(400, { error: 'Transport hash mismatch' });
      const result = JSON.parse(bytes.toString('utf8'));
      if (result.measurementVersion !== MEASUREMENT_VERSION) return send(400, { error: 'Measurement rules version differs from this producer' });
      const configuration = cases.find(c => c.id === result.caseId);
      if (!configuration || result.schemaVersion !== 2 || result.phase !== 'measurement' || !result.parts || !result.viewport || !Array.isArray(result.fonts)) return send(400, { error: 'Invalid measurement envelope' });
      if (JSON.stringify(result.configuration) !== JSON.stringify(configuration)) return send(400, { error: 'Measurement configuration differs from the declared case' });
      // Store the original body, not a parsed/reserialized copy. Hashes cover only declared inputs.
      const name = `${configuration.id}-${++sequence}`;
      const file = path.join(directory, `${name}.json`);
      writeFileSync(file, bytes, { flag: 'wx' });
      const files = currentFiles ? currentFiles(configuration) : manifest.files;
      const { caseFiles, caseMetadataHashes, ...capturedManifest } = manifest;
      writeFileSync(path.join(directory, `${name}.receipt.json`), JSON.stringify({ ...capturedManifest, measurementVersion: MEASUREMENT_VERSION, metadataHash: caseMetadataHashes?.[configuration.id], files, inputsUnchangedSinceStart: JSON.stringify(files) === JSON.stringify(caseFiles?.[configuration.id] || manifest.files), caseId: configuration.id, configuration, body: { file: `${name}.json`, sha256: hash, bytes: size }, recordedAt: new Date().toISOString(), status: 'NOT VERIFIED',
        viewportMatches: result.viewport.width === configuration.viewport.width && result.viewport.height === configuration.viewport.height }, null, 2), { flag: 'wx' });
      send(200, { file, sha256: hash, bytes: size });
    } catch (error) { if (!res.headersSent) send(400, { error: error.message }); }
  };
}

export async function startPreview(root, metadataPath, { port = 0, directory, viteConfig, approveConfig = false, evidenceSession: providedSession } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  root = path.resolve(root);
  if (viteConfig && !approveConfig) throw new Error('Explicit configuration review and --approve-config are required');
  const configFile = viteConfig ? projectFile(root, viteConfig) : false;
  const evidenceSession = evidenceSessionFor(root, { evidenceSession: providedSession });
  const metadata = evidenceSession.json(metadataPath);
  const snapshot = loadSnapshot(root, metadata.evidence.snapshot, { evidenceSession });
  if (snapshot.hash !== metadata.evidence.hash) throw new Error('Metadata snapshot hash mismatch');
  const map = evidenceSession.json('design-system/relationships/figma-code-map.json');
  const entry = Object.entries(map).find(([key, value]) => !key.startsWith('_') && value?.designSystem?.metadata === metadataPath)?.[1];
  if (!entry || entry.code?.path !== metadata.code.path || entry.code?.component !== metadata.code.component) throw new Error('Preview metadata must belong to the component map');
  const names = new Set((metadata.evidence?.dispositions || []).filter(d => d.kind === 'delegated').map(d => d.resolvedComponent));
  const mappedComponents = names.size ? mappedComponentsOf(root, Object.entries(map).filter(([k]) => !k.startsWith('_')), { evidenceSession, names }) : [];
  const evidence = verifyEvidence(metadata, snapshot.capture, { mappedComponents });
  const plan = verifyRenderPlan(root, metadata, snapshot.capture, { delegations: evidence.review.delegations, reserved: [entry.designSystem?.usage] });
  const dependencySession = createDependencySession(root);
  const intrinsic = verifyIntrinsicCss(root, metadata, entry.code?.style);
  const tokenStyles = verifyTokenStyles(root, metadata, { dependencySession });
  plan.errors.push(...tokenStyles.errors); plan.warnings.push(...tokenStyles.warnings);
  plan.errors.push(...intrinsic.errors); plan.warnings.push(...intrinsic.warnings);
  if (evidence.errors.length || plan.errors.length) throw new Error([...evidence.errors, ...plan.errors].join('\n'));
  const require = createRequire(path.join(root, 'package.json'));
  const viteInfo = JSON.parse(readFileSync(require.resolve('vite/package.json'), 'utf8'));
  const viteEntry = viteInfo.exports?.['.']?.import;
  const esmEntry = typeof viteEntry === 'string' ? viteEntry : viteEntry?.default;
  const vite = await import(pathToFileURL(esmEntry ? path.resolve(path.dirname(require.resolve('vite/package.json')), esmEntry) : require.resolve('vite')).href);
  const createServer = vite.createServer || vite.default?.createServer;
  if (typeof createServer !== 'function') throw new Error('Installed Vite does not expose createServer');
  require.resolve('react'); require.resolve('react-dom/client');
  const session = randomBytes(32).toString('hex');
  directory ||= mkdtempSync(path.join(os.tmpdir(), 'ds-verification-'));
  mkdirSync(directory, { recursive: true });
  const scopedCases = metadata.verification.cases.map(c => [c, caseInputs(root, metadata, c, entry.code.style, { dependencySession, evidenceSession })]);
  const casePaths = new Map(scopedCases.map(([c, scoped]) => [c.id, [...new Set([metadataPath, ...(viteConfig ? [viteConfig] : []), ...scoped.files])].sort()]));
  const inputs = [...new Set([...casePaths.values()].flat())].sort();
  const initialHashes = new Map(inputs.map(file => [file, sha256(readFileSync(projectFile(root, file)))]));
  const manifest = { schemaVersion: 1, snapshotHash: snapshot.hash, files: inputs.map(file => ({ path: file, sha256: initialHashes.get(file) })),
    caseFiles: Object.fromEntries([...casePaths].map(([id, files]) => [id, files.map(file => ({ path: file, sha256: initialHashes.get(file) }))])),
    caseMetadataHashes: Object.fromEntries(scopedCases.map(([c, scoped]) => [c.id, scoped.metadataHash])),
    renderer: { vite: viteInfo.version, react: JSON.parse(readFileSync(require.resolve('react/package.json'), 'utf8')).version },
    limitations: ['Declared input hashes do not cover all transitive dependencies, fonts or browser changes.', 'The collector preserves bytes; it does not certify fidelity, authenticity or state activation.'] };
  const syntax = { byCase: Object.fromEntries(scopedCases.map(([c, scoped]) => [c.id, collectCssDiagnostics(root, scoped.files)])) };
  const module = previewModule(metadata, snapshot.capture, session, { cssDiagnostics: syntax });
  let selectedPort = port;
  if (selectedPort === 0) {
    // Vite 5 treats zero as its default port rather than asking the OS for a free one.
    const reservation = createPortReservation();
    await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    selectedPort = reservation.address().port;
    await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  }
  const server = await createServer({ root, configFile, appType: 'custom', cacheDir: path.join(directory, 'vite-cache'), esbuild: { jsx: 'automatic' },
    customLogger: previewLogger(), clearScreen: false,
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
    server: { host: '127.0.0.1', port: selectedPort, strictPort: true },
    plugins: [{ name: 'ds-verification-preview', resolveId(id) { if (id === '/__ds_verification.tsx') return '\0ds-verification.tsx'; },
      load(id) { if (id === '\0ds-verification.tsx') return module; } }],
  });
  server.middlewares.use(receiptHandler({ session, directory, manifest, cases: metadata.verification.cases,
    currentFiles: configuration => casePaths.get(configuration.id).map(file => ({ path: file, sha256: sha256(readFileSync(projectFile(root, file))) })) }));
  server.middlewares.use(async (req, res, next) => {
    if (req.url?.split('?')[0] === '/__ds_css_diagnostics') {
      try {
        const diagnostic = collectCssDiagnostics(root, [], { application: true });
        res.setHeader('content-type', 'text/html');
        res.end('<!doctype html><html><head><meta charset="utf-8"><title>Application CSS diagnostics</title></head><body><pre id="result"></pre><script>const source=' + json(diagnostic) + '; window.__dsCssDiagnostics={...source, results:source.declarations.map(d=>({...d,supported:CSS.supports(d.property,d.value),...(d.supports?.length?{applicable:d.supports.every(query=>CSS.supports(query))}:{})}))}; document.getElementById("result").textContent=JSON.stringify(window.__dsCssDiagnostics,null,2);</script></body></html>');
      } catch (error) { next(error); }
      return;
    }
    if (req.url?.split('?')[0] !== '/__ds_verification') return next();
    try {
      const html = await server.transformIndexHtml(req.url, '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DS verification</title></head><body><main id="component"></main><output id="verification-status" style="display:block;margin-top:24px"></output><script type="module" src="/__ds_verification.tsx"></script></body></html>');
      res.setHeader('content-type', 'text/html'); res.end(html);
    } catch (error) { next(error); }
  });
  try { await server.listen(); }
  catch (error) { await server.close(); throw error; }
  return { server, directory, diagnosticsUrl: `http://127.0.0.1:${server.httpServer.address().port}/__ds_css_diagnostics`, warnings: [...evidence.warnings, ...plan.warnings, ...scopedCases.flatMap(([, scoped]) => scoped.warnings), ...Object.values(syntax.byCase).flatMap(s => [...s.errors, ...s.warnings])], urls: metadata.verification.cases.map(c => ({ id: c.id, viewport: c.viewport, url: `http://127.0.0.1:${server.httpServer.address().port}/__ds_verification?case=${c.id}` })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , root, metadata, requestedPort, ...flags] = process.argv;
    if (!root || !metadata) throw new Error('Usage: node verification-preview.mjs ROOT METADATA_PATH [PORT]');
    const port = requestedPort === undefined ? 0 : Number(requestedPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
    let viteConfig, approveConfig = false;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i] === '--config' && flags[i + 1] && !viteConfig) viteConfig = flags[++i];
      else if (flags[i] === '--approve-config' && !approveConfig) approveConfig = true;
      else throw new Error('Unknown or duplicated preview option');
    }
    const preview = await startPreview(root, metadata, { port, viteConfig, approveConfig });
    console.log(JSON.stringify({ directory: preview.directory, cases: preview.urls, diagnosticsUrl: preview.diagnosticsUrl, warnings: preview.warnings }, null, 2));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.server.close(); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
