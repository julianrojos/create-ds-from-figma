import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, statSync } from 'node:fs';
import { browserRuntime } from '../../scripts/test-kit.mjs';
import { collectCssDiagnostics, compareCssDiagnostics } from './css-diagnostics.mjs';

export function applicationSignals(root) {
  const candidates = ['index.html', ...['App', 'app', 'main', 'index'].flatMap(name =>
    ['tsx', 'jsx', 'ts', 'js', 'mts', 'mjs', 'cts', 'cjs'].map(extension => `src/${name}.${extension}`))];
  return candidates.filter(file => existsSync(path.join(root, file)) && statSync(path.join(root, file)).isFile());
}

export function applicationResult(source, results) {
  const checks = compareCssDiagnostics(source, { cssDiagnostics: { schemaVersion: 1, results } });
  const status = source.errors.length || checks.some(c => c.status === 'FAIL') ? 'FAIL'
    : checks.some(c => c.status !== 'PASS') ? 'NOT VERIFIED' : 'PASS';
  return { ...source, results, checks, status, reason: status === 'PASS'
    ? 'Applicable literal syntax checks passed in this browser; not proof of cascade, React behavior or visual fidelity.'
    : status === 'FAIL' ? 'Application parsing or literal syntax checks failed; see errors and checks.'
      : 'Some literal checks require execution or target-engine review.' };
}

// Only literal data is sent to a blank page: no project modules, Vite config or application code run.
export async function diagnoseApplication(root, { playwright, executablePath, timeoutMs = 20000 } = {}) {
  let browser, source, timer;
  try {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('A bounded diagnostic timeout is required');
    source = collectCssDiagnostics(root, [], { application: true });
    if (!playwright) {
      const runtime = browserRuntime();
      playwright = await import(pathToFileURL(path.join(runtime, 'node_modules/playwright/index.mjs')).href);
    }
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), timeout: timeoutMs });
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    const results = await Promise.race([page.evaluate(declarations => declarations.map(d => ({ id: d.id,
      supported: CSS.supports(d.property, d.value),
      ...(d.supports?.length ? { applicable: d.supports.every(query => CSS.supports(query)) } : {}) })), source.declarations),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Application literal diagnostics timed out')), timeoutMs); })]);
    return { ...applicationResult(source, results), browser: await browser.version() };
  } catch (error) {
    return { ...source, errors: [...(source?.errors || []), error.message], results: [], checks: [], status: 'NOT RUN', reason: error.message };
  } finally { clearTimeout(timer); if (browser) await browser.close(); }
}
