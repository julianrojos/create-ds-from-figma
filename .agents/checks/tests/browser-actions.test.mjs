import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserActionsProblem } from '../lib/browser-actions.mjs';
import { activateBrowserCase, collectBrowserCase } from '../../skills/create-ds-from-figma/scripts/lib/browser-actions.mjs';

test('browser actions accept only bounded explicit input and reject arbitrary execution or force options', () => {
  for (const actions of [undefined, [], [{ kind: 'hover', selector: 'button' }, { kind: 'click', selector: 'input' }, { kind: 'press', key: 'Tab' }]]) assert.equal(browserActionsProblem(actions), null);
  for (const actions of [null, {}, Array(33).fill({ kind: 'press', key: 'Tab' }), [null], [{ kind: 'focus', selector: 'input' }], [{ kind: 'evaluate', code: 'pass()' }],
    [{ kind: 'press', key: 'Anything' }], [{ kind: 'hover', selector: '' }], [{ kind: 'hover', selector: 'button', force: true }], [{ kind: 'press', key: 'Tab', selector: 'input' }]]) assert.ok(browserActionsProblem(actions), JSON.stringify(actions));
});

test('invalid actions fail before browser use and actions execute in declared order without focus or DOM mutation APIs', async () => {
  const calls = [], element = { hover: async () => calls.push('hover'), click: async () => calls.push('click') };
  const page = { keyboard: { press: async key => calls.push(key) }, evaluateHandle: async () => ({ asElement: () => element, dispose: async () => calls.push('dispose') }) };
  await assert.rejects(activateBrowserCase(page, { actions: [{ kind: 'evaluate' }] }, 100), /Unsupported/);
  assert.deepEqual(calls, []);
  await activateBrowserCase(page, { actions: [{ kind: 'hover', selector: 'button' }, { kind: 'press', key: 'Tab' }, { kind: 'click', selector: 'button' }] }, 100);
  assert.deepEqual(calls, ['hover', 'dispose', 'Tab', 'click', 'dispose']);
});

test('pointer action resolution excludes nested roots and rejects ambiguous owned targets', async () => {
  const calls = [], delegatedRoot = {};
  const owned = { closest: () => root, click: async () => calls.push('owned') };
  const delegated = { closest: () => delegatedRoot, click: async () => calls.push('delegated') };
  const root = { matches: () => false, querySelectorAll: () => [owned, delegated] };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { querySelectorAll: () => [root] };
  const page = { evaluateHandle: async (resolve, selector) => {
    const element = resolve(selector);
    return { asElement: () => element, dispose: async () => {} };
  } };
  try {
    await assert.doesNotReject(activateBrowserCase(page, { actions: [{ kind: 'click', selector: 'button' }] }, 100));
    assert.deepEqual(calls, ['owned']);
    root.querySelectorAll = () => [owned, owned];
    await assert.rejects(activateBrowserCase(page, { actions: [{ kind: 'click', selector: 'button' }] }, 100), /exactly one target/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

test('the host deadline bounds every browser stage even when the page and its cleanup never resolve', async () => {
  for (const stage of ['goto', 'waitForSelector', 'press', 'evaluate', 'waitForFunction']) {
    let closed = 0, guard;
    const pending = () => new Promise(() => {});
    const page = { goto: async () => {}, waitForSelector: async () => {}, evaluate: async () => {}, waitForFunction: async () => {},
      keyboard: { press: async () => {} }, close: () => { closed++; return pending(); } };
    if (stage === 'press') page.keyboard.press = pending;
    else page[stage] = pending;
    try {
      await assert.rejects(Promise.race([
        collectBrowserCase(page, 'test', { states: [], actions: [{ kind: 'press', key: 'Tab' }] }, 30),
        new Promise(resolve => { guard = setTimeout(resolve, 500); }),
      ]), /timed out.*host deadline/, stage);
      assert.equal(closed, 1, stage);
    } finally { clearTimeout(guard); }
  }
});

test('collection starts without awaiting its promise and completed or failed cases clear the host deadline', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let started = 0, closed = 0;
  globalThis.window = { __dsVerification: { collect: () => { started++; return new Promise(() => {}); } } };
  const page = { goto: async () => {}, waitForSelector: async () => {}, evaluate: async fn => { assert.equal(fn(), undefined); },
    waitForFunction: async () => {}, close: async () => { closed++; } };
  try {
    await assert.doesNotReject(collectBrowserCase(page, 'test', { states: [{ verification: { kind: 'pseudo' } }] }, 30));
    assert.equal(started, 1);
    page.goto = async () => { throw new Error('Navigation failed'); };
    await assert.rejects(collectBrowserCase(page, 'test', { states: [] }, 30), /Navigation failed/);
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(closed, 0, 'A cleared deadline cannot close a completed or already failed page.');
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  }
});
