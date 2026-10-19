import { canonicalJson } from './figma-evidence.mjs';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const unknown = v => object(v) && (v.unavailable === true || v.mixed === true) || Array.isArray(v) && v.some(unknown) || object(v) && Object.values(v).some(unknown);
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
const refOf = (capture, node) => `${capture.source.fileKey}:${node.id}`;
const identity = (instance, node, property) => `delegation:${[instance, node, property].map(encodeURIComponent).join(':')}`;

function readField(capture, node, field) {
  if (capture.coverage.issues.some(i => i.node === node.id && (i.field === field || i.field.startsWith(field + '.'))) || unknown(node.properties[field])) return { state: 'unreadable' };
  if (Object.hasOwn(node.properties, field)) return { state: 'present', value: node.properties[field] };
  return { state: node.notApplicable.includes(field) ? 'not applicable' : 'unreadable' };
}

function modeContext(capture, node, variableIds) {
  if (!variableIds.length) return {};
  const modes = readField(capture, node, 'resolvedVariableModes');
  if (modes.state !== 'present' || !object(modes.value)) return null;
  const result = {}, seen = new Set();
  const visit = id => {
    if (seen.has(id)) return false;
    seen.add(id);
    const variable = capture.variables.find(v => v.id === id), collection = capture.collections.find(c => c.id === variable?.collectionId);
    if (!variable || !collection) return false;
    const mode = modes.value[collection.id] ?? collection.defaultModeId;
    if (!collection.modes.some(m => m.modeId === mode)) return false;
    result[collection.id] = mode;
    const value = variable.valuesByMode?.[mode];
    return value !== undefined && !unknown(value) && (value?.type !== 'VARIABLE_ALIAS' || visit(value.id));
  };
  // Each alias chain gets its own cycle guard; sharing a resolved target is not a cycle.
  for (const id of variableIds) { seen.clear(); if (!visit(id)) return null; }
  return result;
}

export function delegationFacts({ reason, treatment, ...record }) {
  return { ...record, ...(treatment ? { treatment: Object.fromEntries(Object.entries(treatment).filter(([key]) => key !== 'reason')) } : {}) };
}

// Compare observations, not presumed override provenance. Missing/ambiguous baselines never mean equality.
export function delegationDifferences(capture, metadata, mappedComponents = []) {
  const records = [], errors = [], dependencies = [];
  const nodes = new Map(capture.nodes.map(n => [refOf(capture, n), n]));
  for (const disposition of metadata.evidence?.dispositions || []) {
    if (disposition.kind !== 'delegated') continue;
    const instance = nodes.get(disposition.instance), main = instance?.properties.mainComponent;
    const mainRef = main?.remote ? `componentKey:${main.key}` : `${capture.source.fileKey}:${main?.id}`;
    const candidates = mappedComponents.filter(c => c.name === disposition.resolvedComponent && c.refs.includes(mainRef));
    const mapped = candidates.length === 1 ? candidates[0] : undefined;
    const baseline = mapped?.capture;
    const current = [];
    const add = (node, property, status, reason, facts = {}) => {
      const record = { id: identity(disposition.instance, node, property), instance: disposition.instance, node, property, status, reason, ...facts };
      current.push(record); return record;
    };
    const roots = baseline?.nodes.filter(n => n.type === 'COMPONENT' && (main?.remote ? n.properties.key === main.key : baseline.source.fileKey === capture.source.fileKey && n.id === main?.id)) || [];
    if (!instance || instance.type !== 'INSTANCE' || !main || !mapped || roots.length !== 1 || !baseline || main.key && roots[0].properties.key !== main.key) {
      add(disposition.instance, '$identity', 'unmatched', mapped?.snapshotProblem || 'A unique mapped main component and verified baseline snapshot are required.');
    } else {
      dependencies.push({ instance: disposition.instance, component: mapped.name, snapshot: mapped.snapshot, hash: mapped.hash });
      const baselineNodes = new Map(baseline.nodes.map(n => [n.id, n]));
      const compareNode = (a, b, root = false) => {
        const node = refOf(capture, a);
        if (!root && (a.type === 'INSTANCE' || b.type === 'INSTANCE')) { add(node, '$nested', 'unmatched', 'Nested instances require a separate unambiguous delegation correspondence.'); return; }
        if (!root && (a.type !== b.type || a.name !== b.name || a.id.split(';').at(-1) !== b.id) || a.children.length !== b.children.length || [capture, baseline].some((c, i) => c.coverage.issues.some(issue => issue.node === [a, b][i].id && issue.field === 'children'))) {
          add(node, '$structure', 'unmatched', 'Node suffix, type, name and ordered structure must establish an unambiguous correspondence.'); return;
        }
        const compare = (property, left, right, reason = 'Readable captured property comparison.') => {
          const status = left.state === 'unreadable' || right.state === 'unreadable' ? 'unreadable' : left.state === 'not applicable' && right.state === 'not applicable' ? 'not applicable' : equal(left, right) ? 'same' : 'difference';
          add(node, property, status, reason, { baselineNode: refOf(baseline, b), observed: left, baseline: right });
        };
        const leftBindings = readField(capture, a, 'boundVariables'), rightBindings = readField(baseline, b, 'boundVariables');
        if (leftBindings.state === 'unreadable' || rightBindings.state === 'unreadable') compare('bindings', leftBindings, rightBindings);
        const bindings = c => c.observations.filter(o => o.kind === 'binding');
        const observedBindings = new Map(bindings(capture).filter(o => o.node === a.id).map(o => [o.field, o.value]));
        const baselineBindings = new Map(bindings(baseline).filter(o => o.node === b.id).map(o => [o.field, o.value]));
        for (const field of new Set([...observedBindings.keys(), ...baselineBindings.keys()])) {
          if (leftBindings.state === 'unreadable' || rightBindings.state === 'unreadable') continue;
          if (observedBindings.has(field) && baselineBindings.has(field) && capture.source.fileKey !== baseline.source.fileKey) {
            add(node, `binding:${field}`, 'unmatched', 'Variable IDs from different files have no captured stable-key correspondence.'); continue;
          }
          const owner = field.split(/[.\[]/)[0];
          if (['fills', 'strokes', 'effects', 'segments'].includes(owner) && [readField(capture, a, owner), readField(baseline, b, owner)].some(v => v.state === 'unreadable')) {
            add(node, `binding:${field}`, 'unreadable', 'The paint or text segment holding this binding could not be read.'); continue;
          }
          if (['fills', 'strokes'].includes(owner)) {
            const lp = readField(capture, a, owner), rp = readField(baseline, b, owner);
            if (Array.isArray(lp.value) && Array.isArray(rp.value) && (lp.value.length !== rp.value.length || Math.max(lp.value.length, rp.value.length) > 1 && !equal(lp.value, rp.value))) {
              add(node, `binding:${field}`, 'unmatched', 'Changed paint stacks do not establish identity of indexed bindings.'); continue;
            }
          }
          compare(`binding:${field}`, observedBindings.has(field) ? { state: 'present', value: observedBindings.get(field) } : { state: 'absent' }, baselineBindings.has(field) ? { state: 'present', value: baselineBindings.get(field) } : { state: 'absent' });
        }
        for (const field of ['fills', 'strokes']) {
          const left = readField(capture, a, field), right = readField(baseline, b, field);
          if (left.state !== 'present' || right.state !== 'present' || !Array.isArray(left.value) || !Array.isArray(right.value)) { compare(field, left, right); continue; }
          if (left.value.length !== right.value.length) { compare(`${field}.length`, { state: 'present', value: left.value.length }, { state: 'present', value: right.value.length }); add(node, field, 'unmatched', 'Different paint stacks have no established per-paint correspondence.'); continue; }
          if (left.value.length > 1 && !equal(left.value, right.value)) { add(node, field, 'unmatched', 'Multiple changed or reordered paints require an explicit correspondence; indices alone are not identity.'); continue; }
          if (!left.value.length) compare(field, left, right);
          left.value.forEach((paint, index) => {
            const other = right.value[index];
            if (!object(paint) || !object(other)) { add(node, `${field}[${index}]`, 'unreadable', 'Paint data is unreadable.'); return; }
            for (const key of new Set([...Object.keys(paint), ...Object.keys(other)])) {
              if (key === 'boundVariables') continue; // Binding observations above preserve variable identity separately.
              const property = `${field}[${index}].${key}`;
              if (['color', 'gradientStops'].includes(key)) {
                const aliases = bindings => [...bindings].filter(([name]) => [field, `${field}[${index}]`, property].includes(name)).map(([, value]) => value.id);
                const la = aliases(observedBindings), ra = aliases(baselineBindings);
                const lm = modeContext(capture, a, la), rm = modeContext(baseline, b, ra);
                if (!lm || !rm) { add(node, property, 'unreadable', 'The relevant resolved variable/alias mode context is unreadable.'); continue; }
                if (la.length && ra.length && (!equal(lm, rm) || capture.source.fileKey !== baseline.source.fileKey)) { add(node, property, 'unmatched', 'Resolved paint values require equivalent readable mode contexts.'); continue; }
              }
              compare(property, Object.hasOwn(paint, key) ? { state: 'present', value: paint[key] } : { state: 'absent' }, Object.hasOwn(other, key) ? { state: 'present', value: other[key] } : { state: 'absent' });
            }
          });
        }
        for (let i = 0; i < a.children.length; i++) {
          const child = nodes.get(`${capture.source.fileKey}:${a.children[i]}`), original = baselineNodes.get(b.children[i]);
          if (!child || !original) add(node, '$structure', 'unmatched', 'A captured child is missing.'); else compareNode(child, original);
        }
      };
      compareNode(instance, roots[0], true);
    }
    const treatments = disposition.differences ?? [];
    if (!Array.isArray(treatments)) errors.push(`${disposition.instance}: differences must be an array`);
    const seen = new Set();
    for (const treatment of Array.isArray(treatments) ? treatments : []) {
      const record = current.find(r => r.id === treatment?.id && r.status === 'difference');
      const allowed = treatment?.treatment === 'implemented' ? ['id', 'treatment', 'reason', 'part', 'cssProperty'] : ['id', 'treatment', 'reason'];
      if (!record || seen.has(treatment.id) || !['implemented', 'omitted'].includes(treatment.treatment) || !text(treatment.reason) || Object.keys(treatment).some(k => !allowed.includes(k)) || treatment.treatment === 'implemented' && (!text(treatment.part) || !metadata.parts?.[treatment.part] || !/^(?:--[A-Za-z_][\w-]*|[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.test(treatment.cssProperty || ''))) {
        errors.push(`${disposition.instance}: invalid or stale delegation difference treatment`); continue;
      }
      seen.add(treatment.id); record.treatment = treatment;
    }
    for (const record of current) if (record.status === 'difference' && !record.treatment) errors.push(`Undeclared delegation difference: ${record.id}`);
    records.push(...current);
  }
  return { records, errors, dependencies };
}

export function delegationChecks(capture, metadata, configuration, mappedComponents = []) {
  if (configuration.kind !== 'fidelity') return [];
  const nodes = new Map(capture.nodes.map(n => [n.id, n])), selected = new Set();
  const visit = id => { if (selected.has(id)) return; selected.add(id); for (const child of nodes.get(id)?.children || []) visit(child); };
  visit(configuration.figmaRef.slice(capture.source.fileKey.length + 1));
  return delegationDifferences(capture, metadata, mappedComponents).records.filter(r => selected.has(r.instance.slice(capture.source.fileKey.length + 1)) && !['same', 'not applicable'].includes(r.status)).map(record => ({
    id: record.id, status: record.status === 'difference' && record.treatment?.treatment === 'implemented' ? 'NOT COMPARABLE' : 'NOT RUN',
    reason: record.status === 'difference' ? record.treatment?.treatment === 'implemented' ? 'Treatment declared; no automatic value comparator exists. A specific rendered review of this difference is required.' : record.treatment?.treatment === 'omitted' ? 'Implementation omitted; confirmation blocked. Implement the difference, not merely retry measurement.' : 'Difference has no declared treatment.' : record.reason,
    delegation: delegationFacts(record),
  }));
}

export function delegationNextActions(metadataPath, records) {
  const actions = new Map();
  for (const record of records) {
    if (['same', 'not applicable'].includes(record.status)) continue;
    const code = record.status === 'unmatched' ? 'RESOLVE_DELEGATION_CORRESPONDENCE' : record.status === 'unreadable' ? 'INSPECT_DELEGATION_READ_FAILURE' : !record.treatment ? 'DECLARE_DELEGATION_TREATMENT' : record.treatment.treatment === 'omitted' ? 'IMPLEMENT_DELEGATION_DIFFERENCE' : 'REVIEW_DELEGATION_DIFFERENCE';
    if (!actions.has(code)) actions.set(code, { code, targets: [metadataPath], resources: [], differences: [], command: null,
      permissions: [code === 'IMPLEMENT_DELEGATION_DIFFERENCE' || code === 'DECLARE_DELEGATION_TREATMENT' ? 'project-write' : 'project-read'],
      reason: code === 'INSPECT_DELEGATION_READ_FAILURE' ? 'Inspect the read failure and collector support or permissions; recapture only if it can resolve the missing data.' : code === 'IMPLEMENT_DELEGATION_DIFFERENCE' ? 'Omission is recorded but blocks confirmation. Implement the difference; retrying measurement alone cannot resolve it.' : code === 'REVIEW_DELEGATION_DIFFERENCE' ? 'A declared implementation is not verified. Supply a specific rendered review tied to this difference, configuration and retained artifacts.' : code === 'DECLARE_DELEGATION_TREATMENT' ? 'Declare implemented or omitted treatment for each observed difference. Omission never enables confirmation.' : 'Establish an unambiguous node, paint and source-context correspondence with a verified mapped snapshot. Do not assume equality.' });
    if (!actions.get(code).differences.some(d => d.id === record.id)) actions.get(code).differences.push({ id: record.id, instance: record.instance, node: record.node, property: record.property, status: record.status });
  }
  return [...actions.values()];
}
