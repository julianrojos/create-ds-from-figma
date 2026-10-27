import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { removalReport } from '../../../checks/lib/removal-report.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2) throw new Error('Use report-component-removal.mjs ROOT METADATA');
    console.log(JSON.stringify(removalReport(...args), null, 2));
  } catch (error) {
    console.error(`Component removal report: ${error.message}`);
    process.exitCode = 1;
  }
}
