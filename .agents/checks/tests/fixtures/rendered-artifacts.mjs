import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { caseInputs, configurationHash } from '../../lib/comparison-evidence.mjs';
import { publishMeasurement } from '../../lib/publish-measurement.mjs';
import { sha256 } from '../../lib/render-plan.mjs';

// Synthetic schema fixtures, not genuine browser/Figma fidelity evidence.
export function renderedArtifacts(root, metadata, configuration) {
  const capturedAt = '2026-10-14T12:00:00.000Z';
  const prefix = `design-system/verification/artifacts/${configuration.id}`;
  mkdirSync(path.join(root, prefix), { recursive: true });
  const body = { schemaVersion: 1, kind: 'browser-measurement', producer: 'verification-preview-v1', capturedAt,
    snapshotHash: metadata.evidence.hash, caseId: configuration.id, configuration, viewport: configuration.viewport,
    url: `http://127.0.0.1:5199/__ds_verification?case=${configuration.id}`, fonts: [], images: [],
    parts: { root: { count: 1, elements: [{ text: 'F', rect: { x: 0, y: 0, width: 48, height: 48 }, computed: { width: '48px' } }] } } };
  writeFileSync(path.join(root, prefix, 'browser.json'), JSON.stringify(body));
  const original = readFileSync(path.join(root, prefix, 'browser.json'));
  const receiptPath = path.join(root, prefix, 'browser.receipt.json');
  const inputs = caseInputs(root, metadata, configuration);
  writeFileSync(receiptPath, JSON.stringify({ status: 'NOT VERIFIED', snapshotHash: metadata.evidence.hash, caseId: configuration.id, configuration,
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
