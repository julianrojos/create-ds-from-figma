import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewLogger } from '../../skills/create-ds-from-figma/scripts/lib/preview-logger.mjs';

test('preview logger preserves info/warnings/errors and Vite bookkeeping without clearing the output', () => {
  const messages = [], logger = previewLogger(message => messages.push(message));
  assert.equal(logger.hasWarned, false);
  logger.info('optimizer reload'); assert.equal(logger.hasWarned, false);
  logger.warnOnce('one warning'); logger.warnOnce('one warning'); logger.warn('ordinary warning');
  const error = new Error('broken transform');
  logger.error('transform failed', { error }); logger.clearScreen('info');
  assert.equal(logger.hasWarned, true);
  assert.equal(logger.hasErrorLogged(error), true); assert.equal(logger.hasErrorLogged(new Error()), false);
  assert.equal(logger.hasErrorLogged(null), false);
  assert.deepEqual(messages, ['[vite:info] optimizer reload\n', '[vite:warn] one warning\n', '[vite:warn] ordinary warning\n', '[vite:error] transform failed\n']);
});
