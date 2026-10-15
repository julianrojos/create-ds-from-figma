import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../browser-tests/', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || `Browser setup failed (${result.status})`);
};
try {
  run(npm, ['ci', '--prefix', directory, '--no-audit', '--no-fund']);
  run(process.execPath, [path.join(directory, 'node_modules/playwright/cli.js'), 'install', 'chromium']);
  console.log('Locked browser runtime ready. Run npm run test:browser or npm test.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
