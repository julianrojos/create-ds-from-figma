import { canonicalJson } from './figma-evidence.mjs';

export function behaviorBaseline(metadata, configuration) {
  const cases = Array.isArray(metadata.verification?.cases) ? metadata.verification.cases.filter(c => c && typeof c === 'object') : [];
  const fidelity = cases.find(c => c.id === configuration.baseline && c.kind === 'fidelity');
  const context = c => Object.fromEntries(['figmaRef', 'modes', 'viewport', 'environment', 'states'].map(k => [k, c?.[k] ?? null]));
  if (!fidelity || canonicalJson(context(fidelity)) !== canonicalJson(context(configuration))) return undefined;
  if (configuration.measurementBaseline === undefined) return fidelity;
  const reference = cases.find(c => c.id === configuration.measurementBaseline);
  if (!reference || reference.id === configuration.id || reference.kind !== 'behavior' || reference.baseline !== fidelity.id || reference.measurementBaseline !== undefined || canonicalJson(context(reference)) !== canonicalJson(context(configuration))) return undefined;
  return reference;
}
