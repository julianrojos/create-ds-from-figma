import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalJson } from './figma-evidence.mjs';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const fail = message => { throw new Error(`Variable inventory: ${message}`); };
const unique = (values, label) => { if (new Set(values).size !== values.length) fail(`duplicate ${label}`); };
const sorted = list => [...list].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const envelopeFields = ['schemaVersion', 'capturedAt', 'hash', 'inventory'];
const captureDate = value => {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
};

export function normalizeInventory(input) {
  const data = structuredClone(input);
  if (data?.schemaVersion !== 1 || data.source?.collector !== 'variable-inventory-v1' || data.source?.api !== 'PLUGIN' ||
      !/^[A-Za-z0-9_-]+$/.test(data.source?.fileKey || '') || !text(data.source?.tool) ||
      !(data.source.revision === null || text(data.source.revision)) || !Array.isArray(data.collections) || !Array.isArray(data.variables)) fail('invalid schema or provenance');
  if (data.collections.some(c => !object(c)) || data.variables.some(v => !object(v))) fail('collection and variable records must be objects');
  unique(data.collections.map(c => c?.id), 'collection ID'); unique(data.variables.map(v => v?.id), 'variable ID');
  const collections = new Map();
  for (const c of data.collections) {
    if (!text(c?.id) || !text(c.name) || typeof c.remote !== 'boolean' || !Array.isArray(c.modes) || !c.modes.length ||
        c.modes.some(m => !text(m?.modeId) || !text(m.name)) || !Array.isArray(c.variableIds) || c.variableIds.some(id => !text(id))) fail('invalid collection');
    unique(c.modes.map(m => m.modeId), 'mode ID'); unique(c.modes.map(m => m.name), 'mode name'); unique(c.variableIds, 'collection variable ID');
    if (!c.modes.some(m => m.modeId === c.defaultModeId)) fail(`unknown default mode in ${c.id}`);
    c.variableIds.sort(); collections.set(c.id, c);
  }
  const variables = new Map(data.variables.map(v => [v.id, v]));
  for (const v of data.variables) {
    const c = collections.get(v.collectionId);
    if (!text(v.id) || !text(v.name) || typeof v.remote !== 'boolean' || !c || c.remote !== v.remote || !c.variableIds.includes(v.id) ||
        !['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'].includes(v.type) || !object(v.valuesByMode) || !Array.isArray(v.scopes) || v.scopes.some(s => !text(s))) fail(`invalid variable ${v.id}`);
    if (canonicalJson(Object.keys(v.valuesByMode).sort()) !== canonicalJson(c.modes.map(m => m.modeId).sort())) fail(`incomplete modes for ${v.id}`);
    v.scopes = [...new Set(v.scopes)].sort();
    for (const value of Object.values(v.valuesByMode)) {
      if (object(value) && value.type === 'VARIABLE_ALIAS') {
        const target = variables.get(value.id);
        if (!target || target.type !== v.type) fail(`missing or incompatible alias ${v.id} -> ${value.id}`);
      } else if (v.type === 'COLOR' ? !object(value) || !['r', 'g', 'b'].every(k => Number.isFinite(value[k]) && value[k] >= 0 && value[k] <= 1) ||
          (value.a !== undefined && (!Number.isFinite(value.a) || value.a < 0 || value.a > 1)) :
        v.type === 'FLOAT' ? !Number.isFinite(value) : typeof value !== (v.type === 'STRING' ? 'string' : 'boolean')) fail(`invalid ${v.type} value for ${v.id}`);
    }
  }
  for (const c of data.collections.filter(c => !c.remote)) {
    if (c.variableIds.some(id => !variables.has(id) || variables.get(id).collectionId !== c.id)) fail(`incomplete local collection ${c.id}`);
    unique(data.variables.filter(v => v.collectionId === c.id).map(v => v.name), `variable name in ${c.id}`);
  }
  data.collections = sorted(data.collections); data.variables = sorted(data.variables);
  return data;
}

export function sealInventory(input, capturedAt = new Date().toISOString()) {
  const inventory = normalizeInventory(input);
  if (!captureDate(capturedAt)) fail('invalid capture date; expected canonical ISO UTC from toISOString()');
  return { schemaVersion: 1, capturedAt, hash: createHash('sha256').update(canonicalJson(inventory)).digest('hex'), inventory };
}

export function readInventory(file, fileKey) {
  const envelope = JSON.parse(readFileSync(file, 'utf8'));
  if (!object(envelope)) fail('envelope must be an object');
  if (Object.keys(envelope).length !== envelopeFields.length || !envelopeFields.every(key => Object.hasOwn(envelope, key))) fail('envelope needs exactly schemaVersion, capturedAt, hash and inventory');
  if (envelope.schemaVersion !== 1 || typeof envelope.hash !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.hash)) fail('invalid envelope schemaVersion or SHA-256 hash');
  if (!captureDate(envelope.capturedAt)) fail('invalid capture date; expected canonical ISO UTC from toISOString()');
  const expected = sealInventory(envelope.inventory, envelope.capturedAt);
  if (envelope.hash !== expected.hash || canonicalJson(envelope.inventory) !== canonicalJson(expected.inventory)) fail('hash or canonical inventory mismatch');
  if (fileKey !== undefined && fileKey !== expected.inventory.source.fileKey) fail('file origin differs from project');
  return envelope;
}

export function inventoryCollections(inventory) {
  const data = normalizeInventory(inventory);
  return data.collections.filter(c => !c.remote).map(c => ({ ...c, variables: data.variables.filter(v => v.collectionId === c.id) }));
}

// Resolve only mode-independent cross-collection aliases; no implicit active-mode choice.
export function inventoryTokenCollections(input) {
  const data = normalizeInventory(input), variables = new Map(data.variables.map(v => [v.id, v]));
  const collections = new Map(data.collections.map(c => [c.id, c]));
  const resolve = (v, mode, seen = new Set()) => {
    const key = `${v.id}:${mode}`;
    if (seen.has(key)) fail(`alias cycle at ${key}`);
    const next = new Set([...seen, key]), raw = v.valuesByMode[mode];
    if (raw?.type === 'VARIABLE_ALIAS') {
      const target = variables.get(raw.id), targetCollection = collections.get(target.collectionId);
      const candidates = target.collectionId === v.collectionId ? [resolve(target, mode, next)] : targetCollection.modes.map(m => resolve(target, m.modeId, next));
      if (new Set(candidates.map(canonicalJson)).size !== 1) fail(`cross-collection alias ${v.id} -> ${target.id} depends on an unrecorded mode; explicit resolution is required`);
      return candidates[0];
    }
    if (v.type !== 'COLOR') return raw;
    const hex = channel => Math.round(channel * 255).toString(16).padStart(2, '0').toUpperCase();
    return '#' + [raw.r, raw.g, raw.b, ...(raw.a !== undefined && raw.a !== 1 ? [raw.a] : [])].map(hex).join('');
  };
  return inventoryCollections(data).map(c => ({ collection: c.name, id: c.id, modes: c.modes.map(m => m.name),
    defaultMode: c.modes.find(m => m.modeId === c.defaultModeId).name,
    variables: Object.fromEntries(c.variables.map(v => [v.name, { id: v.id, type: v.type, scopes: v.scopes,
      valuesByMode: Object.fromEntries(c.modes.map(m => {
        const raw = v.valuesByMode[m.modeId], value = resolve(v, m.modeId);
        return [m.name, raw?.type === 'VARIABLE_ALIAS' ? { targetVariableId: raw.id, source: variables.get(raw.id).remote ? 'external' : 'local', value } : value];
      })) }])) }));
}
