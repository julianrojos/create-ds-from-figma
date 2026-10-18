import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { diagnoseComposition } from '../../skills/create-ds-from-figma/scripts/lib/composition-browser.mjs';
import { diagnosisActions } from '../lib/diagnosis-actions.mjs';
import { compositionFixture } from './fixtures/composition-fixture.mjs';

const png = color => { const p = new PNG({ width: 2, height: 2 }); for (let i = 0; i < 4; i++) p.data.set([...color, 255], i * 4); return PNG.sync.write(p); };
const white = png([255, 255, 255]), gray = png([217, 217, 217]);
function fixture(t, options = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'composition-errors-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = [], f = compositionFixture();
  let shots = 0, restores = 0;
  const page = {
    evaluate: async (operation, argument) => {
      calls.push(operation.name || 'cleanup-or-body');
      if (options.evaluateError === operation.name) throw new Error('Synthetic page disconnected');
      if (operation.name === 'inspectPage') return options.condition || { clip: { x: 10, y: 10, width: 2, height: 2 }, excluded: [] };
      if (operation.name === 'verifyStable' && options.unstable) return { notComparable: 'Layout changed during isolation' };
      if (operation.name === 'restorePage' && ++restores >= (options.failRestorationAt || Infinity)) throw new Error('Synthetic restoration error');
      return null;
    },
    screenshot: async () => {
      shots++;
      if (shots === options.failShot) throw new Error('Synthetic screenshot timeout');
      return shots === 2 || shots === 3 ? white : gray;
    },
  };
  return { directory, calls, run: () => diagnoseComposition(page, f.capture, f.metadata, f.configuration, { directory }) };
}

test('initial body read errors propagate before isolation, captures, writes or cleanup', async t => {
  const f = fixture(t, { evaluateError: '' });
  await assert.rejects(f.run, /Synthetic page disconnected/);
  assert.deepEqual(f.calls, ['cleanup-or-body']);
  assert.deepEqual(readdirSync(f.directory), []);
});

test('screenshot failures before and during isolation are NOT RUN, retain partial artifacts and request a retry', async t => {
  for (const failShot of [1, 2]) {
    const f = fixture(t, { failShot }), result = await f.run();
    assert.equal(result.checks.length, 2);
    assert.ok(result.checks.every(c => c.status === 'NOT RUN' && /screenshot timeout/.test(c.reason)));
    assert.equal(result.artifacts.length, failShot - 1);
    assert.deepEqual(result.groups, []);
    assert.ok(f.calls.includes('restorePage'));
    assert.equal(f.calls.at(-1), 'cleanup-or-body');
    const actions = diagnosisActions('.', 'm.json', [{ caseId: 'source-0', checks: [], composition: result }]);
    assert.deepEqual(actions.map(a => a.code), ['RETRY_COMPOSITION_DIAGNOSTICS']);
  }
});

test('persistence and unexpected browser errors are not disguised as unsupported conditions', async t => {
  const file = fixture(t);
  writeFileSync(path.join(file.directory, 'composition-source-0-0'), 'occupied by a file');
  const blocked = await file.run();
  assert.ok(blocked.checks.every(c => c.status === 'NOT RUN' && c.reason));
  assert.ok(file.calls.includes('restorePage')); assert.deepEqual(blocked.artifacts, []);
  const disconnected = fixture(t, { evaluateError: 'inspectPage' });
  assert.ok((await disconnected.run()).checks.every(c => c.status === 'NOT RUN' && /disconnected/.test(c.reason)));
});

test('explicit comparability conditions remain abstentions instead of technical failures', async t => {
  for (const options of [{ condition: { notComparable: 'Unsupported mask' } }, { unstable: true }, { condition: { clip: { x: 0, y: 0, width: 2000, height: 2000 }, excluded: [] } }]) {
    const f = fixture(t, options), result = await f.run();
    assert.ok(result.checks.every(c => c.status === 'NOT COMPARABLE'));
    assert.ok(f.calls.includes('restorePage'));
  }
});

test('restoration failures preserve the original error, attempt remaining cleanup and never retain successful checks', async t => {
  const broken = fixture(t, { failShot: 2, failRestorationAt: 1 }), failure = await broken.run();
  assert.ok(failure.checks.every(c => c.status === 'NOT RUN' && /screenshot timeout.*Restoration failed.*restoration error/.test(c.reason)));
  assert.equal(broken.calls.at(-1), 'cleanup-or-body');
  const clean = fixture(t), passed = await clean.run();
  assert.ok(passed.checks.every(c => c.status === 'PASS'));
  const late = fixture(t, { failRestorationAt: 2 }), result = await late.run();
  assert.ok(result.checks.every(c => c.status === 'NOT RUN' && /Restoration failed/.test(c.reason)));
  assert.deepEqual(result.groups, []); assert.equal(result.artifacts.length, 6);
});
