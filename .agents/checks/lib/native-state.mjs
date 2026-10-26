export function nativeStateProblem(state) {
  const check = state?.verification;
  if (check === undefined) return null;
  const native = check?.kind === 'native' && ['checked', 'disabled'].includes(check.property) && state.name === check.property;
  const pseudo = check?.kind === 'pseudo' && (state.name === 'hover' && check.property === 'hover' || state.name === 'focus' && ['focus', 'focus-visible'].includes(check.property) || state.name === 'focus-visible' && check.property === 'focus-visible');
  if (!check || typeof check !== 'object' || Array.isArray(check) ||
      Object.keys(check).some(key => !['kind', 'selector', 'property', 'value'].includes(key)) ||
      !native && !pseudo ||
      typeof check.value !== 'boolean' || typeof check.selector !== 'string' || !check.selector.trim() || check.selector.length > 256) {
    return 'State verification requires a scoped selector and boolean value: native checked/disabled with matching name/property, or pseudo hover/focus/focus-visible (focus may assert focus-visible)';
  }
  return null;
}

// Self-contained browser probe; never mutates DOM, props or event handlers.
export function readNativeState(root, state) {
  const check = state.verification;
  const result = { name: state.name, property: check.property, expected: check.value };
  let matches;
  try {
    matches = [root, ...root.querySelectorAll(check.selector)].filter(e =>
      (e !== root || e.matches(check.selector)) && e.closest('[data-ds-part="root"]') === root);
  } catch {
    return { ...result, status: 'NOT RUN', reason: 'Invalid native state selector.' };
  }
  if (matches.length !== 1) return { ...result, status: matches.length || check.kind === 'pseudo' ? 'NOT RUN' : 'FAIL', count: matches.length, reason: 'State assertion needs exactly one element owned by this component root.' };
  const element = matches[0], tag = element.tagName;
  if (check.kind === 'pseudo') {
    try {
      const measured = element.matches(':' + check.property);
      return { ...result, measured, count: 1, status: measured === check.value ? 'PASS' : 'FAIL', reason: 'Observed browser pseudoclass at collection time, not proof of activation history or appearance.' };
    } catch {
      return { ...result, status: 'NOT RUN', reason: 'Browser pseudoclass could not be read.' };
    }
  }
  if (check.property === 'checked' && !(tag === 'INPUT' && ['checkbox', 'radio'].includes(element.type)) ||
      check.property === 'disabled' && !['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'FIELDSET', 'OPTGROUP', 'OPTION'].includes(tag)) {
    return { ...result, status: 'FAIL', reason: 'Selected element does not support this native state; ARIA and classes are not substitutes.' };
  }
  const measured = check.property === 'checked' ? element.checked : element.matches(':disabled');
  return { ...result, measured, count: 1, status: measured === check.value ? 'PASS' : 'FAIL', reason: 'Native DOM state at collection time; not proof of keyboard behavior or visual fidelity.' };
}

export function compareNativeStates(configuration, measurement, add) {
  for (const state of configuration.states || []) {
    const id = `state:${state.name}`;
    if (!state.verification) { add(id, 'NOT COMPARABLE', 'No automatic state assertion declared; requires a specific rendered state review.'); continue; }
    const problem = nativeStateProblem(state);
    if (problem) { add(id, 'NOT RUN', problem); continue; }
    const records = Array.isArray(measurement?.nativeStates) ? measurement.nativeStates.filter(r => r?.name === state.name) : [];
    if (records?.length !== 1) { add(id, 'NOT RUN', 'Original native state measurement is missing or ambiguous.'); continue; }
    const record = records[0], expected = state.verification.value;
    if (record.property !== state.verification.property || record.expected !== expected ||
        !['PASS', 'FAIL', 'NOT RUN'].includes(record.status)) { add(id, 'NOT RUN', 'Native state measurement differs from the declared assertion.'); continue; }
    if (record.status === 'NOT RUN') { add(id, 'NOT RUN', record.reason); continue; }
    if (record.count !== 1 || typeof record.measured !== 'boolean') { add(id, 'FAIL', record.reason || 'Native target is missing.'); continue; }
    if (record.status !== (record.measured === expected ? 'PASS' : 'FAIL')) { add(id, 'NOT RUN', 'Native state result is inconsistent with its recorded value.'); continue; }
    add(id, record.measured === expected ? 'PASS' : 'FAIL', 'Declared native state compared with the original DOM reading.', { expected, measured: record.measured });
  }
}
