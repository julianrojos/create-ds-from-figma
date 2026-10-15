import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyIntrinsicCss } from '../lib/intrinsic-css.mjs';

test('intrinsic sizing rejects a provable fixed local declaration, without confusing overridden or conditional rules', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'intrinsic-css-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = { evidence: { textDimensions: [{ observation: 'text#width', behavior: 'content', treatment: 'translation', cssSelector: '.initial', cssProperty: 'width' }] } };
  const check = css => { writeFileSync(path.join(root, 'part.css'), css); return verifyIntrinsicCss(root, metadata, 'part.css'); };
  assert.equal(check('.initial { width: 12px; }').errors.length, 1);
  assert.equal(check('.initial { width: 12px; width: auto; }').errors.length, 0);
  assert.equal(check('.initial { width: 12px !important; width: auto; }').errors.length, 1);
  assert.equal(check('.initial { width: auto; }').warnings.length, 0);
  assert.equal(check('.initial { inline-size: 12px; }').errors.length, 1);
  assert.equal(check('.initial.large { width: 12px; }').errors.length, 1);
  metadata.evidence.textDimensions[0].cssProperty = 'inline-size';
  assert.equal(check('.initial.large { width: 12px; }').errors.length, 1);
  metadata.evidence.textDimensions[0].cssProperty = 'width';
  assert.equal(check('.initial.large { width: 12px; } .initial { width: auto; }').errors.length, 1);
  assert.equal(check('.initial.large { width: 12px; width: auto; }').errors.length, 0);
  assert.equal(check('.initial.large { width: 12px; } .initial.initial { width: auto; }').errors.length, 0);
  assert.equal(check('.initial.initial { width: auto; } .initial.large { width: 12px; }').errors.length, 1);
  assert.equal(check('.initial.large { width: 12px; } .initial.initial.initial { width: auto; }').errors.length, 0);
  for (const css of ['@media (min-width: 1px) { .initial { width: 12px; } }', '.initial { width: 12px; } .initial.large { width: auto; }', '.initial { width: var(--size); }', '.initial:hover { width: 12px; }', '.initial { writing-mode:vertical-rl; width:12px; }']) {
    const result = check(css); assert.equal(result.errors.length, 0, css); assert.ok(result.warnings.length, css);
  }
  assert.equal(check('.other { width: 12px; } .initial { width: auto; }').errors.length, 0);
});
