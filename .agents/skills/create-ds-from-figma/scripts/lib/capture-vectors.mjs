// Self-contained so the exact collector can execute in Plugin API without model transcription.
export async function captureVectors(figma, { fileKey, nodeId }) {
  if (figma.fileKey !== fileKey) throw new Error('Active file identity is unavailable or differs from requested vector export');
  const root = await figma.getNodeByIdAsync(nodeId);
  if (!root) throw new Error('Requested node is unavailable');
  const kinds = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE']), found = [];
  const visit = node => { if (kinds.has(node.type)) found.push(node); if (Array.isArray(node.children)) for (const child of node.children) visit(child); };
  visit(root);
  const ids = new Set(found.map(node => node.id));
  if (ids.size !== found.length) throw new Error('Duplicate vector node IDs');
  const vectors = [];
  for (const node of found) {
    if (typeof node.exportAsync !== 'function') throw new Error(`Vector node cannot be exported: ${node.id}`);
    const svg = await node.exportAsync({ format: 'SVG_STRING' });
    // The exported SVG is cropped to what the node renders (renderBounds); the layout box (bounds) can be larger. Both locate it.
    const box = node.absoluteBoundingBox, render = node.absoluteRenderBounds;
    const rect = r => r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    vectors.push({ id: node.id, name: node.name, type: node.type, visible: node.visible !== false, width: node.width, height: node.height,
      bounds: rect(box), renderBounds: rect(render), svg });
  }
  return { schemaVersion: 1, source: { fileKey, nodeId, collector: 'vector-export-v1', api: 'PLUGIN', tool: 'use_figma', revision: null }, vectors };
}
