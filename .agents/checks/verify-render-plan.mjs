import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRenderPlan } from './lib/render-plan.mjs';
import { verifyFigmaEvidence } from './verify-figma-evidence.mjs';
import { verifyIntrinsicCss } from './lib/intrinsic-css.mjs';
import { caseInputs } from './lib/comparison-evidence.mjs';
import { verifyTokenStyles } from './lib/token-styles.mjs';
import { createDependencySession } from './lib/local-dependencies.mjs';

export function verifyRenderPlans(root, { contexts, dependencySession } = {}) {
  const errors = [], warnings = [];
  dependencySession ||= createDependencySession(root);
  if (!contexts) {
    contexts = new Map();
    const evidence = verifyFigmaEvidence(root, { contexts });
    errors.push(...evidence.errors); warnings.push(...evidence.warnings);
  }
    for (const [key, { metadata, capture, entry, result: evidence }] of contexts) {
      const name = entry?.name || key;
      if (evidence.errors.length) continue;
      try {
        const result = verifyRenderPlan(root, metadata, capture, { delegations: evidence.review.delegations });
        const tokens = verifyTokenStyles(root, metadata, { dependencySession });
        result.errors.push(...tokens.errors); result.warnings.push(...tokens.warnings);
        const css = verifyIntrinsicCss(root, metadata, entry.code?.style);
        for (const c of metadata.verification?.cases || []) result.warnings.push(...caseInputs(root, metadata, c, entry.code?.style, { dependencySession }).warnings);
        result.errors.push(...css.errors); result.warnings.push(...css.warnings);
        errors.push(...result.errors.map(e => `${name}: ${e}`));
        warnings.push(...result.warnings.map(e => `${name}: ${e}`));
      } catch (error) { errors.push(`${name}: render plan: ${error.message}`); }
    }
  return { errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyRenderPlans(path.resolve(process.argv[2] || '.'));
  console.log(JSON.stringify(result, null, 2));
  console.log(`${result.errors.length ? 'FAIL' : result.warnings.length ? 'NOT VERIFIED' : 'PASS'}: plan conformance only; no rendered check was executed`);
  if (result.errors.length) process.exitCode = 1;
}
