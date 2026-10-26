import { renderedExpectation } from './render-values.mjs';

export const COLOR_CHANNEL_TOLERANCE = 1;
export const COLOR_ALPHA_TOLERANCE = 0.005;
const CAPTURE_COLOR_EPSILON = 1e-7;
const properties = new Set(['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Computed legacy sRGB only. Other color spaces require an explicit conversion, never a guessed string match.
export function parseComputedColor(value) {
  if (typeof value !== 'string') return null;
  const match = /^rgba?\(([^()]*)\)$/i.exec(value.trim());
  if (!match) return null;
  const pieces = match[1].trim().replace(/\s*\/\s*/, ',').split(/[\s,]+/);
  if (![3, 4].includes(pieces.length) || pieces.some(v => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i.test(v))) return null;
  const numbers = pieces.map((v, i) => Number.parseFloat(v) * (v.endsWith('%') ? (i === 3 ? 0.01 : 2.55) : 1));
  if (numbers.length === 3) numbers.push(1);
  return numbers.every((v, i) => Number.isFinite(v) && v >= 0 && v <= (i === 3 ? 1 : 255) + 1e-10) ? numbers : null;
}

function paintOf(node, field) {
  const match = /^(?:segments\[(\d+)\]\.)?(fills|strokes)(?:\[(\d+)\](?:\.color)?)?$/.exec(field || '');
  if (!match) return { reason: 'Only a single solid fill or stroke has an automatic color expectation.' };
  let owner = node.properties;
  if (match[1] !== undefined) {
    const segments = owner.segments, segment = segments?.[Number(match[1])];
    if (segments?.length !== 1 || segment?.start !== 0 || segment.end !== owner.characters?.length) return { reason: 'Partial or mixed text segments do not establish a whole-element CSS color.' };
    owner = segment;
  }
  const paints = owner?.[match[2]], paint = paints?.[Number(match[3] || 0)];
  if (!Array.isArray(paints) || paints.length !== 1 || !object(paint) || paint.type !== 'SOLID' || paint.visible === false ||
      paint.blendMode !== undefined && paint.blendMode !== 'NORMAL' || paint.opacity !== undefined && (!Number.isFinite(paint.opacity) || paint.opacity < 0 || paint.opacity > 1)) {
    return { reason: 'Multiple, hidden, mixed, non-solid or blended paints need a specific rendered review.' };
  }
  return { paint };
}

// Resolve the raw captured alias graph with every target collection's own active mode.
function capturedColor(capture, scope, configuration, node, variableId) {
  const variables = new Map(capture.variables.map(v => [v.id, v])), collections = new Map(capture.collections.map(c => [c.id, c]));
  const seen = new Set();
  let id = variableId;
  for (let depth = 0; depth < 128; depth++) {
    const variable = variables.get(id), collection = collections.get(variable?.collectionId);
    if (!variable || variable.type !== 'COLOR' || !collection) return { reason: 'Captured COLOR variable or its collection is unavailable.' };
    let mode = configuration.modes?.[collection.id];
    for (let current = node; current && scope.selected.has(current.id); current = scope.nodes.get(current.parentId)) {
      const explicit = current.properties.explicitVariableModes;
      if (explicit !== undefined && (!object(explicit) || explicit.unavailable || explicit.mixed) || explicit === undefined && current.inspected?.includes('explicitVariableModes')) return { reason: 'Explicit source modes are unreadable.' };
      if (Object.hasOwn(explicit || {}, collection.id)) { mode = explicit[collection.id]; break; }
      if (current.id === scope.rootId) break;
    }
    if (!collection.modes.some(m => m.modeId === mode)) return { reason: 'The active mode of a captured alias collection is not established.' };
    const key = `${id}:${mode}`;
    if (seen.has(key)) return { reason: 'Captured color aliases contain a cycle.' };
    seen.add(key);
    const value = variable.valuesByMode?.[mode];
    if (value?.type === 'VARIABLE_ALIAS') { id = value.id; continue; }
    const expected = renderedExpectation('color', value);
    return expected.comparable ? { color: value, modes: [...seen] } : { reason: 'The captured variable value is not a readable sRGB color.' };
  }
  return { reason: 'Captured color alias resolution exceeded its bounded depth.' };
}

function revealProblem(scope, node) {
  for (let current = node; current && scope.selected.has(current.id); current = scope.nodes.get(current.parentId)) {
    const properties = current.properties;
    if (properties.opacity === 0) return 'A source ancestor has zero opacity; this behavior color has no established reveal mechanism.';
    if (properties.visible === false) {
      const refs = properties.componentPropertyReferences;
      if (!object(refs) || typeof refs.visible !== 'string' || !refs.visible.trim()) return 'The hidden source has no readable visibility control; its behavior color needs an established reveal mechanism.';
    }
    if (current.id === scope.rootId) break;
  }
  return null;
}

function reflectedVariableAlpha(paint, observation, color) {
  // Figma resolves a COLOR binding into paint RGB/opacity; these are not two alpha factors.
  return observation.kind === 'binding' && paint.boundVariables?.color?.type === 'VARIABLE_ALIAS' &&
    paint.boundVariables.color.id === observation.variableId && object(color) &&
    ['r', 'g', 'b'].every(channel => Number.isFinite(paint.color?.[channel]) && Number.isFinite(color[channel]) &&
      Math.abs(paint.color[channel] - color[channel]) <= CAPTURE_COLOR_EPSILON) &&
    Number.isFinite(color.a) && Math.abs(paint.opacity - color.a) <= CAPTURE_COLOR_EPSILON;
}

export function compareColors(capture, metadata, configuration, measurement, scope, add) {
  const keys = Object.entries(metadata.parts?.root?.nodes || {}).filter(([, ref]) => ref === configuration.figmaRef).map(([key]) => key);
  const observations = new Map(capture.observations.map(o => [o.id, o])), variables = new Map(capture.variables.map(v => [v.id, v]));
  const groups = new Map();
  for (const record of [...(metadata.bindings || []), ...(metadata.measuredLiterals || [])]) {
    if (!keys.includes(record.variant)) continue;
    const observation = observations.get(record.observation);
    if (!observation || !scope.selected.has(observation.node)) continue;
    if (!properties.has(record.cssProperty) && variables.get(observation.variableId)?.type !== 'COLOR') continue;
    const node = scope.nodes.get(observation.node);
    const hidden = scope.visible(node.id) === false;
    if (hidden && configuration.kind !== 'behavior') continue;
    if (hidden) {
      const seen = measurement?.parts?.[record.part];
      // Only original, well-formed visibility/absence readings can show that this optional paint is not exercised.
      if (Array.isArray(seen?.elements) && seen.count === seen.elements.length &&
          (seen.count === 0 || seen.elements.every(element => element.geometry?.visible === false))) continue;
    }
    const id = `color:${record.part}:${record.cssProperty}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ record, observation, node, hidden });
  }
  for (const [id, records] of groups) {
    const { record } = records[0], detail = { part: record.part, property: record.cssProperty, observations: records.map(r => r.observation.id).sort() };
    let reason, expected, resolutions = [], reflectedAlpha = false;
    for (const { record, observation, node, hidden } of records) {
      const refs = [...new Set(keys.map(key => metadata.parts?.[record.part]?.nodes?.[key]).filter(Boolean))];
      if (refs.length !== 1 || refs[0] !== `${capture.source.fileKey}:${node.id}` || scope.visible(node.id) === null) { reason = 'Color needs an unambiguous mapped source node with readable visibility.'; break; }
      if (hidden && (reason = revealProblem(scope, node))) break;
      if (!properties.has(record.cssProperty)) { reason = 'The declared CSS destination is not a supported single-color paint property; a supplier variable does not prove consumption.'; break; }
      const source = paintOf(node, observation.field);
      if (!source.paint) { reason = source.reason; break; }
      const resolved = observation.kind === 'binding' ? capturedColor(capture, scope, configuration, node, observation.variableId) : { color: source.paint.color };
      if (!resolved.color) { reason = resolved.reason; break; }
      if (source.paint.opacity !== undefined && source.paint.opacity !== 1) {
        if (!reflectedVariableAlpha(source.paint, observation, resolved.color)) {
          reason = 'Paint opacity is not an unambiguous reflection of its bound variable alpha; separate opacity, literals and differing source modes need a specific rendered review.'; break;
        }
        reflectedAlpha = true;
      }
      const value = renderedExpectation('color', resolved.color);
      const rgba = value.comparable && parseComputedColor(value.css);
      if (!rgba) { reason = 'The source paint does not establish a finite sRGB color.'; break; }
      if (expected && rgba.some((v, i) => v !== expected[i])) { reason = 'Several source colors target the same CSS property; their composition is not inferred.'; break; }
      expected = rgba; resolutions.push(...(resolved.modes || []));
    }
    if (reason) { add(id, 'NOT COMPARABLE', reason, detail); continue; }
    if (!measurement) { add(id, 'NOT RUN', 'No original computed-color measurement.', detail); continue; }
    const part = measurement.parts?.[record.part];
    if (!part || !Array.isArray(part.elements) || part.count !== part.elements.length) { add(id, 'NOT RUN', 'Computed-color part measurement is missing or malformed.', detail); continue; }
    if (part.count !== 1) { add(id, part.count ? 'NOT COMPARABLE' : 'FAIL', 'Computed color needs one mapped DOM element.', detail); continue; }
    if (records.some(record => record.hidden) && part.elements[0].geometry?.visible !== true) { add(id, 'NOT RUN', 'The behavior paint needs an original readable visible-element measurement.', detail); continue; }
    if (reflectedAlpha || expected[3] !== 1) {
      const opacityProperties = ['opacity', ...(['fill', 'stroke'].includes(record.cssProperty) ? [`${record.cssProperty}-opacity`] : [])];
      const opacities = opacityProperties.map(property => part.elements[0].computed?.[property]);
      if (opacities.some(opacity => typeof opacity !== 'string' || !opacity.trim())) { add(id, 'NOT RUN', 'Bound alpha requires original computed element and applicable SVG paint opacity.', detail); continue; }
      if (opacities.some(opacity => Number(opacity) !== 1)) { add(id, 'NOT COMPARABLE', 'Bound alpha is compared inside the CSS color only when element and applicable SVG paint opacity are one; separate opacity composition is not inferred.', detail); continue; }
      if (reflectedAlpha) detail.alphaSource = 'bound-variable-reflected-in-paint';
    }
    const css = part.elements[0].computed?.[record.cssProperty];
    if (typeof css !== 'string' || !css.trim()) { add(id, 'NOT RUN', 'Declared computed color property was not recorded.', detail); continue; }
    const measured = parseComputedColor(css);
    if (!measured) { add(id, 'NOT COMPARABLE', 'Computed color is outside the supported legacy sRGB forms.', { ...detail, measured: css }); continue; }
    const delta = measured.map((v, i) => v - expected[i]);
    const pass = delta.every((v, i) => Math.abs(v) <= (i === 3 ? COLOR_ALPHA_TOLERANCE : COLOR_CHANNEL_TOLERANCE));
    add(id, pass ? 'PASS' : 'FAIL', 'Declared computed CSS color versus the captured source in the examined modes; not visible pixels, mask loading, composition or glyph coverage.',
      { ...detail, expected, measured, delta, resolvedModes: [...new Set(resolutions)].sort(), tolerance: { channel: COLOR_CHANNEL_TOLERANCE, alpha: COLOR_ALPHA_TOLERANCE } });
  }
}
