// Self-contained so the exact collector can execute in Plugin API without model transcription.
export async function captureInventory(figma, { fileKey }) {
  if (figma.fileKey !== fileKey) throw new Error('Active file identity is unavailable or differs from requested inventory');
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const locals = await figma.variables.getLocalVariablesAsync();
  const collectionMap = new Map(collections.map(c => [c.id, c]));
  const variables = new Map(locals.map(v => [v.id, v]));
  if (collectionMap.size !== collections.length || variables.size !== locals.length || collections.some(c => c.remote !== false) || locals.some(v => v.remote !== false)) throw new Error('Local inventory contains duplicate IDs or non-local entries');
  const localIds = new Set(variables.keys());
  const pending = [...locals];
  for (let i = 0; i < pending.length; i++) {
    const variable = pending[i];
    if (!collectionMap.has(variable.variableCollectionId)) {
      const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
      if (!collection || collection.id !== variable.variableCollectionId) throw new Error(`Collection unavailable or identity differs: ${variable.variableCollectionId}`);
      if (!collection.remote) throw new Error(`Local collection omitted from local inventory: ${collection.id}`);
      collectionMap.set(collection.id, collection);
    }
    for (const value of Object.values(variable.valuesByMode)) {
      if (value?.type !== 'VARIABLE_ALIAS' || variables.has(value.id)) continue;
      const target = await figma.variables.getVariableByIdAsync(value.id);
      if (!target || target.id !== value.id) throw new Error(`Alias target unavailable or identity differs: ${value.id}`);
      // A missing local is an incomplete file inventory, never an external dependency.
      if (!target.remote || localIds.has(target.id)) throw new Error(`Local variable omitted from local inventory: ${target.id}`);
      variables.set(target.id, target); pending.push(target);
    }
  }
  return { schemaVersion: 1, source: { fileKey, collector: 'variable-inventory-v1', api: 'PLUGIN', tool: 'use_figma', revision: null },
    collections: [...collectionMap.values()].map(c => ({ id: c.id, name: c.name, remote: c.remote,
      defaultModeId: c.defaultModeId, modes: c.modes.map(m => ({ modeId: m.modeId, name: m.name })), variableIds: [...c.variableIds] })),
    variables: [...variables.values()].map(v => ({ id: v.id, name: v.name, remote: v.remote,
      collectionId: v.variableCollectionId, type: v.resolvedType, valuesByMode: v.valuesByMode, scopes: [...v.scopes] })) };
}
