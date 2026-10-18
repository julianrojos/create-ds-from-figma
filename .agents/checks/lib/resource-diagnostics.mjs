import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalJson, loadSnapshot } from './figma-evidence.mjs';
import { projectFile, renderRequirements, sha256 } from './render-plan.mjs';
import { caseNodes } from './render-comparison.mjs';
import { essentialAssetGaps, essentialFontGaps } from './resource-gaps.mjs';
import { fontConfigurations } from './font-configuration.mjs';
import { concreteFontWeight } from './font-weight.mjs';

export const RESOURCE_SCRIPT = '.agents/skills/create-ds-from-figma/scripts/verification-resources.mjs';
const FINALIZER = '.agents/skills/create-ds-from-figma/scripts/finalize-import.mjs';
const VECTOR_SCRIPT = '.agents/skills/create-ds-from-figma/scripts/figma-vectors.mjs';
const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE']);
const unique = values => [...new Set(values)].sort();
const hasImageIdentity = resource => typeof resource.imageHash === 'string' && resource.imageHash.trim().length > 0;
const identity = resource => resource.kind === 'font' ? resource.id : resource.imageHash;
const keyOf = resource => resource.kind === 'font' ? resource.id : `image:${hasImageIdentity(resource) ? resource.imageHash : `${resource.observations[0]}:${resource.entries[0].index}`}`;

export function deduplicateNextActions(actions) {
  const result = new Map();
  for (const action of actions) {
    const { targets, ...facts } = action, key = canonicalJson(facts);
    if (!result.has(key)) result.set(key, structuredClone(action));
    if (targets || result.get(key).targets) result.get(key).targets = unique([...(result.get(key).targets || []), ...(targets || [])]);
  }
  return [...result.values()];
}
const targetActions = (metadataPath, actions) => actions.map(action => ({ ...action, targets: [metadataPath] }));

// Wrap shared derivation without changing comparator inputs or classifying observed resources as essential.
export function snapshotResources(capture) {
  const requirements = renderRequirements(capture), observations = new Map(capture.observations.map(o => [o.id, o]));
  const variants = requirements.variants.map(figmaRef => ({ figmaRef, nodes: caseNodes(capture, { figmaRef }).selected }));
  const describe = resource => {
    const nodes = unique(resource.observations.map(id => observations.get(id)?.node).filter(Boolean));
    return { ...resource, key: keyOf(resource), nodes: nodes.map(node => `${capture.source.fileKey}:${node}`),
      variants: variants.filter(variant => nodes.some(node => variant.nodes.has(node))).map(v => v.figmaRef),
      essentiality: 'UNCLASSIFIED', cases: { status: 'PENDING', ids: [] },
      css: { status: 'PENDING' }, registration: { status: 'UNDETERMINED' },
      configuration: { status: 'NOT VERIFIED', reason: 'Resource usage and CSS loading have not been examined.' },
      loading: { status: 'NOT RUN', reason: 'No rendered resource check was executed.' } };
  };
  const images = new Map();
  for (const asset of requirements.assets) {
    const key = hasImageIdentity(asset) ? asset.imageHash : `${asset.observation}:${asset.index}`;
    if (!images.has(key)) images.set(key, { kind: 'image', imageHash: asset.imageHash, observations: [], entries: [] });
    images.get(key).observations.push(asset.observation); images.get(key).entries.push({ observation: asset.observation, index: asset.index });
  }
  const resources = [...requirements.fonts.map(font => describe({ kind: 'font', ...font })),
    ...[...images.values()].map(image => describe({ ...image, observations: unique(image.observations) }))];
  // Vector-like nodes are not resources to authorize but shapes geometry cannot certify: observed here so their original export is not forgotten.
  const vectors = capture.nodes.filter(node => VECTOR_TYPES.has(node.type)).map(node => ({ kind: 'vector', key: `vector:${capture.source.fileKey}:${node.id}`,
    node: `${capture.source.fileKey}:${node.id}`, name: node.name, type: node.type, visible: node.properties.visible !== false,
    variants: variants.filter(variant => variant.nodes.has(node.id)).map(variant => variant.figmaRef), essentiality: 'UNCLASSIFIED',
    representation: { status: 'UNDETERMINED', reason: 'Geometry checks cannot establish a vector shape; reproduce it from its original Figma SVG export or record an explicit approximation decision.' } }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const nextActions = [
    ...(resources.length ? [{ code: 'REVIEW_OBSERVED_RESOURCES', resources: resources.map(r => r.key),
      prerequisites: ['Decide which observed resources the intended implementation and cases will render; ask together for unresolved authorized sources.'],
      permissions: [], command: null, requiredArguments: [],
      scope: 'Candidates only; no missing-source or essentiality judgment before a plan exists.' }] : []),
    ...(vectors.length ? [{ code: 'EXPORT_VECTOR_SOURCES', resources: vectors.map(v => v.key),
      prerequisites: ['Export the original SVG of the vectors the intended implementation renders instead of rebuilding them with CSS shapes; an approximation needs an explicit, reviewed decision.',
        'A connection configuration the user authorized; --approve-connection is never added on the user\'s behalf.'],
      permissions: ['figma-read', 'temporary-write'],
      command: { executable: 'node', args: [VECTOR_SCRIPT, 'capture', capture.source.fileKey, capture.source.rootNodeId] },
      requiredArguments: [{ name: 'connectionConfig', type: 'authorized-connection-config', append: true }],
      scope: 'Observed vector-like nodes of the snapshot; the export is read-only, immutable once saved and not an authorization or a rendered check.' }] : [])];
  return { schemaVersion: 1, phase: 'snapshot', resources, vectors, nextActions,
    scope: 'Observed resource candidates, not essential-resource gaps, CSS decisions, file authorization or rendered fidelity.' };
}

export function resourceNextActions(root, metadataPath, { fonts = [], assets = [] } = {}) {
  const requests = [
    ...fonts.map(font => ({ kind: 'font', key: font.id, id: font.id, font: font.font, css: font.css, cases: font.cases })),
    ...assets.map(asset => ({ kind: 'image', key: `image:${hasImageIdentity(asset) ? asset.imageHash : `${asset.observation}:${asset.index}`}`, imageHash: asset.imageHash, cases: asset.cases })),
  ];
  const grouped = new Map();
  for (const resource of requests) {
    if (!grouped.has(resource.key)) grouped.set(resource.key, { ...resource, cases: [] });
    grouped.get(resource.key).cases.push(...(resource.cases || []));
  }
  return targetActions(metadataPath, [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key, 'en')).map(resource => {
    const needsCapture = resource.kind === 'image' && !hasImageIdentity(resource);
    return {
    code: resource.kind === 'font' ? 'AUTHORIZE_FONT_SOURCE' : needsCapture ? 'RECAPTURE_IMAGE_IDENTITY' : 'AUTHORIZE_IMAGE_SOURCE',
    resources: [{ ...resource, cases: unique(resource.cases) }],
    prerequisites: needsCapture ? ['A non-empty imageHash observed in a valid capture is required before registration.']
      : ['A user-authorized existing project-relative source file is required; do not infer a package, substitute an image or treat a hash as authorization.'],
    permissions: needsCapture ? ['figma-read'] : ['project-write'],
    command: needsCapture ? null : { executable: 'node', args: [RESOURCE_SCRIPT, 'register', root, metadataPath, resource.kind, identity(resource)] },
    requiredArguments: needsCapture ? [] : [{ name: 'sourcePath', type: 'authorized-project-relative-file', append: true }],
  }; }));
}

export function fontConfigurationActions(root, metadataPath, configurations, metadata) {
  const ids = configurations.filter(c => c.status !== 'DECLARED' && metadata.verification.fonts.some(f => f.id === c.id && f.source?.kind === 'file')).map(c => c.id);
  return ids.length ? [{ code: 'REVIEW_FONT_CONFIGURATION', resources: ids, targets: [metadataPath],
    prerequisites: ['Review CSS entry points, font descriptors and URLs against the registered file; unsupported imports require independent inspection. Declaration linkage is not browser loading.'],
    permissions: ['project-read'], command: { executable: 'node', args: [RESOURCE_SCRIPT, 'inspect', root, metadataPath] }, requiredArguments: [] }] : [];
}

export function deliveryNextActions(root, metadataPath, { fonts = [], assets = [], summary, configurationActions = [] } = {}) {
  const actions = resourceNextActions(root, metadataPath, { fonts, assets });
  actions.push(...configurationActions);
  if (fonts.length || assets.length) actions.push({ code: 'VERIFY_RESOURCE_CONFIGURATION', resources: [],
    prerequisites: ['Register authorized files; inspect their actual use and font loading CSS without assuming registration configured it.'],
    permissions: ['project-read'], command: null, requiredArguments: [] });
  if (summary?.pending || summary?.failedRecords || summary?.unestablished || summary?.totalCases === 0) {
    actions.push({ code: 'MEASURE_AND_REVIEW_CASES', resources: [],
      prerequisites: ['Establish fidelity/behavior cases and resolve required resources and configuration.', 'Use existing current measurements or collect new ones with an available permitted browser runtime.'],
      permissions: ['browser-execution', 'project-write'],
      command: { executable: 'node', args: [FINALIZER, root, metadataPath, '--collect'] }, requiredArguments: [],
      scope: 'Collection is not confirmation. Reuse current published measurements when appropriate; do not fabricate a review.' });
    actions.push({ code: 'RECORD_RENDERED_REVIEWS', resources: [], prerequisites: ['Actual rendered comparison and current typed retained artifacts for every required case.'],
      permissions: ['project-write'], command: { executable: 'node', args: [FINALIZER, root, metadataPath, '--reviews'] },
      requiredArguments: [{ name: 'reviewFile', type: 'explicit-rendered-review-json', append: true }] });
  }
  return targetActions(metadataPath, actions);
}

export function loadResourceMetadata(root, metadataPath) {
  const file = projectFile(root, metadataPath), bytes = readFileSync(file), metadata = JSON.parse(bytes);
  const snapshotFile = projectFile(root, metadata.evidence?.snapshot), snapshotBytes = readFileSync(snapshotFile);
  const snapshot = loadSnapshot(root, metadata.evidence.snapshot);
  if (metadata.evidence.hash !== snapshot.hash) throw new Error('Metadata snapshot hash mismatch');
  if (!Array.isArray(metadata.verification?.fonts) || !Array.isArray(metadata.verification.assets) || !Array.isArray(metadata.verification.cases)) throw new Error('Resource inspection requires existing fonts, assets and cases arrays');
  for (const key of ['fonts', 'assets', 'cases']) if (metadata.verification[key].some(record => !record || typeof record !== 'object' || Array.isArray(record))) throw new Error(`Resource inspection requires object records in ${key}`);
  if (metadata.verification.fonts.some(font => concreteFontWeight(font.css?.weight) === null)) throw new Error('Resource fonts require one concrete CSS weight from 1 to 1000, normal or bold; ranges belong to @font-face');
  const variants = renderRequirements(snapshot.capture).variants;
  if (metadata.verification.cases.some(c => typeof c.id !== 'string' || !c.id.trim() || !['fidelity', 'behavior'].includes(c.kind) || !variants.includes(c.figmaRef))) throw new Error('Resource cases need IDs and must refer to captured variants');
  return { file, bytes, metadata, snapshotFile, snapshotBytes, ...snapshot };
}

function registration(root, records) {
  if (!records.length || records.some(record => record.source?.kind !== 'file')) return { status: 'PENDING', reason: 'Not all observed entries have registered source files.' };
  try {
    for (const record of records) {
      if (sha256(readFileSync(projectFile(root, record.source.path))) !== record.source.sha256) throw new Error('Registered source hash differs from file bytes');
    }
    return { status: 'REGISTERED', sources: [...new Map(records.map(record => [canonicalJson(record.source), record.source])).values()] };
  } catch (error) { return { status: 'INVALID', reason: error.message }; }
}

// In the one fill observed so far, Figma's imageHash equals the SHA-1 of the original bytes (it is not documented here as a rule). When
// they match, the file is that original; when they differ it is not byte-identical (re-encoded, rendered or another image), which says
// nothing about whether it is acceptable. A hash that is not a SHA-1 digest establishes nothing.
export function imageProvenance(root, imageHash, sources) {
  if (typeof imageHash !== 'string' || !/^[0-9a-f]{40}$/.test(imageHash)) return { status: 'UNKNOWN', reason: 'The captured imageHash is not a SHA-1 digest, so file identity cannot be established.' };
  try {
    const digests = sources.map(source => createHash('sha1').update(readFileSync(projectFile(root, source.path))).digest('hex'));
    return digests.every(digest => digest === imageHash) ? { status: 'MATCHES_FIGMA_IMAGE_HASH', sha1: imageHash }
      : { status: 'DIFFERS_FROM_FIGMA_IMAGE_HASH', sha1: [...new Set(digests)], reason: 'The registered file is not byte-identical to the original fill; it may be a re-encoded or different image. This neither proves nor disproves fidelity.' };
  } catch (error) { return { status: 'UNKNOWN', reason: error.message }; }
}

export function inspectResourceMetadata(root, metadataPath) {
  return describeResourceMetadata(root, metadataPath, loadResourceMetadata(root, metadataPath));
}

export function describeResourceMetadata(root, metadataPath, { capture, hash, metadata }) {
  const fonts = essentialFontGaps(capture, metadata), assets = essentialAssetGaps(capture, metadata);
  const configuration = fontConfigurations(root, metadata);
  const cases = metadata.verification.cases.map(c => ({ ...c, nodes: caseNodes(capture, c).selected }));
  const diagnostic = snapshotResources(capture);
  const resources = diagnostic.resources.map(resource => {
    const records = resource.kind === 'font' ? metadata.verification.fonts.filter(f => f.id === resource.id)
      : metadata.verification.assets.filter(a => resource.entries.some(entry => entry.observation === a.observation && entry.index === a.index));
    const nodeIds = resource.nodes.map(node => node.slice(capture.source.fileKey.length + 1));
    const covered = resource.kind === 'font' ? records.length === 1 : records.length === resource.entries.length && new Set(records.map(a => `${a.observation}:${a.index}`)).size === resource.entries.length;
    return { ...resource, cases: { status: 'DECLARED', ids: cases.filter(c => nodeIds.some(id => c.nodes.has(id))).map(c => c.id) },
      css: resource.kind === 'font' && records[0]?.css ? { status: 'DECLARED', ...records[0].css } : { status: resource.kind === 'font' ? 'PENDING' : 'NOT APPLICABLE' },
      registration: covered ? registration(root, records) : { status: 'PENDING', reason: 'Resource entries are missing or duplicated; complete their observed identities before registration.' },
      ...(resource.kind === 'font' ? { configuration: configuration.configurations.find(c => c.id === resource.id) || resource.configuration } : {}) };
  }).map(resource => {
    if (resource.kind !== 'image') return resource;
    return { ...resource, provenance: resource.registration.status === 'REGISTERED' ? imageProvenance(root, resource.imageHash, resource.registration.sources)
      : { status: 'NOT APPLICABLE', reason: 'No registered source file to compare.' } };
  });
  const nextActions = resourceNextActions(root, metadataPath, { fonts, assets });
  nextActions.push(...fontConfigurationActions(root, metadataPath, configuration.configurations, metadata));
  const invalid = resources.filter(resource => resource.registration.status === 'INVALID');
  if (invalid.length) nextActions.push({ code: 'RECHECK_REGISTERED_SOURCES', resources: invalid.map(resource => resource.key), targets: [metadataPath],
    prerequisites: ['Inspect missing files or changed bytes. Restoring the authorized file and explicitly replacing a registered source are different decisions; do not add --replace automatically.'],
    permissions: ['project-read'], command: null, requiredArguments: [] });
  return { ...diagnostic, phase: 'metadata', snapshotHash: hash, resources,
    essentialGaps: { fonts, assets }, nextActions, configurationWarnings: configuration.warnings,
    scope: 'Registration is checked against file bytes and supported font declarations are linked statically. Browser loading is not examined. Declared cases are affected subtrees, not proof of visibility or rendered use.' };
}
