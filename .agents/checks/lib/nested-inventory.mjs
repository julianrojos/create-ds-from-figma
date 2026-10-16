import { sealCapture } from './figma-evidence.mjs';
import { entryRefs } from './figma-map.mjs';

export function nestedInventory(snapshot, map) {
  if (snapshot?.hash !== sealCapture(snapshot.capture).hash) throw new Error('Nested inventory snapshot hash mismatch');
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Expected a component map object');
  const capture = snapshot.capture, fileKey = capture.source.fileKey;
  const entries = Object.entries(map).filter(([key, value]) => !key.startsWith('_') && value && typeof value === 'object' && !Array.isArray(value));
  return { snapshotHash: snapshot.hash, instances: capture.nodes.filter(n => n.type === 'INSTANCE').map(node => {
    const main = node.properties.mainComponent;
    const refs = main ? [...(main.remote === false && /^\d+:\d+$/.test(main.id) ? [`${fileKey}:${main.id}`] : []),
      ...(typeof main.key === 'string' && main.key.trim() ? [`componentKey:${main.key}`] : [])] : [];
    const matches = entries.filter(([key, entry]) => refs.some(ref => entryRefs(key, entry).includes(ref)));
    const identityKnown = refs.length > 0 && typeof main?.remote === 'boolean';
    const status = !identityKnown || matches.length > 1 ? 'unresolved' : matches.length === 1 ? 'mapped' : main.remote ? 'external' : 'missing';
    return { instance: `${fileKey}:${node.id}`, refs, status,
      ...(status === 'mapped' ? { resolvedComponent: matches[0][1].name || matches[0][0] } : {}),
      reason: !identityKnown ? 'Stable identity or provenance unavailable; do not infer from name.' : matches.length > 1 ? 'Stable refs match multiple map entries.' :
        status === 'missing' ? 'Proven local component has no map entry; import it first.' : status === 'external' ? 'Proven remote component has no map entry.' : 'Stable identity matches one map entry.' };
  }), scope: 'Read-only diagnosis against this snapshot and map; no mapping or imported component is created.' };
}
