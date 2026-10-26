import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { browserRuntime, repoRoot } from '../scripts/test-kit.mjs';
import { classify as classifyClosureCheck } from '../scripts/verify-all.mjs';
import { createPreviewProject } from '../checks/tests/fixtures/preview-project.mjs';
import { runBrowserVerification, browserVerificationExitCode } from '../skills/create-ds-from-figma/scripts/verification-browser.mjs';
import { renderRequirements, sha256 } from '../checks/lib/render-plan.mjs';
import { componentCapture } from '../checks/tests/fixtures/component-capture.mjs';
import { persistCapture } from '../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { verifyImports } from '../checks/verify-imports.mjs';
import { diagnoseApplication } from '../checks/lib/application-diagnostics.mjs';
import { finalizeImport } from '../skills/create-ds-from-figma/scripts/finalize-import.mjs';
import { diagnoseComposition } from '../skills/create-ds-from-figma/scripts/lib/composition-browser.mjs';
import { compositionFixture } from '../checks/tests/fixtures/composition-fixture.mjs';
import { diagnosisActions } from '../checks/lib/diagnosis-actions.mjs';
import { createDelegationProject } from '../checks/tests/fixtures/delegation-project.mjs';
import { renderTokensCss } from '../checks/lib/tokens-css.mjs';
import { activateBrowserCase, collectBrowserCase } from '../skills/create-ds-from-figma/scripts/lib/browser-actions.mjs';

const runtime = browserRuntime();
const playwright = await import(pathToFileURL(path.join(runtime, 'node_modules/playwright/index.mjs')).href);
const executablePath = playwright.chromium.executablePath();
if (!existsSync(executablePath)) throw new Error('Locked Chromium binary missing. Run npm run test:browser:setup. The real-browser regression is required, not skipped.');
const output = path.join(repoRoot, 'test-results/browser');
mkdirSync(output, { recursive: true });

test('initially hidden optional text uses a visible behavior reference in real Chromium without skipping dimensions', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, metadataPath), metadata = JSON.parse(readFileSync(file));
  const original = JSON.parse(readFileSync(path.join(root, metadata.evidence.snapshot))).capture;
  original.nodes[1].properties.visible = false;
  original.nodes[1].properties.componentPropertyReferences = { visible: 'Show helper' };
  Object.assign(metadata.evidence, persistCapture(root, componentCapture({ seeds: original.nodes, rootNodeId: original.source.rootNodeId })));
  const fidelity = metadata.verification.cases[0];
  fidelity.props.show = false;
  const reference = { ...structuredClone(fidelity), id: 'visible-reference', kind: 'behavior', baseline: fidelity.id,
    props: { initial: 'F', show: true }, expectations: [{ kind: 'contained', part: 'initial', container: 'root', inset: 0, reason: 'Visible optional helper stays inside its container.' }] };
  for (const c of metadata.verification.cases.filter(c => c.kind === 'behavior')) {
    c.props.show = true;
    c.measurementBaseline = reference.id;
  }
  metadata.verification.cases.push(reference); // Reference deliberately follows its consumers.
  writeFileSync(file, JSON.stringify(metadata));
  writeFileSync(path.join(root, 'src/PreviewGlyph.tsx'), `import styles from './PreviewGlyph.module.css';
    export function PreviewGlyph({ initial, show }) { return <span data-ds-part="root" className={styles.root}><span hidden={!show} data-ds-part="initial" className={styles.initial}>{initial}</span></span>; }`);
  const css = readFileSync(path.join(root, 'src/PreviewGlyph.module.css'), 'utf8');
  writeFileSync(path.join(root, 'src/PreviewGlyph.module.css'), css + '\n.root{box-sizing:border-box}');
  const run = async () => {
    const result = await finalizeImport(root, metadataPath, { diagnose: true, browserOptions: { executablePath } });
    if (result.diagnosis?.directory) t.after(() => rmSync(result.diagnosis.directory, { recursive: true, force: true }));
    assert.equal(result.diagnosis?.execution.status, 'COMPLETED', JSON.stringify(result));
    return result.diagnosis.diagnostics.cases;
  };
  const good = await run();
  assert.equal(good[0].checks.find(c => c.id === 'geometry:initial')?.status, 'PASS');
  for (const c of good.filter(c => c.kind === 'behavior')) {
    const checks = c.checks.filter(c => c.id.startsWith('behavior:'));
    assert.ok(checks.length);
    assert.ok(checks.every(c => c.status === 'PASS'), JSON.stringify(c));
  }
  writeFileSync(path.join(root, 'src/base.css'), readFileSync(path.join(root, 'src/base.css'), 'utf8') + '\n[data-ds-part="initial"]{display:inline-block;width:12px !important}');
  const broken = await run();
  assert.ok(broken.some(c => c.checks.some(check => check.id.startsWith('behavior:') && check.axis === 'width' && check.status === 'FAIL')), JSON.stringify(broken));
  assert.equal(existsSync(path.join(root, 'design-system/verification')), false);
});

test('generated external FLOAT tokens retain explicit units, unitless values and scaling in real Chromium', async () => {
  const result = renderTokensCss({ collections: [], externals: [
    { id: 'radius', type: 'FLOAT', value: 6, cssName: '--lib-radius' },
    { id: 'weight', type: 'FLOAT', value: 500, cssName: '--lib-weight' },
    { id: 'opacity', type: 'FLOAT', value: 50, cssName: '--lib-opacity' },
  ], externalSerialization: {
    radius: { css: { kind: 'unit', unit: 'px' }, source: { type: 'user' } },
    weight: { css: { kind: 'unitless' }, source: { type: 'user' } },
    opacity: { css: { kind: 'scale', factor: 0.01, unit: '' }, source: { type: 'user' } },
  } });
  assert.deepEqual(result.errors, []);
  const browser = await playwright.chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${result.css} #sample{border-radius:var(--lib-radius);font-weight:var(--lib-weight);opacity:var(--lib-opacity)}</style><div id="sample">Synthetic sample</div>`);
    assert.deepEqual(await page.locator('#sample').evaluate(node => {
      const style = getComputedStyle(node); return { radius: style.borderTopLeftRadius, weight: style.fontWeight, opacity: style.opacity };
    }), { radius: '6px', weight: '500', opacity: '0.5' });
  } finally { await browser.close(); }
});

test('computed color audit detects a cascade error with correct geometry and uses raw Figma paint instead of the declared CSS literal', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, metadataPath), metadata = JSON.parse(readFileSync(file));
  const original = JSON.parse(readFileSync(path.join(root, metadata.evidence.snapshot))).capture;
  original.nodes[0].properties.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
  const capture = componentCapture({ seeds: original.nodes, rootNodeId: original.source.rootNodeId });
  const observation = capture.observations.find(o => o.node === '1:2' && o.field === 'fills');
  Object.assign(metadata.evidence, persistCapture(root, capture));
  metadata.measuredLiterals.push({ observation: observation.id, source: 'FILE:1:2', figmaProperty: 'fills', part: 'root', variant: 'default',
    cssSelector: '.root', cssProperty: 'background-color', value: '#ff0000', translation: 'approximate',
    reason: 'Single synthetic solid fill maps to one CSS background color.', figmaValue: { source: 'PLUGIN', field: 'fills', value: observation.value } });
  writeFileSync(file, JSON.stringify(metadata));
  writeFileSync(path.join(root, 'src/PreviewGlyph.module.css'), readFileSync(path.join(root, 'src/PreviewGlyph.module.css'), 'utf8') + '\n.root{box-sizing:border-box;background-color:#ff0000}');
  const base = readFileSync(path.join(root, 'src/base.css'), 'utf8');
  writeFileSync(path.join(root, 'src/base.css'), base + '\n[data-ds-part="root"]{background-color:blue !important}');
  const run = async () => {
    const result = await finalizeImport(root, metadataPath, { diagnose: true, browserOptions: { executablePath } });
    if (result.diagnosis?.directory) t.after(() => rmSync(result.diagnosis.directory, { recursive: true, force: true }));
    assert.equal(result.diagnosis?.execution.status, 'COMPLETED', JSON.stringify(result)); return result;
  };
  const broken = await run();
  assert.equal(broken.status, 'FAIL');
  for (const c of broken.diagnosis.diagnostics.cases) assert.equal(c.checks.find(c => c.id === 'color:root:background-color').status, 'FAIL');
  assert.equal(broken.diagnosis.diagnostics.cases[0].checks.find(c => c.id === 'geometry:root').status, 'PASS');
  assert.equal(broken.report.components[0].cases[0].computedColors[0].status, 'FAIL');
  writeFileSync(path.join(root, 'src/base.css'), base);
  const corrected = await run();
  assert.equal(corrected.status, 'NOT VERIFIED', JSON.stringify(corrected));
  assert.ok(corrected.diagnosis.diagnostics.cases.every(c => c.checks.find(c => c.id === 'color:root:background-color').status === 'PASS'));
  assert.equal(corrected.report.components[0].coverage.confirmed, null);
  assert.equal(existsSync(path.join(root, 'design-system/verification')), false);
});

test('bound variable alpha is measured once in real Chromium; lost, doubled and separate opacity never pass', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, metadataPath), metadata = JSON.parse(readFileSync(file));
  const original = JSON.parse(readFileSync(path.join(root, metadata.evidence.snapshot))).capture;
  original.nodes[0].properties.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.08,
    boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'color-id' } } }];
  const capture = componentCapture({ seeds: original.nodes, rootNodeId: original.source.rootNodeId,
    collections: [{ id: 'COL', name: 'Colors', defaultModeId: 'Default', modes: [{ modeId: 'Default', name: 'Default' }] }],
    variables: [{ id: 'color-id', name: 'foreground', type: 'COLOR', collectionId: 'COL', valuesByMode: { Default: { r: 0, g: 0, b: 0, a: 0.08 } } }] });
  Object.assign(metadata.evidence, persistCapture(root, capture));
  const observation = capture.observations.find(o => o.node === '1:2' && o.kind === 'binding');
  metadata.bindings.push({ observation: observation.id, node: 'FILE:1:2', variableId: 'color-id', figmaProperty: observation.field,
    part: 'root', variant: 'default', cssSelector: '.root', cssProperty: 'background-color', cssVariable: '--ds-color-id' });
  metadata.verification.stylesheets.push('src/styles/tokens.css');
  for (const c of metadata.verification.cases) c.modes = { COL: 'Default' };
  writeFileSync(file, JSON.stringify(metadata));
  const base = readFileSync(path.join(root, 'src/base.css'), 'utf8');
  const run = async (color, opacity = 1) => {
    writeFileSync(path.join(root, 'src/base.css'), base + `\n[data-ds-part="root"]{background-color:${color};opacity:${opacity}}`);
    const result = await finalizeImport(root, metadataPath, { diagnose: true, browserOptions: { executablePath } });
    if (result.diagnosis?.directory) t.after(() => rmSync(result.diagnosis.directory, { recursive: true, force: true }));
    assert.equal(result.diagnosis?.execution.status, 'COMPLETED', JSON.stringify(result));
    const cases = result.diagnosis.diagnostics.cases;
    assert.ok(cases.some(c => c.kind === 'behavior'));
    return cases.map(c => c.checks.find(check => check.id === 'color:root:background-color'));
  };
  const correct = await run('rgba(0,0,0,.08)');
  assert.ok(correct.every(c => c?.status === 'PASS'), JSON.stringify(correct));
  assert.ok(correct.every(c => c.expected[3] === 0.08));
  for (const color of ['rgb(0,0,0)', 'rgba(0,0,0,.0064)']) {
    const wrong = await run(color);
    assert.ok(wrong.every(c => c?.status === 'FAIL'), JSON.stringify(wrong));
  }
  const separate = await run('rgba(0,0,0,.08)', 0.08);
  assert.ok(separate.every(c => c?.status === 'NOT COMPARABLE'), JSON.stringify(separate));
  assert.equal(existsSync(path.join(root, 'design-system/verification')), false);
});

test('native state assertions collect configured states and detect ignored props without publishing diagnostics', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, metadataPath), metadata = JSON.parse(readFileSync(file));
  metadata.states = [{ name: 'checked', control: 'shared' }, { name: 'disabled', control: 'consumer' }];
  for (const c of metadata.verification.cases) {
    c.props = { ...c.props, checked: true, disabled: true };
    c.states = ['checked', 'disabled'].map(property => ({ name: property, activation: `Native ${property} supplied through the recorded prop.`, verification: { kind: 'native', selector: 'input', property, value: true } }));
  }
  writeFileSync(file, JSON.stringify(metadata));
  const source = 'import {useState} from "react"; import s from "./PreviewGlyph.module.css"; export function PreviewGlyph({initial,checked,defaultChecked=false,disabled}:{initial:string,checked?:boolean,defaultChecked?:boolean,disabled?:boolean}){const [value,setValue]=useState(defaultChecked);return <span data-ds-part="root" className={s.root}><input aria-label="Synthetic control" type="checkbox" checked={checked??value} disabled={disabled} onChange={e=>setValue(e.currentTarget.checked)} style={{position:"absolute",opacity:0}}/><span data-ds-part="initial" className={s.initial}>{initial}</span></span>}';
  writeFileSync(path.join(root, 'src/PreviewGlyph.tsx'), source);
  writeFileSync(path.join(root, 'src/PreviewGlyph.module.css'), readFileSync(path.join(root, 'src/PreviewGlyph.module.css'), 'utf8') + '\n.root {position:relative;box-sizing:border-box}');
  const run = async () => {
    const result = await runBrowserVerification(root, metadataPath, { playwright, executablePath, diagnostic: true });
    t.after(() => rmSync(result.directory, { recursive: true, force: true })); return result;
  };
  const good = await run();
  assert.equal(good.execution.status, 'COMPLETED', JSON.stringify(good));
  assert.equal(good.diagnostics.summary.FAIL, 0);
  for (const c of good.diagnostics.cases) {
    assert.equal(c.checks.find(c => c.id === 'state:checked').status, 'PASS');
    assert.equal(c.checks.find(c => c.id === 'state:disabled').status, 'PASS');
  }
  assert.deepEqual(good.manifest.cases, []); assert.equal(existsSync(path.join(root, 'design-system/verification')), false);
  writeFileSync(path.join(root, 'src/PreviewGlyph.tsx'), source.replace('checked={checked??value}', 'checked={false}'));
  const ignored = await run();
  assert.ok(ignored.diagnostics.cases.every(c => c.checks.find(c => c.id === 'state:checked').status === 'FAIL'));
  writeFileSync(path.join(root, 'src/PreviewGlyph.tsx'), source.replace('disabled={disabled}', 'disabled={false}'));
  const enabled = await run();
  assert.ok(enabled.diagnostics.cases.every(c => c.checks.find(c => c.id === 'state:disabled').status === 'FAIL'));
  writeFileSync(path.join(root, 'src/PreviewGlyph.tsx'), source);
  for (const c of metadata.verification.cases) {
    delete c.props.checked; c.props.defaultChecked = true; c.props.disabled = false;
    c.states[1].verification.value = false;
  }
  writeFileSync(file, JSON.stringify(metadata));
  const uncontrolled = await run();
  assert.equal(uncontrolled.execution.status, 'COMPLETED');
  assert.ok(uncontrolled.diagnostics.cases.every(c => c.checks.filter(check => check.id.startsWith('state:')).every(check => check.status === 'PASS')));
  for (const c of metadata.verification.cases) c.states[0].verification.selector = 'input, span';
  writeFileSync(file, JSON.stringify(metadata));
  const ambiguous = await run();
  assert.ok(ambiguous.diagnostics.cases.every(c => c.checks.find(c => c.id === 'state:checked').status === 'NOT RUN'));
  for (const c of metadata.verification.cases) delete c.states[0].verification;
  writeFileSync(file, JSON.stringify(metadata));
  const unsupported = await run();
  assert.equal(unsupported.execution.status, 'PARTIAL'); assert.equal(unsupported.blocked.length, metadata.verification.cases.length);
});

test('real pointer and keyboard actions are asserted independently in fidelity and required behavior', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, metadataPath), metadata = JSON.parse(readFileSync(file));
  writeFileSync(path.join(root, 'src/PreviewGlyph.tsx'), `import styles from './PreviewGlyph.module.css';
    export function PreviewGlyph({ initial }: { initial: string }) { return <button type="button" data-ds-part="root" className={styles.root}><span data-ds-part="initial" className={styles.initial}>{initial}</span></button>; }`);
  const run = async (property, actions, selector = 'button') => {
    const name = property === 'focus-visible' ? 'focus' : property;
    metadata.states = [{ name, control: 'internal' }];
    for (const c of metadata.verification.cases) {
      c.actions = actions;
      c.states = [{ name, activation: 'Explicit real input followed by an independent DOM assertion.', verification: { kind: 'pseudo', selector, property, value: true } }];
    }
    writeFileSync(file, JSON.stringify(metadata));
    const result = await runBrowserVerification(root, metadataPath, { playwright, executablePath, diagnostic: true });
    t.after(() => rmSync(result.directory, { recursive: true, force: true }));
    assert.equal(result.execution.status, 'COMPLETED', JSON.stringify(result));
    return result.diagnostics.cases.map(c => c.checks.find(check => check.id === `state:${name}`)?.status);
  };
  assert.deepEqual(await run('hover', []), ['FAIL', 'FAIL', 'FAIL'], 'No hover action cannot turn a false reading into PASS.');
  assert.deepEqual(await run('hover', [{ kind: 'hover', selector: 'button' }]), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(await run('focus-visible', [{ kind: 'press', key: 'Tab' }]), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(await run('focus-visible', [{ kind: 'click', selector: 'button' }]), ['FAIL', 'FAIL', 'FAIL'], 'A button clicked by a pointer is not keyboard-focus-visible in the locked Chromium.');
  assert.deepEqual(await run('focus', [{ kind: 'click', selector: 'button' }]), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(await run('hover', [{ kind: 'hover', selector: 'button' }], 'button, span'), ['NOT RUN', 'NOT RUN', 'NOT RUN']);
  assert.deepEqual(await run('hover', [{ kind: 'hover', selector: 'button' }], '.absent'), ['NOT RUN', 'NOT RUN', 'NOT RUN']);
  assert.equal(existsSync(path.join(root, 'design-system/verification')), false);
});

test('interactive collection has a host deadline independent of the page collection promise', async () => {
  const browser = await playwright.chromium.launch({ executablePath, headless: true });
  try {
    for (const recorded of [true, false]) {
      const page = await browser.newPage();
      const html = `<div id="component"><button data-ds-part="root">Probe</button></div><script>
        window.__dsVerification = { status: 'awaiting-interaction', collect: () => {
          window.__dsVerification.status = '${recorded ? 'recorded' : 'collecting'}';
          return new Promise(() => {});
        } };
      </script>`;
      let guard;
      try {
        const collection = Promise.race([
          collectBrowserCase(page, 'data:text/html,' + encodeURIComponent(html), { states: [{ verification: { kind: 'pseudo' } }] }, 1000),
          new Promise((_, reject) => { guard = setTimeout(() => reject(new Error('Test safety deadline: browser collection did not settle')), 5000); }),
        ]);
        if (recorded) {
          await collection;
          assert.equal(await page.evaluate(() => window.__dsVerification.status), 'recorded');
          assert.equal(page.isClosed(), false);
        } else {
          await assert.rejects(collection, /timed out.*host deadline/);
          if (!page.isClosed()) await page.waitForEvent('close', { timeout: 2000 });
          assert.equal(page.isClosed(), true);
        }
      } finally { clearTimeout(guard); await page.close(); }
    }
  } finally { await browser.close(); }
});

test('browser action selectors cannot target another component or nested delegated controls', async () => {
  const browser = await playwright.chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button id="outside">Outside</button><div id="component"><div data-ds-part="root"><button id="owned">Owned</button><div data-ds-part="root"><button id="nested">Nested</button></div></div></div>');
    for (const selector of ['#outside', '#nested']) await assert.rejects(activateBrowserCase(page, { actions: [{ kind: 'click', selector }] }, 1000), /exactly one target owned/);
    await activateBrowserCase(page, { actions: [{ kind: 'click', selector: 'button' }] }, 1000);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'owned');
  } finally { await browser.close(); }
});

test('real native probes read effective disabled, enforce ownership and support keyboard state changes', async () => {
  const { readNativeState } = await import('../checks/lib/native-state.mjs');
  const browser = await playwright.chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<fieldset disabled><label data-ds-part="root"><input type="checkbox" aria-label="Control"/><span data-ds-part="root"><input type="checkbox" checked/></span></label></fieldset>');
    const read = (property, value) => page.evaluate(({ source, property, value }) => {
      const probe = (0, eval)('(' + source + ')');
      return probe(document.querySelector('label'), { name: property, verification: { selector: 'input', property, value } });
    }, { source: readNativeState.toString(), property, value });
    assert.equal((await read('disabled', true)).status, 'PASS', 'fieldset disability is effective even when input.disabled is false');
    assert.equal((await read('checked', false)).status, 'PASS', 'nested roots do not make the target ambiguous');
    await page.locator('fieldset').evaluate(e => e.disabled = false);
    await page.getByLabel('Control').focus(); await page.keyboard.press('Space');
    assert.equal((await read('checked', true)).status, 'PASS');
    assert.equal((await read('disabled', false)).status, 'PASS');
    await page.keyboard.press('Space'); assert.equal((await read('checked', false)).status, 'PASS');
  } finally { await browser.close(); }
});

test('real delegated instance diagnostics block undeclared differences and keep implementations pending specific review', async t => {
  const f = createDelegationProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  f.write('src/PreviewGlyph.tsx', 'import s from "./PreviewGlyph.module.css"; import {Child} from "./Child"; export function PreviewGlyph(){return <span data-ds-part="root" className={s.root}><span data-ds-part="remove" className={s.remove}><Child/></span></span>}');
  f.write('src/PreviewGlyph.module.css', '.root{display:block;position:relative;width:48px;height:48px}.remove{display:block;position:absolute;left:8px;top:8px;width:16px;height:16px}');
  f.write('src/Child.tsx', 'export function Child(){return <span style={{display:"block",width:16,height:16}}><span style={{display:"block",margin:4,width:8,height:8,backgroundColor:"#1a1a1a"}}/></span>}');
  const differences = structuredClone(f.metadata.evidence.dispositions[0].differences);
  f.metadata.evidence.dispositions[0].differences = []; f.write(f.metadataPath, f.metadata);
  const blocked = await runBrowserVerification(f.root, f.metadataPath, { playwright, executablePath, diagnostic: true });
  t.after(() => rmSync(blocked.directory, { recursive: true, force: true }));
  assert.equal(blocked.execution.phase, 'static-validation');
  assert.ok(blocked.closure.failures.some(f => /Undeclared delegation difference/.test(f.reason)));
  f.metadata.evidence.dispositions[0].differences = differences; f.write(f.metadataPath, f.metadata);
  const files = [f.metadataPath, f.childPath, 'src/PreviewGlyph.tsx', 'src/PreviewGlyph.module.css', 'src/Child.tsx'];
  const before = files.map(file => sha256(readFileSync(path.join(f.root, file))));
  const measured = await runBrowserVerification(f.root, f.metadataPath, { playwright, executablePath, diagnostic: true });
  t.after(() => rmSync(measured.directory, { recursive: true, force: true }));
  assert.equal(measured.execution.status, 'COMPLETED', JSON.stringify(measured));
  assert.equal(measured.diagnostics.summary.FAIL, 0); assert.equal(measured.diagnostics.summary['NOT RUN'], 0);
  const check = measured.diagnostics.cases[0].checks.find(c => c.id === differences[0].id);
  assert.equal(check.status, 'NOT COMPARABLE');
  assert.ok(diagnosisActions(f.root, f.metadataPath, measured.diagnostics.cases).some(a => a.code === 'REVIEW_DELEGATION_DIFFERENCE'));
  assert.deepEqual(measured.manifest.cases, []); assert.equal(existsSync(path.join(f.root, 'design-system/verification')), false);
  assert.deepEqual(files.map(file => sha256(readFileSync(path.join(f.root, file)))), before);
});

test('Vite logger messages cannot corrupt preview JSON and ineligible composition never opens a 4x context', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'vite.config.mjs'), `export default { plugins: [{ name: 'forced-log', configResolved(c) {
    c.logger.info('forced optimizer reload'); c.logger.warn('forced warning'); c.logger.error('forced transform diagnostic');
  } }] };`);
  const script = `import {startPreview} from ${JSON.stringify(pathToFileURL(path.join(repoRoot, '.agents/skills/create-ds-from-figma/scripts/verification-preview.mjs')).href)};
    import {rmSync} from 'node:fs';
    const p = await startPreview(${JSON.stringify(root)}, ${JSON.stringify(metadataPath)}, {viteConfig:'vite.config.mjs',approveConfig:true});
    try { console.log(JSON.stringify({status:'ready',include:p.server.config.optimizeDeps.include})); } finally { try { await p.server.close(); } finally { rmSync(p.directory,{recursive:true,force:true}); } }`;
  const child = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { timeout: 30000 });
  const output = JSON.parse(child.stdout);
  assert.equal(output.status, 'ready');
  for (const dependency of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime']) assert.ok(output.include.includes(dependency));
  for (const message of ['forced optimizer reload', 'forced warning', 'forced transform diagnostic']) assert.ok(child.stderr.includes(message), child.stderr);
  const contexts = [];
  const instrumented = { chromium: { launch: async options => {
    const browser = await playwright.chromium.launch(options);
    return { newContext: options => { contexts.push(options); return browser.newContext(options); }, close: () => browser.close() };
  } } };
  const result = await runBrowserVerification(root, metadataPath, { playwright: instrumented, executablePath, diagnostic: true });
  t.after(() => rmSync(result.directory, { recursive: true, force: true }));
  assert.equal(result.execution.status, 'COMPLETED', JSON.stringify(result));
  assert.ok(!contexts.some(c => c?.deviceScaleFactor === 4));
  const composition = result.diagnostics.cases.find(c => c.kind === 'fidelity').composition;
  assert.deepEqual(composition.artifacts, []); assert.deepEqual(composition.groups, []);
  assert.ok(composition.checks.some(c => c.status === 'NOT COMPARABLE'));
});

test('real composition diagnostic finds occluded rotated ink and abstains on ambiguity without changing the page', async t => {
  const browser = await playwright.chromium.launch({ headless: true, executablePath });
  t.after(() => browser.close());
  const directory = mkdtempSync(path.join(os.tmpdir(), 'composition-browser-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const run = async (id, { css = '', markup = '', strokeContent = '', screenshotFailure = false, mutate = () => {} } = {}) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 4 });
    try {
      const page = await context.newPage(), f = compositionFixture(); mutate(f);
      await page.setContent(`<style>body{margin:0;background:#fff}.root{position:relative;margin:32px;width:100px;height:100px;background:white}.fill,.stroke,.cover{position:absolute;left:30px;top:30px;width:24px;height:24px;transform:rotate(45deg);box-sizing:border-box}.fill{background:#fff;z-index:2}.stroke{border:solid #d9d9d9;border-width:0 2px 2px 0;z-index:1}${css}</style><div id="component"><div class="root" data-ds-part="root"><span class="fill" data-ds-part="fill"></span><span class="stroke" data-ds-part="stroke">${strokeContent}</span>${markup}</div></div>`);
      const bodyMarkup = () => page.evaluate(() => { const e = document.body.cloneNode(true); if (!e.getAttribute('style')) e.removeAttribute('style'); return e.outerHTML; });
      const before = await bodyMarkup();
      const bounds = () => page.locator('[data-ds-part]').evaluateAll(elements => elements.map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
      const beforeBounds = await bounds();
      let shots = 0;
      const sampledPage = screenshotFailure ? { evaluate: page.evaluate.bind(page), screenshot: async options => {
        if (++shots === 2) throw new Error('Synthetic screenshot timeout during isolation');
        return page.screenshot(options);
      } } : page;
      const result = await diagnoseComposition(sampledPage, f.capture, f.metadata, { ...f.configuration, id }, { directory });
      assert.equal(await bodyMarkup(), before, 'isolation restores original inline properties and elements (Chromium may retain an empty style attribute)');
      if (screenshotFailure) assert.deepEqual(await bounds(), beforeBounds, 'a screenshot error cannot leave the page layout modified');
      for (const artifact of result.artifacts) assert.equal(sha256(readFileSync(artifact.path)), artifact.sha256);
      return result;
    } finally { await context.close(); }
  };
  const broken = await run('inverted');
  const stroke = broken.checks.find(c => c.part === 'stroke');
  assert.equal(stroke.status, 'FAIL', JSON.stringify(broken));
  assert.ok(stroke.counts.occludedByLower > 0); assert.equal(stroke.counts.visible, 0);
  assert.ok(broken.artifacts.length >= 6); assert.ok(broken.groups[0].geometryAndStylesUnchanged);
  const fixed = await run('correct', { css: '.stroke{z-index:3}' });
  const corrected = fixed.checks.find(c => c.part === 'stroke');
  assert.equal(corrected.status, 'PASS', JSON.stringify(fixed));
  assert.equal(corrected.counts.occludedByLower, 0); assert.equal(corrected.counts.visible, corrected.counts.opaque);
  const antialiased = await run('opaque-over-antialiased-lower', { css: '.fill{transform:none;border-radius:50%}.stroke{transform:none;background:#d9d9d9;border:0;z-index:3}' });
  const upper = antialiased.checks.find(c => c.part === 'stroke');
  assert.equal(upper.status, 'PASS', JSON.stringify(antialiased));
  assert.equal(upper.counts.visible, upper.counts.opaque); assert.equal(upper.counts.indeterminate, 0);
  for (const [id, options] of [
    ['opacity', { css: '.stroke{opacity:.5}' }],
    ['ancestor-filter', { css: '.root{filter:blur(1px)}' }],
    ['same-color', { css: '.stroke{border-color:white}' }],
    ['duplicate', { markup: '<span data-ds-part="stroke"></span>' }],
    ['shared-source', { mutate: f => { f.metadata.parts.stroke.nodes.default = 'FILE:1:3'; } }],
    ['descendant', { strokeContent: '<span></span>' }],
    ['visibility-override', { css: '#component .root .fill{visibility:visible!important}' }],
    ['leaf-shadow', { css: '.stroke{box-shadow:0 0 1px black}' }],
    ['pseudo', { css: '.stroke::before{content:"";position:absolute;background:red;width:2px;height:2px}' }],
    ['drift', { css: 'body[style] .stroke{left:31px}' }],
  ]) {
    const result = await run(id, options);
    assert.ok(!result.checks.some(c => c.status === 'FAIL'), JSON.stringify(result));
    assert.equal(result.checks.find(c => c.part === 'stroke').status, 'NOT COMPARABLE', id);
  }
  const covered = await run('legitimate-cover', { css: '.cover{background:#00f;z-index:4}', markup: '<span class="cover" data-ds-part="cover"></span>', mutate: f => {
    const shape = structuredClone(f.capture.nodes[2]); shape.id = '1:5';
    f.capture.nodes.push(shape); f.capture.nodes[0].children.push('1:5');
    f.metadata.parts.cover = { nodes: { default: 'FILE:1:5' } };
  } });
  assert.ok(!covered.checks.some(c => c.status === 'FAIL'), JSON.stringify(covered));
  assert.ok(covered.checks.find(c => c.part === 'stroke').counts.legitimatelyCovered > 0);
  const unrun = await run('screenshot-error', { screenshotFailure: true });
  assert.ok(unrun.checks.every(c => c.status === 'NOT RUN' && /screenshot timeout during isolation/.test(c.reason)), JSON.stringify(unrun));
  assert.equal(unrun.artifacts.length, 1); assert.deepEqual(unrun.groups, []);
});

test('diagnostic import loop detects shared size classes and inverted partial-border pointers without authorizing resources or publishing', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules'), image: { kind: 'unresolved', reason: 'Synthetic resource intentionally unavailable' } });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath)));
  const { capture: original } = JSON.parse(readFileSync(path.join(root, metadata.evidence.snapshot)));
  const seeds = original.nodes.map(({ id, parentId, type, name, children, properties }) => structuredClone({ id, parentId, type, name, children, properties }));
  seeds[0].children.push('1:4');
  seeds[1].properties.fontName = { family: 'Synthetic Pending', style: 'Regular' };
  seeds.push({ id: '1:4', parentId: '1:2', type: 'VECTOR', name: 'Pointer', children: [], properties: {
    width: 8, height: 8, absoluteBoundingBox: { x: 118.34314575, y: 142.34314575, width: 11.3137085, height: 11.3137085 },
    absoluteTransform: [[0.70710678, -0.70710678, 124], [0.70710678, 0.70710678, 142.34314575]], strokes: [] } });
  const capture = componentCapture({ seeds });
  Object.assign(metadata.evidence, persistCapture(root, capture));
  metadata.parts.pointer = { selector: '.pointer', nodes: { default: 'FILE:1:4' } };
  metadata.verification.fonts = renderRequirements(capture).fonts.map(font => ({ id: font.id,
    css: { family: font.font.family, weight: '400', style: 'normal' }, source: { kind: 'unresolved', reason: 'No authorized font in this synthetic fixture' } }));
  writeFileSync(path.join(root, metadataPath), JSON.stringify(metadata));
  writeFileSync(path.join(root, 'src/PreviewGlyph.tsx'), 'import styles from "./PreviewGlyph.module.css"; export function PreviewGlyph({initial}:{initial:string}){return <span data-ds-part="root" className={styles.root}><span data-ds-part="initial" className={[styles.initial,styles.size].join(" ")}>{initial}</span><span data-ds-part="pointer" className={styles.pointer}/></span>}');
  const css = '.root{position:relative;display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;--extent:48px}.initial{font:20px/24px Arial;letter-spacing:0}.size{width:var(--extent);height:var(--extent)}.pointer{position:absolute;left:50%;margin-left:-4px;top:-4px;width:8px;height:8px;transform:rotate(45deg);border-style:solid;border-bottom-width:1px;border-right-width:1px}';
  const style = path.join(root, 'src/PreviewGlyph.module.css'); writeFileSync(style, css);
  const tree = () => {
    const visit = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? visit(file) : entry.isFile() ? [[path.relative(root, file), sha256(readFileSync(file))]] : [];
    });
    return Object.fromEntries(visit(root));
  };
  const before = tree();
  const publication = await finalizeImport(root, metadataPath, { collect: true });
  assert.equal(publication.collection, undefined); assert.match(publication.errors.join('\n'), /DS_GAP/);
  const broken = await finalizeImport(root, metadataPath, { diagnose: true });
  assert.equal(broken.status, 'FAIL', JSON.stringify(broken)); assert.equal(broken.complete, false);
  assert.equal(classifyClosureCheck({ kind: 'diagnostic' }, { status: 1, stdout: JSON.stringify(broken) }).status, 'FAIL');
  assert.equal(broken.diagnosis.execution.status, 'COMPLETED', JSON.stringify(broken.diagnosis));
  t.after(() => rmSync(broken.diagnosis.directory, { recursive: true, force: true }));
  assert.deepEqual(broken.diagnosis.manifest.cases, []);
  const cases = broken.diagnosis.diagnostics.cases;
  assert.equal(cases.length, metadata.verification.cases.length);
  const source = cases.find(c => c.caseId === 'source-0');
  assert.ok(source.checks.some(c => c.id === 'geometry:initial' && c.status === 'FAIL'));
  assert.ok(source.checks.some(c => c.id === 'position:pointer' && c.status === 'FAIL'));
  assert.ok(source.diagnostics.some(c => c.checkId === 'position:pointer' && c.delta.width > 5));
  assert.ok(broken.diagnosis.diagnostics.resources.fonts.length); assert.ok(broken.diagnosis.diagnostics.resources.assets.length);
  assert.ok(broken.diagnosis.diagnostics.warnings.some(w => /border widths may retain initial values/.test(w)));
  assert.ok(broken.nextActions.some(a => a.code === 'AUTHORIZE_FONT_SOURCE'));
  assert.ok(broken.nextActions.some(a => a.code === 'REVIEW_RENDERED_DIFFERENCES' && a.cases.some(c => c.checks.includes('position:pointer'))));
  assert.deepEqual(tree(), before, 'Diagnosis cannot write to the project, its sources, usage, snapshots or verification artifacts');
  writeFileSync(style, css + '.initial{width:auto;height:auto}.pointer{top:auto;bottom:-4px;box-sizing:border-box;border-top-width:0;border-left-width:0}');
  const fixedBytes = tree();
  const fixed = await finalizeImport(root, metadataPath, { diagnose: true });
  t.after(() => rmSync(fixed.diagnosis.directory, { recursive: true, force: true }));
  const corrected = fixed.diagnosis.diagnostics.cases.find(c => c.caseId === 'source-0');
  assert.ok(corrected.checks.some(c => c.id === 'geometry:initial' && c.status === 'PASS'), JSON.stringify(corrected));
  assert.ok(corrected.checks.some(c => c.id === 'position:pointer' && c.status === 'PASS'), JSON.stringify(corrected));
  assert.ok(corrected.checks.some(c => c.id.startsWith('font:') && c.status === 'FAIL'));
  assert.equal(fixed.status, 'FAIL'); assert.equal(fixed.complete, false);
  assert.deepEqual(fixed.diagnosis.manifest.cases, []); assert.deepEqual(tree(), fixedBytes);
});

test('finalize diagnosis exposes composition failures without publishing or changing the project', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath)));
  const { capture: original } = JSON.parse(readFileSync(path.join(root, metadata.evidence.snapshot)));
  const seeds = original.nodes.map(({ id, parentId, type, name, children, properties }) => structuredClone({ id, parentId, type, name, children, properties }));
  Object.assign(seeds[0].properties, { layoutMode: 'NONE', opacity: 1, effects: [] });
  for (const [id, part] of [['1:4', 'fill'], ['1:5', 'stroke']]) {
    seeds[0].children.push(id);
    seeds.push({ id, name: part, parentId: '1:2', type: 'VECTOR', children: [], properties: { visible: true, opacity: 1, effects: [], fills: [], strokes: [], width: 8, height: 8,
      absoluteBoundingBox: { x: 118, y: 142, width: 12, height: 12 }, absoluteTransform: [[1, 0, 118], [0, 1, 142]] } });
    metadata.parts[part] = { selector: `.${part}`, nodes: { default: `FILE:${id}` } };
  }
  Object.assign(metadata.evidence, persistCapture(root, componentCapture({ seeds })));
  writeFileSync(path.join(root, metadataPath), JSON.stringify(metadata));
  writeFileSync(path.join(root, 'src/PreviewGlyph.tsx'), 'import s from "./PreviewGlyph.module.css"; export function PreviewGlyph({initial}:{initial:string}){return <span data-ds-part="root" className={s.root}><span data-ds-part="initial" className={s.initial}>{initial}</span><span data-ds-part="fill" className={s.fill}/><span data-ds-part="stroke" className={s.stroke}/></span>}');
  const style = path.join(root, 'src/PreviewGlyph.module.css');
  writeFileSync(style, readFileSync(style, 'utf8').replace('border: 1px solid black;', 'border: none;') + '.root{position:relative}.fill,.stroke{position:absolute;left:18px;top:42px;width:8px;height:8px;transform:rotate(45deg);box-sizing:border-box}.fill{background:white;z-index:2}.stroke{border:solid #d9d9d9;border-width:0 1px 1px 0;z-index:1}');
  const before = [metadataPath, 'src/PreviewGlyph.tsx', 'src/PreviewGlyph.module.css', 'design-system/components/PreviewGlyph/usage.md'].map(f => [f, sha256(readFileSync(path.join(root, f)))]);
  const result = await finalizeImport(root, metadataPath, { diagnose: true });
  t.after(() => rmSync(result.diagnosis.directory, { recursive: true, force: true }));
  assert.equal(result.status, 'FAIL', JSON.stringify(result)); assert.equal(result.complete, false);
  assert.ok(result.diagnosis.diagnostics.compositionSummary.FAIL > 0, JSON.stringify(result.diagnosis));
  assert.ok(result.nextActions.some(a => a.code === 'REVIEW_COMPOSITION_DIAGNOSTICS'));
  assert.deepEqual(result.diagnosis.manifest.cases, []);
  assert.equal(existsSync(path.join(root, 'design-system/verification')), false);
  for (const [file, hash] of before) assert.equal(sha256(readFileSync(path.join(root, file))), hash);
  writeFileSync(style, readFileSync(style, 'utf8') + '.fill,.stroke{left:20px;top:44px}.stroke{z-index:3}');
  const component = path.join(root, 'src/PreviewGlyph.tsx');
  writeFileSync(component, readFileSync(component, 'utf8').replace('{return <span', '{if(window.devicePixelRatio===4)throw new Error("Synthetic composition page unavailable");return <span'));
  const unrun = await finalizeImport(root, metadataPath, { diagnose: true, browserOptions: { timeoutMs: 5000 } });
  t.after(() => rmSync(unrun.diagnosis.directory, { recursive: true, force: true }));
  assert.equal(unrun.diagnosis.execution.status, 'COMPLETED', JSON.stringify(unrun));
  assert.equal(unrun.diagnosis.diagnostics.summary.FAIL, 0, JSON.stringify(unrun.diagnosis.diagnostics));
  assert.equal(unrun.diagnosis.diagnostics.summary['NOT RUN'], 0);
  assert.equal(unrun.diagnosis.diagnostics.compositionSummary['NOT RUN'], 1);
  assert.equal(unrun.status, 'FAIL'); assert.equal(unrun.complete, false);
  const retry = unrun.nextActions.find(a => a.code === 'RETRY_COMPOSITION_DIAGNOSTICS');
  assert.equal(retry.cases[0].caseId, 'source-0');
  assert.equal(retry.cases[0].checks[0].id, 'composition:collection');
  assert.equal(retry.cases[0].checks[0].status, 'NOT RUN');
  assert.ok(retry.cases[0].checks[0].reason);
  assert.ok(!unrun.nextActions.some(a => a.code === 'REVIEW_COMPOSITION_DIAGNOSTICS'));
  assert.deepEqual(unrun.diagnosis.manifest.cases, []);
  assert.equal(existsSync(path.join(root, 'design-system/verification')), false);
  writeFileSync(component, readFileSync(component, 'utf8').replace('if(window.devicePixelRatio===4)throw new Error("Synthetic composition page unavailable");', ''));
  const files = [metadataPath, 'src/PreviewGlyph.tsx', 'src/PreviewGlyph.module.css', 'design-system/components/PreviewGlyph/usage.md'];
  const initialHashes = files.map(file => sha256(readFileSync(path.join(root, file))));
  let initialReads = 0, compositionCaptures = 0, compositionClosed = false;
  // Fail the first diagnostic evaluate only; normal measurement and 4x mounting still use Chromium.
  const failingInitialRead = { chromium: { launch: async options => {
    const browser = await playwright.chromium.launch(options);
    return { close: () => browser.close(), newContext: async options => {
      const context = await browser.newContext(options);
      if (options?.deviceScaleFactor !== 4) return context;
      return { setDefaultTimeout: context.setDefaultTimeout.bind(context), close: async () => { await context.close(); compositionClosed = true; }, newPage: async () => {
        const page = await context.newPage();
        return { goto: page.goto.bind(page), waitForFunction: page.waitForFunction.bind(page), evaluate: async operation => {
          initialReads++;
          assert.match(operation.toString(), /document\.body\.getAttribute\('style'\)/);
          throw new Error('Synthetic initial body read failed');
        }, screenshot: async () => { compositionCaptures++; throw new Error('Unexpected composition capture'); } };
      } };
    } };
  } } };
  const initialFailure = await runBrowserVerification(root, metadataPath, { playwright: failingInitialRead, executablePath, diagnostic: true });
  t.after(() => rmSync(initialFailure.directory, { recursive: true, force: true }));
  assert.equal(initialFailure.execution.status, 'COMPLETED', JSON.stringify(initialFailure));
  assert.equal(initialFailure.diagnostics.summary.FAIL, 0); assert.equal(initialFailure.diagnostics.summary['NOT RUN'], 0);
  assert.equal(initialFailure.diagnostics.compositionSummary['NOT RUN'], 1);
  const failedCase = initialFailure.diagnostics.cases.find(c => c.caseId === 'source-0');
  assert.deepEqual(failedCase.composition.checks, [{ id: 'composition:collection', status: 'NOT RUN', reason: 'Synthetic initial body read failed' }]);
  const actions = diagnosisActions(root, metadataPath, initialFailure.diagnostics.cases);
  assert.deepEqual(actions.map(a => a.code), ['RETRY_COMPOSITION_DIAGNOSTICS']);
  assert.equal(actions[0].cases[0].caseId, 'source-0');
  assert.equal(actions[0].cases[0].checks[0].reason, 'Synthetic initial body read failed');
  assert.equal(initialReads, 1); assert.equal(compositionCaptures, 0); assert.equal(compositionClosed, true);
  assert.ok(!readdirSync(initialFailure.directory).some(name => name.startsWith('composition-')));
  assert.deepEqual(files.map(file => sha256(readFileSync(path.join(root, file)))), initialHashes);
  assert.deepEqual(initialFailure.manifest.cases, []);
  assert.equal(existsSync(path.join(root, 'design-system/verification')), false);
});

test('a clean temporary diagnosis never confirms or publishes a candidate', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const style = path.join(root, 'src/PreviewGlyph.module.css');
  writeFileSync(style, readFileSync(style, 'utf8').replace('border: 1px solid black;', 'border: none;'));
  const usage = readFileSync(path.join(root, 'design-system/components/PreviewGlyph/usage.md'));
  const result = await finalizeImport(root, metadataPath, { diagnose: true });
  t.after(() => rmSync(result.diagnosis.directory, { recursive: true, force: true }));
  assert.equal(result.status, 'NOT VERIFIED', JSON.stringify(result)); assert.equal(result.complete, false);
  assert.equal(classifyClosureCheck({ kind: 'diagnostic' }, { status: 1, stdout: JSON.stringify(result) }).status, 'DIAGNOSTIC');
  assert.equal(result.diagnosis.execution.status, 'COMPLETED');
  assert.equal(result.diagnosis.diagnostics.summary.FAIL, 0); assert.equal(result.diagnosis.diagnostics.summary['NOT RUN'], 0);
  assert.deepEqual(result.diagnosis.manifest.cases, []); assert.equal(result.correspondences, undefined);
  assert.equal(existsSync(path.join(root, 'design-system/verification')), false);
  assert.deepEqual(readFileSync(path.join(root, 'design-system/components/PreviewGlyph/usage.md')), usage);
});

test('real headless regression: geometry, transfer, publication and application syntax are checked separately', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const options = { playwright, executablePath };
  writeFileSync(path.join(root, 'src/App.tsx'), 'export const App=()=> <main style={{display:"\'flex\'"}}/>;');
  const occupied = createServer();
  await new Promise((resolve, reject) => { occupied.once('error', reject); occupied.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const occupiedPort = occupied.address().port;
  const collision = await runBrowserVerification(root, metadataPath, { ...options, port: occupiedPort });
  t.after(() => rmSync(collision.directory, { recursive: true, force: true }));
  assert.equal(collision.execution.status, 'NOT RUN');
  assert.equal(collision.execution.phase, 'preview');
  assert.match(collision.execution.reason, /already in use/);
  assert.ok(occupied.listening, 'an explicitly occupied port is not reclaimed');
  const finalized = await finalizeImport(root, metadataPath, { collect: true });
  const broken = finalized.collection;
  assert.equal(finalized.status, 'FAIL', JSON.stringify(finalized));
  assert.deepEqual(finalized.errors, []);
  assert.equal(broken.preview.requestedPort, 0);
  assert.ok(broken.preview.port > 0); assert.notEqual(broken.preview.port, occupiedPort);
  assert.ok(broken.preview.cases.every(c => Number(new URL(c.url).port) === broken.preview.port));
  assert.equal(JSON.parse(readFileSync(path.join(broken.directory, 'result.json'))).preview.port, broken.preview.port);
  t.after(() => rmSync(broken.directory, { recursive: true, force: true }));
  assert.equal(broken.blocked.length, 0, JSON.stringify(broken.blocked));
  assert.equal(broken.manifest.cases.length, 3);
  assert.equal(broken.closure.state, 'failed', JSON.stringify(broken.closure));
  const delivery = finalized.delivery;
  assert.equal(delivery.status, 'FAIL');
  assert.equal(delivery.components[0].status, 'FAIL', 'a statically valid but unconfirmed broken import cannot pass delivery');
  assert.equal(delivery.application.status, 'FAIL');
  assert.ok(broken.application.results.some(r => r.file === 'src/App.tsx' && !r.supported));
  const file = path.join(root, 'src/PreviewGlyph.module.css');
  writeFileSync(file, readFileSync(file, 'utf8').replace('border: 1px solid black;', 'border: none;'));
  const fixed = await runBrowserVerification(root, metadataPath, options);
  assert.equal(fixed.preview.requestedPort, 0); assert.ok(fixed.preview.port > 0);
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

test('delivery diagnoses application literals independently of invalid component evidence without executing project code', async t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = JSON.parse(readFileSync(path.join(root, metadataPath)));
  delete metadata.evidence;
  writeFileSync(path.join(root, metadataPath), JSON.stringify(metadata));
  const app = path.join(root, 'src/Showcase.tsx');
  writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/src/Showcase.tsx"></script>');
  writeFileSync(app, 'throw new Error("Application modules must not run"); export const App=()=> <main style={{display:"\'flex\'",padding:48}}/>;');
  const failed = await verifyImports(root);
  assert.equal(failed.status, 'FAIL'); assert.ok(failed.errors.length);
  assert.equal(failed.application.status, 'FAIL');
  assert.ok(failed.application.signals.includes('index.html'));
  assert.ok(failed.application.checks.some(c => c.status === 'FAIL' && c.declaration?.file === 'src/Showcase.tsx'));
  writeFileSync(app, 'throw new Error("Must not execute"); export const App=()=> <main style={{display:"flex",padding:48}}/>;');
  const passed = await diagnoseApplication(root);
  assert.equal(passed.status, 'PASS', JSON.stringify(passed));
  assert.ok(passed.checks.some(c => c.declaration?.value === '48px'));
  assert.ok(passed.browser);
});

test('real CSS diagnostics serialize React numbers and distinguish inactive feature queries from vendor support', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'src/App.tsx'), 'export const App=()=> <main style={{padding:48,marginTop:-2,opacity:0.5,lineHeight:1.2,width:0,WebkitLineClamp:3}}/>;');
  writeFileSync(path.join(root, 'src/vendor.css'), '@supports (-moz-appearance: none) {.x{display:"flex"}} .x{-moz-appearance:none;display:flex}');
  const result = await runBrowserVerification(root, metadataPath, { playwright, executablePath });
  assert.equal(result.preview.requestedPort, 0); assert.ok(result.preview.port > 0);
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
  const passed = await runBrowserVerification(root, metadataPath, { playwright, executablePath });
  assert.equal(passed.preview.requestedPort, 0); assert.ok(passed.preview.port > 0);
  t.after(() => rmSync(passed.directory, { recursive: true, force: true }));
  assert.equal(passed.application.status, 'PASS');
  assert.ok(passed.application.reason);
  assert.equal(passed.execution.status, 'COMPLETED');
});

test('browser launch failure preserves a structured pending closure and releases the preview port', async t => {
  const { root, metadataPath } = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runBrowserVerification(root, metadataPath, { playwright, executablePath: path.join(root, 'missing-browser') });
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
    assert.equal(result.preview.requestedPort, 0); assert.ok(result.preview.port > 0);
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(result.preview.port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()));
    });
  }
});

test('missing stylesheets, broken CSS imports and failed font decoding never complete real browser verification', async t => {
  const options = { playwright, executablePath, timeoutMs: 2500 };
  const make = () => {
    const f = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules') });
    t.after(() => rmSync(f.root, { recursive: true, force: true }));
    return { ...f, file: path.join(f.root, f.metadataPath), metadata: JSON.parse(readFileSync(path.join(f.root, f.metadataPath))) };
  };
  const run = async f => {
    const result = await runBrowserVerification(f.root, f.metadataPath, options);
    t.after(() => rmSync(result.directory, { recursive: true, force: true }));
    assert.equal(result.closure.complete, false);
    assert.notEqual(browserVerificationExitCode(result), 0);
    assert.equal((await verifyImports(f.root)).status, 'FAIL');
    return result;
  };
  const absent = make();
  absent.metadata.verification.stylesheets.push('src/missing.css');
  writeFileSync(absent.file, JSON.stringify(absent.metadata));
  const staticFailure = await run(absent);
  assert.equal(staticFailure.execution.phase, 'static-validation');
  assert.equal(staticFailure.closure.state, 'failed');
  const broken = make();
  writeFileSync(path.join(broken.root, 'src/PreviewGlyph.tsx'), 'import "./missing-import.css";\n' + readFileSync(path.join(broken.root, 'src/PreviewGlyph.tsx'), 'utf8'));
  const importFailure = await run(broken);
  assert.ok(importFailure.blocked.length > 0 || importFailure.closure.state === 'failed', JSON.stringify(importFailure));
  assert.equal(importFailure.manifest.cases.length, 0, 'a failed component import cannot publish a measurement');
  const font = make();
  const seeds = JSON.parse(readFileSync(path.join(font.root, font.metadata.evidence.snapshot))).capture.nodes;
  seeds[1].properties.fontName = { family: 'BrokenFont', style: 'Regular' };
  const capture = componentCapture({ seeds });
  font.metadata.evidence = { ...font.metadata.evidence, ...persistCapture(font.root, capture) };
  const bytes = Buffer.from('This is not a decodable font');
  writeFileSync(path.join(font.root, 'src/broken.woff2'), bytes);
  const id = renderRequirements(capture).fonts[0].id;
  font.metadata.verification.fonts = [{ id, css: { family: 'BrokenFont', style: 'normal', weight: '400' }, source: { kind: 'file', path: 'src/broken.woff2', sha256: sha256(bytes) } }];
  writeFileSync(font.file, JSON.stringify(font.metadata));
  writeFileSync(path.join(font.root, 'src/base.css'), '@font-face {font-family:BrokenFont;src:url("./broken.woff2")}');
  const style = path.join(font.root, 'src/PreviewGlyph.module.css');
  writeFileSync(style, readFileSync(style, 'utf8').replace('font-family: Arial, sans-serif', 'font-family: BrokenFont'));
  const fontFailure = await run(font);
  assert.equal(fontFailure.closure.state, 'failed');
  assert.ok(fontFailure.closure.failures.some(f => JSON.stringify(f).includes(`font:${id}`)), JSON.stringify(fontFailure.closure));
  assert.ok(fontFailure.manifest.cases.length > 0, 'failed font loading may retain diagnostic measurements, never confirmation');
  const measured = JSON.parse(readFileSync(path.join(font.root, fontFailure.manifest.cases[0].artifacts[0].path)));
  assert.ok(measured.fonts.find(f => f.id === id).faces.some(face => face.status === 'error'), 'the browser actually attempted and failed font decoding');
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


test('behavior recorder permits the exact diagnostic and retains real Chromium output without project changes',t=>{
 // Uses the same executable entry point as external behavioral sessions, with the locked browser runtime.
 return import('../scripts/behavior-session.mjs').then(async ({beginSession,recordExec,finishSession})=>{
  const start=beginSession('candidate-correspondence',{model:'synthetic-browser-control',modelVersion:'none',executor:'browser-regression'});
  t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
  const event=await recordExec(start.session,start.diagnosticArgv);assert.equal(event.execution,'ATTEMPTED');assert.equal(event.complete,true);
  const result=JSON.parse(event.stdout);assert.equal(result.diagnosis?.execution.status,'COMPLETED',event.stdout+event.stderr);
  if(result.diagnosis?.directory)t.after(()=>rmSync(result.diagnosis.directory,{recursive:true,force:true}));
  assert.equal(result.complete,false);assert.equal(result.report.source,'temporary-diagnosis');
  const finished=await finishSession(start.session,{status:'diagnosed',confirmed:false,finalText:'Synthetic Chromium diagnostic process regression; not an agent evaluation.'});
  assert.equal(finished.status,'PASS');const trace=JSON.parse(readFileSync(finished.trace));assert.deepEqual(trace.before,trace.after);assert.equal(trace.events[0].stdout,event.stdout);
 });
});
