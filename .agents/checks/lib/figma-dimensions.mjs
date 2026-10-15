const isText = value => typeof value === 'string' && value.trim().length > 0;
const dimensionProperties = { width: new Set(['width', 'inline-size']), height: new Set(['height', 'block-size']) };

// This rule classifies captured text dimensions, not geometry, constraints or arbitrary CSS.
export function textDimensionRequirements(capture) {
  const observations = new Map(capture.observations.map(o => [o.id, o]));
  const requirements = [];
  for (const node of capture.nodes.filter(n => n.type === 'TEXT')) {
    for (const field of ['width', 'height']) {
      const observation = observations.get(`${node.id}#${field}#property`);
      if (!observation) continue;
      const auto = observations.get(`${node.id}#textAutoResize#property`);
      const sizing = observations.get(`${node.id}#layoutSizing${field === 'width' ? 'Horizontal' : 'Vertical'}#property`);
      const bindings = capture.observations.filter(o => o.node === node.id && o.kind === 'binding' && o.field === field);
      let behavior = 'unknown';
      let reason = 'No supported textAutoResize value establishes dimensional behavior.';
      if (typeof observation.value !== 'number' || !Number.isFinite(observation.value)) {
        reason = 'The captured dimension is not a readable numeric value.';
      } else if (sizing && !['FIXED', 'HUG'].includes(sizing.value)) {
        reason = 'FILL or unsupported layout sizing interacts with text sizing; this rule does not establish that layout behavior.';
      } else if (['NONE', 'TRUNCATE', 'HEIGHT', 'WIDTH_AND_HEIGHT'].includes(auto?.value)) {
        behavior = auto.value === 'WIDTH_AND_HEIGHT' || (auto.value === 'HEIGHT' && field === 'height') ? 'content' : 'fixed';
        reason = `${auto.value} establishes ${behavior} sizing for ${field} in the captured configuration.`;
        if (behavior === 'content' && bindings.length) {
          behavior = 'unknown';
          reason = 'A dimension binding interacts with content sizing; resolve the conflict before choosing a translation.';
        }
      }
      requirements.push({ observation: observation.id, node: `${capture.source.fileKey}:${node.id}`, field,
        behavior, rule: 'text-auto-resize-v1',
        observations: [auto?.id, sizing?.id, ...bindings.map(o => o.id)].filter(Boolean), reason });
    }
  }
  return requirements.sort((a, b) => a.observation < b.observation ? -1 : a.observation > b.observation ? 1 : 0);
}

export function verifyTextDimensions(metadata, capture, { delegations = new Map() } = {}) {
  const errors = [], review = [];
  const requirements = textDimensionRequirements(capture);
  const expected = new Map(requirements.map(r => [r.observation, r]));
  const recorded = metadata.evidence?.textDimensions;
  if (!Array.isArray(recorded)) return { errors: ['evidence.textDimensions must be an array, including when no text dimensions are captured'], review, count: requirements.length };
  const seen = new Set();
  for (const [index, record] of recorded.entries()) {
    const label = `textDimensions[${index}]`;
    if (!record || typeof record !== 'object' || Array.isArray(record)) { errors.push(`${label}: invalid dimension record`); continue; }
    const requirement = expected.get(record.observation);
    if (!requirement || seen.has(record.observation)) { errors.push(`${label}: observation must identify a unique captured text width or height`); continue; }
    seen.add(record.observation);
    if (record.behavior !== requirement.behavior || record.rule !== requirement.rule ||
        !Array.isArray(record.observations) || record.observations.length !== requirement.observations.length ||
        new Set(record.observations).size !== record.observations.length || !requirement.observations.every(id => record.observations.includes(id))) {
      errors.push(`${label}: behavior, rule or supporting observations differ from snapshot requirements`);
    }
    if (record.treatment === 'delegation') {
      if (!delegations.get(record.instance)?.has(requirement.node)) errors.push(`${label}: dimension is not a descendant of the recorded validated mapped delegation`);
    } else if (record.treatment === 'unresolved') {
      if (requirement.behavior !== 'unknown' || !(metadata.unresolved || []).some(u =>
        u.field === `textDimensions.${record.observation}` && isText(u.reason) && isText(u.source) && u.blocking === false)) {
        errors.push(`${label}: unresolved treatment requires unknown behavior and an explicit nonblocking unresolved entry`);
      }
    } else if (record.treatment === 'declaration' || record.treatment === 'translation') {
      if (!isText(record.cssSelector) || !dimensionProperties[requirement.field].has(record.cssProperty)) {
        errors.push(`${label}: a dimension selector and matching physical or logical CSS property are required`);
      }
      if (requirement.behavior === 'unknown') errors.push(`${label}: unknown behavior cannot be claimed as an implemented dimension`);
      const identity = r => r.cssSelector === record.cssSelector && r.cssProperty === record.cssProperty;
      if (record.treatment === 'declaration') {
        const matches = (metadata.measuredLiterals || []).some(l => l.observation === record.observation && identity(l)) ||
          (metadata.bindings || []).some(b => b.node === requirement.node && b.figmaProperty === requirement.field && identity(b));
        if (requirement.behavior !== 'fixed' || !matches) errors.push(`${label}: declaration requires fixed behavior and a matching binding or measured literal`);
      } else if (!(metadata.evidence.translations || []).some(t => identity(t) && isText(t.reason) &&
          [record.observation, ...requirement.observations].every(id => t.observations?.includes(id)))) {
        errors.push(`${label}: translation must reference the dimension and its sizing observations`);
      }
    } else errors.push(`${label}: treatment must be declaration, translation, delegation or unresolved; hidden text is not automatically excluded`);
    review.push({ ...requirement, treatment: record.treatment, cssSelector: record.cssSelector, cssProperty: record.cssProperty });
  }
  for (const requirement of requirements) {
    if (!seen.has(requirement.observation)) errors.push(`Missing text dimension coverage: ${requirement.observation}`);
    if (requirement.behavior === 'content' && (metadata.measuredLiterals || []).some(l => l.observation === requirement.observation)) {
      errors.push(`${requirement.observation}: content-dependent text dimension cannot be recorded as a fixed measured literal`);
    }
  }
  return { errors, review, count: requirements.length };
}
