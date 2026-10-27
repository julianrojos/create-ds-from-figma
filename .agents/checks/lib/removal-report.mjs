import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { createDependencySession } from './local-dependencies.mjs';
import { projectFile, sha256 } from './render-plan.mjs';
import { verifyCorrespondences } from './correspondences.mjs';
import { markdownProse } from './markdown-prose.mjs';
import { generateTokensCss, renderTokensCss, TOKENS_CSS_PATH } from './tokens-css.mjs';
import { loadSnapshot } from './figma-evidence.mjs';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const mapPath = 'design-system/relationships/figma-code-map.json';
const statePath = 'design-system/relationships/figma-state.json';
const inventoryPath = 'design-system/inventory.json';
const pointer = v => String(v).replaceAll('~', '~0').replaceAll('/', '~1');
const entries = map => Object.entries(map).filter(([key]) => !key.startsWith('_'));

export function removalReport(projectRoot, metadataPath, { retirePaths = [], keepPaths = [] } = {}) {
  if (!Array.isArray(retirePaths) || !Array.isArray(keepPaths)) throw new Error('Explicit file decisions must be arrays');
  const root = realpathSync(projectRoot), inputHashes = new Map(), uncertainties = [], blockers = [], demoReferences = [];
  const bytes = relative => {
    const file = projectFile(root, relative);
    if (file !== path.join(root, relative)) throw new Error(`Symlink input requires independent review: ${relative}`);
    const value = readFileSync(file);
    inputHashes.set(relative, sha256(value));
    return value;
  };
  const json = relative => JSON.parse(bytes(relative).toString('utf8'));
  const issue = (code, location, reason) => uncertainties.push({ code, location, reason });
  const map = json(mapPath), state = json(statePath), inventory = json(inventoryPath), metadata = json(metadataPath);
  if (!object(map) || !object(state.components) || !Array.isArray(inventory.components) || !Array.isArray(inventory.screens)) throw new Error('Readable component map, state.components and inventory arrays required');
  const selected = entries(map).filter(([, value]) => value?.designSystem?.metadata === metadataPath);
  if (selected.length !== 1 || !text(metadata.name) || !text(metadata.code?.path)) throw new Error('Target metadata must identify exactly one mapped component with code');
  const [mapKey, target] = selected[0];
  if (target.code?.path !== metadata.code.path || target.code?.component !== metadata.code.component) throw new Error('Target code and map disagree');
  if (!metadataPath.startsWith('design-system/components/') || !target.code.path.startsWith('src/') || !text(target.designSystem.usage)) throw new Error('Target requires DS metadata/usage and a source path under src');
  if (path.posix.dirname(target.designSystem.usage) !== path.posix.dirname(metadataPath)) throw new Error('Target usage must belong to the same component documentation directory');
  bytes(target.code.path);
  if (!object(state.components[metadata.name]) || inventory.components.filter(name => name === metadata.name).length !== 1) issue('INCONSISTENT_REGISTRATION', metadataPath, 'Target state entry or unique inventory registration is missing');
  const stableRef = ref => typeof ref === 'string' && /^(?:[A-Za-z0-9_-]+:\d+:\d+|componentKey:[A-Za-z0-9_-]+)$/.test(ref);
  const refsOf = entry => {
    const refs = [...new Set([...(Array.isArray(entry?.figma?.refs) ? entry.figma.refs : []),
      ...Object.values(entry?.figma?.variants || {}).flatMap(v => Array.isArray(v?.refs) ? v.refs : [])])];
    if (refs.some(ref => !stableRef(ref))) issue('INVALID_SOURCE_REF', entry?.designSystem?.metadata ?? mapKey, 'Full stable source refs required');
    return refs.filter(stableRef);
  };
  const targetRefs = new Set(refsOf(target));
  if (!targetRefs.size) issue('MISSING_TARGET_REFS', mapKey, 'Stable full source refs required');
  const names = new Map(), records = new Map(), claims = new Map();
  const claim = (file, owner) => {
    if (!text(file)) return;
    if (!claims.has(file)) claims.set(file, new Set());
    claims.get(file).add(owner);
  };
  for (const [key, entry] of entries(map)) {
    try {
      const component = entry.designSystem?.metadata === metadataPath ? metadata : json(entry.designSystem?.metadata);
      if (!text(component.name)) throw new Error('Component name missing');
      if (!text(entry.code?.path) || entry.code.path !== component.code?.path || entry.code.component !== component.code?.component) throw new Error('Mapped code and component metadata disagree');
      bytes(entry.code.path);
      if (!object(state.components[component.name])) issue('INCONSISTENT_REGISTRATION', key, 'Mapped component has no state entry');
      if (names.has(component.name)) throw new Error(`Duplicate component name: ${component.name}`);
      names.set(component.name, entry);
      records.set(key, { entry, metadata: component });
      for (const file of [entry.code?.path, entry.code?.style, entry.designSystem?.metadata, entry.designSystem?.usage,
        ...(component.verification?.inputs || []), ...(component.verification?.stylesheets || []),
        ...(component.verification?.fonts || []).map(r => r.source?.kind === 'file' ? r.source.path : null),
        ...(component.verification?.assets || []).map(r => r.source?.kind === 'file' ? r.source.path : null)]) claim(file, key);
      if (key !== mapKey && refsOf(entry).some(ref => targetRefs.has(ref))) issue('CONFLICTING_REFS', key, 'Stable ref belongs to target and another component');
    } catch (error) { issue('UNREADABLE_COMPONENT', key, error.message); }
  }
  for (const [parent, record] of Object.entries(state.components).filter(([key]) => !key.startsWith('_'))) {
    if (parent === metadata.name) continue;
    if (!names.has(parent) || !Array.isArray(record?.nestedComponents)) {
      issue('UNRESOLVED_PARENT', parent, 'Mapped parent and nestedComponents array required'); continue;
    }
    for (const [index, nested] of record.nestedComponents.entries()) {
      const location = `${statePath}#/components/${pointer(parent)}/nestedComponents/${index}`;
      if (!object(nested)) { issue('UNRESOLVED_NESTED', location, 'Nested record is not an object'); continue; }
      const refs = [nested.mainComponentRef,
        text(nested.mainComponentKey) ? `componentKey:${nested.mainComponentKey}` : null,
        text(nested.mainComponentFileKey) && text(nested.mainComponentNodeId) ? `${nested.mainComponentFileKey}:${nested.mainComponentNodeId}` : null].filter(text);
      if (refs.some(ref => !stableRef(ref))) { issue('UNRESOLVED_NESTED', location, 'Malformed stable source ref'); continue; }
      const refMatch = refs.some(ref => targetRefs.has(ref)), nameMatch = nested.status === 'mapped' && nested.resolvedComponent === metadata.name;
      if (refMatch || nameMatch) blockers.push({ kind: 'nested-reference', parent, location, refs, resolvedComponent: nested.resolvedComponent ?? null });
      const comparable = refs.some(ref => [...targetRefs].some(targetRef => targetRef.startsWith('componentKey:') === ref.startsWith('componentKey:')));
      const named = nested.status === 'mapped' && names.has(nested.resolvedComponent);
      if ((!comparable && !named) || refMatch && named && !nameMatch || nameMatch && comparable && !refMatch) issue('UNRESOLVED_NESTED', location, 'Identity is insufficient or source refs and resolved component disagree');
    }
  }
  for (const [index, screen] of inventory.screens.entries()) {
    if (!text(screen?.name) || !Array.isArray(screen.composition?.components) || !screen.composition.components.every(text)) issue('UNREADABLE_SCREEN', `${inventoryPath}#/screens/${index}`, 'Screen composition required');
    else if (screen.composition.components.includes(metadata.name)) blockers.push({ kind: 'screen-composition', screen: screen.name, location: `${inventoryPath}#/screens/${index}` });
  }

  const session = createDependencySession(root), sourceFiles = [], nearby = new Set();
  const walk = (directory, result) => {
    if (!text(directory) || path.isAbsolute(directory) || directory.includes('\\') || directory.split('/').some(p => p === '.' || p === '..')) { issue('UNSAFE_DIRECTORY', directory, 'Directory must remain project-relative without traversal'); return; }
    if (!existsSync(path.join(root, directory))) return;
    if (lstatSync(path.join(root, directory)).isSymbolicLink()) { issue('SYMLINK_DIRECTORY', directory, 'Directory not traversed'); return; }
    if (!realpathSync(path.join(root, directory)).startsWith(root + path.sep)) { issue('UNSAFE_DIRECTORY', directory, 'Directory resolves outside the project'); return; }
    for (const item of readdirSync(path.join(root, directory), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${directory}/${item.name}`;
      if (['node_modules', '.git', '.DS_Store'].includes(item.name)) continue;
      if (item.isSymbolicLink()) issue('SYMLINK_INPUT', file, 'Link not traversed or proposed for retirement');
      else if (item.isDirectory()) walk(file, result);
      else if (item.isFile()) result.add(file);
      else issue('SPECIAL_INPUT', file, 'Non-regular input not inspected');
    }
  };
  const sourceSet = new Set();
  walk('src', sourceSet);
  for (const file of sourceSet) {
    if (/\.(?:[cm]?[jt]sx?|css)$/.test(file)) sourceFiles.push(file);
    else if (/\.(?:vue|svelte|scss|sass|less|html)$/.test(file)) issue('UNSUPPORTED_SOURCE', file, 'Source dependency syntax not inspected');
  }
  const candidates = new Set([metadataPath, target.designSystem.usage, target.code.path, target.code.style].filter(text));
  for (const file of candidates) if ([TOKENS_CSS_PATH, mapPath, statePath, inventoryPath].includes(file) || file.startsWith('design-system/figma/') || file.startsWith('design-system/verification/')) throw new Error('Target claims shared infrastructure as component code or documentation');
  const codeDirectory = path.posix.dirname(target.code.path), documentDirectory = path.posix.dirname(metadataPath);
  if (codeDirectory.startsWith('src/components/') && codeDirectory.split('/').length >= 3) walk(codeDirectory, nearby);
  if (documentDirectory.startsWith('design-system/components/')) walk(documentDirectory, nearby);
  try {
    const own = session.resolve([target.code.path, target.code.style]);
    for (const warning of own.warnings) issue('DEPENDENCY_UNCERTAINTY', target.code.path, warning);
    for (const file of own.files) {
      bytes(file);
      if (codeDirectory.startsWith('src/components/') && file.startsWith(codeDirectory + '/') && /\.(?:[cm]?[jt]sx?|css)$/.test(file)) candidates.add(file);
    }
  } catch (error) { issue('DEPENDENCY_UNCERTAINTY', target.code.path, error.message); }
  // Reachability is not ownership: a dependency may have to remain active.
  const claimedElsewhere = file => [...(claims.get(file) || [])].some(owner => owner !== mapKey);
  const retainedDestinations = new Set([...keepPaths, ...[...claims.keys()].filter(claimedElsewhere)]);
  for (const source of sourceFiles) {
    if (!keepPaths.includes(source) && !claimedElsewhere(source) && (candidates.has(source) || source.startsWith(codeDirectory + '/'))) continue;
    try {
      for (const file of session.resolve([source]).files) if (candidates.has(file)) retainedDestinations.add(file);
    } catch { /* The dependency pass below records failures as blocking uncertainty. */ }
  }
  const localBarrels = new Map();
  for (const file of nearby) {
    if (file === target.code.path || !file.startsWith(codeDirectory + '/') || !/\.[cm]?[jt]sx?$/.test(file)) continue;
    const tree = ts.createSourceFile(file, bytes(file).toString('utf8'), ts.ScriptTarget.Latest, true);
    if (tree.parseDiagnostics.length || !tree.statements.length) continue;
    const destinations = [];
    const pure = tree.statements.every(statement => {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.moduleSpecifier.text.startsWith('.')) return false;
      const resolved = ts.resolveModuleName(statement.moduleSpecifier.text, path.join(root, file),
        { moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true }, ts.sys).resolvedModule;
      if (!resolved) return false;
      destinations.push(path.relative(root, resolved.resolvedFileName).split(path.sep).join('/'));
      return true;
    });
    if (pure) localBarrels.set(file, destinations);
    if (tree.statements.some(ts.isExportDeclaration)) candidates.delete(file);
  }
  // A pure local reexport joins only when its destinations belong to the retiring
  // group and none is a retained/shared helper. Consumers of the required component
  // entrypoint are reported separately, preserving their blocking diagnostics.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const [file, destinations] of localBarrels) {
      if (candidates.has(file)) continue;
      if (destinations.every(destination => candidates.has(destination) && (destination === target.code.path || !retainedDestinations.has(destination)))) {
        candidates.add(file); expanded = true;
      }
    }
  }
  if (![retirePaths, keepPaths].every(paths => Array.isArray(paths) && paths.every(file => candidates.has(file) || nearby.has(file)))) throw new Error('Explicit file decisions must belong to the inspected component group');
  const retiring = new Set([...candidates, ...retirePaths].filter(file => !keepPaths.includes(file)));
  const uses = new Map();
  for (const source of sourceFiles) {
    try {
      bytes(source);
      const dependencies = session.resolve([source]);
      for (const warning of dependencies.warnings) issue('DEPENDENCY_UNCERTAINTY', source, warning);
      for (const file of dependencies.files) {
        const sourceClaimedElsewhere = [...(claims.get(source) || [])].some(owner => owner !== mapKey);
        if (file === source || !retiring.has(file) || retiring.has(source) && !sourceClaimedElsewhere) continue;
        if (!uses.has(file)) uses.set(file, new Set());
        uses.get(file).add(source);
        const reference = { kind: 'source-dependency', source, target: file, scope: 'dependency-closure; may be transitive, not proof that this source requires editing' };
        if (source === 'src/App.tsx' || source === 'src/App.jsx') demoReferences.push({ ...reference, treatment: 'REQUIRES_EXPLICIT_EDIT_PLAN' });
        else blockers.push(reference);
      }
    } catch (error) { issue('DEPENDENCY_UNCERTAINTY', source, error.message); }
  }
  const git = spawnSync('git', ['ls-files', '-z', '--', ...candidates], { cwd: root, encoding: 'utf8' });
  const tracked = git.status === 0 ? new Set(git.stdout.split('\0').filter(Boolean)) : null;
  const files = [];
  for (const file of [...new Set([...candidates, ...nearby])].sort()) {
    try {
      const hash = sha256(bytes(file)), otherClaims = [...(claims.get(file) || [])].filter(key => key !== mapKey), references = [...(uses.get(file) || [])].sort();
      const attribution = otherClaims.length || references.some(source => !['src/App.tsx', 'src/App.jsx'].includes(source)) ? 'shared-identified' : candidates.has(file) ? 'candidate-to-retire' : 'attribution-unknown';
      if (attribution !== 'candidate-to-retire') issue('FILE_ATTRIBUTION_REQUIRES_REVIEW', file, attribution);
      files.push({ path: file, sha256: hash, attribution, otherMapClaims: otherClaims, sourceReferences: references,
        gitTracking: tracked ? tracked.has(file) ? 'TRACKED_NOT_A_BACKUP_GUARANTEE' : 'UNTRACKED' : 'UNKNOWN', action: 'PROPOSE_ONLY' });
    } catch (error) { issue('UNREADABLE_CANDIDATE', file, error.message); }
  }

  let currentEvidence;
  try {
    const snapshot = loadSnapshot(root, metadata.evidence?.snapshot);
    if (snapshot.hash !== metadata.evidence.hash) throw new Error('Target snapshot and metadata hashes disagree');
    bytes(metadata.evidence.snapshot);
    const usage = bytes(target.designSystem.usage).toString('utf8');
    currentEvidence = verifyCorrespondences(root, metadata, usage, markdownProse(usage), { metadataPath, style: target.code.style });
    if (currentEvidence.errors.length) issue('CURRENT_EVIDENCE_ERRORS', metadataPath, currentEvidence.errors.join('; '));
  } catch (error) { currentEvidence = { current: [], errors: [error.message], warnings: [] }; issue('CURRENT_EVIDENCE_ERRORS', metadataPath, error.message); }

  let generatedCss = { status: 'NOT DETERMINED', path: TOKENS_CSS_PATH };
  try {
    const baseline = generateTokensCss(root);
    if (baseline.errors.length) throw new Error(baseline.errors.join('; '));
    const collections = Object.entries(state.collections || {}).map(([id, record]) => {
      const file = record.file, data = json(`design-system/tokens/${file}`);
      if (data.id !== id) throw new Error(`Collection ID mismatch: ${file}`);
      return { file, record, data };
    });
    const others = [...records].filter(([key]) => key !== mapKey);
    if (others.length !== entries(map).length - 1) throw new Error('Other metadata is incomplete');
    for (const [, record] of records) if (!Array.isArray(record.metadata.externalVariables)) throw new Error('externalVariables array required for token projection');
    const proposed = renderTokensCss({ collections, externals: others.flatMap(([, r]) => r.metadata.externalVariables), externalSerialization: state.externalSerialization });
    if (proposed.errors.length) throw new Error(proposed.errors.join('; '));
    const actual = bytes(TOKENS_CSS_PATH).toString('utf8');
    generatedCss = { status: 'PROJECTED', path: TOKENS_CSS_PATH, currentMatchesGenerator: actual === baseline.css,
      generatedOutputWouldChange: baseline.css !== proposed.css, currentHash: sha256(actual), proposedHash: sha256(proposed.css), warnings: [...baseline.warnings, ...proposed.warnings] };
    if (!generatedCss.currentMatchesGenerator) issue('CURRENT_TOKEN_CSS_DRIFT', TOKENS_CSS_PATH, 'Current CSS differs from generated output');
  } catch (error) { generatedCss.error = error.message; issue('TOKEN_PROJECTION_UNAVAILABLE', TOKENS_CSS_PATH, error.message); }
  return {
    schemaVersion: 1, kind: 'component-removal-report', metadata: metadataPath, component: metadata.name,
    analysis: { status: uncertainties.length ? 'PARTIAL' : 'COMPLETE_WITHIN_SCOPE', uncertainties,
      scope: 'Recorded relationships, dependency reachability from src, explicit file claims and generated token CSS only.' },
    removalAssessment: blockers.length || uncertainties.length ? 'BLOCKED' : 'REQUIRES_EXPLICIT_PLAN_AND_AUTHORIZATION',
    execution: 'NOT_EXECUTED_READ_ONLY', blockers, demoReferences, files,
    proposedRegistryEdits: [{ path: mapPath, pointer: `/${pointer(mapKey)}`, action: 'remove-entry' },
      { path: statePath, pointer: `/components/${pointer(metadata.name)}`, action: 'remove-entry' },
      { path: inventoryPath, component: metadata.name, action: 'remove-component-name' }],
    historicalEvidence: { action: 'PRESERVE_ALL', snapshot: metadata.evidence?.snapshot ?? null,
      directories: ['design-system/figma/snapshots/', 'design-system/verification/'], note: 'Preservation does not establish current validity.' },
    currentEvidence, projectedEffects: { generatedCss, otherConfirmations: 'NOT DETERMINED; input changes can stale other components. No confirmations are modified or approved.', regression: 'NOT MEASURED' },
    preservedSharedData: ['Local token JSON, serialization, externalSerialization, prop vocabulary, fonts, assets and historical evidence are not proposed for deletion. Orphan cleanup is not implemented.'],
    fingerprintedInputs: [...inputHashes].sort(([a], [b]) => a.localeCompare(b)).map(([file, hash]) => ({ path: file, sha256: hash })),
    limits: ['No file is proven exclusively owned. This report is not an executable manifest or a complete dependency inventory.',
      'Source dependencies may be transitive, including through the demo; they do not prove a direct import or that each source requires an edit. Any proposed demo edit needs a fresh dependency analysis.',
      'CSS class consumers, external packages, runtime references and files outside src may not be identified. Nonliteral imports and unresolved dependencies are blocking uncertainties.',
      'Execution requires a separate reviewed component-removal plan, rescanning consumers, rechecking files and destinations, recoverable backups and explicit authorization. Git tracking is not proof that current bytes are recoverable.',
      'fingerprintedInputs contains report fingerprints, not a complete manifest of every input consumed by evidence validators or dependency resolution.',
      'The CSS projection removes only the selected metadata from external token inputs, preserves all serialization decisions and does not simulate edits to the demo or other consumers.'],
  };
}
