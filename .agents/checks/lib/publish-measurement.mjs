import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalJson } from './figma-evidence.mjs';
import { projectFile, sha256 } from './render-plan.mjs';
import { readArtifact, validateBrowserMeasurement, validateMeasurementInputs } from './comparison-evidence.mjs';
import { createDependencySession } from './local-dependencies.mjs';

export function publishMeasurement(root, metadata, caseId, receiptPath) {
  const dependencySession = createDependencySession(root);
  const configuration = metadata.verification?.cases.find(c => c.id === caseId);
  if (!configuration) throw new Error('Unknown measurement case');
  const receiptBytes = readFileSync(receiptPath), receipt = JSON.parse(receiptBytes);
  if (receipt.status !== 'NOT VERIFIED' || receipt.snapshotHash !== metadata.evidence.hash || receipt.caseId !== caseId || canonicalJson(receipt.configuration) !== canonicalJson(configuration) || receipt.inputsUnchangedSinceStart !== true || receipt.viewportMatches !== true || !Array.isArray(receipt.files) || !receipt.files.length) throw new Error('Receipt must identify the exact unchanged case and viewport');
  const bodyName = receipt.body?.file;
  if (typeof bodyName !== 'string' || path.basename(bodyName) !== bodyName || !bodyName.endsWith('.json')) throw new Error('Receipt body must be a sibling JSON file');
  const directory = realpathSync(path.dirname(receiptPath)), source = realpathSync(path.join(directory, bodyName));
  if (path.dirname(source) !== directory) throw new Error('Receipt body escapes receipt directory');
  const bytes = readFileSync(source), hash = sha256(bytes);
  if (receipt.body.sha256 !== hash || receipt.body.bytes !== bytes.length) throw new Error('Receipt body hash/size mismatch');
  validateMeasurementInputs(root, receipt, metadata, configuration, { dependencySession });
  const body = JSON.parse(bytes);
  if (body.snapshotHash !== metadata.evidence.hash || canonicalJson(body.configuration) !== canonicalJson(configuration) || body.caseId !== caseId || body.kind !== 'browser-measurement') throw new Error('Measurement body differs from receipt case');
  validateBrowserMeasurement(body, metadata, configuration);
  const base = realpathSync(root), ds = realpathSync(path.join(base, 'design-system'));
  if (!ds.startsWith(base + path.sep)) throw new Error('Publication directory escapes project');
  let parent = ds;
  for (const segment of ['verification', 'artifacts']) {
    parent = path.join(parent, segment);
    if (!existsSync(parent)) mkdirSync(parent);
    if (!realpathSync(parent).startsWith(ds + path.sep)) throw new Error('Publication directory escapes design-system');
  }
  const save = (name, original) => {
    const relative = `design-system/verification/artifacts/${name}`, output = path.join(base, relative);
    if (existsSync(output)) { if (!readFileSync(projectFile(root, relative)).equals(original)) throw new Error('Immutable publication differs'); }
    else writeFileSync(output, original, { flag: 'wx' });
    if (sha256(readFileSync(projectFile(root, relative))) !== sha256(original)) throw new Error('Publication transfer hash mismatch');
    return { path: relative, sha256: sha256(original) };
  };
  // Preserve both original body and original receipt; neither is reserialized.
  const publication = save(`${sha256(receiptBytes)}.receipt.json`, receiptBytes);
  const artifact = { kind: 'browser-measurement', ...save(`${hash}.measurement.json`, bytes), publication };
  return readArtifact(root, artifact, metadata, configuration, { derive: true, dependencySession });
}
