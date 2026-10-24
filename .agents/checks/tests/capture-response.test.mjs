import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureResponse, captureViaBridge } from '../../skills/create-ds-from-figma/scripts/lib/capture-bridge.mjs';

const chunk = { transportVersion: 1, offset: 0, total: 3, checksum: 'example', payload: 'abc' };
const message = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const options = { responseFormat: 'figma-execute', fileKey: 'FILE' };

test('Figma response adapters are explicit, preserve the chunk and never guess nested JSON', () => {
  const envelope = { success: true, result: chunk, fileContext: { fileKey: 'FILE' }, timestamp: 1 };
  assert.deepEqual(captureResponse(message(envelope), options), chunk);
  assert.deepEqual(captureResponse(message({ success: true, result: chunk }), options), chunk);
  assert.deepEqual(captureResponse(message(chunk)), chunk);
  assert.throws(() => captureResponse(message(envelope)), /tool.responseFormat/);
  assert.throws(() => captureResponse(message(chunk), options), /did not report success/);
  assert.throws(() => captureResponse(message(chunk), { responseFormat: 'auto' }), /Unsupported/);
  for (const result of [null, [], JSON.stringify(chunk), { result: chunk }]) assert.throws(() => captureResponse(message({ success: true, result }), options), /transport/);
});

test('figma_execute failures, mismatching context and ambiguous or corrupt MCP replies cannot stage data', async () => {
  const bad = [
    null,
    { content: 'not content blocks' },
    { content: [null] },
    { isError: true, ...message({ success: true, result: chunk }) },
    message({ success: false, result: chunk, error: 'Plugin refused' }),
    message({ success: 'true', result: chunk }),
    message({ success: true, result: chunk, error: 'Conflicting error' }),
    message({ success: true, result: chunk, fileContext: { fileKey: 'OTHER' } }),
    message({ success: true, result: chunk, fileContext: {} }),
    message(null),
    { content: [{ type: 'text', text: '{truncated' }] },
    { content: [...message(chunk).content, ...message(chunk).content] },
    message({ success: true, result: { ...chunk, offset: 1 } }),
    message({ success: true, result: { ...chunk, payload: 'abcd' } }),
  ];
  for (const reply of bad) {
    let recorded = false, staged = false;
    await assert.rejects(captureViaBridge({ ...options, getCode: async () => '', runFigma: async () => reply,
      recordResponse: async raw => { assert.equal(raw, reply); recorded = true; }, stage: async () => { staged = true; } }));
    assert.equal(recorded, true); assert.equal(staged, false);
  }
  assert.throws(() => captureResponse(message({ success: false, error: 'Plugin refused' }), options), /Plugin refused/);
});

test('wrapped chunks keep continuity checks and never merge changed captures', async () => {
  let calls = 0, staged = 0;
  await assert.rejects(captureViaBridge({ ...options, getCode: async () => '',
    runFigma: async () => message({ success: true, result: { ...chunk, offset: calls++ ? 1 : 0, payload: 'a', checksum: calls === 1 ? 'first' : 'changed' } }),
    stage: async () => { staged++; } }), /Capture changed/);
  assert.equal(staged, 1);
});

test('fragment validation, continuity and staging failures retain progress and the original cause', async () => {
  for (const kind of ['truncated', 'changed', 'stage']) {
    let calls = 0;
    const recorded = [], staged = [], writeError = new Error('Disk full');
    await assert.rejects(captureViaBridge({ fileKey: 'FILE', nodeId: '1:1', getCode: async () => '',
      runFigma: async () => {
        const offset = calls++;
        return message({ transportVersion: 1, offset, total: 3, checksum: kind === 'changed' && offset === 1 ? 'changed' : 'stable',
          payload: kind === 'truncated' && offset === 1 ? '' : 'x' });
      },
      recordResponse: async raw => recorded.push(raw),
      stage: async c => { if (kind === 'stage' && c.offset === 1) throw writeError; staged.push(c.offset); },
    }), error => {
      assert.match(error.message, /Capture offset 1, received 1 chunks of 3 characters:/);
      assert.match(error.message, kind === 'truncated' ? /Invalid or truncated/ : kind === 'changed' ? /Capture changed.*NEW temporary session/ : /Disk full/);
      assert.ok(error.cause instanceof Error);
      if (kind === 'stage') assert.equal(error.cause, writeError);
      return true;
    });
    assert.equal(calls, 2);
    assert.equal(recorded.length, 2);
    assert.deepEqual(staged, [0]);
  }
});

test('large captures cross 128 chunks with an explicit bounded budget; failures preserve server detail and offset', async () => {
  let offset = 0;
  const staged = [];
  const run = maxChunks => captureViaBridge({ fileKey: 'FILE', nodeId: '1:1', maxChunks,
    getCode: async next => { offset = next; return ''; },
    runFigma: async () => message({ transportVersion: 1, offset, total: 1700000, checksum: 'stable', payload: 'x'.repeat(Math.min(12000, 1700000 - offset)) }),
    stage: async c => staged.push(c.offset) });
  const result = await run(256);
  assert.equal(result.chunks.length, 142);
  assert.equal(result.total, 1700000);
  await assert.rejects(run(128), /128.*1536000 of 1700000.*NEW session/);
  for (const invalid of [0, -1, 4097, 1.5, NaN]) await assert.rejects(run(invalid), /maxChunks/);
  let recorded;
  const failure = { isError: true, content: [{ type: 'text', text: 'Plugin execution timed out' }] };
  await assert.rejects(captureViaBridge({ fileKey: 'FILE', nodeId: '1:1', getCode: async () => '',
    runFigma: async () => failure, stage: async () => assert.fail('must not stage an error'),
    recordResponse: async raw => { recorded = raw; } }), /offset 0.*received 0 chunks.*timed out/);
  assert.equal(recorded, failure);
});
