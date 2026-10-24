import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { canonicalJson, loadSnapshot } from './figma-evidence.mjs';
import { projectFile, renderRequirements, sha256 } from './render-plan.mjs';
import { localDependencies } from './local-dependencies.mjs';
import { StaleEvidenceError, UnverifiedEvidenceError } from './evidence-status.mjs';
import { caseFonts, compareRendered } from './render-comparison.mjs';
import { MEASUREMENT_VERSION, isMeasurementVersion } from './measurement-version.mjs';
import { collectCssDiagnostics, compareCssDiagnostics } from './css-diagnostics.mjs';
import { delegationDifferences, delegationFacts } from './delegation-differences.mjs';
import { mappedComponentsOf, mappedDelegations } from '../verify-figma-evidence.mjs';
import { evidenceSessionFor } from './evidence-session.mjs';

const text = v => typeof v === 'string' && v.trim().length > 0;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = v => Array.isArray(v) ? v : [];
// Absorbs floor/round/ceil differences of fractional bounds; it does not prove the PNG shows the node.
export const DIMENSION_TOLERANCE = 1;
export const configurationHash = configuration => sha256(canonicalJson(configuration));

export function renderedChecks(root, metadata, configuration, artifacts, { baselineMeasurement, ...options } = {}) {
  const evidenceSession = evidenceSessionFor(root, options), context = { ...options, evidenceSession };
  const { capture } = loadSnapshot(root, metadata.evidence.snapshot, context);
  const browser = artifacts.find(a => a.kind === 'browser-measurement');
  const measurement = browser ? JSON.parse(readFileSync(projectFile(root, browser.path), 'utf8')) : undefined;
  for (const font of caseFonts(capture, configuration)) {
    const source = metadata.verification?.fonts?.find(f => f.id === font.id)?.source;
    if (source?.kind === 'file') checkInputHash(root, { path: source.path, sha256: source.sha256 });
  }
  const result = compareRendered(capture, metadata, configuration, measurement, { baselineMeasurement, mappedComponents: mappedDelegations(root, metadata, context) });
  const inputs = caseInputs(root, metadata, configuration, undefined, context);
  const syntax = collectCssDiagnostics(root, inputs.files);
  result.checks.push(...compareCssDiagnostics(syntax, measurement));
  result.summary = Object.fromEntries(['PASS', 'FAIL', 'NOT COMPARABLE', 'NOT RUN'].map(status => [status, result.checks.filter(c => c.status === status).length]));
  return result;
}

export function validateBrowserMeasurement(body, metadata, configuration) {
  if (!isMeasurementVersion(body.measurementVersion)) throw new Error('Original measurement rules version required');
  const elements = body.parts?.root?.elements;
  if (body.schemaVersion !== 2 || body.kind !== 'browser-measurement' || body.producer !== 'verification-preview-v2' || !/^\d{4}-\d{2}-\d{2}T/.test(body.capturedAt || '') || !Number.isFinite(Date.parse(body.capturedAt)) || body.caseId !== configuration.id || body.snapshotHash !== metadata.evidence.hash || canonicalJson(body.configuration) !== canonicalJson(configuration) || !text(body.url) || body.viewport?.width !== configuration.viewport?.width || body.viewport?.height !== configuration.viewport?.height || body.parts?.root?.count !== 1 || !Array.isArray(elements) || elements.length !== 1 || !Array.isArray(body.fonts) || !Array.isArray(body.images)) throw new Error('Browser artifact is not an original measurement of the exact case/viewport');
  for (const part of Object.values(body.parts)) {
    if (!object(part) || !Array.isArray(part.elements) || part.count !== part.elements.length) throw new Error('Browser artifact has invalid part counts');
    for (const e of part.elements) if (typeof e.text !== 'string' || !object(e.computed) || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(e.rect?.[k])) || e.rect.width < 0 || e.rect.height < 0 || !['visible', 'laidOut', 'axisAligned'].every(k => typeof e.geometry?.[k] === 'boolean')) throw new Error('Browser artifact has invalid rendered geometry');
  }
}

export function caseInputs(root, metadata, configuration, style, options = {}) {
  const { dependencySession } = options, evidenceSession = evidenceSessionFor(root, options);
  const map = evidenceSession.json('design-system/relationships/figma-code-map.json');
  const entries = Object.entries(map).filter(([key, entry]) => !key.startsWith('_') && entry?.code?.path === metadata.code.path && entry.code.component === metadata.code.component);
  if (entries.length !== 1) throw new Error('Examined component must resolve uniquely in the component map');
  const mappedStyle = entries[0][1].code.style;
  if (style !== undefined && style !== mappedStyle) throw new Error('Examined CSS differs from the component map');
  const { capture } = loadSnapshot(root, metadata.evidence.snapshot, { evidenceSession });
  const nodes = new Map(capture.nodes.map(n => [n.id, n])), ids = new Set();
  const visit = id => { if (ids.has(id)) return; ids.add(id); for (const child of nodes.get(id)?.children || []) visit(child); };
  visit(configuration.figmaRef.slice(capture.source.fileKey.length + 1));
  const observations = new Set(capture.observations.filter(o => ids.has(o.node)).map(o => o.id));
  const refs = new Set([...ids].map(id => `${capture.source.fileKey}:${id}`));
  const names = new Set((metadata.evidence?.dispositions || []).filter(d => d.kind === 'delegated').map(d => d.resolvedComponent));
  const delegation = delegationDifferences(capture, metadata, names.size ? mappedComponentsOf(root, Object.entries(map).filter(([key]) => !key.startsWith('_')), { evidenceSession, names }) : []);
  const delegated = delegation.records.filter(r => refs.has(r.instance)).map(delegationFacts);
  const delegatedInputs = delegation.dependencies.filter(d => refs.has(d.instance));
  const requirements = renderRequirements(capture);
  const fontIds = new Set(requirements.fonts.filter(f => f.observations.some(id => observations.has(id))).map(f => f.id));
  const fonts = list(metadata.verification?.fonts).filter(f => fontIds.has(f.id));
  const assets = list(metadata.verification?.assets).filter(a => observations.has(a.observation));
  const variants = Object.keys(metadata.parts?.root?.nodes || {}).filter(k => refs.has(metadata.parts.root.nodes[k]));
  const parts = Object.fromEntries(Object.entries(metadata.parts || {}).flatMap(([name, part]) => {
    const selected = Object.fromEntries(Object.entries(part.nodes || {}).filter(([k, ref]) => variants.includes(k) && refs.has(ref)));
    return Object.keys(selected).length ? [[name, { selector: part.selector, nodes: selected }]] : [];
  }));
  const omitProse = record => Object.fromEntries(Object.entries(record).filter(([k]) => !['reason', 'styleOriginSource'].includes(k)));
  const variant = capture.variants.find(v => `${capture.source.fileKey}:${v.nodeId}` === configuration.figmaRef);
  const classification = Object.fromEntries(Object.entries(variant?.properties || {}).map(([axis, value]) => [axis, metadata.variantClassification?.[axis]?.[value]]));
  const stateNames = new Set([...list(configuration.states).map(s => s.name), ...Object.values(variant?.properties || {})].filter(text).map(n => n.toLowerCase()));
  const resource = r => ({ ...r, source: object(r.source) ? Object.fromEntries(Object.entries(r.source).filter(([k]) => k !== 'reason')) : r.source });
  const state = evidenceSession.json('design-system/relationships/figma-state.json');
  const usedIds = new Set(capture.variables.map(v => v.id));
  const collectionState = Object.fromEntries(capture.collections.filter(c => state.collections?.[c.id]).map(c => {
    const record = state.collections[c.id];
    return [c.id, { file: record.file, modeScopes: record.modeScopes,
      serialization: Object.fromEntries(Object.entries(record.serialization || {}).filter(([id]) => usedIds.has(id))) }];
  }));
  const semantic = { snapshotHash: metadata.evidence.hash, configuration, code: metadata.code, parts, classification, delegated, delegatedInputs,
    bindings: list(metadata.bindings).filter(b => refs.has(b.node)).map(omitProse),
    literals: list(metadata.measuredLiterals).filter(l => refs.has(l.source)).map(omitProse),
    dimensions: list(metadata.evidence?.textDimensions).filter(d => observations.has(d.observation)).map(omitProse),
    translations: list(metadata.evidence?.translations).filter(t => list(t.observations).some(id => observations.has(id))).map(omitProse),
    dispositions: list(metadata.evidence?.dispositions).filter(d => refs.has(d.instance) || list(d.observations).some(id => observations.has(id))).map(d => ({ ...omitProse(d),
      ...(Array.isArray(d.differences) ? { differences: d.differences.map(omitProse) } : {}) })),
    states: list(metadata.states).filter(s => stateNames.has(s.name?.toLowerCase())).map(omitProse),
    fonts: fonts.map(resource), assets: assets.map(resource), stylesheets: metadata.verification?.stylesheets, inputs: metadata.verification?.inputs,
    geometryPolicy: metadata.verification?.geometryPolicy,
    nodeCoverage: list(metadata.verification?.nodeCoverage).filter(r => refs.has(r.node)).map(omitProse),
    associatedBehavior: configuration.kind === 'fidelity' ? list(metadata.verification?.cases).filter(c => c.kind === 'behavior' && c.baseline === configuration.id) : [],
    mappedCode: entries[0][1].code,
    componentState: state.components?.[metadata.name], collectionState,
    externalSerialization: Object.fromEntries(Object.entries(state.externalSerialization || {}).filter(([id]) => usedIds.has(id))),
    externalVariables: list(metadata.externalVariables).filter(v => usedIds.has(v.id)),
  };
  const seeds = [metadata.code.path, metadata.evidence.snapshot, mappedStyle, ...list(metadata.verification?.stylesheets), ...list(metadata.verification?.inputs),
    ...delegatedInputs.map(d => d.snapshot),
    ...[...fonts, ...assets].filter(r => r.source?.kind === 'file').map(r => r.source.path),
    ...Object.values(collectionState).map(c => `design-system/tokens/${c.file}`)];
  const dependencies = dependencySession ? dependencySession.resolve(seeds) : localDependencies(root, seeds);
  return { metadataHash: sha256(canonicalJson(semantic)), metadataPath: entries[0][1].designSystem?.metadata, ...dependencies };
}

export function validateMeasurementInputs(root, receipt, metadata, configuration, options = {}) {
  if (!isMeasurementVersion(receipt.measurementVersion)) throw new Error('Original receipt measurement rules version required');
  if (receipt.measurementVersion !== MEASUREMENT_VERSION) throw new StaleEvidenceError(`Measurement rules version changed: ${receipt.measurementVersion} -> ${MEASUREMENT_VERSION}`);
  const inputs = caseInputs(root, metadata, configuration, undefined, options);
  if (receipt.metadataHash !== inputs.metadataHash) throw new StaleEvidenceError('Stale measurement decisions for this configuration');
  if (inputs.warnings.length) throw new UnverifiedEvidenceError(inputs.warnings.join('; '));
  if (!Array.isArray(receipt.files) || !receipt.files.length) throw new Error('Measurement input hashes required');
  const recorded = new Set();
  for (const file of receipt.files) {
    if (!object(file) || !text(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || recorded.has(file.path)) throw new Error('Unique measurement input paths and SHA-256 required');
    recorded.add(file.path);
    // Metadata prose is audit-only; the relevant decisions are covered by metadataHash.
    if (file.path !== inputs.metadataPath) checkInputHash(root, file);
  }
  for (const file of inputs.files) if (!recorded.has(file)) throw new StaleEvidenceError(`Measurement input not recorded: ${file}`);
}

export function checkInputHash(root, file) {
  try { if (sha256(readFileSync(projectFile(root, file.path))) !== file.sha256) throw new StaleEvidenceError(`Measurement input changed: ${file.path}`); }
  catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw new StaleEvidenceError(`Measurement input missing: ${file.path}`); throw error; }
}

export function readArtifact(root, artifact, metadata, configuration, { derive = false, checkCurrentInputs = true, ...options } = {}) {
  if (!object(artifact) || !['browser-measurement', 'figma-screenshot'].includes(artifact.kind) || !text(artifact.path) || !artifact.path.startsWith('design-system/verification/artifacts/')) throw new Error('Typed rendered artifact must live under design-system/verification/artifacts');
  const artifactFile = relative => {
    const file = projectFile(root, relative);
    if (!file.startsWith(path.join(realpathSync(root), 'design-system/verification/artifacts') + path.sep)) throw new Error('Rendered artifact escapes artifact directory');
    return file;
  };
  const bytes = readFileSync(artifactFile(artifact.path));
  if (artifact.sha256 !== undefined && sha256(bytes) !== artifact.sha256) throw new Error(`Stale or corrupted artifact: ${artifact.path}`);
  const body = artifact.kind === 'browser-measurement' ? JSON.parse(bytes.toString('utf8')) : null;
  let image;
  const p = derive ? artifact.kind === 'browser-measurement'
    ? { tool: body.producer, capturedAt: body.capturedAt, caseId: body.caseId, snapshotHash: body.snapshotHash, configurationHash: configurationHash(body.configuration) }
    : { ...artifact.provenance, caseId: configuration.id, snapshotHash: metadata.evidence.hash, configurationHash: configurationHash(configuration) }
    : artifact.provenance;
  if (!object(p) || !text(p.tool) || p.caseId !== configuration.id || p.snapshotHash !== metadata.evidence.hash || p.configurationHash !== configurationHash(configuration) || !/^\d{4}-\d{2}-\d{2}T/.test(p.capturedAt || '') || !Number.isFinite(Date.parse(p.capturedAt))) throw new Error('Artifact provenance must identify tool, capture time, case, snapshot and configuration');
  if (artifact.kind === 'figma-screenshot') {
    if (p.figmaRef !== configuration.figmaRef || bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20)) throw new Error('Figma artifact needs matching source ref and PNG header/dimensions');
    const scale = artifact.export?.scale;
    if (artifact.export?.scope !== 'node-bounds' || !Number.isFinite(scale) || scale <= 0) throw new Error('Figma PNG requires declared node-bounds export and positive scale');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (bytes.length > 32 * 1024 * 1024 || width * height > 16 * 1024 * 1024) throw new Error('Figma PNG exceeds decoding limits');
    try { PNG.sync.read(bytes, { checkCRC: true }); }
    catch (error) { throw new Error(`Figma PNG cannot be fully decoded: ${error.message}`); }
    // Tolerance, not a rounding rule: Figma's fractional export rounding is not assumed, only that the PNG is of the captured node.
    const { capture } = loadSnapshot(root, metadata.evidence.snapshot, options);
    const node = capture.nodes.find(n => `${capture.source.fileKey}:${n.id}` === configuration.figmaRef);
    const expected = ['width', 'height'].map(k => node?.properties[k] * scale);
    let comparison = 'NOT VERIFIED';
    if (expected.every(v => Number.isFinite(v) && v > 0)) {
      if (Math.abs(width - expected[0]) > DIMENSION_TOLERANCE || Math.abs(height - expected[1]) > DIMENSION_TOLERANCE) throw new Error(`Figma PNG is ${width}x${height}, outside ${DIMENSION_TOLERANCE}px of the captured node bounds ${expected[0]}x${expected[1]} at scale ${scale}`);
      comparison = 'WITHIN_ONE_PIXEL_OF_NODE_BOUNDS';
    }
    image = { width, height, dimensionComparison: comparison };
    if (!derive && canonicalJson(artifact.image) !== canonicalJson(image)) throw new Error('Figma PNG image record must match decoded pixels and the dimension comparison');
  } else {
    const publication = artifact.publication;
    if (!object(publication) || !text(publication.path) || !publication.path.startsWith('design-system/verification/artifacts/')) throw new Error('Browser measurement needs a published original receipt');
    const receiptBytes = readFileSync(artifactFile(publication.path));
    if (sha256(receiptBytes) !== publication.sha256) throw new Error('Published receipt hash mismatch');
    const receipt = JSON.parse(receiptBytes);
    if (!isMeasurementVersion(body.measurementVersion) || body.measurementVersion !== receipt.measurementVersion) throw new Error('Measurement rules version differs from original receipt');
    if (receipt.body?.sha256 !== sha256(bytes) || receipt.body?.bytes !== bytes.length || receipt.snapshotHash !== metadata.evidence.hash || receipt.caseId !== configuration.id || canonicalJson(receipt.configuration) !== canonicalJson(configuration) || receipt.status !== 'NOT VERIFIED' || receipt.inputsUnchangedSinceStart !== true || receipt.viewportMatches !== true) throw new Error('Published receipt differs from original measurement or case');
    if (!/^[a-f0-9]{64}$/.test(receipt.metadataHash || '') || !Array.isArray(receipt.files) || !receipt.files.length || receipt.files.some(f => !text(f?.path) || path.isAbsolute(f.path) || f.path.includes('\\') || f.path.split('/').some(p => ['.', '..'].includes(p)) || !/^[a-f0-9]{64}$/.test(f.sha256 || '')) || new Set(receipt.files.map(f => f.path)).size !== receipt.files.length) throw new Error('Receipt semantic fingerprint and unique safe input hashes required');
    validateBrowserMeasurement(body, metadata, configuration);
    if (p.tool !== body.producer || p.capturedAt !== body.capturedAt) throw new Error('Browser provenance differs from original measurement');
    if (checkCurrentInputs) validateMeasurementInputs(root, receipt, metadata, configuration, options);
  }
  return { ...artifact, ...(image ? { image } : {}), provenance: p, sha256: sha256(bytes) };
}

export function checkedArtifacts(root, artifacts, metadata, configuration, options) {
  if (!Array.isArray(artifacts) || !artifacts.length) throw new Error('Rendered artifacts required');
  const result = artifacts.map(a => readArtifact(root, a, metadata, configuration, options));
  if (new Set(result.map(a => a.path)).size !== result.length || !['browser-measurement', 'figma-screenshot'].every(kind => result.some(a => a.kind === kind))) throw new Error('One original browser measurement and one Figma screenshot required; no duplicate paths');
  return result;
}
