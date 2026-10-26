import { delegationNextActions } from './delegation-differences.mjs';

// Derived from the observed checks only. Behavior checks must all PASS and no rendered review rescues them, so a behavior check that
// could not be compared needs a metadata decision, not a review: the two kinds of blocker call for different next steps.
export function diagnosisActions(root, metadataPath, diagnosticCases = []) {
  const differences = diagnosticCases.map(c => ({ caseId: c.caseId,
    checks: c.checks.filter(check => check.status === 'FAIL' && !check.id.startsWith('font:')).map(check => check.id) })).filter(c => c.checks.length);
  const unresolved = diagnosticCases.filter(c => c.kind === 'behavior').map(c => ({ caseId: c.caseId,
    checks: c.checks.filter(check => ['NOT COMPARABLE', 'NOT RUN'].includes(check.status) && !check.id.startsWith('font:')).map(check => ({ id: check.id, status: check.status, reason: check.reason })) })).filter(c => c.checks.length);
  const compositions = diagnosticCases.map(c => ({ caseId: c.caseId, checks: (c.composition?.checks || []).filter(check => check.status === 'FAIL').map(check => check.id) })).filter(c => c.checks.length);
  const unrunCompositions = diagnosticCases.map(c => ({ caseId: c.caseId,
    checks: (c.composition?.checks || []).filter(check => check.status === 'NOT RUN').map(({ id, status, reason }) => ({ id, status, reason })) })).filter(c => c.checks.length);
  const pendingStates = diagnosticCases.map(c => ({ caseId: c.caseId,
    checks: c.checks.filter(check => check.id.startsWith('state:') && ['NOT COMPARABLE', 'NOT RUN'].includes(check.status)).map(({ id, status, reason }) => ({ id, status, reason })) })).filter(c => c.checks.length);
  return [
    ...(pendingStates.length ? [{ code: 'RESOLVE_STATE_VERIFICATION', targets: [metadataPath], cases: pendingStates,
      permissions: ['project-read'], command: null,
      reason: 'Inspect the declared state, scoped target and original DOM reading. Native checked/disabled assertions read the real control; pseudo hover/focus/focus-visible assertions read the exact browser pseudoclass after explicit pointer/keyboard actions. An action is not proof of the state. Unsupported paths need an environment-browser harness, not removed states or guessed events. No command is authorized automatically.' }] : []),
    ...delegationNextActions(metadataPath, diagnosticCases.flatMap(c => c.checks.filter(check => check.delegation).map(check => ({ ...check.delegation, reason: check.reason })))),
    ...(unrunCompositions.length ? [{ code: 'RETRY_COMPOSITION_DIAGNOSTICS', targets: [metadataPath], cases: unrunCompositions,
      permissions: ['project-read', 'browser-execution', 'temporary-write'],
      command: { executable: 'npm', args: ['run', 'finalize:import', '--', root, metadataPath, '--diagnose'] },
      reason: 'Composition collection did not run. Resolve the recorded execution error and retry with browser execution and temporary storage available. This is missing diagnostic execution, not an observed visual difference or authorization to run the command.' }] : []),
    ...(compositions.length ? [{ code: 'REVIEW_COMPOSITION_DIAGNOSTICS', targets: [metadataPath], cases: compositions,
      permissions: ['project-read', 'temporary-read'], command: null,
      reason: 'Inspect the isolated/composed screenshots and opaque-ink balance. This experimental sibling model is not a published check or automatic Figma fidelity confirmation.' }] : []),
    ...(differences.length ? [{ code: 'REVIEW_RENDERED_DIFFERENCES', targets: [metadataPath], cases: differences, permissions: ['project-read', 'browser-execution', 'temporary-write'],
      reason: 'Inspect observed deltas and resource limitations before attributing a cause. Correct demonstrated implementation defects and repeat the diagnosis.',
      command: { executable: 'npm', args: ['run', 'finalize:import', '--', root, metadataPath, '--diagnose'] } }] : []),
    ...(unresolved.length ? [{ code: 'RESOLVE_BEHAVIOR_CHECKS', targets: [metadataPath], cases: unresolved, permissions: ['project-write'],
      reason: 'Behavior checks must all PASS and no rendered review rescues a NOT COMPARABLE or NOT RUN one. Declare the missing justified expectation (for example an intrinsic-size relation and its reason) or correct the case in metadata.verification.cases, then diagnose again. Do not add reviews or invent a relation to make the check pass.',
      command: null }] : []),
  ];
}
