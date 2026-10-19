import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMutations } from './lib/mutation-runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const comparison = '.agents/checks/lib/delegation-differences.mjs';
runMutations({ root, name: 'delegation',
  tests: ['.agents/checks/tests/delegation-differences.test.mjs', '.agents/checks/tests/delegation-evidence.test.mjs', '.agents/checks/tests/evidence-session.test.mjs'],
  scope: 'Synthetic delegation detection, treatment, specific review and dependency currency, not real Figma fidelity or exhaustive mutations.',
  mutants: [
    ['.agents/checks/verify-imports.mjs', 'request-already-confirmed-reviews', 'delegationNextActions(d.metadataPath, d.pendingRecords)', 'delegationNextActions(d.metadataPath, d.records)'],
    ['.agents/checks/verify-ds.mjs', 'one-case-review-covers-all-cases', 'applicable.some(scope => !confirmed.has(scope.id))', 'applicable.every(scope => !confirmed.has(scope.id))'],
    ['.agents/checks/lib/evidence-session.mjs', 'trust-cached-bytes', "if (parsed.get(key)?.hash !== hash)", 'if (!parsed.has(key))'],
    ['.agents/checks/lib/evidence-session.mjs', 'ignore-candidate-overrides', 'allowOverrides && metadataOverrides.has(relative)', 'false'],
    ['.agents/checks/lib/evidence-session.mjs', 'reuse-snapshot-validation-after-content-change', "if (derived.get(key)?.hash !== hash)", 'if (!derived.has(key))'],
    ['.agents/checks/lib/correspondences.mjs', 'drop-candidate-session-in-confirmation-inputs', 'caseInputs(root, metadata, configuration, style, context)', 'caseInputs(root, metadata, configuration, style)'],
    [comparison, 'accept-undeclared-difference', "if (record.status === 'difference' && !record.treatment)", 'if (false)'],
    [comparison, 'omission-passes', "? 'NOT COMPARABLE' : 'NOT RUN'", "? 'NOT COMPARABLE' : 'PASS'"],
    [comparison, 'implementation-is-proof', "? 'NOT COMPARABLE' : 'NOT RUN'", "? 'PASS' : 'NOT RUN'"],
    [comparison, 'ignore-main-key', ' || main.key && roots[0].properties.key !== main.key', ''],
    [comparison, 'missing-baseline-is-same', "add(disposition.instance, '$identity', 'unmatched'", "add(disposition.instance, '$identity', 'same'"],
    [comparison, 'mode-mismatch-is-comparable', '!equal(lm, rm) || capture.source.fileKey !== baseline.source.fileKey', 'false'],
    [comparison, 'cross-file-ids-are-global', 'observedBindings.has(field) && baselineBindings.has(field) && capture.source.fileKey !== baseline.source.fileKey', 'false'],
    [comparison, 'unreadable-paint-is-absent-binding', "['fills', 'strokes', 'effects', 'segments'].includes(owner)", 'false'],
    ['.agents/checks/lib/comparison-evidence.mjs', 'drop-child-snapshot-fingerprint', 'classification, delegated, delegatedInputs,', 'classification, delegated, delegatedInputs: [],'],
    ['.agents/checks/lib/render-comparison.mjs', 'general-review-covers-differences', "check.status === 'NOT COMPARABLE' && !seen.has(check.id)", 'false'],
  ],
});
