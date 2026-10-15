import { mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startPreview } from './verification-preview.mjs';
import { publishMeasurement } from '../../../checks/lib/publish-measurement.mjs';
import { closeVerification } from '../../../checks/lib/verification-closure.mjs';
import { projectFile } from '../../../checks/lib/render-plan.mjs';
import { loadSnapshot } from '../../../checks/lib/figma-evidence.mjs';
import { sha256 } from '../../../checks/lib/render-plan.mjs';
import { caseInputs } from '../../../checks/lib/comparison-evidence.mjs';
import { compareCssDiagnostics } from '../../../checks/lib/css-diagnostics.mjs';

export function inspectRunReservation(directory) {
  directory = path.resolve(directory);
  const file = path.join(directory, '.verification-run.lock');
  const result = { directory, file, status: 'unknown', owner: null,
    recovery: 'Preserve this directory and use a different empty output directory (or omit directory for a fresh temporary run). Never reclaim a reservation automatically from a PID check.',
    scope: 'Advisory PID visibility on this host, not proof of process identity, liveness on another host or permission to remove the lock.' };
  try {
    const bytes = readFileSync(file);
    result.sha256 = sha256(bytes);
    let owner;
    try { owner = JSON.parse(bytes); } catch { result.status = 'unrecognized-lock'; return result; }
    if (owner?.schemaVersion !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.hostname !== 'string' || !owner.hostname.trim() || typeof owner.startedAt !== 'string' || !Number.isFinite(Date.parse(owner.startedAt))) { result.status = 'unrecognized-lock'; return result; }
    result.owner = owner;
    if (owner.hostname !== os.hostname()) { result.status = 'other-host-unverified'; return result; }
    try { process.kill(owner.pid, 0); result.status = 'pid-present-identity-unverified'; }
    catch (error) { result.status = error.code === 'ESRCH' ? 'pid-not-visible' : 'process-check-unverified'; }
  } catch (error) { result.status = error.code === 'ENOENT' ? 'missing' : 'unreadable'; }
  return result;
}

export async function calibrateTypography(root, metadataPath, fonts, { playwright, executablePath, port = 5174 } = {}) {
  if (!Array.isArray(fonts) || !fonts.length || fonts.some(f => !f || !['family', 'weight', 'style', 'path'].every(k => typeof f[k] === 'string' && f[k].trim()) || !path.isAbsolute(f.path) || !['normal', 'italic', 'oblique'].includes(f.style))) throw new Error('Calibration needs explicit font descriptors and absolute font file paths');
  const metadata = JSON.parse(readFileSync(projectFile(root, metadataPath), 'utf8'));
  const { capture } = loadSnapshot(root, metadata.evidence.snapshot);
  const sources = fonts.map(f => ({ ...f, sha256: sha256(readFileSync(f.path)), bytes: readFileSync(f.path) }));
  let preview, browser;
  try {
    preview = await startPreview(root, metadataPath, { port });
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), timeout: 20000 });
    const samples = [];
    for (const c of metadata.verification.cases.filter(c => c.kind === 'fidelity')) {
      if (c.states.length) throw new Error('Calibrate interactive states through an explicit activation harness');
      const context = await browser.newContext({ viewport: c.viewport, deviceScaleFactor: 1 });
      try {
        const page = await context.newPage();
        await page.goto(preview.urls.find(u => u.id === c.id).url, { timeout: 20000 });
        const css = sources.map(f => '@font-face{font-family:' + JSON.stringify(f.family) + ';font-style:' + f.style + ';font-weight:' + f.weight + ';src:url("data:font/woff2;base64,' + f.bytes.toString('base64') + '") format("woff2");}').join('\n');
        await page.addStyleTag({ content: css });
        await page.evaluate(fonts => {
          for (const f of fonts) document.fonts.load(`${f.style} ${f.weight} 16px ${JSON.stringify(f.family)}`).catch(() => {});
        }, fonts);
        await page.waitForFunction(fonts => document.fonts.status === 'loaded' && fonts.every(f => [...document.fonts].some(face => face.family.replace(/^["']|["']$/g, '') === f.family && face.weight === f.weight && face.style === f.style && face.status === 'loaded')), fonts, { timeout: 20000 });
        await page.waitForFunction(() => document.querySelector('[data-ds-part="root"]'), undefined, { timeout: 20000 });
        const keys = Object.keys(metadata.parts.root.nodes).filter(k => metadata.parts.root.nodes[k] === c.figmaRef);
        for (const [part, mapping] of Object.entries(metadata.parts)) {
          const refs = [...new Set(keys.map(k => mapping.nodes[k]).filter(Boolean))];
          const node = refs.length === 1 && capture.nodes.find(n => `${capture.source.fileKey}:${n.id}` === refs[0]);
          if (node?.type !== 'TEXT' || node.properties.visible === false) continue;
          const actual = await page.evaluate(part => {
            const root = document.querySelector('#component [data-ds-part="root"]');
            const elements = [...root.querySelectorAll('[data-ds-part]')].filter(e => e.getAttribute('data-ds-part') === part && e.closest('[data-ds-part="root"]') === root);
            if (elements.length !== 1) return null;
            const e = elements[0], r = e.getBoundingClientRect(), s = getComputedStyle(e);
            return { text: e.textContent, width: r.width, height: r.height, family: s.fontFamily, weight: s.fontWeight,
              faces: [...document.fonts].map(f => ({ family: f.family, weight: f.weight, style: f.style, status: f.status })) };
          }, part);
          if (!actual || actual.text !== node.properties.characters) throw new Error(`Calibration configuration/content differs for ${c.id}/${part}`);
          samples.push({ caseId: c.id, part, node: refs[0], expected: { width: node.properties.width, height: node.properties.height }, actual,
            delta: { width: actual.width - node.properties.width, height: actual.height - node.properties.height } });
        }
      } finally { await context.close(); }
    }
    if (!samples.length) throw new Error('No exact comparable text samples were collected');
    const inputs = [...new Set([metadataPath, ...metadata.verification.cases.filter(c => c.kind === 'fidelity').flatMap(c => caseInputs(root, metadata, c).files)])].sort();
    return { schemaVersion: 1, snapshotHash: metadata.evidence.hash, browser: await browser.version(), devicePixelRatio: 1,
      inputs: inputs.map(file => ({ path: file, sha256: sha256(readFileSync(projectFile(root, file))) })),
      fonts: sources.map(({ family, weight, style, path: file, sha256 }) => ({ family, weight, style, file: path.basename(file), sha256 })), samples,
      scope: 'Exploratory metrics for exact source content with explicitly loaded files; not universal tolerance calibration, glyph-font proof or equality with the Figma font binary.' };
  } finally { try { await browser?.close(); } finally { await preview?.server.close(); } }
}

function reserveRunDirectory(directory) {
  directory = directory ? path.resolve(directory) : mkdtempSync(path.join(os.tmpdir(), 'ds-browser-run-'));
  mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, '.verification-run.lock');
  try { writeFileSync(lock, JSON.stringify({ schemaVersion: 1, pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString() }) + '\n', { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw new Error(`Cannot reserve browser output directory ${directory}: ${error.message}`);
    const reservation = inspectRunReservation(directory);
    const failure = new Error(`Cannot reserve browser output directory ${directory}: existing reservation (${reservation.status}${reservation.owner ? `; PID ${reservation.owner.pid}; host ${reservation.owner.hostname}; since ${reservation.owner.startedAt}` : ''}). ${reservation.recovery} Inspect with verification-browser.mjs inspect-lock DIRECTORY.`);
    failure.code = 'DS_OUTPUT_RESERVED';
    failure.reservation = reservation;
    throw failure;
  }
  try {
    if (readdirSync(directory).some(file => file !== '.verification-run.lock')) throw new Error(`Browser output directory must be empty: ${directory}`);
  } catch (error) { unlinkSync(lock); throw error; }
  return { directory, release: () => unlinkSync(lock) };
}

export function browserVerificationExitCode(result) {
  if (result.execution.status === 'NOT RUN' && result.execution.phase !== 'static-validation') return 2;
  return !result.closure.complete || result.blocked.length || result.application.errors?.length || result.application.checks?.some(c => c.status !== 'PASS') ? 1 : 0;
}

// Optional adapter: neither Playwright nor a browser binary is installed or downloaded by this script.
export async function runBrowserVerification(root, metadataPath, { playwright, executablePath, port = 5174, directory, timeoutMs = 20000 } = {}) {
  if (!playwright?.chromium || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('An explicitly supplied Playwright module and bounded timeout are required');
  const reservation = reserveRunDirectory(directory);
  directory = reservation.directory;
  let preview, browser;
  const manifest = { schemaVersion: 1, cases: [] }, blocked = [];
  let closure, execution = { status: 'NOT RUN', phase: 'static-validation' };
  let application = { errors: [], results: [], checks: [], status: 'NOT RUN', reason: 'Application diagnostics were not executed.' };
  try {
    try {
      closure = closeVerification(root, metadataPath, manifest);
      if (closure.state === 'failed') {
        execution.reason = 'Static preflight failed; browser collection was not started. See closure failures and pending measurements.';
      } else {
        const metadata = JSON.parse(readFileSync(projectFile(root, metadataPath), 'utf8'));
        execution.phase = 'preview';
        preview = await startPreview(root, metadataPath, { port });
        execution.phase = 'browser-launch';
        browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), timeout: timeoutMs });
        execution.phase = 'collection';
        for (const c of metadata.verification.cases) {
          if (c.states.length) { blocked.push({ caseId: c.id, status: 'NOT RUN', reason: 'Activate states through the environment browser; this adapter does not invent interaction paths.' }); continue; }
          const context = await browser.newContext({ viewport: c.viewport, deviceScaleFactor: 1 });
          try {
            const page = await context.newPage();
            await page.goto(preview.urls.find(u => u.id === c.id).url, { timeout: timeoutMs });
            await page.waitForFunction(() => ['recorded', 'diagnostic-recorded', 'failed'].includes(window.__dsVerification?.status), undefined, { timeout: timeoutMs });
            const state = await page.evaluate(() => ({ status: window.__dsVerification.status, receipt: window.__dsVerification.receipt, error: window.__dsVerification.error }));
            if (state.status !== 'recorded') throw new Error(state.error || 'Collection did not produce an exact viewport measurement');
            const receipt = state.receipt.file.replace(/\.json$/, '.receipt.json');
            const artifact = publishMeasurement(root, metadata, c.id, receipt);
            manifest.cases.push({ caseId: c.id, artifacts: [artifact] });
          } catch (error) { blocked.push({ caseId: c.id, status: 'NOT RUN', reason: error.message }); }
          finally { await context.close(); }
        }
        const diagnosticContext = await browser.newContext();
        try {
          const page = await diagnosticContext.newPage();
          await page.goto(preview.diagnosticsUrl, { timeout: timeoutMs });
          application = await page.evaluate(() => window.__dsCssDiagnostics);
          if (!application || !Array.isArray(application.results)) throw new Error('Application CSS diagnostics were not produced');
          application.checks = compareCssDiagnostics(application, { cssDiagnostics: { schemaVersion: 1, results: application.results } });
          application.status = application.errors.length || application.checks.some(c => c.status === 'FAIL') ? 'FAIL' : application.checks.some(c => c.status !== 'PASS') ? 'NOT VERIFIED' : 'PASS';
          application.reason = application.status === 'PASS' ? 'Applicable literal syntax checks passed in this browser; not proof of cascade or visual fidelity.' : application.status === 'FAIL' ? 'Application parsing or literal syntax checks failed; see errors and checks.' : 'Application diagnostics ran, but some checks need execution or target-engine review.';
        } catch (error) { application = { errors: [error.message], results: [], checks: [], status: 'NOT RUN', reason: error.message }; }
        finally { await diagnosticContext.close(); }
        closure = closeVerification(root, metadataPath, manifest);
        execution = { status: blocked.length || application.status === 'NOT RUN' ? 'PARTIAL' : 'COMPLETED', phase: 'complete' };
      }
    } catch (error) {
      execution = { status: 'NOT RUN', phase: execution.phase, reason: error.message };
      closure = closeVerification(root, metadataPath, manifest);
    } finally { try { await browser?.close(); } finally { await preview?.server.close(); } }
    const result = { directory, manifest, blocked, application, closure, execution,
      scope: 'Browser measurements and literal syntax diagnostics, not automatic visual judgment or glyph-font proof.' };
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    return result;
  } finally { reservation.release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , first, ...args] = process.argv;
    if (first === 'inspect-lock') {
      if (args.length !== 1) throw new Error('Usage: verification-browser.mjs inspect-lock DIRECTORY');
      console.log(JSON.stringify(inspectRunReservation(args[0]), null, 2));
    } else if (first === 'calibrate') {
      const [root, metadataPath, fontsPath, modulePath, executablePath, output] = args;
      if (!root || !metadataPath || !fontsPath || !path.isAbsolute(modulePath || '')) throw new Error('Usage: verification-browser.mjs calibrate ROOT METADATA FONT_MANIFEST ABSOLUTE_PLAYWRIGHT_MODULE [BROWSER_EXECUTABLE]');
      const result = await calibrateTypography(root, metadataPath, JSON.parse(readFileSync(fontsPath, 'utf8')), { playwright: await import(pathToFileURL(modulePath).href), executablePath });
      if (output) writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
      console.log(JSON.stringify(result, null, 2));
    } else {
    const [root, metadataPath, modulePath, executablePath] = [first, ...args];
    if (!root || !metadataPath || !modulePath || !path.isAbsolute(modulePath)) throw new Error('Usage: verification-browser.mjs ROOT METADATA ABSOLUTE_PLAYWRIGHT_MODULE [BROWSER_EXECUTABLE]');
    const result = await runBrowserVerification(root, metadataPath, { playwright: await import(pathToFileURL(modulePath).href), executablePath });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = browserVerificationExitCode(result);
    }
  } catch (error) { console.error(`NOT RUN: ${error.message}`); process.exitCode = 2; }
}
