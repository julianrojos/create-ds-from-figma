import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { caseInputs, configurationHash } from '../../lib/comparison-evidence.mjs';
import { publishMeasurement } from '../../lib/publish-measurement.mjs';
import { sha256 } from '../../lib/render-plan.mjs';
import { MEASUREMENT_VERSION } from '../../lib/measurement-version.mjs';

// Synthetic schema fixtures, not genuine browser/Figma fidelity evidence.
export function renderedArtifacts(root, metadata, configuration, { mutateBody } = {}) {
  const capturedAt = '2026-10-14T12:00:00.000Z';
  const prefix = `design-system/verification/artifacts/${configuration.id}`;
  mkdirSync(path.join(root, prefix), { recursive: true });
  const capture = JSON.parse(readFileSync(path.join(root, metadata.evidence.snapshot))).capture;
  const key = Object.keys(metadata.parts.root.nodes).find(k => metadata.parts.root.nodes[k] === configuration.figmaRef);
  const parts = Object.fromEntries(Object.entries(metadata.parts).map(([part, mapping]) => {
    const node = capture.nodes.find(n => `${capture.source.fileKey}:${n.id}` === mapping.nodes[key]);
    const bounds = node?.properties.absoluteBoundingBox || { x: 0, y: 0, width: 48, height: 48 };
    const text = configuration.content?.[mapping.nodes[key]] ?? node?.properties.characters ?? 'F';
    const measured = configuration.kind === 'behavior' && node?.type === 'TEXT' ? { ...bounds, x: bounds.x - 4, width: bounds.width + 8 } : bounds;
    return [part, { count: 1, elements: [{ text, rect: measured,
      geometry: { visible: true, laidOut: true, axisAligned: true, affine2d: true }, computed: { width: `${bounds.width}px` } }] }];
  }));
  const body = { schemaVersion: 2, measurementVersion: MEASUREMENT_VERSION, kind: 'browser-measurement', producer: 'verification-preview-v2', capturedAt,
    snapshotHash: metadata.evidence.hash, caseId: configuration.id, configuration, viewport: configuration.viewport,
    url: `http://127.0.0.1:5199/__ds_verification?case=${configuration.id}`, fonts: [], images: [],
    parts };
  mutateBody?.(body);
  writeFileSync(path.join(root, prefix, 'browser.json'), JSON.stringify(body));
  const original = readFileSync(path.join(root, prefix, 'browser.json'));
  const receiptPath = path.join(root, prefix, 'browser.receipt.json');
  const inputs = caseInputs(root, metadata, configuration);
  writeFileSync(receiptPath, JSON.stringify({ status: 'NOT VERIFIED', measurementVersion: body.measurementVersion, snapshotHash: metadata.evidence.hash, caseId: configuration.id, configuration,
    body: { file: 'browser.json', sha256: sha256(original), bytes: original.length }, inputsUnchangedSinceStart: true, viewportMatches: true,
    metadataHash: inputs.metadataHash,
    files: [...inputs.files, inputs.metadataPath].map(file => ({ path: file, sha256: sha256(readFileSync(path.join(root, file))) })) }));
  const browser = publishMeasurement(root, metadata, configuration.id, receiptPath);
  writeFileSync(path.join(root, prefix, 'figma.png'), PNG.sync.write(new PNG({ width: 48, height: 48 }))); // The fixture variant measures 48x48 at scale 1.
  const provenance = { capturedAt, caseId: configuration.id, snapshotHash: metadata.evidence.hash, configurationHash: configurationHash(configuration) };
  return [
    browser,
    { kind: 'figma-screenshot', path: `${prefix}/figma.png`, export: { scope: 'node-bounds', scale: 1 }, image: { width: 48, height: 48, dimensionComparison: 'WITHIN_ONE_PIXEL_OF_NODE_BOUNDS' }, provenance: { ...provenance, tool: 'synthetic-figma-tool', figmaRef: configuration.figmaRef } },
  ];
}

export function renderedBehaviors(root, metadata, baseline) {
  return metadata.verification.cases.filter(c => c.kind === 'behavior' && c.baseline === baseline.id)
    .map(c => ({ caseId: c.id, artifact: renderedArtifacts(root, metadata, c)[0] }));
}
