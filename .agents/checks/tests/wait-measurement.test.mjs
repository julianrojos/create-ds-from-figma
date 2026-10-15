import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { waitForMeasurement } from '../lib/wait-measurement.mjs';

test('external receipt wait is bounded, ignores old receipts and accepts only a new matching case', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wait-measurement-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const receipt = { caseId: 'source', status: 'NOT VERIFIED', viewportMatches: true };
  writeFileSync(path.join(directory, 'source-1.receipt.json'), JSON.stringify(receipt));
  await assert.rejects(waitForMeasurement(directory, 'source', { timeoutMs: 20, intervalMs: 2 }), /timeout.*visibility/);
  const pending = waitForMeasurement(directory, 'source', { timeoutMs: 1000, intervalMs: 2 });
  const timer = setTimeout(() => writeFileSync(path.join(directory, 'source-2.receipt.json'), JSON.stringify(receipt)), 20);
  t.after(() => clearTimeout(timer));
  const result = await pending;
  assert.equal(result.status, 'received'); assert.equal(path.basename(result.receipt), 'source-2.receipt.json');
  await assert.rejects(waitForMeasurement(directory, '../source'), /Safe case/);
});
