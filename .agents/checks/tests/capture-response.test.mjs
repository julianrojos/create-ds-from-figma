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
