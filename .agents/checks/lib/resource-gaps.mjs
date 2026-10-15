import { caseFonts, caseNodes, controlledBy, referencesOf } from './render-comparison.mjs';
import { renderRequirements } from './render-plan.mjs';

export function essentialFontGaps(capture, metadata) {
  const gaps = new Map();
  for (const configuration of metadata.verification?.cases || []) {
    for (const requirement of caseFonts(capture, configuration)) {
      const record = metadata.verification.fonts.find(font => font.id === requirement.id);
      if (record?.source?.kind === 'file') continue;
      if (!gaps.has(requirement.id)) gaps.set(requirement.id, { id: requirement.id, font: requirement.font, css: record?.css,
        reason: record?.source?.reason || 'No authorized font source recorded', cases: [],
        action: 'Ask the user for an authorized font file or source; do not infer a package from the family name.' });
      gaps.get(requirement.id).cases.push(configuration.id);
    }
  }
  return [...gaps.values()];
}

// An image fill is essential when a case can render it: the node is inside the case, no ancestor is permanently hidden or transparent
// (a behavior case may reveal a node only through a `visible` component property), and the paint itself is neither hidden nor transparent.
export function essentialAssetGaps(capture, metadata) {
  const gaps = new Map(), requirements = renderRequirements(capture).assets;
  for (const configuration of metadata.verification?.cases || []) {
    const scope = caseNodes(capture, configuration);
    const rendered = start => {
      for (let id = start; id !== undefined && scope.selected.has(id); id = scope.nodes.get(id).parentId) {
        const properties = scope.nodes.get(id).properties;
        if (properties.opacity === 0) return false;
        if (properties.visible === false && (configuration.kind !== 'behavior' || !controlledBy(referencesOf(scope, id), 'visible'))) return false;
        if (id === scope.rootId) break;
      }
      return true;
    };
    for (const requirement of requirements) {
      const observation = capture.observations.find(o => o.id === requirement.observation), paint = observation?.value?.[requirement.index];
      if (!observation || !scope.selected.has(observation.node) || paint?.visible === false || paint?.opacity === 0 || !rendered(observation.node)) continue;
      const key = `${requirement.observation}:${requirement.index}`, record = metadata.verification.assets?.find(asset => asset.observation === requirement.observation && asset.index === requirement.index);
      if (record?.source?.kind === 'file') continue;
      if (!gaps.has(key)) gaps.set(key, { observation: requirement.observation, index: requirement.index, imageHash: requirement.imageHash,
        reason: record?.source?.reason || 'No authorized image source recorded', cases: [],
        action: 'Ask the user for an authorized image file or export; do not invent or substitute an image.' });
      gaps.get(key).cases.push(configuration.id);
    }
  }
  return [...gaps.values()];
}
