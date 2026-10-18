export function compositionFixture() {
  const bounds = { x: 40, y: 40, width: 34, height: 34 };
  const shape = id => ({ id, parentId: '1:2', type: 'VECTOR', children: [], properties: { visible: true, opacity: 1, effects: [], fills: [], strokes: [], absoluteBoundingBox: bounds } });
  const capture = { source: { fileKey: 'FILE' }, nodes: [
    { id: '1:2', type: 'COMPONENT', parentId: null, children: ['1:3', '1:4'], properties: { visible: true, opacity: 1, effects: [], layoutMode: 'NONE' } },
    shape('1:3'), shape('1:4'),
  ] };
  const metadata = { evidence: { hash: 'synthetic' }, parts: { root: { nodes: { default: 'FILE:1:2' } }, fill: { nodes: { default: 'FILE:1:3' } }, stroke: { nodes: { default: 'FILE:1:4' } } } };
  const configuration = { id: 'source-0', kind: 'fidelity', figmaRef: 'FILE:1:2', states: [] };
  return { capture, metadata, configuration };
}
