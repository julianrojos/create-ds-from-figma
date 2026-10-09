import { createHash } from 'node:crypto';
import { realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { captureProfile, extractObservations } from '../../skills/create-ds-from-figma/scripts/lib/capture-figma.mjs';

export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Snapshot contains a non-JSON value');
  return JSON.stringify(value);
}

export function captureHash(capture) {
  return createHash('sha256').update(canonicalJson(capture)).digest('hex');
}

export function captureProblems(capture) {
  const errors = [];
  if (capture?.schemaVersion !== 1 || capture.source?.collector !== 'capture-figma-v1' || capture.source?.api !== 'PLUGIN' ||
      !capture.source?.fileKey || !capture.source?.rootNodeId || !Array.isArray(capture.nodes) ||
      !Array.isArray(capture.observations) || !Array.isArray(capture.variants) || !Array.isArray(capture.collections) ||
      !Array.isArray(capture.variables) || !Array.isArray(capture.styles) || !Array.isArray(capture.coverage?.issues) ||
      !Array.isArray(capture.profile?.fields) || !Array.isArray(capture.profile?.textFields)) return ['Invalid capture schema'];
  const nodes = new Map();
  if (canonicalJson(capture.profile.fields) !== canonicalJson(captureProfile().fields) || canonicalJson(capture.profile.textFields) !== canonicalJson(captureProfile().textFields)) errors.push('Capture profile differs from collector version');
  for (const node of capture.nodes) {
    if (!node?.id || nodes.has(node.id)) errors.push('Missing or duplicate node ID');
    nodes.set(node?.id, node);
    if (!Array.isArray(node?.children) || !node.properties || !Array.isArray(node.inspected) || !Array.isArray(node.notApplicable)) errors.push(`Invalid node ${node?.id}`);
    else for (const field of capture.profile.fields) {
      if (Number(node.inspected.includes(field)) + Number(node.notApplicable.includes(field)) !== 1) errors.push(`Field coverage missing or conflicting: ${node.id}/${field}`);
      if (node.inspected.includes(field) && !Object.hasOwn(node.properties, field) && !capture.coverage.issues.some(i => i.node === node.id && i.field === field)) errors.push(`Unreported read failure: ${node.id}/${field}`);
    }
  }
  const root = nodes.get(capture.source.rootNodeId);
  if (!root || root.parentId !== null || !['COMPONENT', 'COMPONENT_SET'].includes(root.type)) errors.push('Invalid capture root');
  const reached = new Set();
  function visit(id, parentId) {
    const node = nodes.get(id);
    if (!node) { errors.push(`Missing child ${id}`); return; }
    if (reached.has(id)) { errors.push(`Repeated or cyclic child ${id}`); return; }
    reached.add(id);
    if (node.parentId !== parentId) errors.push(`Parent mismatch for ${id}`);
    for (const child of node.children || []) visit(child, id);
  }
  if (root) visit(root.id, null);
  if (reached.size !== nodes.size || capture.coverage.nodeCount !== nodes.size) errors.push('Traversal coverage differs from captured nodes');
  const observationIds = new Set();
  for (const o of capture.observations) {
    if (!o?.id || observationIds.has(o.id) || !nodes.has(o.node) || !o.field || !['binding', 'property', 'style'].includes(o.kind)) errors.push(`Invalid observation ${o?.id}`);
    observationIds.add(o?.id);
    if (o.kind === 'binding' && (o.value?.type !== 'VARIABLE_ALIAS' || o.value.id !== o.variableId)) errors.push(`Binding identity differs for ${o.id}`);
    if (o.kind === 'style' && o.value !== o.styleId) errors.push(`Style identity differs for ${o.id}`);
  }
  const sortedObservations = [...capture.observations].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (!errors.length && canonicalJson(extractObservations(capture.nodes).observations) !== canonicalJson(sortedObservations)) errors.push('Observation coverage or values differ from raw nodes');
  const expected = root?.type === 'COMPONENT_SET' ? (root.children || []).filter(id => nodes.get(id)?.type === 'COMPONENT') : [];
  const actual = capture.variants.map(v => v.nodeId);
  if (new Set(actual).size !== actual.length || canonicalJson([...actual].sort()) !== canonicalJson([...expected].sort())) errors.push('Variant coverage differs from root children');
  for (const v of capture.variants) if (v.key !== nodes.get(v.nodeId)?.name || canonicalJson(v.properties) !== canonicalJson(nodes.get(v.nodeId)?.properties.variantProperties || {})) errors.push(`Variant identity differs for ${v.nodeId}`);
  for (const n of capture.nodes.filter(n => n.type === 'TEXT')) if (!Array.isArray(n.properties.segments) && !capture.coverage.issues.some(i => i.node === n.id && i.field === 'segments')) errors.push(`Unreported missing text segments: ${n.id}`);
  const variables = new Map(capture.variables.map(v => [v.id, v]));
  if (variables.size !== capture.variables.length) errors.push('Duplicate variable ID');
  for (const v of capture.variables) {
    const c = capture.collections.find(c => c.id === v.collectionId);
    if (!c || !Array.isArray(c.modes) || !c.modes.some(m => m.modeId === c.defaultModeId) ||
        canonicalJson(Object.keys(v.valuesByMode || {}).sort()) !== canonicalJson(c.modes.map(m => m.modeId).sort())) errors.push(`Variable modes unavailable or inconsistent for ${v.id}`);
    for (const value of Object.values(v.valuesByMode || {})) if (value?.type === 'VARIABLE_ALIAS' && !variables.has(value.id) && !capture.coverage.issues.some(i => i.field === `variables.${value.id}`)) errors.push(`Unreported missing alias ${value.id}`);
  }
  for (const o of capture.observations.filter(o => o.kind === 'binding')) if (!variables.has(o.variableId) && !capture.coverage.issues.some(i => i.field === `variables.${o.variableId}`)) errors.push(`Unreported missing variable ${o.variableId}`);
  const styles = new Set(capture.styles.map(s => s.id));
  if (styles.size !== capture.styles.length) errors.push('Duplicate style ID');
  if (new Set(capture.collections.map(c => c.id)).size !== capture.collections.length) errors.push('Duplicate collection ID');
  for (const o of capture.observations.filter(o => o.kind === 'style')) if (!styles.has(o.styleId) && !capture.coverage.issues.some(i => i.field === `styles.${o.styleId}`)) errors.push(`Unreported missing style ${o.styleId}`);
  return errors;
}

export function sealCapture(capture, capturedAt = new Date().toISOString()) {
  const errors = captureProblems(capture);
  if (errors.length) throw new Error(errors.join('; '));
  return { schemaVersion: 1, capturedAt, hash: captureHash(capture), capture };
}

export function loadSnapshot(root, relative) {
  if (typeof relative !== 'string' || !relative.startsWith('design-system/figma/snapshots/') || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid snapshot path');
  const base = realpathSync(root);
  const full = realpathSync(path.resolve(base, relative));
  if (!full.startsWith(base + path.sep)) throw new Error('Snapshot escapes project root');
  const snapshot = JSON.parse(readFileSync(full, 'utf8'));
  if (snapshot.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}T/.test(snapshot.capturedAt || '') || snapshot.hash !== captureHash(snapshot.capture)) throw new Error('Snapshot envelope or SHA-256 mismatch');
  const errors = captureProblems(snapshot.capture);
  if (errors.length) throw new Error(errors.join('; '));
  return snapshot;
}

export const CLASSIFICATION_RULES = [
  { id: 'browser-interaction-v1', axis: 'State', values: { Hover: 'hover', Pressed: 'pressed' }, kind: 'interaction', control: 'internal' },
];

export function classificationProposals(capture) {
  const root = capture.nodes.find(n => n.id === capture.source.rootNodeId);
  const definitions = root?.properties.componentPropertyDefinitions || {};
  const proposals = [];
  for (const [axis, definition] of Object.entries(definitions)) {
    if (definition.type !== 'VARIANT') continue;
    for (const value of definition.variantOptions || []) {
      const rule = CLASSIFICATION_RULES.find(r => r.axis === axis && r.values[value]);
      proposals.push({ axis, value, status: rule ? 'candidate' : 'ambiguous', rule: rule?.id || 'manual',
        observations: [`${root.id}#componentPropertyDefinitions#property`],
        ...(rule ? { kind: rule.kind, state: rule.values[value], control: rule.control } : {}),
        reason: rule ? 'Exact State/value naming matches the browser interaction convention; confirm semantics before accepting.' : 'No explicit rule establishes API, state or content semantics.' });
    }
  }
  return proposals;
}

// A Figma path covers its descendants: `fills` covers `fills[0].color`, `boundVariables.x` covers `boundVariables.x.y`.
const fieldCovers = (parent, child) => child === parent || child.startsWith(parent + '.') || child.startsWith(parent + '[');
const overlapping = (a, b) => fieldCovers(a, b) || fieldCovers(b, a);
// figma.mixed and unreadable fields are not scalars; a single CSS literal cannot represent them.
const isNonScalar = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (value.mixed === true || value.unavailable === true);
// Text segments carry the same fields as the node: `segments[0].fontSize` is compared like `fontSize`.
const baseField = field => field.replace(/^segments\[\d+\]\./, '');

// A binding resolves in a non-default mode that its node does not declare: forced by a captured ancestor,
// or inherited from outside the captured subtree (visible only through resolvedVariableModes).
function inheritedMode(capture, nodeId, collectionId) {
  const byId = new Map(capture.nodes.map(n => [n.id, n]));
  const resolved = byId.get(nodeId)?.properties.resolvedVariableModes?.[collectionId];
  const fallback = capture.collections.find(c => c.id === collectionId)?.defaultModeId;
  let ancestor = null;
  for (let node = byId.get(byId.get(nodeId)?.parentId); node; node = byId.get(node.parentId)) {
    const modeId = node.properties.explicitVariableModes?.[collectionId];
    if (modeId) { ancestor = { node, modeId }; break; }
  }
  return ancestor || (typeof resolved === 'string' && fallback && resolved !== fallback)
    ? { resolvedModeId: typeof resolved === 'string' ? resolved : null, ancestor } : null;
}

export function variantAxes(capture) {
  const axes = new Map();
  for (const variant of capture.variants) for (const [axis, value] of Object.entries(variant.properties || {})) {
    if (!axes.has(axis)) axes.set(axis, new Set());
    axes.get(axis).add(value);
  }
  return axes;
}

export function verifyEvidence(metadata, capture, { mappedComponents = [] } = {}) {
  const errors = [], warnings = [];
  const review = { literals: [], manualDecisions: [], delegations: [], inheritedModes: [] };
  const source = capture.source;
  if (metadata.figma?.fileKey !== source.fileKey || metadata.figma?.nodeId !== source.rootNodeId) errors.push('Metadata root differs from snapshot');
  const nodes = new Map(capture.nodes.map(n => [source.fileKey + ':' + n.id, n]));
  const observations = new Map(capture.observations.map(o => [o.id, o]));
  const accounted = new Set();
  const use = (id, label, account = true) => {
    const o = observations.get(id);
    if (!o) errors.push(`${label}: missing observation ${id}`);
    else if (account) accounted.add(id);
    return o;
  };
  const keys = capture.variants.map(v => v.key).sort();
  if (canonicalJson([...(metadata.figmaCoverage?.variants || [])].sort()) !== canonicalJson(keys)) errors.push('Metadata variant coverage differs from snapshot');
  const axes = variantAxes(capture);
  const recordedAxes = metadata.variants && typeof metadata.variants === 'object' && !Array.isArray(metadata.variants) ? metadata.variants : null;
  const axesOf = Object.fromEntries([...axes].map(([axis, values]) => [axis, [...values].sort()]));
  const recordedOf = recordedAxes ? Object.fromEntries(Object.entries(recordedAxes).map(([axis, values]) => [axis, Array.isArray(values) ? [...values].sort() : values])) : null;
  if (!recordedOf || canonicalJson(Object.fromEntries(Object.entries(axesOf).sort())) !== canonicalJson(Object.fromEntries(Object.entries(recordedOf).sort()))) errors.push('Metadata variant axes and values differ from snapshot');
  for (const [axis, values] of Object.entries(metadata.variantClassification || {})) for (const value of Object.keys(values || {})) {
    if (!axes.get(axis)?.has(value)) errors.push(`Classified ${axis}=${value} is absent from snapshot variants`);
  }
  for (const [axis, values] of axes) for (const value of values) {
    if (!metadata.variantClassification?.[axis]?.[value]) errors.push(`Snapshot variant ${axis}=${value} is not classified`);
  }
  for (const [part, value] of Object.entries(metadata.parts || {})) for (const [variant, node] of Object.entries(value.nodes || {})) {
    if (!nodes.has(node)) errors.push(`Part ${part}/${variant}: node absent from snapshot`);
    if (part === 'root') {
      const expected = capture.variants.length ? capture.variants.find(v => v.key === variant)?.nodeId : source.rootNodeId;
      if (node !== source.fileKey + ':' + expected) errors.push(`Root part ${variant}: variant node differs from snapshot`);
    }
  }
  for (const [index, b] of (metadata.bindings || []).entries()) {
    const o = use(b.observation, `bindings[${index}]`);
    if (o && (o.kind !== 'binding' || b.node !== source.fileKey + ':' + o.node || b.variableId !== o.variableId || b.figmaProperty !== o.field)) errors.push(`bindings[${index}]: recorded fact differs from observation`);
    if (o && !b.modeOverride) {
      const collectionId = capture.variables.find(v => v.id === b.variableId)?.collectionId;
      const forced = collectionId && nodes.get(b.node)?.properties.explicitVariableModes?.[collectionId];
      if (forced) errors.push(`bindings[${index}]: node forces an explicit mode for ${collectionId}; modeOverride is required`);
      else if (collectionId) {
        const inherited = inheritedMode(capture, o.node, collectionId);
        if (inherited) {
          const variable = capture.variables.find(v => v.id === b.variableId);
          const collection = capture.collections.find(c => c.id === collectionId);
          const mode = id => typeof id === 'string' ? { id, name: collection?.modes.find(m => m.modeId === id)?.name ?? null } : null;
          review.inheritedModes.push({ index, observation: o.id, node: b.node, nodeName: nodes.get(b.node)?.name ?? null,
            variableId: b.variableId, variableName: variable?.name ?? null, collectionId, collectionName: collection?.name ?? null,
            resolvedMode: mode(inherited.resolvedModeId), defaultMode: mode(collection?.defaultModeId),
            forcedBy: inherited.ancestor ? { node: source.fileKey + ':' + inherited.ancestor.node.id,
              name: inherited.ancestor.node.name, mode: mode(inherited.ancestor.modeId) } : null });
        }
      }
    }
    if (o && b.modeOverride) {
      const node = nodes.get(b.node);
      const modeId = node?.properties.explicitVariableModes?.[b.modeOverride.collectionId];
      const mode = capture.collections.find(c => c.id === b.modeOverride.collectionId)?.modes.find(m => m.modeId === modeId);
      if (!mode || mode.name !== b.modeOverride.modeName) errors.push(`bindings[${index}]: explicit mode differs from snapshot`);
    }
  }
  for (const [index, literal] of (metadata.measuredLiterals || []).entries()) {
    if (literal.figmaValue && Object.hasOwn(literal.figmaValue, 'unit')) errors.push(`measuredLiterals[${index}]: raw units belong inside value, not figmaValue.unit`);
    const o = use(literal.observation, `measuredLiterals[${index}]`);
    if (!o) continue;
    if (o.kind !== 'property' || literal.source !== source.fileKey + ':' + o.node || literal.figmaProperty !== o.field) errors.push(`measuredLiterals[${index}]: recorded source differs from observation`);
    if (literal.translation === 'approximate' && (literal.figmaValue?.source !== 'PLUGIN' || literal.figmaValue?.field !== o.field || canonicalJson(literal.figmaValue?.value) !== canonicalJson(o.value))) errors.push(`measuredLiterals[${index}]: raw Figma value differs from snapshot`);
    if (isNonScalar(o.value)) errors.push(`measuredLiterals[${index}]: mixed or unavailable Figma value cannot be recorded as a single literal`);
    // Only these narrow conversions are mechanically comparable; visual equivalence is separate.
    const dimensions = /^(width|height|x|y|paddingLeft|paddingRight|paddingTop|paddingBottom|cornerRadius|fontSize)$/;
    const field = baseField(o.field);
    if (literal.translation === 'direct' && dimensions.test(field) && !isNonScalar(o.value) && (typeof o.value !== 'number' || literal.value !== `${o.value}px`)) errors.push(`measuredLiterals[${index}]: direct dimension differs from snapshot`);
    if (literal.translation === 'direct' && field === 'lineHeight' && !isNonScalar(o.value) && o.value?.unit !== 'PIXELS') errors.push(`measuredLiterals[${index}]: lineHeight requires an approximate translation`);
    if (literal.translation === 'direct' && field === 'lineHeight' && o.value?.unit === 'PIXELS' && literal.value !== `${o.value.value}px`) errors.push(`measuredLiterals[${index}]: direct lineHeight differs from snapshot`);
    if (!dimensions.test(field)) review.literals.push({ index, observation: o.id, cssProperty: literal.cssProperty });
    if (capture.observations.some(b => b.kind === 'binding' && b.node === o.node && overlapping(b.field, o.field))) errors.push(`measuredLiterals[${index}]: observed binding cannot be replaced by a literal`);
  }
  for (const [index, t] of (metadata.evidence?.translations || []).entries()) {
    if (!Array.isArray(t.observations) || !t.observations.length || !t.cssSelector || !t.cssProperty || !t.reason) errors.push(`translations[${index}]: observations and translation explanation required`);
    for (const id of t.observations || []) use(id, `translations[${index}]`);
    warnings.push(`Translation ${index}: accounted for, CSS identity and rendering NOT VERIFIED by this check`);
  }
  for (const [index, d] of (metadata.evidence?.dispositions || []).entries()) {
    if (d.kind === 'delegated' && d.instance) {
      const instance = nodes.get(d.instance), main = instance?.properties.mainComponent;
      const ref = main?.remote ? `componentKey:${main.key}` : `${source.fileKey}:${main?.id}`;
      const mapped = mappedComponents.find(c => c.name === d.resolvedComponent && c.refs.includes(ref));
      if (instance?.type !== 'INSTANCE' || !main || (main.remote && !main.key) || !mapped || typeof d.reason !== 'string' || !d.reason.trim() || d.configuration === undefined ||
          canonicalJson(d.configuration) !== canonicalJson(instance.properties.componentProperties || {})) {
        errors.push(`dispositions[${index}]: delegation identity or configuration differs from mapped instance`);
      } else {
        const descendants = new Set();
        const visit = id => { descendants.add(id); for (const child of nodes.get(source.fileKey + ':' + id)?.children || []) visit(child); };
        for (const child of instance.children) visit(child);
        for (const o of capture.observations) if (descendants.has(o.node) && ['binding', 'style'].includes(o.kind)) accounted.add(o.id);
        review.delegations.push({ index, instance: d.instance, resolvedComponent: d.resolvedComponent, descendants: descendants.size });
        warnings.push(`Delegation ${index}: mapped identity and configuration checked; descendant overrides and rendering NOT VERIFIED`);
      }
      continue;
    }
    if (!Array.isArray(d.observations) || !d.observations.length || !['excluded', 'deferred', 'delegated'].includes(d.kind) || !d.reason) errors.push(`dispositions[${index}]: invalid disposition`);
    for (const id of d.observations || []) use(id, `dispositions[${index}]`);
    warnings.push(`Disposition ${index} (${d.kind}): justification requires review; not evidence of implementation fidelity`);
  }
  for (const o of capture.observations.filter(o => o.kind === 'style')) {
    const application = (metadata.styles || []).some(s => s.id === o.styleId && s.nodes?.some(n => n.node === source.fileKey + ':' + o.node && n.start === o.start && n.end === o.end));
    if (application) accounted.add(o.id);
    else if (!accounted.has(o.id)) errors.push(`Unaccounted style ${o.id}`);
  }
  for (const s of metadata.styles || []) {
    const raw = capture.styles.find(x => x.id === s.id);
    if (!raw || raw.name !== s.name || raw.type !== s.type || (s.key && raw.key !== s.key)) errors.push(`Style ${s.id}: definition differs or unavailable in snapshot`);
    for (const n of s.nodes || []) if (!capture.observations.some(o => o.kind === 'style' && o.styleId === s.id && source.fileKey + ':' + o.node === n.node && n.start === o.start && n.end === o.end)) errors.push(`Style ${s.id}: application absent from snapshot`);
  }
  for (const o of capture.observations.filter(o => o.kind === 'binding')) if (!accounted.has(o.id)) errors.push(`Unaccounted binding ${o.id}`);
  const proposals = classificationProposals(capture);
  const targets = new Set([
    ...Object.entries(metadata.variantClassification || {}).flatMap(([axis, values]) => Object.keys(values).map(value => `variantClassification.${axis}.${value}`)),
    ...(metadata.notBuilt || []).map((_, index) => `notBuilt[${index}]`),
  ]);
  const decisionTargets = new Set();
  for (const [index, d] of (metadata.evidence?.decisions || []).entries()) {
    if (!targets.has(d.target) || decisionTargets.has(d.target) || typeof d.reason !== 'string' || !d.reason.trim() || !d.rule || !Array.isArray(d.observations) || !d.observations.length) errors.push(`decisions[${index}]: valid unique target, rule, reason and observations required`);
    decisionTargets.add(d.target);
    for (const id of d.observations || []) use(id, `decisions[${index}]`, false);
    if (d.rule === 'manual') review.manualDecisions.push({ index, target: d.target, reason: d.reason, observations: d.observations });
    if (d.rule !== 'manual') {
      const proposal = proposals.find(p => d.target === `variantClassification.${p.axis}.${p.value}` && p.rule === d.rule && p.status === 'candidate');
      const decision = proposal && metadata.variantClassification?.[proposal.axis]?.[proposal.value];
      if (!proposal || decision?.kind !== proposal.kind || decision?.state !== proposal.state || !proposal.observations.every(id => d.observations.includes(id))) errors.push(`Decision ${index}: rule conditions or result do not match`);
    }
  }
  for (const [axis, values] of Object.entries(metadata.variantClassification || {})) for (const value of Object.keys(values)) {
    if (!(metadata.evidence?.decisions || []).some(d => d.target === `variantClassification.${axis}.${value}`)) errors.push(`Missing decision evidence for ${axis}=${value}`);
  }
  for (const [index] of (metadata.notBuilt || []).entries()) if (!(metadata.evidence?.decisions || []).some(d => d.target === `notBuilt[${index}]`)) errors.push(`Missing decision evidence for notBuilt[${index}]`);
  if (capture.coverage.issues.length) warnings.push(`Capture has ${capture.coverage.issues.length} unavailable reads; capture completeness NOT VERIFIED`);
  if (review.inheritedModes.length) {
    const named = (name, id) => name ? `${JSON.stringify(name)} (${id})` : id;
    const mode = value => value ? named(value.name, value.id) : 'unavailable';
    const details = review.inheritedModes.map(d => `binding ${d.index}: node ${named(d.nodeName, d.node)}, variable ${named(d.variableName, d.variableId)}, collection ${named(d.collectionName, d.collectionId)}, resolved ${mode(d.resolvedMode)}, default ${mode(d.defaultMode)}`);
    warnings.push(`${review.inheritedModes.length} binding(s) need mode review: inherited from an ancestor or from outside the captured subtree. Fidelity NOT VERIFIED until the required mode is checked. ${details.join('; ')}. See review.inheritedModes for captured ancestor details.`);
  }
  if (review.literals.length) warnings.push(`${review.literals.length} literal translation(s) need contextual verification; see review.literals`);
  if (review.manualDecisions.length) warnings.push(`${review.manualDecisions.length} manual decision(s): justification NOT VERIFIED; see review.manualDecisions`);
  const remainingProperties = capture.observations.filter(o => o.kind === 'property' && !accounted.has(o.id)).length;
  return { errors, warnings, review, coverage: { capturedNodes: capture.nodes.length, bindings: capture.observations.filter(o => o.kind === 'binding').length,
    styles: capture.observations.filter(o => o.kind === 'style').length, unreferencedProperties: remainingProperties,
    captureIssues: capture.coverage.issues.length, scope: 'captured bindings/styles, variant identities and referenced facts; not all Figma properties or rendering' } };
}
