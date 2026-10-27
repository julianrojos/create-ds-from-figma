import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateReport } from '../../../checks/lib/update-report.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 3) throw new Error('Use report-component-update.mjs ROOT METADATA PROPOSED_SNAPSHOT');
    const proposed = JSON.parse(readFileSync(args[2], 'utf8'));
    console.log(JSON.stringify(updateReport(args[0], args[1], proposed), null, 2));
  } catch (error) {
    console.error(`Component update report: ${error.message}`);
    process.exitCode = 1;
  }
}
