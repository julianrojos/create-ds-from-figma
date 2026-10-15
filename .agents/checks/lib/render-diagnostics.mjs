// Noise threshold for size diagnostics, independent of positional/fidelity tolerances.
export const AABB_SIZE_DIAGNOSTIC_THRESHOLD = 1;

// Informational AABB differences do not establish that the underlying shapes are comparable.
export function renderDiagnostics(result) {
  return (result?.checks || []).flatMap(check => {
    const size = check.informationalSize;
    if (!size) return [];
    const delta = { width: size.measured.width - size.expected.width, height: size.measured.height - size.expected.height };
    if (!Object.values(delta).some(value => Math.abs(value) > AABB_SIZE_DIAGNOSTIC_THRESHOLD)) return [];
    return [{ checkId: check.id, kind: 'noncomparable-size-difference', ...size, delta,
      diagnosticThreshold: AABB_SIZE_DIAGNOSTIC_THRESHOLD,
      reason: 'Source and DOM AABB sizes differ. Inspect shape, transforms and stroke bounds; this is not an objective size FAIL or a shape PASS.' }];
  });
}
