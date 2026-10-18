import { decodeImage } from './pixel-residual.mjs';
import { caseNodes } from './render-comparison.mjs';

export const COMPOSITION_VERSION = 'composition-diagnostic-v4';
export const COMPOSITION_SCALE = 4;
export const MAX_COMPOSITION_PARTS = 8;
const SHAPES = new Set(['VECTOR', 'RECTANGLE', 'ELLIPSE', 'LINE', 'POLYGON', 'STAR']);
const box = r => r && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k])) && r.width > 0 && r.height > 0;
const intersects = (a, b) => box(a) && box(b) && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const unknown = (n, key) => n.properties[key] === undefined && n.inspected?.includes(key);

// A diagnostic model, not an assertion that the DOM must copy Figma's tree. Only uniquely mapped leaf siblings participate.
export function compositionPlan(capture, metadata, configuration) {
  const checks = [], groups = [], add = (part, reason) => checks.push({ id: `composition:${part}`, part, status: 'NOT COMPARABLE', reason });
  if (configuration.kind !== 'fidelity' || configuration.states?.length) return { groups, checks: [{ id: 'composition:case', status: 'NOT COMPARABLE', reason: 'Only exact, non-interactive fidelity configurations are sampled.' }] };
  const scope = caseNodes(capture, configuration);
  const root = scope.nodes.get(scope.rootId);
  const modes = root?.properties.resolvedVariableModes;
  if ((capture.collections || []).some(c => {
    const unreadable = modes === undefined ? root?.inspected?.includes('resolvedVariableModes') : !modes || Array.isArray(modes) || modes.mixed || modes.unavailable;
    return unreadable || configuration.modes?.[c.id] !== (modes?.[c.id] ?? c.defaultModeId);
  })) return { groups, checks: [{ id: 'composition:case', status: 'NOT COMPARABLE', reason: 'Case modes do not establish the captured source context.' }] };
  const keys = Object.entries(metadata.parts?.root?.nodes || {}).filter(([, ref]) => ref === configuration.figmaRef).map(([key]) => key);
  const siblings = new Map(), mapped = new Map();
  for (const [part, mapping] of Object.entries(metadata.parts || {})) {
    if (part === 'root') continue;
    const refs = [...new Set(keys.map(key => mapping.nodes?.[key]).filter(Boolean))];
    const node = refs.length === 1 && capture.nodes.find(n => `${capture.source.fileKey}:${n.id}` === refs[0]);
    if (!node || !scope.selected.has(node.id) || scope.visible(node.id) !== true || !SHAPES.has(node.type) || node.children.length || !box(node.properties.absoluteBoundingBox)) { add(part, 'A visible, uniquely mapped leaf shape with captured bounds is required; text and absent parts are excluded.'); continue; }
    let unsupported = false;
    for (let id = node.id; scope.selected.has(id); id = scope.nodes.get(id).parentId) {
      const n = scope.nodes.get(id), p = n.properties;
      if (unknown(n, 'opacity') || p.opacity !== undefined && p.opacity !== 1 || unknown(n, 'effects') || p.effects !== undefined && (!Array.isArray(p.effects) || p.effects.some(e => e.visible !== false && (id === node.id || !['DROP_SHADOW', 'INNER_SHADOW'].includes(e.type))))) unsupported = true;
      if (id === node.id && ['fills', 'strokes'].some(field => unknown(n, field) || p[field] !== undefined && (!Array.isArray(p[field]) || p[field].some(paint => paint.visible !== false && (paint.opacity !== undefined && paint.opacity !== 1 || paint.blendMode !== undefined && paint.blendMode !== 'NORMAL'))))) unsupported = true;
      if (id === scope.rootId) break;
    }
    const parent = scope.nodes.get(node.parentId), p = parent?.properties;
    if (!parent || !['FRAME', 'COMPONENT', 'INSTANCE'].includes(parent.type) || !['NONE', 'HORIZONTAL', 'VERTICAL'].includes(p.layoutMode) || p.layoutMode !== 'NONE' && typeof p.itemReverseZIndex !== 'boolean' || unsupported) { add(part, 'Source sibling order, opacity or effects are unsupported or unreadable.'); continue; }
    const record = { part, node: refs[0], nodeId: node.id, bounds: node.properties.absoluteBoundingBox };
    mapped.set(node.id, (mapped.get(node.id) || 0) + 1);
    if (!siblings.has(parent.id)) siblings.set(parent.id, { parent, parts: [] });
    siblings.get(parent.id).parts.push(record);
  }
  for (const { parent, parts } of siblings.values()) {
    if (parts.some(p => mapped.get(p.nodeId) !== 1) || new Set(parent.children).size !== parent.children.length || parts.some(p => !parent.children.includes(p.nodeId))) { for (const p of parts) add(p.part, 'A source node is shared by parts or sibling order is malformed.'); continue; }
    const overlapping = parts.filter(p => parts.some(q => q !== p && intersects(p.bounds, q.bounds)));
    for (const p of parts.filter(p => !overlapping.includes(p))) add(p.part, 'No overlap with another comparable sibling.');
    if (overlapping.length > MAX_COMPOSITION_PARTS) { for (const p of overlapping) add(p.part, 'Composition part budget exceeded.'); continue; }
    if (overlapping.length < 2) continue;
    if (groups.length >= 4) { for (const p of overlapping) add(p.part, 'Composition group budget exceeded.'); continue; }
    const reverse = parent.properties.layoutMode !== 'NONE' && parent.properties.itemReverseZIndex;
    overlapping.sort((a, b) => (parent.children.indexOf(a.nodeId) - parent.children.indexOf(b.nodeId)) * (reverse ? -1 : 1));
    groups.push({ parent: `${capture.source.fileKey}:${parent.id}`, parts: overlapping, order: 'back-to-front', reversed: Boolean(reverse) });
  }
  return { groups, checks };
}

const color = (image, i) => [image.rgb[i * 3], image.rgb[i * 3 + 1], image.rgb[i * 3 + 2]];
const equal = (a, b) => a.every((v, i) => v === b[i]);

// All images have one clip and one scale. Exact equality on two different opaque backgrounds identifies only stable opaque ink.
export function compareCompositionInk(layers, compositeBytes, { excluded = [] } = {}) {
  if (!Array.isArray(layers) || layers.length < 2 || layers.length > MAX_COMPOSITION_PARTS || new Set(layers.map(l => l.part)).size !== layers.length || layers.some(l => typeof l.part !== 'string' || !l.part)) throw new Error('Composition requires unique leaf parts in back-to-front order');
  const composite = decodeImage(compositeBytes), images = layers.map(l => [decodeImage(l.first), decodeImage(l.second)]);
  if (images.flat().some(image => image.width !== composite.width || image.height !== composite.height)) throw new Error('Composition image dimensions differ');
  const width = composite.width, pixels = width * composite.height;
  const counts = layers.map(() => ({ opaque: 0, visible: 0, occludedByLower: 0, legitimatelyCovered: 0, indeterminate: 0, nonOpaque: 0 }));
  for (let i = 0; i < pixels; i++) {
    const colors = images.map(([a]) => color(a, i));
    const opaque = images.map(([a, b], j) => equal(colors[j], color(b, i)));
    const painted = images.map(([a, b], j) => opaque[j] || !equal(colors[j], [255, 0, 255]) || !equal(color(b, i), [0, 255, 0]));
    const composed = color(composite, i), x = i % width, y = Math.floor(i / width);
    const blocked = excluded.some(r => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
    for (let j = 0; j < layers.length; j++) {
      const c = counts[j];
      if (!opaque[j]) { c.nonOpaque++; continue; }
      c.opaque++;
      if (blocked || opaque.some((v, k) => k !== j && v && equal(colors[j], colors[k]))) { c.indeterminate++; continue; }
      const above = opaque.map((v, k) => v && k > j ? k : -1).filter(k => k >= 0);
      // Lower anti-aliased paint cannot hide an opaque upper pixel that matches the composite exactly.
      // Expected upper paint, equal colors and unknown regions still prevent a visibility conclusion.
      const translucentAbove = painted.some((v, k) => k > j && v && !opaque[k]);
      if (!above.length && !translucentAbove && equal(composed, colors[j])) { c.visible++; continue; }
      if (painted.some((v, k) => k !== j && v && !opaque[k])) { c.indeterminate++; continue; }
      if (above.length) {
        const top = above.at(-1);
        if (equal(composed, colors[top])) c.legitimatelyCovered++; else c.indeterminate++;
      } else if (opaque.some((v, k) => k < j && v && equal(composed, colors[k]))) c.occludedByLower++;
      else c.indeterminate++;
    }
  }
  return layers.map((layer, j) => {
    const c = counts[j], status = c.occludedByLower ? 'FAIL' : c.visible + c.legitimatelyCovered > 0 && c.indeterminate === 0 ? 'PASS' : 'NOT COMPARABLE';
    return { id: `composition:${layer.part}`, part: layer.part, status, counts: c,
      reason: c.occludedByLower ? 'Expected upper ink is replaced by a color matching an opaque lower sibling; review the isolated and composed artifacts.' : status === 'PASS' ? 'All sampled opaque ink is visible or covered by a known higher sibling.' : 'No conclusive complete opaque-ink comparison; ambiguous colors, other paint and translucent pixels are not proof.' };
  });
}
