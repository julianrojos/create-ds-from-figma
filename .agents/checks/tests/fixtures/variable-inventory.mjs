export function inventoryMock() {
  const collection = { id: 'C', name: 'Color', remote: false, defaultModeId: 'light', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }], variableIds: ['base', 'alias', 'size', 'external-alias'] };
  const remote = { id: 'R', name: 'Remote', remote: true, defaultModeId: 'r', modes: [{ modeId: 'r', name: 'Base' }], variableIds: ['remote'] };
  const variable = (id, type, valuesByMode) => ({ id, name: id, remote: false, variableCollectionId: 'C', resolvedType: type, scopes: ['ALL_SCOPES'], valuesByMode });
  const variables = [variable('base', 'COLOR', { light: { r: 1, g: 0, b: 0, a: 0.5 }, dark: { r: 0, g: 0, b: 0, a: 1 } }),
    variable('alias', 'COLOR', { light: { type: 'VARIABLE_ALIAS', id: 'base' }, dark: { type: 'VARIABLE_ALIAS', id: 'base' } }),
    variable('size', 'FLOAT', { light: 12, dark: 14 }),
    variable('external-alias', 'STRING', { light: { type: 'VARIABLE_ALIAS', id: 'remote' }, dark: { type: 'VARIABLE_ALIAS', id: 'remote' } }),
    { id: 'remote', name: 'Inter', remote: true, variableCollectionId: 'R', resolvedType: 'STRING', scopes: ['FONT_FAMILY'], valuesByMode: { r: 'Inter' } }];
  return { fileKey: 'FILE', variables: { getLocalVariableCollectionsAsync: async () => [collection], getLocalVariablesAsync: async () => variables.filter(v => !v.remote),
    getVariableByIdAsync: async id => variables.find(v => v.id === id), getVariableCollectionByIdAsync: async id => [collection, remote].find(c => c.id === id) } };
}
