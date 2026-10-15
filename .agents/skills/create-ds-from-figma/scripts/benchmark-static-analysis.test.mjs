import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createPreviewProject } from '../../../checks/tests/fixtures/preview-project.mjs';
import { benchmarkStaticAnalysis } from './benchmark-static-analysis.mjs';

test('static benchmark checks cached equivalence and reports timings without performance thresholds', t => {
  const { root, metadataPath } = createPreviewProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(path.join(root, metadataPath)));
  const result = benchmarkStaticAnalysis(root, m, { iterations: 3 });
  assert.equal(result.cases, 3); assert.equal(result.iterations, 3);
  assert.equal(result.cached.analyses, 2); assert.equal(result.cached.cacheHits, 5);
  for (const record of [result.cached, result.uncached]) assert.ok(Number.isFinite(record.medianMs) && record.medianMs >= 0);
  assert.throws(() => benchmarkStaticAnalysis(root, m, { iterations: 0 }), /Iterations/);
});
