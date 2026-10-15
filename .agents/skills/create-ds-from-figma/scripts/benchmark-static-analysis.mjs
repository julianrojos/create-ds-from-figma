import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createDependencySession } from '../../../checks/lib/local-dependencies.mjs';
import { caseInputs } from '../../../checks/lib/comparison-evidence.mjs';
import { verifyTokenStyles } from '../../../checks/lib/token-styles.mjs';
import { projectFile } from '../../../checks/lib/render-plan.mjs';

export function benchmarkStaticAnalysis(root, metadata, { iterations = 20 } = {}) {
  if (!Number.isInteger(iterations) || iterations < 3 || iterations > 1000) throw new Error('Iterations must be an integer from 3 to 1000');
  const work = cached => {
    const dependencySession = cached ? createDependencySession(root) : undefined;
    const options = { dependencySession };
    const result = [verifyTokenStyles(root, metadata, options)];
    for (const c of metadata.verification.cases) for (let repeat = 0; repeat < 2; repeat++) result.push(caseInputs(root, metadata, c, undefined, options));
    return { result, stats: dependencySession?.stats };
  };
  const reference = work(false), cachedReference = work(true);
  if (JSON.stringify(reference.result) !== JSON.stringify(cachedReference.result)) throw new Error('Cached analysis differs from uncached analysis');
  for (let warm = 0; warm < 5; warm++) { work(false); work(true); }
  const times = { uncached: [], cached: [] };
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const cached of iteration % 2 ? [true, false] : [false, true]) {
      const start = performance.now(); work(cached); times[cached ? 'cached' : 'uncached'].push(performance.now() - start);
    }
  }
  const summarize = values => { values.sort((a, b) => a - b); return { medianMs: values[Math.floor(values.length / 2)], p95Ms: values[Math.ceil(values.length * 0.95) - 1] }; };
  return { scope: 'Warm-process token stylesheet check and two caseInputs calls per case; not total DS validation, cold startup or rendered fidelity.',
    nodeVersion: process.version, cases: metadata.verification.cases.length, iterations,
    uncached: summarize(times.uncached), cached: { ...summarize(times.cached), ...cachedReference.stats } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , root, metadataPath, iterations = '20'] = process.argv;
    if (!root || !metadataPath) throw new Error('Usage: benchmark-static-analysis.mjs ROOT METADATA [ITERATIONS]');
    const metadata = JSON.parse(readFileSync(projectFile(root, metadataPath), 'utf8'));
    console.log(JSON.stringify(benchmarkStaticAnalysis(root, metadata, { iterations: Number(iterations) }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
