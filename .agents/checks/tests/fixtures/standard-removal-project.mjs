import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Extend the synthetic preview fixture without changing other browser fixtures.
export function standardRemovalProject(fixture, { barrel = 'export { PreviewGlyph } from "./PreviewGlyph";\n' } = {}) {
  const directory = 'src/components/PreviewGlyph';
  mkdirSync(path.join(fixture.root, directory), { recursive: true });
  for (const name of ['PreviewGlyph.tsx', 'PreviewGlyph.module.css']) {
    renameSync(path.join(fixture.root, 'src', name), path.join(fixture.root, directory, name));
  }
  for (const file of [fixture.metadataPath, 'design-system/relationships/figma-code-map.json']) {
    const contents = readFileSync(path.join(fixture.root, file), 'utf8')
      .replaceAll('src/PreviewGlyph.tsx', `${directory}/PreviewGlyph.tsx`)
      .replaceAll('src/PreviewGlyph.module.css', `${directory}/PreviewGlyph.module.css`);
    writeFileSync(path.join(fixture.root, file), contents);
  }
  writeFileSync(path.join(fixture.root, directory, 'index.ts'), barrel);
  return { ...fixture, directory, barrel: `${directory}/index.ts`, code: `${directory}/PreviewGlyph.tsx` };
}

export function sharedRemovalExport(fixture, { mapped = true, throughBarrel = false } = {}) {
  const write = (file, value) => {
    const full = path.join(fixture.root, file); mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const read = file => JSON.parse(readFileSync(path.join(fixture.root, file), 'utf8'));
  const sharedCode = `${fixture.directory}/Other.tsx`;
  write(sharedCode, 'export interface OtherProps { disabled?: boolean }; export function Other(props: OtherProps) { return null; }');
  write(fixture.code, readFileSync(path.join(fixture.root, fixture.code), 'utf8') + `\nimport type { OtherProps } from "./${throughBarrel ? 'index' : 'Other'}";\n`);
  write(fixture.barrel, 'export { PreviewGlyph } from "./PreviewGlyph";\nexport { Other } from "./Other";\nexport type { OtherProps } from "./Other";\n');
  if (mapped) {
    const metadata = 'design-system/components/Other/metadata.json', usage = 'design-system/components/Other/usage.md';
    write(metadata, { name: 'Other', code: { path: sharedCode, component: 'Other' }, bindings: [], externalVariables: [], verification: { inputs: [], stylesheets: [], fonts: [], assets: [] } });
    write(usage, '# Usage');
    const mapFile = 'design-system/relationships/figma-code-map.json', map = read(mapFile);
    map['OTHER:2:3'] = { name: 'Other', code: { path: sharedCode, component: 'Other' }, designSystem: { metadata, usage }, figma: { refs: ['OTHER:2:3'], variants: {} } };
    write(mapFile, map);
    const stateFile = 'design-system/relationships/figma-state.json', state = read(stateFile);
    state.components.Other = { figmaNodeId: '2:3', nestedComponents: [] }; write(stateFile, state);
    const inventoryFile = 'design-system/inventory.json', inventory = read(inventoryFile);
    inventory.components.push('Other'); write(inventoryFile, inventory);
  }
  return { ...fixture, sharedCode };
}
