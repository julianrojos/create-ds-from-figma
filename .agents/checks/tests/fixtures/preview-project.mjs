import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { componentCapture, fixtureRenderPlan } from './component-capture.mjs';
import { persistCapture } from '../../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { renderRequirements } from '../../lib/render-plan.mjs';
import { startPreview } from '../../../skills/create-ds-from-figma/scripts/verification-preview.mjs';
import { generateTokensCss } from '../../lib/tokens-css.mjs';

// Synthetic browser fixture, never a real DS import or a Figma fidelity baseline.
export function createPreviewProject({ configured = false, runtimeModules } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ds-preview-fixture-'));
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  symlinkSync(runtimeModules || path.join(repo, 'node_modules'), path.join(root, 'node_modules'));
  const write = (relative, value) => { const file = path.join(root, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };
  const capture = componentCapture({ seeds: [
    { id: '1:2', parentId: null, type: 'COMPONENT', name: 'PreviewGlyph', children: ['1:3'], properties: { width: 48, height: 48,
      absoluteBoundingBox: { x: 100, y: 100, width: 48, height: 48 }, absoluteTransform: [[1, 0, 100], [0, 1, 100]] } },
    { id: '1:3', parentId: '1:2', type: 'TEXT', name: 'Initial', children: [], properties: { characters: 'F', segments: [], width: 12, height: 24,
      textAutoResize: 'WIDTH_AND_HEIGHT', fontSize: 20, lineHeight: { unit: 'PIXELS', value: 24 }, letterSpacing: { unit: 'PIXELS', value: 0 },
      absoluteBoundingBox: { x: 118, y: 112, width: 12, height: 24 }, absoluteTransform: [[1, 0, 118], [0, 1, 112]] } },
  ] });
  const requirements = renderRequirements(capture), verification = fixtureRenderPlan(capture);
  verification.stylesheets = ['src/base.css'];
  const baseline = verification.cases[0]; baseline.props = { initial: 'F' }; baseline.content = { 'FILE:1:3': 'F' };
  for (const letter of ['W', 'M']) verification.cases.push({ ...structuredClone(baseline), id: `wide-${letter}`, kind: 'behavior', baseline: baseline.id,
    props: { initial: letter }, content: { 'FILE:1:3': letter }, expectations: requirements.dimensions.map(d => ({ kind: 'intrinsic-size', observation: d.observation, axis: d.field, part: 'initial', relation: d.field === 'width' ? 'grow' : 'equal', reason: 'Synthetic schema case requires wider text with unchanged line height.' })) });
  const metadataPath = 'design-system/components/PreviewGlyph/metadata.json';
  const metadata = { name: 'PreviewGlyph', description: 'Synthetic intrinsic text fixture.', figma: { fileKey: 'FILE', nodeId: '1:2', url: 'https://www.figma.com/design/FILE?node-id=1-2' }, code: { path: 'src/PreviewGlyph.tsx', component: 'PreviewGlyph' },
    states: [], tokens: [], externalVariables: [], unresolved: [], notApplicable: [], notBuilt: [],
    variants: {}, variantClassification: {}, figmaCoverage: { variants: [], styles: { status: 'captured', source: 'synthetic fixture' } }, styles: [],
    parts: { root: { selector: '.root', nodes: { default: 'FILE:1:2' } }, initial: { selector: '.initial', nodes: { default: 'FILE:1:3' } } },
    bindings: [], measuredLiterals: requirements.typography.map(o => ({ observation: o.observation, source: `FILE:${o.node}`, figmaProperty: o.field,
      part: 'initial', variant: 'default', cssSelector: '.initial', cssProperty: { fontSize: 'font-size', lineHeight: 'line-height', letterSpacing: 'letter-spacing' }[o.field],
      value: `${o.field === 'fontSize' ? o.value : o.value.value}px`, translation: o.field === 'fontSize' ? 'direct' : 'approximate',
      ...(o.field === 'fontSize' ? {} : { reason: 'PIXELS becomes a CSS pixel length.', figmaValue: { source: 'PLUGIN', field: o.field, value: o.value } }) })),
    evidence: { ...persistCapture(root, capture), decisions: [], dispositions: [],
      textDimensions: requirements.dimensions.map(d => ({ ...d, treatment: 'translation', cssSelector: '.initial', cssProperty: d.field })),
      translations: requirements.dimensions.map(d => ({ observations: [d.observation, ...d.observations], cssSelector: '.initial', cssProperty: d.field, reason: 'Inline text uses intrinsic content sizing.' })) }, verification,
  };
  write('package.json', { type: 'module', dependencies: { react: '*', 'react-dom': '*', vite: '*' } });
  write(metadataPath, metadata);
  write('design-system/components/PreviewGlyph/usage.md', '## Figma to code correspondences\n\n```json\n{"schemaVersion":1,"correspondences":[{"caseId":"source-0","status":"candidate"}]}\n```\n');
  write('design-system/relationships/figma-code-map.json', { 'FILE:1:2': { name: 'PreviewGlyph', code: { ...metadata.code, style: 'src/PreviewGlyph.module.css' }, designSystem: { metadata: metadataPath, usage: 'design-system/components/PreviewGlyph/usage.md' }, figma: { fileKey: 'FILE', nodeId: '1:2', refs: ['FILE:1:2'], variants: {} } } });
  write('design-system/inventory.json', { components: ['PreviewGlyph'], screens: [] });
  write('design-system/tokens/Colors.json', { collection: 'Colors', id: 'COL', modes: ['Default'], defaultMode: 'Default', variables: { foreground: { id: 'color-id', cssName: '--ds-color-id', type: 'COLOR', valuesByMode: { Default: '#000000' } } } });
  write('design-system/relationships/figma-state.json', { fileKey: 'FILE', tokenPrefix: 'ds', collections: { COL: { name: 'Colors', modes: ['Default'], varCount: 1, file: 'Colors.json', serialization: {}, modeScopes: {} } },
    variables: { COL: { foreground: { id: 'color-id', type: 'COLOR' } } }, components: { PreviewGlyph: { figmaNodeId: '1:2', nestedComponents: [] } } });
  const generated = generateTokensCss(root);
  if (generated.errors.length) throw new Error(generated.errors.join('\n'));
  write('src/styles/tokens.css', generated.css);
  write('src/PreviewGlyph.tsx', `import styles from "${configured ? '@fixture/PreviewGlyph.module.css' : './PreviewGlyph.module.css'}";\nexport function PreviewGlyph({ initial }: { initial: string }) { return <span data-ds-part="root" className={styles.root}><span data-ds-part="initial" className={styles.initial}>{initial}</span></span>; }`);
  if (configured) write('vite.config.mjs', 'import { fileURLToPath } from "node:url"; export default { resolve: { alias: { "@fixture": fileURLToPath(new URL("./src", import.meta.url)) } } };');
  write('src/PreviewGlyph.module.css', '.root { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border: 1px solid black; border-radius: 50%; }\n.initial { font-family: Arial, sans-serif; font-size: 20px; line-height: 24px; letter-spacing: 0; }');
  write('src/base.css', 'body { margin: 0; padding: 24px; background: white; color: black; }');
  return { root, metadataPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const configured = process.argv.includes('--configured');
  const fixture = createPreviewProject({ configured });
  const preview = await startPreview(fixture.root, fixture.metadataPath, { port: configured ? 5198 : 5199, ...(configured ? { viteConfig: 'vite.config.mjs', approveConfig: true } : {}) });
  console.log(JSON.stringify({ root: fixture.root, directory: preview.directory, cases: preview.urls }, null, 2));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.server.close(); });
}
