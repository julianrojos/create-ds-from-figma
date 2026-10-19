import { componentCapture, fixtureRenderPlan } from './component-capture.mjs';
import { captureHash } from '../../lib/figma-evidence.mjs';

// Synthetic parent/child observations, never captured from a user's design.
export function delegationFixture({ changed = true } = {}) {
  const paint = id => [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id } } }];
  const collections = [{ id: 'COL', defaultModeId: 'light', modes: [{ modeId: 'light', name: 'Light' }, { modeId: 'dark', name: 'Dark' }] }];
  const variables = ['base', 'on-brand'].map(id => ({ id, collectionId: 'COL', type: 'COLOR', valuesByMode: { light: { r: 0.1, g: 0.1, b: 0.1, a: 1 }, dark: { r: 1, g: 1, b: 1, a: 1 } } }));
  const properties = (x, y, width, height) => ({ width, height, visible: true, opacity: 1, absoluteBoundingBox: { x, y, width, height }, absoluteTransform: [[1, 0, x], [0, 1, y]], resolvedVariableModes: { COL: 'light' }, boundVariables: {}, fills: [], strokes: [] });
  const baseline = componentCapture({ rootNodeId: '9:1', collections, variables, seeds: [
    { id: '9:1', parentId: null, type: 'COMPONENT', name: 'Child', children: ['9:2'], properties: { ...properties(0, 0, 16, 16), key: 'child-key' } },
    { id: '9:2', parentId: '9:1', type: 'VECTOR', name: 'Glyph', children: [], properties: { ...properties(4, 4, 8, 8), strokes: paint('base') } },
  ] });
  const capture = componentCapture({ collections, variables, seeds: [
    { id: '1:2', parentId: null, type: 'COMPONENT', name: 'PreviewGlyph', children: ['2:1'], properties: properties(0, 0, 48, 48) },
    { id: '2:1', parentId: '1:2', type: 'INSTANCE', name: 'Remove', children: ['I2:1;9:2'], properties: { ...properties(8, 8, 16, 16), componentProperties: {}, mainComponent: { id: '9:1', key: 'child-key', remote: false } } },
    { id: 'I2:1;9:2', parentId: '2:1', type: 'VECTOR', name: 'Glyph', children: [], properties: { ...properties(12, 12, 8, 8), strokes: paint(changed ? 'on-brand' : 'base') } },
  ] });
  const metadata = { name: 'PreviewGlyph', figma: { fileKey: 'FILE', nodeId: '1:2' }, figmaCoverage: { variants: [], styles: { status: 'captured' } }, variants: {}, variantClassification: {},
    code: { path: 'src/PreviewGlyph.tsx', component: 'PreviewGlyph' }, parts: { root: { selector: '.root', nodes: { default: 'FILE:1:2' } }, remove: { selector: '.remove', nodes: { default: 'FILE:2:1' } } },
    bindings: [], measuredLiterals: [], styles: [], states: [], tokens: [], externalVariables: [], unresolved: [], notApplicable: [], notBuilt: [],
    evidence: { hash: captureHash(capture), dispositions: [{ kind: 'delegated', instance: 'FILE:2:1', resolvedComponent: 'Child', configuration: {}, reason: 'Synthetic child reused.', differences: [] }], decisions: [], translations: [], textDimensions: [] },
    verification: fixtureRenderPlan(capture) };
  const mappedComponents = [{ name: 'Child', refs: ['FILE:9:1'], capture: baseline, hash: captureHash(baseline), snapshot: 'design-system/figma/snapshots/child.json' }];
  return { capture, baseline, metadata, mappedComponents, configuration: metadata.verification.cases[0] };
}
