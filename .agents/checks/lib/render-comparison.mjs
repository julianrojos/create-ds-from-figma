import { renderRequirements } from './render-plan.mjs';
import { compareBehavior } from './behavior-comparison.mjs';
import { delegationChecks } from './delegation-differences.mjs';
import { nodeCoverage } from './node-coverage.mjs';
import { compareNativeStates } from './native-state.mjs';
import { compareColors } from './color-comparison.mjs';

// CSS pixels, independent of the PNG export tolerance. Never supplied by the reviewer.
export const GEOMETRY_TOLERANCE = 1;
export const TEXT_METRIC_TOLERANCE = 1;
export const VECTOR_POSITION_TOLERANCE = 1;
export const COMPARATOR_VERSION = 'render-comparator-v21';
const matrix = m => Array.isArray(m) && m.length === 2 && m.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite));
const translationOnly = m => matrix(m) && Math.abs(m[0][0] - 1) < 1e-8 && Math.abs(m[1][1] - 1) < 1e-8 && Math.abs(m[0][1]) < 1e-8 && Math.abs(m[1][0]) < 1e-8;
const invertible = m => matrix(m) && Math.abs(m[0][0] * m[1][1] - m[0][1] * m[1][0]) > 1e-8;
const rect = r => r && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k])) && r.width >= 0 && r.height >= 0;
const family = value => typeof value === 'string' ? value.replace(/^['"]|['"]$/g, '').toLowerCase() : '';
const weight = value => value === 'normal' ? 400 : value === 'bold' ? 700 : Number(value);
function matchingWeight(actual, expected) {
  const target = weight(expected);
  if (!Number.isFinite(target)) return false;
  if (weight(actual) === target) return true;
  const range = typeof actual === 'string' && actual.trim().split(/\s+/).map(Number);
  return range?.length === 2 && range.every(Number.isFinite) && target >= range[0] && target <= range[1];
}

export function caseNodes(capture, configuration) {
  const nodes = new Map(capture.nodes.map(n => [n.id, n])), selected = new Set();
  const rootId = configuration.figmaRef?.slice(capture.source.fileKey.length + 1);
  const visit = id => { if (selected.has(id) || !nodes.has(id)) return; selected.add(id); for (const child of nodes.get(id).children) visit(child); };
  visit(rootId);
  const visible = id => {
    const seen = new Set();
    let unknown = false;
    while (selected.has(id) && !seen.has(id)) {
      seen.add(id);
      const node = nodes.get(id);
      if (node.properties.visible === false || node.properties.opacity === 0) return false;
      if (node.inspected?.includes('visible') && typeof node.properties.visible !== 'boolean' || node.inspected?.includes('opacity') && !Number.isFinite(node.properties.opacity)) unknown = true;
      if (id === rootId) return unknown ? null : true;
      id = node.parentId;
    }
    return false;
  };
  return { nodes, selected, rootId, visible };
}

const nonScalar = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (value.mixed === true || value.unavailable === true);
// Property references that could reveal or fill a node. `undefined` means unreadable, which fails closed: it may reveal anything.
export const referencesOf = (scope, id) => { const refs = scope.nodes.get(id)?.properties.componentPropertyReferences; return refs === undefined || nonScalar(refs) ? undefined : refs; };
export const controlledBy = (refs, key) => refs === undefined || (refs !== null && typeof refs === 'object' && typeof refs[key] === 'string');

// The mode a node renders a collection in. A readable resolvedVariableModes that omits the collection means its default mode. An
// unreadable one (failed read, mixed, unavailable, malformed) is not a default: only the node's own explicit mode is still known,
// and without it the mode is unknown (`undefined`), never presumed.
function resolvedMode(node, collection) {
  const raw = node?.properties.resolvedVariableModes;
  const readable = raw === undefined ? !node?.inspected?.includes('resolvedVariableModes') : raw !== null && typeof raw === 'object' && !Array.isArray(raw) && !nonScalar(raw);
  if (readable) return typeof raw?.[collection.id] === 'string' ? raw[collection.id] : collection.defaultModeId;
  const explicit = node?.properties.explicitVariableModes?.[collection.id];
  return typeof explicit === 'string' ? explicit : undefined;
}

// A node that does not expose strokes has none. A field that was inspected but cannot be read is unknown, never absent: either its
// value is mixed, unavailable or malformed, or the read itself failed (the collector then omits the property and records an issue).
// The geometry comparison needs to know whether a stroke exists and where it sits.
function strokeState(node) {
  const strokes = node.properties.strokes;
  if (strokes === undefined) return { unreadable: Boolean(node.inspected?.includes('strokes')), visible: false };
  if (!Array.isArray(strokes)) return { unreadable: true, visible: false };
  return { unreadable: false, visible: strokes.some(item => !item || item.visible !== false) };
}

export function caseFonts(capture, configuration) {
  const scope = caseNodes(capture, configuration);
  // A fidelity case renders exactly the captured visible content. A behavior case supplies its own content and props, which can
  // fill an empty text or reveal a hidden one, but only where the design lets it: through a component property, or content the
  // case itself supplies. A layer that is permanently hidden, or empty with no text property, is never rendered.
  const canRender = id => {
    // Visibility comes first: content a behavior case inherits from its baseline cannot show a layer that nothing can reveal.
    for (let current = id; current !== undefined && scope.selected.has(current); current = scope.nodes.get(current).parentId) {
      const properties = scope.nodes.get(current).properties;
      if (properties.opacity === 0) return false;
      if (properties.visible === false && !controlledBy(referencesOf(scope, current), 'visible')) return false;
      if (current === scope.rootId) break;
    }
    const supplied = configuration.content?.[`${capture.source.fileKey}:${id}`];
    return (typeof supplied === 'string' && supplied.trim() !== '') || scope.nodes.get(id).properties.characters !== '' || controlledBy(referencesOf(scope, id), 'characters');
  };
  const rendered = id => configuration.kind === 'behavior' ? canRender(id) : scope.visible(id) !== false && scope.nodes.get(id).properties.characters !== '';
  const ids = new Set(capture.observations.filter(o => scope.selected.has(o.node) && scope.nodes.get(o.node).type === 'TEXT' && rendered(o.node)).map(o => o.id));
  return renderRequirements(capture).fonts.filter(f => f.observations.some(id => ids.has(id)));
}

export function checkSummary(checks) {
  return Object.fromEntries(['PASS', 'FAIL', 'NOT COMPARABLE', 'NOT RUN'].map(status => [status, checks.filter(c => c.status === status).length]));
}

// Keep every reproducible fact, including tolerances and values; prose is not an input to validity.
export function renderResultFacts(result) {
  if (!result || !/^render-comparator-v[1-9]\d*$/.test(result.comparatorVersion || '') || result.policy !== 'mapped-layout-v1' || !Array.isArray(result.checks) || !result.checks.length) throw new Error('Versioned render checks required');
  const ids = new Set();
  for (const check of result.checks) {
    if (!check || typeof check.id !== 'string' || !check.id || ids.has(check.id) || !['PASS', 'FAIL', 'NOT COMPARABLE', 'NOT RUN'].includes(check.status)) throw new Error('Unique render check IDs and valid statuses required');
    ids.add(check.id);
  }
  const summary = checkSummary(result.checks);
  if (!result.summary || Object.keys(result.summary).length !== 4 || Object.entries(summary).some(([key, count]) => result.summary[key] !== count)) throw new Error('Render check summary differs from statuses');
  return { policy: result.policy, comparatorVersion: result.comparatorVersion,
    checks: result.checks.map(check => Object.fromEntries(Object.entries(check).filter(([key]) => key !== 'reason'))) };
}

export function compareRendered(capture, metadata, configuration, measurement, { baselineMeasurement, mappedComponents = [] } = {}) {
  if (metadata.verification?.geometryPolicy !== 'mapped-layout-v1') throw new Error('Expected geometryPolicy mapped-layout-v1');
  const checks = [], scope = caseNodes(capture, configuration), sourceRoot = scope.nodes.get(scope.rootId);
  checks.push(...delegationChecks(capture, metadata, configuration, mappedComponents));
  const browserRoot = measurement?.parts?.root?.elements?.[0];
  const add = (id, status, reason, detail = {}) => checks.push({ id, status, reason, ...detail });
  compareNativeStates(configuration, measurement, add);
  compareColors(capture, metadata, configuration, measurement, scope, add);
  let coverage;
  if (configuration.kind === 'fidelity') {
    coverage = nodeCoverage(metadata, capture, configuration);
    for (const [index, reason] of coverage.errors.entries()) add(`coverage:invalid:${index}`, 'FAIL', reason);
    for (const obligation of coverage.pending) add(`coverage:${obligation.node}`, 'NOT RUN', obligation.reason);
  }
  // Modes a descendant forces for itself differ from the case's global context. They are facts about the source, recorded beside
  // the measurement: the rendered boxes are compared as they are, but nothing here verifies that the code scopes that mode.
  const localModes = nodeId => {
    const found = [];
    for (let id = nodeId; id !== undefined && scope.selected.has(id); id = scope.nodes.get(id).parentId) {
      for (const collection of capture.collections) {
        const forced = scope.nodes.get(id).properties.explicitVariableModes?.[collection.id];
        const global = resolvedMode(sourceRoot, collection);
        if (global === undefined) continue;
        if (typeof forced === 'string' && forced !== global) found.push({ node: `${capture.source.fileKey}:${id}`, collection: collection.id, mode: forced });
      }
      if (id === scope.rootId) break;
    }
    return found.length ? { localModes: found.sort((a, b) => (a.node + a.collection) < (b.node + b.collection) ? -1 : 1) } : {};
  };
  const partialPosition = (part, node, actual) => {
    const id = `position:${part}`, expectedBox = node.properties.absoluteBoundingBox, rootBox = sourceRoot?.properties.absoluteBoundingBox;
    const unsupportedStroke = strokeState(node).unreadable || strokeState(node).visible;
    if (['GROUP', 'BOOLEAN_OPERATION'].includes(node.type) || !invertible(node.properties.absoluteTransform) || actual.geometry?.affine2d !== true || !rect(expectedBox) || !rect(rootBox) || !rect(actual.rect) || !rect(browserRoot?.rect) || unsupportedStroke) {
      add(id, 'NOT COMPARABLE', 'A unique 2D unstroked layout box and readable nonsingular transforms are required for partial position.'); return;
    }
    const center = (box, origin) => ({ x: box.x - origin.x + box.width / 2, y: box.y - origin.y + box.height / 2 });
    const expected = center(expectedBox, rootBox), measured = center(actual.rect, browserRoot.rect);
    const delta = { x: measured.x - expected.x, y: measured.y - expected.y };
    add(id, Object.values(delta).every(d => Math.abs(d) <= VECTOR_POSITION_TOLERANCE) ? 'PASS' : 'FAIL', 'AABB center relative to an untransformed root; position only, never shape or size fidelity.',
      { ...localModes(node.id), expected, measured, delta, tolerance: VECTOR_POSITION_TOLERANCE, informationalSize: { expected: { width: expectedBox.width, height: expectedBox.height }, measured: { width: actual.rect.width, height: actual.rect.height } } });
  };
  const variantKeys = Object.entries(metadata.parts?.root?.nodes || {}).filter(([, ref]) => ref === configuration.figmaRef).map(([key]) => key);
  for (const [part, mapping] of Object.entries(metadata.parts || {})) {
    if (configuration.kind === 'behavior') continue;
    const id = `geometry:${part}`;
    const refs = [...new Set(variantKeys.map(key => mapping.nodes?.[key]).filter(Boolean))];
    // A part mapped only for other variants has no source node here when every node of this variant is accounted for: the source
    // then demands its absence, which is a checkable fact. Without that proof (no variant key, no mapping, open coverage) it stays unknown.
    if (refs.length === 0 && variantKeys.length && Object.keys(mapping.nodes || {}).length && coverage && !coverage.errors.length && !coverage.pending.length) {
      const absent = `absence:${part}`;
      if (!measurement) { add(absent, 'NOT RUN', 'No browser measurement.'); continue; }
      const seen = measurement.parts?.[part];
      if (!seen || !Array.isArray(seen.elements) || seen.count !== seen.elements.length) { add(absent, 'NOT RUN', 'Part measurement is missing or malformed.'); continue; }
      const shown = seen.elements.filter(e => e.geometry?.visible !== false);
      add(absent, shown.length ? 'FAIL' : 'PASS', 'This variant has no source node for the part, so it must not be visibly rendered; check that the case props and content do not produce it.', { rendered: seen.count, visible: shown.length });
      continue;
    }
    if (refs.length !== 1) { add(id, 'NOT COMPARABLE', 'No unique source node for this part and configuration.'); continue; }
    const nodeId = refs[0].slice(capture.source.fileKey.length + 1), node = scope.nodes.get(nodeId);
    if (!refs[0].startsWith(capture.source.fileKey + ':') || !scope.selected.has(nodeId)) { add(id, 'NOT COMPARABLE', 'Part is not inside the examined variant.'); continue; }
    if (!measurement) { add(id, 'NOT RUN', 'No browser measurement.'); continue; }
    const observed = measurement.parts?.[part];
    if (!observed || !Array.isArray(observed.elements) || observed.count !== observed.elements.length) { add(id, 'NOT RUN', 'Part measurement is missing or malformed.'); continue; }
    if (scope.visible(nodeId) === null) { add(id, 'NOT COMPARABLE', 'Captured visibility is unreadable.'); continue; }
    if (scope.visible(nodeId) === false) {
      const hidden = observed.elements.every(e => e.geometry?.visible === false);
      add(id, hidden ? 'PASS' : 'FAIL', 'Captured hidden content must not be visibly rendered; DOM absence is not required.');
      continue;
    }
    if (observed.count !== 1) { add(id, observed.count === 0 ? 'FAIL' : 'NOT COMPARABLE', observed.count === 0 ? 'A visible source part rendered no element; check that the case props and content produce it and that it carries its data-ds-part.' : 'A visible source part requires one unambiguous rendered element.'); continue; }
    const actual = observed.elements[0];
    if (!['visible', 'laidOut', 'axisAligned'].every(k => typeof actual.geometry?.[k] === 'boolean')) { add(id, 'NOT RUN', 'Rendered visibility and transformation measurements are missing.'); continue; }
    if (actual.geometry?.visible === false || actual.geometry?.laidOut === false) { add(id, 'FAIL', 'Captured visible part is hidden or removed from layout.'); continue; }
    if (configuration.kind !== 'fidelity') { add(id, 'NOT COMPARABLE', 'Behavior cases do not inherit exact source geometry.'); continue; }
    // The global context is the examined root's resolved mode. A descendant that forces its own mode is part of the design and
    // is measured as rendered, so it does not make the rest of the component incomparable.
    const rootModes = capture.collections.map(c => [c, resolvedMode(sourceRoot, c)]);
    if (rootModes.some(([, mode]) => mode === undefined)) { add(id, 'NOT COMPARABLE', 'The resolved mode of the examined root is unreadable, so the geometry context cannot be established.'); continue; }
    if (rootModes.some(([c, mode]) => configuration.modes?.[c.id] !== mode)) { add(id, 'NOT COMPARABLE', 'Case modes differ from the captured geometry context.'); continue; }
    if (node.type === 'TEXT' && typeof node.properties.characters !== 'string') { add(id, 'NOT COMPARABLE', 'Captured text is unreadable, so a difference cannot be asserted.'); continue; }
    if (node.type === 'TEXT' && actual.text !== node.properties.characters) { add(id, 'FAIL', 'Rendered fidelity text differs from the captured content.'); continue; }
    // Bounds are comparable only in an untransformed root coordinate system. Absolute matrices include ancestor effects.
    if (!translationOnly(sourceRoot?.properties.absoluteTransform) || !translationOnly(node.properties.absoluteTransform) || actual.geometry?.axisAligned !== true || browserRoot?.geometry?.axisAligned !== true) {
      add(id, 'NOT COMPARABLE', 'Rotation, scale, reflection, skew or unreadable transforms require a specific comparison.');
      if (translationOnly(sourceRoot?.properties.absoluteTransform) && browserRoot?.geometry?.axisAligned === true) partialPosition(part, node, actual);
      continue;
    }
    const stroke = strokeState(node);
    if (stroke.unreadable) { add(id, 'NOT COMPARABLE', 'Source strokes are unreadable, so the stroke-free or INSIDE precondition cannot be established.'); continue; }
    if (stroke.visible && (node.type === 'TEXT' || node.type === 'VECTOR' || node.properties.strokeAlign !== 'INSIDE')) {
      add(id, 'NOT COMPARABLE', 'Source stroke bounds have no supported CSS border-box correspondence.'); continue;
    }
    if (node.type === 'VECTOR' || ['GROUP', 'BOOLEAN_OPERATION'].includes(node.type)) {
      add(id, 'NOT COMPARABLE', 'Vector or grouped bounds need an explicit shape/grouping correspondence.');
      if (node.type === 'VECTOR') partialPosition(part, node, actual);
      continue;
    }
    const expectedBox = node.properties.absoluteBoundingBox, rootBox = sourceRoot?.properties.absoluteBoundingBox;
    if (!rect(expectedBox) || !rect(rootBox) || !rect(actual.rect) || !rect(browserRoot?.rect)) { add(id, 'NOT COMPARABLE', 'Source or browser layout bounds are unavailable.'); continue; }
    const expected = { x: expectedBox.x - rootBox.x, y: expectedBox.y - rootBox.y, width: expectedBox.width, height: expectedBox.height };
    const measured = { x: actual.rect.x - browserRoot.rect.x, y: actual.rect.y - browserRoot.rect.y, width: actual.rect.width, height: actual.rect.height };
    const delta = Object.fromEntries(Object.keys(expected).map(k => [k, measured[k] - expected[k]]));
    const tolerances = { x: GEOMETRY_TOLERANCE, y: GEOMETRY_TOLERANCE, width: node.type === 'TEXT' ? TEXT_METRIC_TOLERANCE : GEOMETRY_TOLERANCE, height: node.type === 'TEXT' ? TEXT_METRIC_TOLERANCE : GEOMETRY_TOLERANCE };
    add(id, Object.entries(delta).every(([key, d]) => Math.abs(d) <= tolerances[key]) ? 'PASS' : 'FAIL', 'Layout bounds relative to the root; CSS border-box corresponds to unstroked or INSIDE-stroked source bounds.', { ...localModes(node.id), expected, measured, delta, tolerance: GEOMETRY_TOLERANCE, tolerances,
      ...(node.type === 'TEXT' ? { typographyTolerance: { status: 'provisional', requiresRenderedReview: true, basis: 'No cross-font or cross-renderer Figma calibration establishes this threshold.' } } : {}) });
  }
  if (configuration.kind === 'behavior') compareBehavior(metadata, configuration, measurement, baselineMeasurement, GEOMETRY_TOLERANCE, add);
  for (const font of caseFonts(capture, configuration)) {
    const id = `font:${font.id}`, resource = metadata.verification?.fonts?.find(f => f.id === font.id);
    if (resource?.source?.kind !== 'file') { add(id, 'FAIL', 'Essential font source is unresolved for this configuration.'); continue; }
    if (!measurement) { add(id, 'NOT RUN', 'No browser font loading measurement.'); continue; }
    const observed = measurement.fonts?.find(f => f.id === font.id);
    const loaded = observed?.faces?.some(f => family(f.family) === family(resource.css.family) && f.style === resource.css.style && f.status === 'loaded' && matchingWeight(f.weight, resource.css.weight));
    add(id, loaded ? 'PASS' : 'FAIL', 'Matching declared font face must be loaded; this does not prove glyph coverage or the rendered glyph font.');
  }
  if (!checks.length) add('geometry:coverage', 'NOT COMPARABLE', 'No mapped parts to compare.');
  return { policy: 'mapped-layout-v1', comparatorVersion: COMPARATOR_VERSION, checks, summary: checkSummary(checks), scope: 'Mapped layout, native states, explicit computed sRGB colors and font loading; not complete visual fidelity or proof of visible paint.' };
}

export function assertConfirmationChecks(result, reviews, artifactPaths) {
  renderResultFacts(result);
  const records = reviews ?? [];
  if (!Array.isArray(records)) throw new Error('checkReviews must be an array');
  const seen = new Set();
  for (const review of records) {
    if (!review || seen.has(review.checkId) || !result.checks.some(c => c.id === review.checkId && (c.status === 'NOT COMPARABLE' || c.status === 'PASS' && c.typographyTolerance?.requiresRenderedReview === true)) || review.result !== 'PASS' || typeof review.reason !== 'string' || !review.reason.trim() || !Array.isArray(review.artifacts) || !review.artifacts.length || review.artifacts.some(p => !artifactPaths.includes(p))) throw new Error('Each specific review must identify a noncomparable or provisional text check, a PASS judgment, reason and retained artifact paths');
    seen.add(review.checkId);
  }
  for (const check of result.checks) {
    if (['FAIL', 'NOT RUN'].includes(check.status)) throw new Error(`Confirmation blocked: ${check.id} ${check.status}: ${check.reason}`);
    if (check.status === 'NOT COMPARABLE' && !seen.has(check.id)) throw new Error(`Specific rendered review required: ${check.id}`);
    if (check.typographyTolerance?.requiresRenderedReview === true && !seen.has(check.id)) throw new Error(`Specific typography review required: ${check.id}; the numeric threshold is provisional, not calibrated fidelity`);
  }
}
