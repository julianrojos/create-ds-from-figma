import { captureProfile, extractObservations } from '../../../skills/create-ds-from-figma/scripts/lib/capture-figma.mjs';

export function componentCapture({ seeds, fileKey = 'FILE', rootNodeId = '1:2', variables = [], collections = [], styles = [] } = {}) {
  const profile = captureProfile();
  seeds ||= [
    { id: '1:2', parentId: null, type: 'COMPONENT_SET', name: 'ExampleComponent', children: ['1:3'],
      properties: { componentPropertyDefinitions: { Size: { type: 'VARIANT', variantOptions: ['Small'], defaultValue: 'Small' } } } },
    { id: '1:3', parentId: '1:2', type: 'COMPONENT', name: 'Size=Small', children: [], properties: { variantProperties: { Size: 'Small' } } },
  ];
  const nodes = seeds.map(seed => ({ ...seed, inspected: profile.fields.filter(field => Object.hasOwn(seed.properties, field)),
    notApplicable: profile.fields.filter(field => !Object.hasOwn(seed.properties, field)) }));
  return { schemaVersion: 1, source: { tool: 'use_figma', api: 'PLUGIN', collector: 'capture-figma-v1', fileKey, rootNodeId, requestedNodeId: rootNodeId, revision: null },
    profile: { ...profile, scope: 'component-subtree-and-used-variable-aliases', excluded: ['vector geometry', 'image bytes', 'file-wide variable values', 'CSS and API decisions'] },
    nodes, observations: extractObservations(nodes).observations, variants: nodes.filter(n => n.parentId === rootNodeId && n.type === 'COMPONENT').map(n => ({ nodeId: n.id, key: n.name, properties: n.properties.variantProperties || {} })),
    variables, collections, styles, coverage: { traversal: 'children-recursive-including-hidden-and-instance-descendants', nodeCount: nodes.length, issues: [] } };
}
