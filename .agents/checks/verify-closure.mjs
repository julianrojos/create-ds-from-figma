import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closureConformance } from './lib/closure-conformance.mjs';

export function parseClosureArgs(args, { allowCheck = true } = {}) {
  let root = '.', since, check = false, hasRoot = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check' && allowCheck && !check) check = true;
    else if (args[i] === '--since' && since === undefined && args[i+1] && !args[i+1].startsWith('-')) since = args[++i];
    else if (!args[i].startsWith('-') && !hasRoot) { root = args[i]; hasRoot = true; }
    else throw new Error(allowCheck ? 'Usage: verify-closure.mjs [ROOT] [--check] [--since REV]' : 'Usage: verify-imports.mjs [ROOT] [--since REV] (delivery checks are always mandatory)');
  }
  return { root: path.resolve(root), since, check };
}
export function parseImportArgs(args) {
  const {check, ...options} = parseClosureArgs(args,{allowCheck:false});
  return options;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseClosureArgs(process.argv.slice(2));
    const report = closureConformance(options.root, options);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = options.check && report.status !== 'PASS' ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
