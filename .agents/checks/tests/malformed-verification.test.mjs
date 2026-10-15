import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { verify } from '../verify-ds.mjs';
import { createPreviewProject } from './fixtures/preview-project.mjs';

// A malformed ficha must produce validation errors, never an exception that hides every other finding.
test('malformed verification plans return controlled errors from the whole structural check', t => {
  for (const [label, cases] of [['object', {}], ['null entry', [null]], ['scalar', 'x'], ['nested array', [[]]], ['number', 7]]) {
    const { root, metadataPath } = createPreviewProject();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const file = path.join(root, metadataPath), metadata = JSON.parse(readFileSync(file));
    metadata.verification.cases = cases;
    writeFileSync(file, JSON.stringify(metadata));
    let result;
    assert.doesNotThrow(() => { result = verify(root); }, label);
    assert.ok(result.errors.length > 0, `${label}: the malformation is reported`);
  }
});

test('malformed unestablished entries do not abort the visual summary either', t => {
  for (const [label, value] of [['object', {}], ['string', 'x'], ['null', null]]) {
    const { root, metadataPath } = createPreviewProject();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const file = path.join(root, metadataPath), metadata = JSON.parse(readFileSync(file));
    metadata.verification.unestablished = value;
    writeFileSync(file, JSON.stringify(metadata));
    assert.doesNotThrow(() => verify(root), label);
  }
});
