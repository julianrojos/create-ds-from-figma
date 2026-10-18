// Derived from the observed checks only. Behavior checks must all PASS and no rendered review rescues them, so a behavior check that
// could not be compared needs a metadata decision, not a review: the two kinds of blocker call for different next steps.
export function diagnosisActions(root, metadataPath, diagnosticCases = []) {
  const differences = diagnosticCases.map(c => ({ caseId: c.caseId,
    checks: c.checks.filter(check => check.status === 'FAIL' && !check.id.startsWith('font:')).map(check => check.id) })).filter(c => c.checks.length);
  const unresolved = diagnosticCases.filter(c => c.kind === 'behavior').map(c => ({ caseId: c.caseId,
    checks: c.checks.filter(check => ['NOT COMPARABLE', 'NOT RUN'].includes(check.status) && !check.id.startsWith('font:')).map(check => ({ id: check.id, status: check.status, reason: check.reason })) })).filter(c => c.checks.length);
  return [
    ...(differences.length ? [{ code: 'REVIEW_RENDERED_DIFFERENCES', targets: [metadataPath], cases: differences, permissions: ['project-read', 'browser-execution', 'temporary-write'],
      reason: 'Inspect observed deltas and resource limitations before attributing a cause. Correct demonstrated implementation defects and repeat the diagnosis.',
      command: { executable: 'npm', args: ['run', 'finalize:import', '--', root, metadataPath, '--diagnose'] } }] : []),
    ...(unresolved.length ? [{ code: 'RESOLVE_BEHAVIOR_CHECKS', targets: [metadataPath], cases: unresolved, permissions: ['project-write'],
      reason: 'Behavior checks must all PASS and no rendered review rescues a NOT COMPARABLE or NOT RUN one. Declare the missing justified expectation (for example an intrinsic-size relation and its reason) or correct the case in metadata.verification.cases, then diagnose again. Do not add reviews or invent a relation to make the check pass.',
      command: null }] : []),
  ];
}
