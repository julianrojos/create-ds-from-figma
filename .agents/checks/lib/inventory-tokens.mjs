import { existsSync, readFileSync, realpathSync, mkdirSync, mkdtempSync, writeFileSync, renameSync, rmSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from './figma-evidence.mjs';
import { inventoryTokenCollections, readInventory } from './variable-inventory.mjs';
import { isPortableTokenFileName } from './token-file-name.mjs';
import { projectFile, sha256 } from './render-plan.mjs';
import { renderTokensCss } from './tokens-css.mjs';

const statePath = 'design-system/relationships/figma-state.json';
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const readState = root => existsSync(path.join(root, statePath)) ? json(projectFile(root, statePath)) : { fileKey: '', tokenPrefix: null, collections: {}, variables: {}, components: {} };
const encode = data => JSON.stringify(data, null, 2) + '\n';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameFact = (actual, expected) => actual !== undefined && canonicalJson(actual) === canonicalJson(expected);
function observedAliasModes(state, inventory) {
  const modes = state.aliasModes === undefined ? {} : state.aliasModes;
  if (!object(modes)) throw new Error('aliasModes must be an object keyed by collection ID');
  const observed = new Set(inventory.collections.map(c => c.id));
  for (const [id, mode] of Object.entries(modes)) {
    if (!observed.has(id) && !state.collections?.[id]?.modes?.includes(mode)) throw new Error(`Unknown retained alias mode ${id}/${mode}`);
  }
  return Object.fromEntries(Object.entries(modes).filter(([id]) => observed.has(id)));
}
const modeFacts = values => object(values) ? Object.fromEntries(Object.entries(values).map(([mode, value]) => [mode,
  object(value) ? Object.fromEntries(['targetVariableId', 'source', 'value'].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : value])) : values;

export function tokenInventoryComparison(root, envelope) {
  const state = readState(root), errors = [], retainedCollections = [], retainedVariables = [];
  if (state.fileKey !== envelope.inventory.source.fileKey) errors.push('Inventory file origin differs from project');
  const observed = inventoryTokenCollections(envelope.inventory, observedAliasModes(state, envelope.inventory)), ids = new Set(observed.map(c => c.id));
  for (const collection of observed) {
    const record = state.collections?.[collection.id];
    if (!record || !isPortableTokenFileName(record.file)) { errors.push(`Collection ${collection.id} has no registered token file`); continue; }
    let data;
    try { data = json(projectFile(root, `design-system/tokens/${record.file}`)); }
    catch (error) { errors.push(error.message); continue; }
    if (!object(data)) { errors.push(`${collection.id}: token collection must be an object`); continue; }
    for (const key of ['id', 'collection', 'modes', 'defaultMode']) if (!sameFact(data[key], collection[key])) errors.push(`${collection.id}: ${key} differs from inventory`);
    if (!object(data.variables)) { errors.push(`${collection.id}: variables must be an object`); continue; }
    const expectedIds = new Set(Object.values(collection.variables).map(v => v.id));
    for (const [name, expected] of Object.entries(collection.variables)) {
      const actual = Object.hasOwn(data.variables, name) ? data.variables[name] : undefined;
      if (!object(actual)) { errors.push(`${collection.id}/${expected.id}: ${actual === undefined ? 'missing' : 'invalid'} variable ${name}`); continue; }
      for (const key of ['id', 'type', 'valuesByMode', 'scopes']) {
        const fact = value => key === 'valuesByMode' ? modeFacts(value) : value;
        if (!sameFact(fact(actual[key]), fact(expected[key]))) errors.push(`${collection.id}/${expected.id}: ${key} differs from inventory`);
      }
    }
    for (const [name, v] of Object.entries(data.variables)) {
      if (!object(v) || typeof v.id !== 'string' || !v.id.trim()) { errors.push(`${collection.id}: invalid variable record ${name}`); continue; }
      if (!expectedIds.has(v.id)) retainedVariables.push({ collectionId: collection.id, id: v.id });
    }
  }
  for (const id of Object.keys(state.collections || {})) if (!ids.has(id)) retainedCollections.push(id);
  return { status: errors.length ? 'FAIL' : 'PASS', hash: envelope.hash, fileKey: envelope.inventory.source.fileKey, errors,
    retainedCollections, retainedVariables, scope: 'Observed local facts compared with this sealed inventory; retained records are not evidence of continued presence in Figma. Hash and origin do not authenticate Figma.' };
}

export function planInventoryTokens(root, inventoryPath, { tokenPrefix, aliasModes } = {}) {
  root = path.resolve(root);
  const state = readState(root), envelope = readInventory(inventoryPath, state.fileKey || undefined);
  const preflightScript = fileURLToPath(new URL('../../skills/create-ds-from-figma/scripts/preflight-token-files.mjs', import.meta.url));
  const args = [preflightScript, root, '--inventory', path.resolve(inventoryPath), ...(tokenPrefix === undefined ? [] : ['--token-prefix', tokenPrefix])];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Token preflight failed');
  const preflight = JSON.parse(result.stdout), next = structuredClone(state), outputs = {};
  observedAliasModes(state, envelope.inventory);
  if (aliasModes !== undefined) {
    if (!object(aliasModes)) throw new Error('aliasModes must be an object keyed by collection ID');
    const known = new Map(envelope.inventory.collections.map(c => [c.id, c]));
    for (const [id, mode] of Object.entries(aliasModes)) {
      if (known.get(id)?.remote !== false || !known.get(id)?.modes.some(m => m.name === mode)) throw new Error(`Unknown local alias mode ${id}/${mode}`);
      if (Object.hasOwn(state.aliasModes || {}, id) && state.aliasModes[id] !== mode) throw new Error(`Alias mode ${id} is already fixed; changing it requires an explicit migration`);
    }
    next.aliasModes = { ...state.aliasModes, ...aliasModes };
  }
  next.fileKey = envelope.inventory.source.fileKey; next.tokenPrefix = preflight.tokenPrefix.value;
  next.collections = Object.assign(Object.create(null), next.collections); next.variables = Object.assign(Object.create(null), next.variables);
  for (const collection of inventoryTokenCollections(envelope.inventory, observedAliasModes(next, envelope.inventory))) {
    const file = preflight.files[collection.id], relative = `design-system/tokens/${file}`;
    const old = existsSync(path.join(root, relative)) ? json(projectFile(root, relative)) : null;
    const incomingIds = new Set(Object.values(collection.variables).map(v => v.id));
    const variables = Object.fromEntries(Object.entries(old?.variables || {}).filter(([, v]) => !incomingIds.has(v.id)));
    if (old && Object.values(variables).length && canonicalJson(old.modes) !== canonicalJson(collection.modes)) throw new Error(`Retained variables in ${collection.id} need explicit mode migration`);
    for (const [name, v] of Object.entries(collection.variables)) {
      if (Object.hasOwn(variables, name)) throw new Error(`Retained variable name collision: ${collection.id}/${name}`);
      const previous = Object.values(old?.variables || {}).find(entry => entry.id === v.id);
      Object.defineProperty(variables, name, { value: { ...previous, ...v, cssName: preflight.variables[v.id] }, enumerable: true, writable: true, configurable: true });
    }
    collection.variables = variables;
    const previous = next.collections[collection.id] || {}, scopes = previous.modeScopes || {};
    const modes = collection.modes.filter(m => m !== collection.defaultMode);
    for (const mode of Object.keys(scopes)) if (!modes.includes(mode)) throw new Error(`Existing scope ${collection.id}/${mode} needs explicit mode migration`);
    next.collections[collection.id] = { ...previous, name: collection.collection, modes: collection.modes,
      varCount: Object.keys(variables).length, file, modeScopes: Object.fromEntries(modes.map(m => [m, scopes[m] ?? null])), serialization: previous.serialization || {} };
    next.variables[collection.id] = Object.fromEntries(Object.entries(variables).map(([name, v]) => [name, { id: v.id, type: v.type }]));
    outputs[relative] = encode(collection);
  }
  outputs[statePath] = encode(next);
  const validation = renderTokensCss({ collections: Object.entries(next.collections).map(([id, record]) => {
    if (!isPortableTokenFileName(record.file)) throw new Error(`Invalid registered file for ${id}`);
    const relative = `design-system/tokens/${record.file}`;
    return { file: record.file, record, data: outputs[relative] ? JSON.parse(outputs[relative]) : json(projectFile(root, relative)) };
  }) });
  if (validation.errors.length) throw new Error(validation.errors.join('\n'));
  return { schemaVersion: 1, inventory: { hash: envelope.hash, fileKey: envelope.inventory.source.fileKey }, preflight, outputs,
    expected: Object.fromEntries(Object.keys(outputs).map(relative => [relative, existsSync(path.join(root, relative)) ? sha256(readFileSync(projectFile(root, relative))) : null])),
    warnings: validation.warnings,
    scope: 'Proposal only. Existing scopes, names and serialization decisions are preserved; new non-default scopes remain null. CSS is generated separately.' };
}

// Validate every destination and prepare every file before replacing anything; roll back ordinary write failures.
export function saveInventoryTokens(root, plan) {
  root = realpathSync(root);
  const prepared = [], createdDirectories = [];
  try {
    for (const [relative, bytes] of Object.entries(plan.outputs)) {
      if (relative !== statePath && !/^design-system\/tokens\/[^/]+\.json$/.test(relative)) throw new Error('Invalid token output path');
      const destination = path.join(root, relative), parent = path.dirname(destination);
      const missing = [];
      for (let dir = parent; !existsSync(dir); dir = path.dirname(dir)) missing.push(dir);
      const ancestor = realpathSync(missing.length ? path.dirname(missing.at(-1)) : parent);
      if (ancestor !== root && !ancestor.startsWith(root + path.sep)) throw new Error('Token output must remain inside project');
      for (const dir of missing.reverse()) { mkdirSync(dir); createdDirectories.push(dir); }
      const existing = existsSync(destination) ? readFileSync(projectFile(root, relative)) : null;
      if (!Object.hasOwn(plan.expected || {}, relative) || (existing === null ? null : sha256(existing)) !== plan.expected[relative]) throw new Error('Token inputs changed since planning; regenerate the plan');
      const temporary = mkdtempSync(path.join(parent, '.inventory-'));
      const staged = path.join(temporary, 'output.json'); writeFileSync(staged, bytes, { flag: 'wx' });
      prepared.push({ destination, existing, temporary, staged, committed: false });
    }
    for (const item of prepared) {
      const current = existsSync(item.destination) ? readFileSync(item.destination) : null;
      if (item.existing === null ? current !== null : current === null || !item.existing.equals(current)) throw new Error('Token destination changed during save');
    }
    for (const item of prepared) { renameSync(item.staged, item.destination); item.committed = true; }
  } catch (error) {
    for (const item of prepared.filter(p => p.committed).reverse()) {
      if (item.existing === null) rmSync(item.destination); else writeFileSync(item.destination, item.existing);
    }
    throw error;
  } finally {
    for (const item of prepared) rmSync(item.temporary, { recursive: true, force: true });
    for (const directory of createdDirectories.reverse()) { try { rmdirSync(directory); } catch {} }
  }
  return { status: 'SAVED', inventory: plan.inventory, files: Object.keys(plan.outputs), scope: 'Recorded source facts and existing decisions; not rendered verification or persistent inventory linkage.' };
}
