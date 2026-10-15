import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { collectCssDiagnostics, compareCssDiagnostics } from '../lib/css-diagnostics.mjs';

test('application inline literals are independent of component scope and token substitutions are not falsely validated', t => {
  const { root } = createPreviewProject(); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'src/App.tsx'), 'export const App = () => <main style={{display:"\'flex\'",alignItems:"center",width:20}} />;');
  writeFileSync(path.join(root, 'src/extra.css'), '.beak{border-style:solid;border-bottom-width:1px;width:var(--size)}');
  const component = collectCssDiagnostics(root, ['src/PreviewGlyph.tsx']);
  assert.ok(!component.declarations.some(d => d.file.endsWith('App.tsx')));
  const application = collectCssDiagnostics(root, [], { application: true });
  assert.ok(application.declarations.some(d => d.property === 'display' && d.value === "'flex'"));
  assert.ok(application.warnings.some(w => w.includes('border color')));
  assert.ok(application.warnings.some(w => w.includes('border widths')));
  assert.ok(!application.declarations.some(d => d.value.includes('var(')));
  const body = { cssDiagnostics: { schemaVersion: 1, results: application.declarations.map(d => ({ id: d.id, supported: d.value !== "'flex'" })) } };
  assert.equal(compareCssDiagnostics(application, body).filter(c => c.status === 'FAIL').length, 1);
  assert.equal(compareCssDiagnostics(application, {}).at(-1).status, 'NOT RUN');
});

test('syntax results must account for exactly the current declarations, not another file or collection', t => {
  const { root } = createPreviewProject(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const requirements = collectCssDiagnostics(root, ['src/PreviewGlyph.tsx']);
  const results = requirements.declarations.map(d => ({ id: d.id, supported: true }));
  assert.ok(compareCssDiagnostics(requirements, { cssDiagnostics: { schemaVersion: 1, results } }).every(c => c.status === 'PASS'));
  results[0].id = 'another-declaration';
  assert.ok(compareCssDiagnostics(requirements, { cssDiagnostics: { schemaVersion: 1, results } }).some(c => c.status === 'NOT RUN'));
});

test('numeric inline literals follow React lengths, zero, signed and unitless serialization', t => {
  const { root } = createPreviewProject(); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'src/App.tsx'), 'export const App=()=> <div style={{padding:48,marginTop:-2,width:0,opacity:0.5,lineHeight:1.2,flexGrow:+1,zIndex:2,WebkitLineClamp:3,strokeWidth:2,columns:2,"--space":4,paddingLeft:spacing}}/>;');
  const diagnostics = collectCssDiagnostics(root, [], { application: true });
  const values = Object.fromEntries(diagnostics.declarations.filter(d => d.file === 'src/App.tsx').map(d => [d.property, d.value]));
  assert.deepEqual(values, { padding:'48px', 'margin-top':'-2px', width:'0', opacity:'0.5', 'line-height':'1.2', 'flex-grow':'1', 'z-index':'2', '-webkit-line-clamp':'3', 'stroke-width':'2', columns:'2' });
  assert.equal(diagnostics.warnings.filter(w => w.includes('dynamic inline')).length, 1);
});

test('feature-query applicability and vendor extensions do not claim universal CSS invalidity', t => {
  const { root } = createPreviewProject(); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'src/App.tsx'), 'export const App=()=> <div/>;');
  writeFileSync(path.join(root, 'src/vendor.css'), '@supports (-moz-appearance: none) { @supports (display: grid) {.x {display:"flex"}} } .x{-moz-appearance:none; width:-moz-fit-content;display:"flex"}');
  const requirements = collectCssDiagnostics(root, [], { application: true });
  const guarded = requirements.declarations.find(d => d.supports);
  assert.deepEqual(guarded.supports, ['(-moz-appearance: none)', '(display: grid)']);
  const results = requirements.declarations.map(d => ({id:d.id,supported:d.file !== 'src/vendor.css',...(d.supports?{applicable:false}:{})}));
  const compare = () => compareCssDiagnostics(requirements, {cssDiagnostics:{schemaVersion:1,results}});
  assert.equal(compare().find(c => c.declaration?.id === guarded.id).status, 'PASS');
  assert.equal(compare().filter(c => c.status === 'NOT COMPARABLE').length, 2);
  assert.equal(compare().filter(c => c.status === 'FAIL').length, 1);
  results.find(r => r.id === guarded.id).applicable = true;
  assert.equal(compare().find(c => c.declaration?.id === guarded.id).status, 'FAIL');
  delete results.find(r => r.id === guarded.id).applicable;
  assert.equal(compare().find(c => c.declaration?.id === guarded.id).status, 'NOT RUN');
});
