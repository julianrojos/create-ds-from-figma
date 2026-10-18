import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OPERATIONS, compareRegions, heatmap } from '../../../checks/lib/pixel-residual.mjs';

const MAX_FILE = 32 * 1024 * 1024;
const read = file => { const bytes = readFileSync(file); if (bytes.length > MAX_FILE) throw new Error(`${file} exceeds the size budget`); return bytes; };

export function pixelDiagnose(args) {
  const [command, referenceFile, candidateFile, regionsFile, ...flags] = args;
  const usage = 'Use compare REFERENCE.png CANDIDATE.png REGIONS.json [--max-shift N] [--max-operations N] [--heatmap OUT.png]';
  if (command !== 'compare' || !referenceFile || !candidateFile || !regionsFile) throw new Error(usage);
  const options = new Map();
  for (let i = 0; i < flags.length; i += 2) {
    if (!['--max-shift', '--max-operations', '--heatmap'].includes(flags[i]) || !flags[i + 1] || flags[i + 1].startsWith('--') || options.has(flags[i])) throw new Error(usage);
    options.set(flags[i], flags[i + 1]);
  }
  const maxShift = options.has('--max-shift') ? Number(options.get('--max-shift')) : 12;
  if (!Number.isInteger(maxShift)) throw new Error('--max-shift must be an integer');
  const maxOperations = options.has('--max-operations') ? Number(options.get('--max-operations')) : DEFAULT_OPERATIONS;
  const reference = read(referenceFile), candidate = read(candidateFile), regions = JSON.parse(readFileSync(regionsFile, 'utf8'));
  const result = compareRegions(reference, candidate, regions, { maxShift, maxOperations });
  if (options.has('--heatmap')) {
    const map = heatmap(reference, candidate, { maxShift, maxOperations });
    writeFileSync(options.get('--heatmap'), map.png, { flag: 'wx' });
    result.heatmap = { path: path.resolve(options.get('--heatmap')), shift: map.shift, alignedOn: map.alignedOn, scope: 'White is no difference; red marks differences after one alignment estimated on a central window.' };
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(pixelDiagnose(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
