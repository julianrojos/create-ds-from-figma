export function captureProfile() {
  const fields = [
    'width', 'height', 'x', 'y', 'visible', 'opacity', 'rotation', 'layoutMode',
    'layoutSizingHorizontal', 'layoutSizingVertical', 'layoutPositioning',
    'primaryAxisSizingMode', 'counterAxisSizingMode', 'primaryAxisAlignItems',
    'counterAxisAlignItems', 'itemSpacing', 'counterAxisSpacing', 'layoutWrap',
    'itemReverseZIndex', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
    'cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius',
    'fills', 'strokes', 'effects', 'strokeWeight', 'strokeAlign', 'clipsContent',
    'fillStyleId', 'strokeStyleId', 'effectStyleId', 'textStyleId', 'boundVariables',
    'explicitVariableModes', 'resolvedVariableModes', 'componentPropertyReferences',
    'componentProperties', 'variantProperties', 'characters', 'fontName', 'fontSize',
    'fontWeight', 'lineHeight', 'letterSpacing', 'textAlignHorizontal', 'textAlignVertical',
    'textAutoResize', 'reactions',
  ];
  const textFields = ['fontName', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'fills', 'textStyleId', 'fillStyleId', 'boundVariables'];
  return { fields, textFields };
}

export function extractObservations(nodes) {
  const observations = [];
  const variableIds = new Set();
  const styleIds = new Set();
  const observe = (node, field, kind, value, extra = {}) => {
    observations.push({ id: `${node.id}#${field}#${kind}`, node: node.id, field, kind, value, ...extra });
  };
  const binding = (node, field, value) => {
    if (value?.type === 'VARIABLE_ALIAS') {
      variableIds.add(value.id);
      observe(node, field, 'binding', value, { variableId: value.id });
    } else if (Array.isArray(value)) {
      const aliases = value.filter(v => v?.type === 'VARIABLE_ALIAS');
      if (aliases.length && aliases.every(v => v.id === aliases[0].id)) binding(node, field, aliases[0]);
      else value.forEach((v, i) => binding(node, `${field}[${i}]`, v));
    }
  };
  const paintsAndEffects = (node, field, values) => {
    if (!Array.isArray(values)) return;
    values.forEach((value, index) => {
      for (const [property, alias] of Object.entries(value.boundVariables || {})) binding(node, `${field}[${index}].${property}`, alias);
    });
  };
  for (const node of nodes) {
    for (const [field, value] of Object.entries(node.properties)) {
      observe(node, field, 'property', value);
      if (/StyleId$/.test(field) && typeof value === 'string' && value) {
        styleIds.add(value); observe(node, field, 'style', value, { styleId: value });
      }
    }
    for (const [field, value] of Object.entries(node.properties.boundVariables || {})) binding(node, field, value);
    for (const field of ['fills', 'strokes', 'effects']) paintsAndEffects(node, field, node.properties[field]);
    for (const [index, segment] of (node.properties.segments || []).entries()) {
      for (const [field, value] of Object.entries(segment)) {
        if (!['start', 'end', 'characters'].includes(field)) observe(node, `segments[${index}].${field}`, 'property', value, { start: segment.start, end: segment.end });
        if (/StyleId$/.test(field) && typeof value === 'string' && value) {
          styleIds.add(value); observe(node, `segments[${index}].${field}`, 'style', value, { styleId: value, start: segment.start, end: segment.end });
        }
      }
      for (const [field, value] of Object.entries(segment.boundVariables || {})) binding(node, `segments[${index}].${field}`, value);
      paintsAndEffects(node, `segments[${index}].fills`, segment.fills);
    }
  }
  observations.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { observations, variableIds: Array.from(variableIds).sort(), styleIds: Array.from(styleIds).sort() };
}

// Self-contained: the CLI embeds this function unchanged in the Plugin API context.
export async function captureFigma(figma, options, extract = extractObservations, profile = captureProfile()) {
  const previousFilter = figma.skipInvisibleInstanceChildren;
  if (typeof previousFilter !== 'boolean') throw new Error('Cannot verify skipInvisibleInstanceChildren; full instance traversal is unavailable');
  try {
    if (previousFilter) figma.skipInvisibleInstanceChildren = false;
    if (figma.skipInvisibleInstanceChildren !== false) throw new Error('Cannot disable skipInvisibleInstanceChildren; full instance traversal is unavailable');
    return await readCapture();
  } finally {
    if (figma.skipInvisibleInstanceChildren !== previousFilter) figma.skipInvisibleInstanceChildren = previousFilter;
    if (figma.skipInvisibleInstanceChildren !== previousFilter) throw new Error('Cannot restore skipInvisibleInstanceChildren after capture');
  }

  // Keep the read routine inside this function so captureCode can embed it unchanged.
  async function readCapture() {
    const { fields, textFields } = profile;
    const issues = [];
    const clean = value => {
      if (typeof value === 'symbol') return { mixed: true };
      if (value === undefined) return { unavailable: true };
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite value');
      if (Array.isArray(value)) return value.map(clean);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
      return value;
    };
    const read = (owner, field, target) => {
      try { target[field] = clean(owner[field]); }
      catch (error) { issues.push({ node: owner.id, field, reason: String(error.message || error) }); }
    };
    let root = await figma.getNodeByIdAsync(options.nodeId);
    if (!root) throw new Error('Figma node not found');
    if (root.type === 'INSTANCE') {
      root = await root.getMainComponentAsync();
      if (!root || root.remote) throw new Error('Root instance needs a local main component or its origin URL');
    }
    if (root.type === 'COMPONENT' && root.parent?.type === 'COMPONENT_SET') root = root.parent;
    if (!['COMPONENT', 'COMPONENT_SET'].includes(root.type)) throw new Error('Root must be a component or component set');
    if (figma.fileKey && figma.fileKey !== options.fileKey) throw new Error('File key mismatch');
    const nodes = [];
    const visit = async (node, parentId) => {
      const record = { id: node.id, parentId, type: node.type, name: node.name,
        children: [], properties: {}, inspected: [], notApplicable: [] };
      nodes.push(record);
      for (const field of fields) {
        if (field in node) { record.inspected.push(field); read(node, field, record.properties); }
        else record.notApplicable.push(field);
      }
      if (node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && node.parent?.type !== 'COMPONENT_SET')) {
        record.inspected.push('componentPropertyDefinitions');
        read(node, 'componentPropertyDefinitions', record.properties);
      }
      if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') read(node, 'key', record.properties);
      if (node.type === 'INSTANCE') {
        record.inspected.push('mainComponent');
        try {
          const main = await node.getMainComponentAsync();
          record.properties.mainComponent = main ? { id: main.id, key: main.key, remote: main.remote } : null;
          if (!main) issues.push({ node: node.id, field: 'mainComponent', reason: 'Main component unavailable' });
        } catch (error) { issues.push({ node: node.id, field: 'mainComponent', reason: String(error.message || error) }); }
      }
      if (node.type === 'TEXT') {
        record.inspected.push('segments');
        try { record.properties.segments = clean(node.getStyledTextSegments(textFields)); }
        catch (error) { issues.push({ node: node.id, field: 'segments', reason: String(error.message || error) }); }
      }
      if ('children' in node) {
        try {
          const children = Array.from(node.children);
          record.children = children.map(child => child.id);
          for (const child of children) await visit(child, node.id);
        } catch (error) { issues.push({ node: node.id, field: 'children', reason: String(error.message || error) }); }
      }
    };
    await visit(root, null);
    const { observations, variableIds, styleIds } = extract(nodes);
    const styles = [];
    for (const id of Array.from(styleIds).sort()) {
      try {
        const style = await figma.getStyleByIdAsync(id);
        if (!style) throw new Error('Style unavailable');
        const record = { id: style.id, name: style.name, type: style.type, key: style.key, remote: style.remote, properties: {} };
        for (const field of ['fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'effects', 'paints']) {
          if (field in style) read(style, field, record.properties);
        }
        styles.push(clean(record));
      } catch (error) { issues.push({ node: root.id, field: `styles.${id}`, reason: String(error.message || error) }); }
    }
    const collections = [];
    try {
      for (const c of await figma.variables.getLocalVariableCollectionsAsync()) {
        collections.push(clean({ id: c.id, name: c.name, modes: c.modes, defaultModeId: c.defaultModeId, variableIds: c.variableIds }));
      }
    } catch (error) { issues.push({ node: root.id, field: 'collections', reason: String(error.message || error) }); }
    const variables = [];
    // Follow aliases in every mode, including remote dependencies. This is not the file-level token dump.
    const pending = Array.from(variableIds).sort();
    const visited = new Set();
    while (pending.length) {
      const id = pending.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      try {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (!v) throw new Error('Variable unavailable');
        variables.push(clean({ id: v.id, name: v.name, type: v.resolvedType,
          collectionId: v.variableCollectionId, remote: v.remote, valuesByMode: v.valuesByMode }));
        if (!collections.some(c => c.id === v.variableCollectionId)) {
          const c = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
          if (!c) throw new Error('Variable collection unavailable');
          collections.push(clean({ id: c.id, name: c.name, modes: c.modes, defaultModeId: c.defaultModeId, variableIds: c.variableIds, remote: c.remote }));
        }
        for (const value of Object.values(v.valuesByMode)) if (value?.type === 'VARIABLE_ALIAS') pending.push(value.id);
      } catch (error) { issues.push({ node: root.id, field: `variables.${id}`, reason: String(error.message || error) }); }
    }
    const variants = root.type === 'COMPONENT_SET'
      ? nodes.filter(n => n.parentId === root.id && n.type === 'COMPONENT').map(n => ({ nodeId: n.id, key: n.name, properties: n.properties.variantProperties || {} })) : [];
    return { schemaVersion: 1, source: { tool: 'use_figma', api: 'PLUGIN', collector: 'capture-figma-v1',
      fileKey: options.fileKey, requestedNodeId: options.nodeId, rootNodeId: root.id, revision: null },
      profile: { fields, textFields, scope: 'component-subtree-and-used-variable-aliases', excluded: ['vector geometry', 'image bytes', 'file-wide variable values', 'CSS and API decisions'] },
      variants, nodes, observations, collections, variables, styles,
      coverage: { traversal: 'children-recursive-including-hidden-and-instance-descendants', nodeCount: nodes.length, issues } };
  }
}

// A transport consistency check, not an authenticity proof or a Figma revision.
export function transportChecksum(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
