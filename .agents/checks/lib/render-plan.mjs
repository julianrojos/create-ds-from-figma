import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { textDimensionRequirements } from './figma-dimensions.mjs';
import { nodeCoverage } from './node-coverage.mjs';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
// Only well-formed records of a possibly malformed list; the plan validator reports the malformation itself.
export const objectRecords = value => Array.isArray(value) ? value.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item)) : [];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function projectFile(root, relative) {
  if (!text(relative) || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => p === '..' || p === '.')) throw new Error('Expected a project-relative file path');
  const base = realpathSync(root), file = realpathSync(path.join(base, relative));
  if (!file.startsWith(base + path.sep) || !statSync(file).isFile()) throw new Error('File must remain inside the project');
  return file;
}

export function renderRequirements(capture) {
  const textNodes = new Set(capture.nodes.filter(n => n.type === 'TEXT').map(n => n.id));
  const fonts = [], assets = [], typography = [], fontGroups = new Map();
  for (const o of capture.observations.filter(o => o.kind === 'property')) {
    if (textNodes.has(o.node) && /^(?:segments\[\d+\]\.)?fontName$/.test(o.field) && object(o.value) && text(o.value.family) && text(o.value.style)) {
      const id = `font-${sha256(JSON.stringify(canonical(o.value)))}`;
      if (!fontGroups.has(id)) { const group = { id, font: o.value, observations: [] }; fontGroups.set(id, group); fonts.push(group); }
      fontGroups.get(id).observations.push(o.id);
    }
    if (textNodes.has(o.node) && /^(?:segments\[\d+\]\.)?(fontSize|fontWeight|lineHeight|letterSpacing|textAlignHorizontal|textAlignVertical)$/.test(o.field)) typography.push({ observation: o.id, observations: [o.id], node: o.node, field: o.field, value: o.value });
    if (/(?:^|\.)fills$/.test(o.field) && Array.isArray(o.value)) {
      o.value.forEach((paint, index) => {
        if (paint?.type === 'IMAGE') assets.push({ observation: o.id, index, imageHash: paint.imageHash ?? null });
      });
    }
  }
  // Only a full, single segment with identical value AND bindings can reuse scalar coverage.
  for (const node of capture.nodes.filter(n => n.type === 'TEXT')) {
    const segments = node.properties.segments, segment = segments?.[0];
    if (segments?.length !== 1 || typeof node.properties.characters !== 'string' || segment.start !== 0 || segment.end !== node.properties.characters.length || segment.characters !== node.properties.characters) continue;
    for (const scalar of typography.filter(t => t.node === node.id && !t.field.startsWith('segments['))) {
      const child = typography.find(t => t.node === node.id && t.field === `segments[0].${scalar.field}`);
      const bindings = field => capture.observations.filter(o => o.kind === 'binding' && o.node === node.id && o.field === field).map(o => o.variableId).sort();
      if (child && equal(scalar.value, child.value) && equal(bindings(scalar.field), bindings(child.field))) { scalar.observations.push(child.observation); typography.splice(typography.indexOf(child), 1); }
    }
  }
  fonts.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const font of fonts) font.observations.sort();
  return { fonts, assets, typography, dimensions: textDimensionRequirements(capture),
    variants: (capture.variants.length ? capture.variants.map(v => v.nodeId) : [capture.source.rootNodeId]).map(id => `${capture.source.fileKey}:${id}`) };
}

function subtree(capture, ref) {
  if (typeof ref !== 'string' || !ref.startsWith(`${capture.source.fileKey}:`)) return new Set();
  const nodeId = ref.slice(capture.source.fileKey.length + 1), nodes = new Map(capture.nodes.map(n => [n.id, n]));
  const ids = new Set(), visit = id => { if (ids.has(id)) return; ids.add(id); for (const child of nodes.get(id)?.children || []) visit(child); };
  visit(nodeId);
  return ids;
}

export function verifyRenderPlan(root, metadata, capture, { delegations = [], reserved = [] } = {}) {
  const errors = [], warnings = [], requirements = renderRequirements(capture), plan = metadata.verification;
  if (!object(plan) || plan.schemaVersion !== 1) return { errors: ['verification schemaVersion 1 is required'], warnings, requirements };
  if (plan.geometryPolicy !== 'mapped-layout-v1') errors.push('verification.geometryPolicy must be mapped-layout-v1');
  if (plan.nodeCoverage !== undefined && !Array.isArray(plan.nodeCoverage)) errors.push('verification.nodeCoverage must be an array');
  const arrays = ['fonts', 'assets', 'stylesheets', 'inputs', 'cases', 'unestablished'];
  for (const key of arrays) if (!Array.isArray(plan[key])) errors.push(`verification.${key} must be an array`);
  if (errors.length) return { errors, warnings, requirements };
  const checkFile = (source, label) => {
    try {
      if (!object(source) || !/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error('A file path and SHA-256 are required');
      if (sha256(readFileSync(projectFile(root, source.path))) !== source.sha256) throw new Error('SHA-256 differs from file bytes');
    } catch (error) { errors.push(`${label}: ${error.message}`); }
  };
  const checkResources = (records, expected, label, matches) => {
    const accounted = new Set();
    for (const [i, record] of records.entries()) {
      const key = label === 'assets' ? `${record?.observation}:${record?.index}` : record?.id;
      const requirement = expected.find(r => (label === 'assets' ? r.observation === record?.observation : r.id === record?.id) && matches(r, record));
      if (!requirement || accounted.has(key)) { errors.push(`${label}[${i}]: duplicate or incorrect captured resource`); continue; }
      accounted.add(key);
      if (label === 'fonts' && Object.keys(record).some(k => !['id', 'css', 'source'].includes(k))) errors.push(`${label}[${i}]: font facts are derived; record only id, css and source`);
      if (record.source?.kind === 'file') {
        checkFile(record.source, `${label}[${i}]`);
        if (label === 'assets' && !text(requirement.imageHash)) errors.push(`${label}[${i}]: missing captured image hash requires unresolved source, not an invented asset mapping`);
      }
      else if (record.source?.kind === 'unresolved' && text(record.source.reason)) warnings.push(`${label}[${i}]: resource loading NOT VERIFIED: ${record.source.reason}`);
      else errors.push(`${label}[${i}]: source must be a hashed project file or explicitly unresolved`);
      if (label === 'fonts' && (!object(record.css) || !text(record.css.family) || !text(record.css.weight) || !['normal', 'italic', 'oblique'].includes(record.css.style))) errors.push(`${label}[${i}]: explicit CSS family, weight and style descriptors are required`);
    }
    for (const r of expected) {
      const key = label === 'assets' ? `${r.observation}:${r.index}` : r.id;
      if (!accounted.has(key)) errors.push(`Missing ${label} resource: ${key}`);
    }
  };
  checkResources(plan.fonts, requirements.fonts, 'fonts', () => true);
  checkResources(plan.assets, requirements.assets, 'assets', (r, v) => r.index === v.index && r.imageHash === v.imageHash);
  if (new Set(plan.stylesheets).size !== plan.stylesheets.length) errors.push('stylesheets must not contain duplicates');
  for (const file of plan.stylesheets) {
    try { if (!/\.css$/.test(file)) throw new Error('Expected a CSS file'); projectFile(root, file); }
    catch (error) { errors.push(`stylesheets: ${error.message}`); }
  }
  if (new Set(plan.inputs).size !== plan.inputs.length) errors.push('inputs must not contain duplicates');
  // Finalization writes the component usage.md and the content-addressed reports; hashing either as an input would expire its own confirmation.
  const written = reserved.flatMap(file => { try { return [projectFile(root, file)]; } catch { return []; } });
  const reports = path.join(realpathSync(root), 'design-system', 'verification') + path.sep;
  for (const file of plan.inputs) {
    try {
      const resolved = projectFile(root, file);
      if (written.includes(resolved) || resolved.startsWith(reports)) errors.push(`inputs: ${file} is written by finalization; a confirmation cannot depend on itself`);
    } catch (error) { errors.push(`inputs: ${error.message}`); }
  }
  const delegatedNodes = new Set(delegations.flatMap(d => [...subtree(capture, d.instance)]));
  for (const o of requirements.typography) {
    const fields = o.observations.map(id => capture.observations.find(r => r.id === id)?.field);
    const bound = (metadata.bindings || []).some(b => b.node === `${capture.source.fileKey}:${o.node}` && fields.includes(b.figmaProperty));
    const literal = (metadata.measuredLiterals || []).some(l => o.observations.includes(l.observation));
    const translated = (metadata.evidence?.translations || []).some(t => o.observations.some(id => t.observations?.includes(id)) && text(t.reason) && text(t.cssSelector) && text(t.cssProperty));
    if (!bound && !literal && !translated && !delegatedNodes.has(o.node)) errors.push(`Missing essential typography coverage: ${o.observation}`);
  }
  const refs = new Set(requirements.variants), ids = new Set(), covered = new Set(), cases = new Map();
  const expectedModes = new Map(capture.collections.map(c => [c.id, new Set(c.modes.map(m => m.modeId))]));
  for (const [index, c] of plan.cases.entries()) {
    const label = `cases[${index}]`;
    if (!object(c) || !text(c.id) || !/^[a-zA-Z0-9_-]+$/.test(c.id) || ids.has(c.id)) { errors.push(`${label}: unique safe case id required`); continue; }
    ids.add(c.id); cases.set(c.id, c);
    if (!['fidelity', 'behavior'].includes(c.kind) || !refs.has(c.figmaRef)) errors.push(`${label}: kind and captured variant ref required`);
    if (!object(c.props) || !object(c.content) || !object(c.modes) || !object(c.environment) || !object(c.environment.attributes) || !Array.isArray(c.environment.classes) || c.environment.classes.some(v => !text(v) || /\s/.test(v))) errors.push(`${label}: explicit props, content, modes and environment required`);
    if (!object(c.viewport) || !['width', 'height'].every(k => Number.isInteger(c.viewport[k]) && c.viewport[k] > 0 && c.viewport[k] <= 16384)) errors.push(`${label}: viewport must use positive bounded CSS pixels`);
    if (!Array.isArray(c.states) || c.states.some(s => !object(s) || !text(s.name) || !text(s.activation))) errors.push(`${label}: states need names and real activation instructions`);
    if (!Array.isArray(c.expectations)) errors.push(`${label}: expectations must be an array`);
    for (const [collection, modes] of expectedModes) if (!modes.has(c.modes?.[collection])) errors.push(`${label}: active captured mode required for ${collection}`);
    for (const collection of Object.keys(c.modes || {})) if (!expectedModes.has(collection)) errors.push(`${label}: unknown collection ${collection}`);
    const nodes = subtree(capture, c.figmaRef || '');
    for (const [ref, value] of Object.entries(c.content || {})) if (!nodes.has(ref.slice(capture.source.fileKey.length + 1)) || !ref.startsWith(`${capture.source.fileKey}:`) || typeof value !== 'string' || !capture.nodes.some(n => `${capture.source.fileKey}:${n.id}` === ref && n.type === 'TEXT')) errors.push(`${label}: content needs text and a TEXT ref inside the examined variant`);
    if (c.kind === 'fidelity') {
      covered.add(c.figmaRef);
      for (const n of capture.nodes.filter(n => nodes.has(n.id) && n.type === 'TEXT' && typeof n.properties.characters === 'string')) {
        if (c.content?.[`${capture.source.fileKey}:${n.id}`] !== n.properties.characters) errors.push(`${label}: fidelity content differs from captured text ${n.id}`);
      }
    }
    for (const [key, value] of Object.entries(c.environment?.attributes || {})) if (!/^(?:data-[a-z0-9-]+|dir|lang)$/.test(key) || typeof value !== 'string') errors.push(`${label}: environment attributes are limited to data-*, dir and lang`);
  }
  const unestablishedNodes = new Set();
  for (const [i, record] of plan.unestablished.entries()) {
    if (!object(record) || !refs.has(record.figmaRef) || covered.has(record.figmaRef) || !text(record.reason)) errors.push(`unestablished[${i}]: unique uncovered variant and reason required`);
    else { covered.add(record.figmaRef); for (const id of subtree(capture, record.figmaRef)) unestablishedNodes.add(id); warnings.push(`${record.figmaRef}: correspondence and behavior NOT VERIFIED: ${record.reason}`); }
  }
  for (const ref of refs) if (!covered.has(ref)) errors.push(`Missing fidelity case or explicit unestablished correspondence: ${ref}`);
  for (const c of cases.values()) if (c.kind === 'fidelity') {
    const coverage = nodeCoverage(metadata, capture, c, { delegations });
    errors.push(...coverage.errors.map(e => `${c.id}: ${e}`));
    warnings.push(...coverage.pending.map(e => `${c.id}: node coverage NOT VERIFIED ${e.node}: ${e.reason}`));
  }
  const exercised = new Set();
  for (const c of cases.values()) {
    if (c.kind !== 'behavior') continue;
    const base = cases.get(c.baseline);
    if (!base || base.kind !== 'fidelity' || base.figmaRef !== c.figmaRef || !equal(c.viewport, base.viewport) || !equal(c.modes, base.modes) || !equal(c.environment, base.environment) || !equal(c.states, base.states)) errors.push(`${c.id}: behavior baseline must be a fidelity case with the same ref and environment`);
    for (const e of Array.isArray(c.expectations) ? c.expectations : []) {
      if (e && ['contained', 'anchored', 'centered'].includes(e.kind)) {
        const variantKeys = Object.keys(metadata.parts?.root?.nodes || {}).filter(key => metadata.parts.root.nodes[key] === c.figmaRef);
        const ids = subtree(capture, c.figmaRef);
        const mapped = part => {
          const refs = [...new Set(variantKeys.map(key => metadata.parts?.[part]?.nodes?.[key]).filter(Boolean))];
          return refs.length === 1 && refs[0].startsWith(capture.source.fileKey + ':') && ids.has(refs[0].slice(capture.source.fileKey.length + 1));
        };
        const keys = e.kind === 'contained' ? ['kind', 'part', 'container', 'inset', 'reason'] : e.kind === 'centered' ? ['kind', 'part', 'container', 'axis', 'relation', 'reason'] : ['kind', 'part', 'container', 'edge', 'reason'];
        if (Object.keys(e).some(key => !keys.includes(key)) || !text(e.reason) || !mapped(e.part) || !mapped(e.container) || e.part === e.container || e.kind === 'contained' && e.inset !== undefined && (!Number.isFinite(e.inset) || e.inset < 0) || e.kind === 'anchored' && !['left', 'right', 'top', 'bottom'].includes(e.edge)) errors.push(`${c.id}: explicit ${e.kind} invariant needs distinct mapped parts, reason and valid inset/edge`);
        if (e.kind === 'centered' && (!['x', 'y'].includes(e.axis) || !['center', 'preserve-offset'].includes(e.relation))) errors.push(`${c.id}: centered needs axis x/y and relation center/preserve-offset`);
        continue;
      }
      const requirement = requirements.dimensions.find(d => d.observation === e?.observation && d.behavior === 'content');
      if (!requirement || e.kind !== 'intrinsic-size' || !text(e.part) || !Object.values(metadata.parts?.[e.part]?.nodes || {}).includes(requirement.node) || e.axis !== requirement.field || !subtree(capture, c.figmaRef).has(requirement.node.slice(capture.source.fileKey.length + 1))) { errors.push(`${c.id}: intrinsic-size expectation needs a captured content dimension, axis and its mapped text part`); continue; }
      if (base && c.content?.[requirement.node] !== undefined && c.content[requirement.node] !== base.content?.[requirement.node]) exercised.add(requirement.observation);
      else errors.push(`${c.id}: intrinsic-size case must vary the content of the examined text node`);
      if (Object.keys(e).some(key => !['kind', 'observation', 'axis', 'part', 'relation', 'reason'].includes(key)) || e.relation !== undefined && (!['grow', 'shrink', 'equal', 'change'].includes(e.relation) || !text(e.reason))) errors.push(`${c.id}: dimensional relation must be explicit, supported and justified`);
    }
  }
  for (const d of requirements.dimensions.filter(d => d.behavior === 'content' && !delegatedNodes.has(d.node.slice(capture.source.fileKey.length + 1)) && !unestablishedNodes.has(d.node.slice(capture.source.fileKey.length + 1)))) if (!exercised.has(d.observation)) errors.push(`Missing alternate-content behavior case: ${d.observation}`);
  return { errors, warnings, requirements };
}
