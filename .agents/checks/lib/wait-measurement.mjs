import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Only receipts created after the wait starts count; old evidence must not satisfy a new collection request.
export async function waitForMeasurement(directory, caseId, { timeoutMs = 20000, intervalMs = 100 } = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(caseId) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000 || !Number.isInteger(intervalMs) || intervalMs < 1) throw new Error('Safe case ID and bounded positive wait timeout required');
  const before = new Set(await readdir(directory));
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    controller.abort(); reject(new Error(`Measurement timeout after ${timeoutMs}ms for ${caseId}; check page visibility, expected viewport and window.__dsVerification.error. No new receipt was accepted.`));
  }, timeoutMs); });
  const poll = async () => {
    while (!controller.signal.aborted) {
      for (const name of await readdir(directory)) {
        if (before.has(name) || !name.startsWith(`${caseId}-`) || !name.endsWith('.receipt.json')) continue;
        let receipt;
        try { receipt = JSON.parse(await readFile(path.join(directory, name), 'utf8')); }
        catch (error) { if (error instanceof SyntaxError || error.code === 'ENOENT') continue; throw error; }
        if (receipt.caseId !== caseId || receipt.status !== 'NOT VERIFIED') continue;
        return { receipt: path.resolve(directory, name), viewportMatches: receipt.viewportMatches,
          status: 'received', scope: 'Transport notification only; publish and close still validate original evidence.' };
      }
      await delay(intervalMs, undefined, { signal: controller.signal });
    }
  };
  try { return await Promise.race([poll(), timeout]); }
  finally { clearTimeout(timer); controller.abort(); }
}
