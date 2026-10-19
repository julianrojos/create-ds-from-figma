import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { delegationFixture } from './delegation-fixture.mjs';
import { createPreviewProject } from './preview-project.mjs';
import { persistCapture } from '../../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { delegationDifferences } from '../../lib/delegation-differences.mjs';
import { mappedDelegations } from '../../verify-figma-evidence.mjs';

// An isolated parent verification project. The minimal child's metadata supplies baseline identity, not a delivered DS.
export function createDelegationProject({ runtimeModules } = {}) {
  const { root, metadataPath } = createPreviewProject({ runtimeModules });
  const f = delegationFixture();
  const write = (file, data) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), typeof data === 'string' ? data : JSON.stringify(data)); };
  const childPath = 'design-system/components/Child/metadata.json';
  const child = { name: 'Child', figma: { fileKey: 'FILE', nodeId: '9:1' }, code: { path: 'src/Child.tsx', component: 'Child' }, evidence: persistCapture(root, f.baseline) };
  write('src/Child.tsx', 'export const Child = () => null;');
  write(childPath, child);
  const mapPath = 'design-system/relationships/figma-code-map.json', map = JSON.parse(readFileSync(path.join(root, mapPath)));
  map['FILE:9:1'] = { name: 'Child', figma: { refs: ['FILE:9:1'] }, code: child.code, designSystem: { metadata: childPath } };
  write(mapPath, map);
  Object.assign(f.metadata.evidence, persistCapture(root, f.capture));
  f.metadata.evidence.dispositions[0].differences = delegationDifferences(f.capture, f.metadata, mappedDelegations(root)).records.filter(r => r.status === 'difference').map(r => ({ id: r.id, treatment: 'implemented', part: 'remove', cssProperty: 'background-color', reason: 'Synthetic schema fixture only.' }));
  write(metadataPath, f.metadata);
  return { ...f, root, metadataPath, childPath, child, write };
}
