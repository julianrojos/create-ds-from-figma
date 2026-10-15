import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { verifyTokenStyles } from '../lib/token-styles.mjs';
import { verify } from '../verify-ds.mjs';
import { startPreview } from '../../skills/create-ds-from-figma/scripts/verification-preview.mjs';

test('token definitions must be reachable through actual view imports, not just audited inputs', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath)));
  writeFileSync(path.join(root, 'src/PreviewGlyph.module.css'), '.root { color: var(--ds-color-id); } .initial {}');
  m.tokens = ['--ds-color-id'];
  assert.ok(verifyTokenStyles(root, m).errors.some(e => e.includes('--ds-color-id')));
  m.verification.inputs = ['src/styles/tokens.css'];
  assert.ok(verifyTokenStyles(root, m).errors.length);
  m.verification.stylesheets.push('src/styles/tokens.css');
  assert.deepEqual(verifyTokenStyles(root, m).errors, []);
  m.verification.stylesheets.pop();
  const code = path.join(root, m.code.path);
  writeFileSync(code, 'import "./styles/tokens.css";\n' + readFileSync(code, 'utf8'));
  assert.deepEqual(verifyTokenStyles(root, m).errors, []);
});

test('bindings and local CSS aliases require loaded definitions; type-only imports cannot supply them', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath)));
  m.bindings = [{ variableId: 'color-id' }];
  assert.ok(verifyTokenStyles(root, m).errors.length);
  writeFileSync(path.join(root, 'src/typeSource.ts'), 'import "./styles/tokens.css"; export type Example = string;');
  const code = path.join(root, m.code.path); writeFileSync(code, 'import type { Example } from "./typeSource";\n' + readFileSync(code, 'utf8'));
  assert.ok(verifyTokenStyles(root, m).errors.length);
  writeFileSync(code, readFileSync(code, 'utf8').replace('import type { Example }', 'import { type Example }'));
  assert.ok(verifyTokenStyles(root, m).errors.length);
  m.verification.stylesheets.push('src/styles/tokens.css');
  writeFileSync(path.join(root, 'src/styles/tokens.css'), ':root { --ds-color-id: var(--ds-missing-alias); }');
  assert.ok(verifyTokenStyles(root, m).errors.some(e => e.includes('--ds-missing-alias')));
  writeFileSync(path.join(root, 'src/styles/tokens.css'), ':root { --ds-color-id: var(--ds-alias); --ds-alias: red; }');
  assert.deepEqual(verifyTokenStyles(root, m).errors, []);
});

test('DS verification and preview reject a well-formed plan without reachable token CSS', async t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath)));
  m.tokens = ['--ds-color-id'];
  const css = path.join(root, 'src/PreviewGlyph.module.css');
  writeFileSync(css, readFileSync(css, 'utf8') + '\n.root { color: var(--ds-color-id); }');
  writeFileSync(path.join(root, metadataPath), JSON.stringify(m));
  assert.ok(verify(root).errors.some(e => e.includes('no definition in CSS loaded')));
  await assert.rejects(() => startPreview(root, metadataPath), /no definition in CSS loaded/);
  m.verification.stylesheets.push('src/styles/tokens.css');
  writeFileSync(path.join(root, metadataPath), JSON.stringify(m));
  assert.deepEqual(verify(root).errors, []);
});
