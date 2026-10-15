const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const equal = (a, b) => Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i])) : object(a) ? object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => equal(a[k], b[k])) : a === b;

// Exceptions are deliberately narrower than visual equivalence: unknown effects require mapping or an unresolved obligation.
function plainContainer(node) {
  const p = node.properties;
  if (!['FRAME', 'GROUP'].includes(node.type)) return false;
  for (const field of ['fills', 'strokes', 'effects']) {
    const value = p[field];
    if (value === undefined && node.inspected?.includes(field) || value !== undefined && (!Array.isArray(value) || value.some(v => !v || v.visible !== false))) return false;
  }
  if (p.clipsContent !== undefined && p.clipsContent !== false || p.opacity !== undefined && p.opacity !== 1 || p.visible !== undefined && p.visible !== true) return false;
  for (const field of ['clipsContent', 'opacity', 'visible', 'componentPropertyReferences']) if (p[field] === undefined && node.inspected?.includes(field)) return false;
  if (p.componentPropertyReferences && (!object(p.componentPropertyReferences) || Object.keys(p.componentPropertyReferences).length)) return false;
  return true;
}

export function nodeCoverage(metadata, capture, configuration, { delegations } = {}) {
  const nodes = new Map(capture.nodes.map(n => [`${capture.source.fileKey}:${n.id}`, n])), selected = new Set();
  const visit = ref => { if (selected.has(ref) || !nodes.has(ref)) return; selected.add(ref); for (const child of nodes.get(ref).children) visit(`${capture.source.fileKey}:${child}`); };
  visit(configuration.figmaRef);
  const keys = Object.entries(metadata.parts?.root?.nodes || {}).filter(([, ref]) => ref === configuration.figmaRef).map(([key]) => key);
  const mapped = new Map();
  for (const [part, value] of Object.entries(metadata.parts || {})) {
    const refs = [...new Set(keys.map(key => value.nodes?.[key]).filter(Boolean))];
    if (refs.length === 1 && selected.has(refs[0])) {
      if (!mapped.has(refs[0])) mapped.set(refs[0], []);
      mapped.get(refs[0]).push(part);
    }
  }
  const errors = [], pending = [], coverage = [];
  const records = metadata.verification?.nodeCoverage ?? [];
  if (!Array.isArray(records)) return { errors: ['verification.nodeCoverage must be an array'], pending, coverage };
  const seen = new Set();
  for (const record of records) {
    if (!object(record) || !nodes.has(record.node) || seen.has(record.node) || !['same-layout-box', 'permanently-hidden', 'unresolved'].includes(record.rule) || typeof record.reason !== 'string' || !record.reason.trim() || Object.keys(record).some(k => !['node', 'rule', 'part', 'reason'].includes(k))) errors.push('Node coverage exceptions need a unique captured node, supported rule and reason');
    else seen.add(record.node);
  }
  const dispositions = delegations ?? (metadata.evidence?.dispositions || []).filter(d => d.kind === 'delegated' && d.instance);
  const delegated = new Set();
  for (const d of dispositions) {
    const instance = nodes.get(d.instance);
    if (instance?.type !== 'INSTANCE') continue;
    const descendants = ref => { for (const child of nodes.get(ref)?.children || []) { const next = `${capture.source.fileKey}:${child}`; if (!delegated.has(next)) { delegated.add(next); descendants(next); } } };
    // The instance's own placement/visibility still needs a mapped part; only its internals are delegated.
    descendants(d.instance);
  }
  for (const ref of selected) {
    if (mapped.has(ref)) { coverage.push({ node: ref, rule: 'mapped', parts: mapped.get(ref) }); continue; }
    if (delegated.has(ref)) { coverage.push({ node: ref, rule: 'delegated' }); continue; }
    const n = nodes.get(ref), record = records.find(r => r?.node === ref);
    if (record?.rule === 'unresolved') { pending.push({ node: ref, reason: record.reason }); continue; }
    let valid = false;
    if (record?.rule === 'same-layout-box') {
      const refs = [...new Set(keys.map(key => metadata.parts?.[record.part]?.nodes?.[key]).filter(Boolean))];
      const target = refs.length === 1 && nodes.get(refs[0]);
      const box = n.properties.absoluteBoundingBox, transform = n.properties.absoluteTransform;
      valid = plainContainer(n) && selected.has(refs[0]) && mapped.has(refs[0]) && box && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(box[k])) && Array.isArray(transform) && transform.length === 2 && transform.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite)) &&
        equal(box, target?.properties.absoluteBoundingBox) && equal(transform, target?.properties.absoluteTransform);
    } else if (record?.rule === 'permanently-hidden') {
      // A hidden layer controlled by a component property may appear in another case and cannot be excluded.
      let current = ref;
      while (selected.has(current)) {
        const node = nodes.get(current), p = node.properties, refs = p.componentPropertyReferences;
        const bindings = p.boundVariables;
        const readableBindings = bindings === undefined ? !node.inspected?.includes('boundVariables') : object(bindings) && !bindings.unavailable && !bindings.mixed;
        if ((p.visible === false || p.opacity === 0) && object(refs) && Object.values(refs).every(v => typeof v === 'string') && !Object.hasOwn(refs, 'visible') && readableBindings && !bindings?.visible && !bindings?.opacity) { valid = true; break; }
        if (current === configuration.figmaRef) break;
        current = `${capture.source.fileKey}:${node.parentId}`;
      }
    }
    if (valid) coverage.push({ node: ref, rule: record.rule, ...(record.part ? { part: record.part } : {}) });
    else errors.push(`Unaccounted render node ${ref}${record ? ': coverage rule conditions are not satisfied' : ': map it, delegate verified instance internals, or record an explicit obligation'}`);
  }
  return { errors, pending, coverage };
}
