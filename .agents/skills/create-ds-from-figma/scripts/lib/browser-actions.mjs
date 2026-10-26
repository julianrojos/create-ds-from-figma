import { browserActionsProblem } from '../../../../checks/lib/browser-actions.mjs';

// Execute declared real input only. The collector separately asserts the resulting state.
export async function activateBrowserCase(page, configuration, timeoutMs) {
  const problem = browserActionsProblem(configuration.actions);
  if (problem) throw new Error(problem);
  for (const action of configuration.actions || []) {
    if (action.kind === 'press') {
      await page.keyboard.press(action.key);
      continue;
    }
    const handle = await page.evaluateHandle(selector => {
      const roots = [...document.querySelectorAll('#component [data-ds-part="root"]')].filter(e => !e.parentElement?.closest('[data-ds-part="root"]'));
      if (roots.length !== 1) throw new Error('Browser action requires one rendered component root');
      const root = roots[0];
      const elements = [root, ...root.querySelectorAll(selector)].filter(e => (e !== root || e.matches(selector)) && e.closest('[data-ds-part="root"]') === root);
      if (elements.length !== 1) throw new Error('Browser action requires exactly one target owned by this component root');
      return elements[0];
    }, action.selector);
    try {
      const element = handle.asElement();
      if (!element) throw new Error('Browser action target is not an element');
      await element[action.kind]({ timeout: timeoutMs });
    } finally { await handle.dispose(); }
  }
}

export async function collectBrowserCase(page, url, configuration, timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('Bounded positive browser case timeout required');
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Browser case collection timed out after ${timeoutMs}ms (host deadline for navigation, actions and measurement)`));
      // Closing the case page interrupts pending browser operations without waiting for its timers.
      void page.close().catch(() => {});
    }, timeoutMs);
  });
  try {
    await Promise.race([timeout, (async () => {
      await page.goto(url, { timeout: timeoutMs });
      if (configuration.actions?.length || configuration.states.some(s => s.verification?.kind === 'pseudo')) {
        await page.waitForSelector('#component [data-ds-part="root"]', { state: 'visible', timeout: timeoutMs });
        await activateBrowserCase(page, configuration, timeoutMs);
        await page.evaluate(() => { void window.__dsVerification.collect().catch(() => {}); });
      }
      await page.waitForFunction(() => ['recorded', 'diagnostic-recorded', 'failed'].includes(window.__dsVerification?.status), undefined, { timeout: timeoutMs });
    })()]);
  } finally { clearTimeout(timer); }
}
