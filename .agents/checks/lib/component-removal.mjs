import { existsSync, lstatSync, statSync, realpathSync, readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, renameSync, unlinkSync, rmdirSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { removalReport } from './removal-report.mjs';
import { canonicalJson } from './figma-evidence.mjs';
import { sha256 } from './render-plan.mjs';
import { localDependencies } from './local-dependencies.mjs';
import { generateTokensCss } from './tokens-css.mjs';
import { verify } from '../verify-ds.mjs';
import { verifyProps } from '../verify-props.mjs';
import { structuredReport } from '../verify-bindings.mjs';
import { verifyImports } from '../verify-imports.mjs';

const mapPath = 'design-system/relationships/figma-code-map.json';
const statePath = 'design-system/relationships/figma-state.json';
const inventoryPath = 'design-system/inventory.json';
const cssPath = 'src/styles/tokens.css';
const lockPath = '.component-removal.lock';
const demos = ['src/App.tsx', 'src/App.jsx'];
const projectRoots = new Set(['src', 'design-system']);
const environmentFile = file => /^\.env(?:\.|$)/.test(path.posix.basename(file));
const finderFile = file => path.posix.basename(file) === '.DS_Store';
const componentFile = file => file.startsWith('src/components/') || file.startsWith('design-system/components/');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const digest = value => sha256(canonicalJson(value));
const planHash = ({ hash, ...plan }) => digest(plan);

function relativePath(relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(s => !s || s === '.' || s === '..')) throw new Error('Canonical project-relative path required');
  return relative;
}
function safePath(root, relative) {
  relativePath(relative);
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink not permitted: ${relative}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return current;
}
function fileState(root, relative) {
  const file = safePath(root, relative);
  if (!existsSync(file)) return null;
  if (!statSync(file).isFile()) throw new Error(`Expected regular file: ${relative}`);
  return { sha256: sha256(readFileSync(file)), mode: statSync(file).mode & 0o777 };
}
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
function assertState(root, file, expected) {
  if (!equal(fileState(root, file), expected)) throw new Error(`Concurrent change or restore conflict: ${file}`);
}
function outside(root, location) {
  const resolved = realpathSync(location);
  if (resolved === root || resolved.startsWith(root + path.sep)) throw new Error('Plan/archive location must be outside the active project');
  return resolved;
}
function census(root) {
  const files = new Map(), directories = new Map();
  const addDirectory = file => {
    const full = safePath(root, file);
    if (!statSync(full).isDirectory()) throw new Error(`Expected analysis directory: ${file}`);
    directories.set(file, { path: file, mode: statSync(full).mode & 0o777 });
  };
  const addFile = file => {
    relativePath(file);
    if (environmentFile(file)) throw new Error(`Environment files cannot be staged as analysis inputs: ${file}`);
    if (file.startsWith('node_modules/')) return;
    files.set(file, { path: file, ...fileState(root, file) });
    for (let parent = path.posix.dirname(file); parent !== '.'; parent = path.posix.dirname(parent)) addDirectory(parent);
  };
  const walk = relative => {
    const full = relative ? safePath(root, relative) : root;
    for (const entry of readdirSync(full, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (['.git', 'node_modules'].includes(entry.name) || environmentFile(file) || finderFile(file) && !componentFile(file)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Unresolved project symlink: ${file}`);
      if (entry.isDirectory()) { addDirectory(file); walk(file); }
      else if (entry.isFile()) addFile(file);
      else throw new Error(`Unsupported filesystem entry: ${file}`);
    }
  };
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (projectRoots.has(entry.name)) { addDirectory(entry.name); walk(entry.name); }
    else if (/^tsconfig(?:\.[\w-]+)?\.json$/.test(entry.name) || ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].includes(entry.name)) addFile(entry.name);
  }
  const vocabulary = '.agents/prop-vocabulary.json';
  if (existsSync(path.join(root, vocabulary))) addFile(vocabulary);
  // Evidence may name public assets or other inputs that are not source imports.
  for (const file of [...files.keys()].filter(file => file.startsWith('design-system/components/') && file.endsWith('/metadata.json'))) {
    let metadata;
    try { metadata = readJson(safePath(root, file)); } catch { continue; } // The report/checks diagnose invalid metadata.
    const verification = metadata?.verification;
    const paths = [metadata?.code?.path, metadata?.code?.style,
      ...(Array.isArray(verification?.inputs) ? verification.inputs : []),
      ...(Array.isArray(verification?.stylesheets) ? verification.stylesheets : []),
      ...['fonts', 'assets'].flatMap(kind => (Array.isArray(verification?.[kind]) ? verification[kind] : [])
        .map(item => item?.source?.kind === 'file' ? item.source.path : null))];
    for (const input of paths.filter(input => typeof input === 'string' && input)) {
      if (existsSync(safePath(root, input))) addFile(input);
    }
  }
  const seeds = [...files.keys()].filter(file => file.startsWith('src/') && /\.(?:[cm]?[jt]sx?|css)$/.test(file));
  for (const file of localDependencies(root, seeds).files) addFile(file);
  // TypeScript may read extends outside src; include those configs without copying unrelated folders.
  const configFiles = [...files.keys()].filter(file => /^tsconfig(?:\.[\w-]+)?\.json$/.test(file));
  const configRead = absolute => {
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    relativePath(relative);
    if (relative.startsWith('node_modules/')) return ts.sys.readFile(absolute);
    const full = safePath(root, relative);
    if (!existsSync(full) || !statSync(full).isFile()) return undefined;
    addFile(relative); return readFileSync(full, 'utf8');
  };
  const dependencyRoots = [path.dirname(ts.getDefaultLibFilePath({})),
    ...(existsSync(path.join(root, 'node_modules')) ? [realpathSync(path.join(root, 'node_modules'))] : [])];
  for (const file of configFiles) {
    const parsed = ts.readConfigFile(path.join(root, file), configRead);
    if (!parsed.error) {
      const configuration = ts.parseJsonConfigFileContent(parsed.config, { useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
        readDirectory: ts.sys.readDirectory, readFile: configRead, fileExists: absolute => configRead(absolute) !== undefined }, path.dirname(path.join(root, file)), undefined, path.join(root, file));
      for (const input of configuration.fileNames) addFile(path.relative(root, input).split(path.sep).join('/'));
      // fileNames omits implicit typeRoots/types and transitively resolved declarations.
      // Observe the compiler's actual reads, with the same options as the props check.
      const host = ts.createCompilerHost(configuration.options, true), read = host.readFile;
      host.readFile = absolute => {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        if (relative && !relative.startsWith('../') && !path.isAbsolute(relative) && !relative.startsWith('node_modules/')) return configRead(absolute);
        if (relative.startsWith('node_modules/') || dependencyRoots.some(base => absolute.startsWith(base + path.sep))) return read(absolute);
        throw new Error(`TypeScript input outside the project/dependencies requires review: ${absolute}`);
      };
      // Building the program resolves inputs only; no emit, diagnostics execution or project code.
      ts.createProgram(configuration.fileNames, configuration.options, host).getSourceFiles();
    }
  }
  const typedInputs = [...files.keys()].filter(file => /\.[cm]?[jt]sx?$/.test(file));
  for (let index = 0; index < typedInputs.length; index++) {
    const file = typedInputs[index];
    for (const reference of ts.preProcessFile(readFileSync(safePath(root, file), 'utf8')).referencedFiles) {
      const input = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference.fileName));
      if (!files.has(input)) {
        addFile(input);
        // Installed dependencies are reused, not copied or traversed as local inputs.
        if (files.has(input)) typedInputs.push(input);
      }
    }
  }
  for (const file of localDependencies(root, typedInputs).files) addFile(file);
  return { files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), directories: [...directories.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}
function atomicWrite(root, relative, data, mode) {
  const full = safePath(root, relative);
  mkdirSync(path.dirname(full), { recursive: true });
  safePath(root, relative);
  const temporary = `${full}.removal-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, data, { flag: 'wx', mode, flush: true });
    chmodSync(temporary, mode);
    renameSync(temporary, full);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
function jsonWrite(root, relative, value) {
  const mode = fileState(root, relative)?.mode ?? 0o600;
  atomicWrite(root, relative, JSON.stringify(value, null, 2) + '\n', mode);
}
function stageProject(root, snapshot) {
  const stage = mkdtempSync(path.join(os.tmpdir(), 'component-removal-stage-'));
  try {
    // Temporary copies must remain writable for population, simulation and cleanup.
    // The manifest retains original modes; active files/directories never inherit these temporary permissions.
    for (const directory of snapshot.directories) { mkdirSync(safePath(stage, directory.path), { recursive: true }); chmodSync(safePath(stage, directory.path), directory.mode | 0o700); }
    for (const file of snapshot.files) {
      assertState(root, file.path, { sha256: file.sha256, mode: file.mode });
      atomicWrite(stage, file.path, readFileSync(safePath(root, file.path)), file.mode);
    }
    if (existsSync(path.join(root, 'node_modules'))) symlinkSync(realpathSync(path.join(root, 'node_modules')), path.join(stage, 'node_modules'), 'dir');
    return stage;
  } catch (error) { rmSync(stage, { recursive: true, force: true }); throw error; }
}
function staticChecks(root) {
  const checks = {};
  const run = (name, execute) => {
    try { checks[name] = execute().map(message => message.replaceAll(root, 'ROOT')).sort(); }
    catch (error) { checks[name] = [error.message.replaceAll(root, 'ROOT')]; }
  };
  run('ds', () => verify(root).errors);
  run('props', () => verifyProps(root, ts).errors);
  run('bindings', () => structuredReport(root).results.filter(r => r.status === 'FAIL').map(r => canonicalJson(r)));
  run('dependencies', () => {
    const errors = [];
    const walk = dir => {
      if (!existsSync(path.join(root, dir))) return;
      for (const item of readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const file = `${dir}/${item.name}`;
        if (item.isDirectory() && item.name !== 'node_modules') walk(file);
        else if (item.isFile() && /\.(?:[cm]?[jt]sx?|css)$/.test(file)) {
          errors.push(...localDependencies(root, [file]).warnings.map(w => `${file}: ${w}`));
          if (/\.[cm]?[jt]sx?$/.test(file)) {
            const tree = ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
            errors.push(...tree.parseDiagnostics.map(d => `${file}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`));
          }
        }
      }
    };
    walk('src'); return errors;
  });
  return checks;
}
const newErrors = (before, after) => Object.entries(after).flatMap(([check, errors]) => errors.filter(e => !before[check]?.includes(e)).map(error => ({ check, error })));

export function planRemoval(projectRoot, metadataPath, { demoReplacement = null, keepPaths = [], retirePaths = [], retireSerializationIds = [] } = {}) {
  const root = realpathSync(projectRoot), snapshot = census(root), original = removalReport(root, metadataPath);
  if (demoReplacement !== null && (!object(demoReplacement) || !demos.includes(demoReplacement.path) || typeof demoReplacement.text !== 'string')) throw new Error('Demo replacement needs an existing App.tsx/App.jsx path and exact proposed text');
  if (demoReplacement && !fileState(root, demoReplacement.path)) throw new Error('A demo proposal may edit an existing demo only');
  if (!Array.isArray(keepPaths) || !Array.isArray(retirePaths)) throw new Error('Explicit path lists required');
  const keep = new Set(keepPaths.map(relativePath)), retire = new Set(retirePaths.map(relativePath));
  const stage = stageProject(root, snapshot);
  try {
    const before = staticChecks(stage);
    if (demoReplacement) atomicWrite(stage, demoReplacement.path, demoReplacement.text, fileState(stage, demoReplacement.path).mode);
    const cleanupIds = [...new Set(retireSerializationIds)].sort();
    if (cleanupIds.some(id => typeof id !== 'string' || !id)) throw new Error('Explicit external serialization IDs required');
    if (cleanupIds.length) {
      const baseline = generateTokensCss(stage);
      if (baseline.errors.length || baseline.css !== readFileSync(path.join(stage, cssPath), 'utf8')) throw new Error('Repair current token sources before requesting serialization cleanup');
      const owner = readJson(path.join(stage, metadataPath)), state = readJson(path.join(stage, statePath));
      const others = Object.entries(readJson(path.join(stage, mapPath))).filter(([key, e]) => !key.startsWith('_') && e.designSystem?.metadata !== metadataPath)
        .map(([, e]) => readJson(safePath(stage, e.designSystem.metadata)));
      for (const id of cleanupIds) {
        if (!Object.hasOwn(state.externalSerialization || {}, id) || !owner.externalVariables?.some(v => v.id === id && v.type === 'FLOAT') ||
            others.some(m => m.externalVariables?.some(v => v.id === id) || m.bindings?.some(b => b.variableId === id))) throw new Error(`Serialization is not an exclusive orphan candidate: ${id}`);
      }
    }
    const report = removalReport(stage, metadataPath, { retirePaths: [...retire].filter(file => !finderFile(file)), keepPaths: [...keep].filter(file => !finderFile(file)) });
    const targetMetadata = readJson(path.join(stage, metadataPath));
    const scopedDirectories = [path.posix.dirname(metadataPath), ...(path.posix.dirname(targetMetadata.code.path).startsWith('src/components/') ? [path.posix.dirname(targetMetadata.code.path)] : [])];
    for (const file of snapshot.files) {
      if (!finderFile(file.path) && scopedDirectories.some(dir => file.path.startsWith(dir + '/')) && !report.files.some(known => known.path === file.path)) report.files.push({ path: file.path, attribution: 'attribution-unknown' });
    }
    const known = new Map(report.files.map(file => [file.path, file]));
    for (const file of [...keep, ...retire]) if (!known.has(file) || keep.has(file) && retire.has(file)) throw new Error(`Unknown or contradictory file decision: ${file}`);
    const map = readJson(path.join(stage, mapPath));
    const selected = Object.entries(map).filter(([key, e]) => !key.startsWith('_') && e.designSystem?.metadata === metadataPath);
    const [key, entry] = selected[0];
    const requiredFiles = [metadataPath, entry.designSystem.usage, entry.code.path];
    const explicitKeep = new Set(keep);
    // Preserve the requested intent before shared-file protection adds files to keep.
    const requestedRetire = new Set([...retire, ...requiredFiles,
      ...report.files.filter(file => file.attribution === 'candidate-to-retire' && !explicitKeep.has(file.path)).map(file => file.path)]);
    const fileConflicts = [];
    for (const file of report.files) {
      if (file.attribution === 'shared-identified') {
        if (retire.has(file.path)) fileConflicts.push({ kind: 'shared-file-retirement', path: file.path,
          sourceReferences: file.sourceReferences || [], otherMapClaims: file.otherMapClaims || [] });
        keep.add(file.path);
      } else if (file.attribution === 'attribution-unknown' && !keep.has(file.path) && !retire.has(file.path)) throw new Error(`Explicit keep/retire decision required: ${file.path}`);
      else if (!keep.has(file.path)) retire.add(file.path);
    }
    for (const file of requiredFiles.filter(file => keep.has(file))) fileConflicts.push({ kind: 'required-component-file-kept', path: file,
      reason: explicitKeep.has(file) ? 'explicit-keep' : 'shared-use',
      sourceReferences: known.get(file)?.sourceReferences || [], otherMapClaims: known.get(file)?.otherMapClaims || [] });
    const unresolved = report.analysis.uncertainties.filter(u => !(u.code === 'FILE_ATTRIBUTION_REQUIRES_REVIEW' && (keep.has(u.location) || retire.has(u.location))) &&
      !(cleanupIds.length && u.code === 'TOKEN_PROJECTION_UNAVAILABLE'));
    const dependencies = report.blockers.filter(b => b.kind !== 'source-dependency' || requestedRetire.has(b.target))
      .map(b => b.kind !== 'source-dependency' ? b : { ...b, sourceRetention: explicitKeep.has(b.source) ? 'explicit-keep'
        : known.get(b.source)?.otherMapClaims?.length ? 'other-component-claim' : 'external-consumer' });
    const demoReferences = report.demoReferences.filter(reference => requestedRetire.has(reference.target));
    if (fileConflicts.length || unresolved.length || dependencies.length || demoReferences.length) {
      const details = { fileConflicts, uncertainties: unresolved, dependencies, demoReferences };
      const error = new Error(`Removal blocked: ${canonicalJson(details)}`);
      error.code = 'COMPONENT_REMOVAL_BLOCKED'; error.details = details;
      throw error;
    }
    const metadata = readJson(path.join(stage, metadataPath));
    const state = readJson(path.join(stage, statePath)), inventory = readJson(path.join(stage, inventoryPath));
    delete map[key]; delete state.components[metadata.name];
    for (const id of cleanupIds) delete state.externalSerialization[id];
    inventory.components = inventory.components.filter(name => name !== metadata.name);
    for (const file of retire) unlinkSync(safePath(stage, file));
    jsonWrite(stage, mapPath, map); jsonWrite(stage, statePath, state); jsonWrite(stage, inventoryPath, inventory);
    // Remove directories only when proved empty, never recursively in the active project.
    const within = (dir, base) => dir === base || dir.startsWith(base + '/');
    const componentDirs = snapshot.directories.filter(dir => within(dir.path, path.posix.dirname(metadataPath)) ||
      path.posix.dirname(entry.code.path).startsWith('src/components/') && within(dir.path, path.posix.dirname(entry.code.path)));
    const removedDirectories = [];
    for (const dir of componentDirs.sort((a, b) => b.path.length - a.path.length)) {
      const finder = `${dir.path}/.DS_Store`;
      if (existsSync(path.join(stage, dir.path)) && readdirSync(path.join(stage, dir.path)).every(name => name === '.DS_Store') && fileState(stage, finder)) {
        unlinkSync(safePath(stage, finder)); retire.add(finder);
      }
      if (existsSync(path.join(stage, dir.path)) && readdirSync(path.join(stage, dir.path)).length === 0) { rmdirSync(path.join(stage, dir.path)); removedDirectories.push(dir); }
    }
    const generated = generateTokensCss(stage);
    if (generated.errors.length) throw new Error(`Token generation blocked: ${generated.errors.join('; ')}`);
    atomicWrite(stage, cssPath, generated.css, fileState(stage, cssPath).mode);
    const after = staticChecks(stage), introduced = newErrors(before, after);
    if (introduced.length) throw new Error(`New static failures: ${canonicalJson(introduced)}`);
    const proposed = census(stage), previousFiles = new Map(snapshot.files.map(f => [f.path, f]));
    if (proposed.files.some(f => !previousFiles.has(f.path))) throw new Error('Unexpected file creation in removal plan');
    const operations = snapshot.files.flatMap(file => {
      // Inputs can leave the analysis closure after retirement while remaining on disk.
      // Only actual staged writes/deletions become operations, never reduced reachability.
      const beforeState = { sha256: file.sha256, mode: file.mode }, afterState = fileState(stage, file.path);
      const next = afterState;
      if (equal(beforeState, afterState)) return [];
      return [{ path: file.path, before: beforeState, after: afterState,
        ...(next ? { content: readFileSync(path.join(stage, file.path)).toString('base64') } : {}) }];
    });
    if (!equal(census(root), snapshot)) throw new Error('Project changed while preparing the plan');
    const plan = { schemaVersion: 1, kind: 'component-removal-plan', root, metadata: metadataPath, component: metadata.name,
      proposal: { demoReplacement, keepPaths: [...keep].sort(), retirePaths: [...retire].filter(file => !finderFile(file)).sort(), retireSerializationIds: cleanupIds },
      filesystemMetadata: [...retire].filter(finderFile).sort(),
      source: snapshot, operations, removedDirectories: removedDirectories.sort((a, b) => a.path.localeCompare(b.path)),
      keptFiles: [...keep].sort(), validation: { before, after, newErrors: introduced, warnings: generated.warnings,
        imports: 'NOT RUN; the archive command runs verify:imports after applying. Stale evidence is not confirmed automatically.' },
      ownership: 'Candidates and explicit per-file choices, not exclusive ownership proof. Review this exact plan before approving.',
      preserved: original.historicalEvidence, scope: 'Recoverable retirement; no shared token/resource cleanup or visual approval.' };
    return { ...plan, hash: planHash(plan) };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

function mutablePath(file) {
  relativePath(file);
  if (!(file.startsWith('src/') || file.startsWith('design-system/components/') || [mapPath, statePath, inventoryPath].includes(file))) throw new Error(`Unsupported mutation path: ${file}`);
}
function validatePlan(plan, root) {
  if (plan?.schemaVersion !== 1 || plan.kind !== 'component-removal-plan' || plan.root !== root || plan.hash !== planHash(plan) || !Array.isArray(plan.operations)) throw new Error('Invalid or mismatched removal plan');
  const paths = new Set();
  for (const op of plan.operations) {
    mutablePath(op.path);
    if (paths.has(op.path)) throw new Error('Duplicate operation'); paths.add(op.path);
    for (const state of [op.before, op.after].filter(Boolean)) if (!/^[a-f0-9]{64}$/.test(state.sha256 || '') || !Number.isInteger(state.mode) || state.mode < 0 || state.mode > 0o777) throw new Error('Invalid file state in plan');
    if (!op.before || op.after && (typeof op.content !== 'string' || sha256(Buffer.from(op.content, 'base64')) !== op.after.sha256)) throw new Error('Invalid planned file content');
  }
  if (!Array.isArray(plan.removedDirectories)) throw new Error('Directory manifest required');
  for (const dir of plan.removedDirectories) {
    relativePath(dir.path);
    if (!(dir.path.startsWith('src/components/') || dir.path.startsWith('design-system/components/')) || !Number.isInteger(dir.mode) || dir.mode < 0 || dir.mode > 0o777) throw new Error('Invalid component directory in plan');
  }
}
function acquire(root, id, archive = null) {
  writeFileSync(path.join(root, lockPath), JSON.stringify({ id, archive }) + '\n', { flag: 'wx', mode: 0o600, flush: true });
}
function release(root, id) {
  const file = path.join(root, lockPath);
  if (existsSync(file) && readJson(file).id === id) unlinkSync(file);
}
function saveManifest(archive, manifest) { jsonWrite(archive, 'manifest.json', manifest); }
function loadArchive(root, location, { allowIncomplete = false } = {}) {
  const archive = outside(root, location), manifest = readJson(safePath(archive, 'manifest.json')), plan = readJson(safePath(archive, 'plan.json'));
  validatePlan(plan, root);
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'component-removal-archive' || manifest.root !== root || manifest.planHash !== plan.hash ||
      path.basename(archive) !== `component-removal-${manifest.id}` || !equal(manifest.operations, plan.operations.map(({ content, ...op }) => op))) throw new Error('Archive manifest and approved plan disagree');
  const partialBackup = allowIncomplete && ['PREPARING', 'ABANDONED'].includes(manifest.status);
  for (const op of partialBackup ? [] : plan.operations) {
    if (!equal(fileState(archive, `originals/${op.path}`), op.before)) throw new Error(`Backup is missing, modified or corrupt: ${op.path}`);
    if (op.after && !equal(fileState(archive, `proposed/${op.path}`), op.after)) throw new Error(`Proposed content is missing or corrupt: ${op.path}`);
  }
  return { archive, manifest, plan };
}
function applyState(root, archive, op, side, expected) {
  assertState(root, op.path, expected);
  const desired = op[side];
  if (desired) {
    const data = readFileSync(safePath(archive, `${side === 'before' ? 'originals' : 'proposed'}/${op.path}`));
    if (sha256(data) !== desired.sha256) throw new Error(`Backup content changed: ${op.path}`);
    atomicWrite(root, op.path, data, desired.mode);
  } else unlinkSync(safePath(root, op.path));
}
function reconcile(root, archive, plan, side) {
  const conflicts = [], blockedDirectories = [];
  if (side === 'before') for (const dir of [...plan.removedDirectories].sort((a, b) => a.path.length - b.path.length)) {
    try {
      const full = safePath(root, dir.path);
      if (existsSync(full)) {
        if (!statSync(full).isDirectory() || (statSync(full).mode & 0o777) !== dir.mode) throw new Error(`Concurrent directory change preserved: ${dir.path}`);
      } else { mkdirSync(full, { recursive: true }); chmodSync(full, dir.mode); }
    } catch (error) { blockedDirectories.push(dir.path); conflicts.push(error.message); }
  }
  for (const op of [...plan.operations].reverse()) {
    try {
      if (blockedDirectories.some(dir => op.path.startsWith(dir + '/'))) throw new Error(`Directory conflict prevents restoring: ${op.path}`);
      const current = fileState(root, op.path);
      if (equal(current, op[side])) continue;
      const other = op[side === 'before' ? 'after' : 'before'];
      if (!equal(current, other)) throw new Error(`Concurrent change preserved: ${op.path}`);
      applyState(root, archive, op, side, other);
    } catch (error) { conflicts.push(error.message); }
  }
  if (side === 'after') for (const dir of [...plan.removedDirectories].sort((a, b) => b.path.length - a.path.length)) {
    try {
      const full = safePath(root, dir.path);
      if (!existsSync(full)) continue;
      if (readdirSync(full).length) throw new Error(`Concurrent directory contents preserved: ${dir.path}`);
      rmdirSync(full);
    } catch (error) { conflicts.push(error.message); }
  }
  return conflicts;
}

export async function archiveRemoval(projectRoot, plan, { archiveRoot, approved = false, verifyGate = verifyImports, beforeStep } = {}) {
  if (!approved) throw new Error('Explicit approval of the exact removal plan is required');
  const root = realpathSync(projectRoot);
  validatePlan(plan, root);
  const parent = outside(root, archiveRoot), id = randomUUID();
  acquire(root, id);
  let archive, manifest, keepLock = false;
  try {
    if (!equal(census(root), plan.source)) throw new Error('Stale removal plan: project files or directory inventory changed');
    const fresh = planRemoval(root, plan.metadata, plan.proposal);
    if (fresh.hash !== plan.hash) throw new Error('Stale removal plan: regenerate it after any project or dependency change');
    archive = path.join(parent, `component-removal-${id}`);
    mkdirSync(archive, { mode: 0o700 });
    jsonWrite(archive, 'plan.json', plan);
    manifest = { schemaVersion: 1, kind: 'component-removal-archive', id, root, planHash: plan.hash,
      status: 'PREPARING', operations: plan.operations.map(({ content, ...op }) => op), completed: [], validation: null };
    saveManifest(archive, manifest);
    for (const op of plan.operations) {
      assertState(root, op.path, op.before);
      atomicWrite(archive, `originals/${op.path}`, readFileSync(safePath(root, op.path)), op.before.mode);
      if (op.after) atomicWrite(archive, `proposed/${op.path}`, Buffer.from(op.content, 'base64'), op.after.mode);
    }
    loadArchive(root, archive);
    if (!equal(census(root), plan.source)) throw new Error('Project changed while creating the backup');
    jsonWrite(root, lockPath, { id, archive });
    manifest.status = 'APPLYING'; saveManifest(archive, manifest);
    for (const op of plan.operations) {
      beforeStep?.(op);
      applyState(root, archive, op, 'after', op.before);
      manifest.completed.push(op.path); saveManifest(archive, manifest);
    }
    for (const dir of [...plan.removedDirectories].sort((a, b) => b.path.length - a.path.length)) rmdirSync(safePath(root, dir.path));
    const checks = staticChecks(root), introduced = newErrors(plan.validation.before, checks);
    if (introduced.length) throw new Error(`New static failures after removal: ${canonicalJson(introduced)}`);
    manifest.status = 'ARCHIVED'; manifest.validation = { static: checks, imports: { status: 'NOT RUN' } }; saveManifest(archive, manifest);
    try { manifest.validation.imports = await verifyGate(root); }
    catch (error) { manifest.validation.imports = { status: 'NOT RUN', reason: error.message }; }
    saveManifest(archive, manifest);
    return { status: 'ARCHIVED', archive, delivery: manifest.validation.imports.status === 'PASS' && !Object.values(checks).some(errors => errors.length) ? 'AUTOMATED_CHECKS_PASSED' : 'PENDING_VERIFICATION',
      validation: manifest.validation, note: 'Retirement is recoverable; no visual comparison or confirmation was created.' };
  } catch (error) {
    error.archive = archive;
    if (archive && manifest?.status === 'APPLYING') {
      const conflicts = reconcile(root, archive, plan, 'before');
      manifest.status = conflicts.length ? 'RECOVERY_REQUIRED' : 'ROLLED_BACK'; manifest.recoveryConflicts = conflicts;
      keepLock = conflicts.length > 0;
      try { saveManifest(archive, manifest); } catch (journalError) { keepLock = true; error.recoveryError = journalError.message; }
    }
    throw error;
  } finally { if (!keepLock) release(root, id); }
}

export async function restoreRemoval(projectRoot, location, { approved = false, verifyGate = verifyImports, beforeStep } = {}) {
  if (!approved) throw new Error('Explicit restore approval required');
  const root = realpathSync(projectRoot), { archive, manifest, plan } = loadArchive(root, location), id = randomUUID();
  if (manifest.status !== 'ARCHIVED') throw new Error('Only a completed archive can be restored; inspect recovery for interrupted operations');
  acquire(root, id, archive);
  let keepLock = false;
  try {
    for (const op of plan.operations) assertState(root, op.path, op.after);
    for (const dir of plan.removedDirectories) if (existsSync(safePath(root, dir.path))) throw new Error(`Restore directory conflict: ${dir.path}`);
    manifest.status = 'RESTORING'; manifest.restoreId = id; saveManifest(archive, manifest);
    for (const dir of plan.removedDirectories) { mkdirSync(safePath(root, dir.path), { recursive: true }); chmodSync(safePath(root, dir.path), dir.mode); }
    for (const op of plan.operations) { beforeStep?.(op); applyState(root, archive, op, 'before', op.after); }
    manifest.status = 'RESTORED';
    manifest.restoredStatic = staticChecks(root);
    try { manifest.restoredValidation = await verifyGate(root); }
    catch (error) { manifest.restoredValidation = { status: 'NOT RUN', reason: error.message }; }
    saveManifest(archive, manifest);
    return { status: 'RESTORED', archive, validation: manifest.restoredValidation, static: manifest.restoredStatic,
      delivery: manifest.restoredValidation.status === 'PASS' && !Object.values(manifest.restoredStatic).some(errors => errors.length) ? 'AUTOMATED_CHECKS_PASSED' : 'PENDING_VERIFICATION',
      note: 'Original bytes restored; historical confirmations are not newly approved.' };
  } catch (error) {
    if (manifest.status === 'RESTORING') {
      const conflicts = reconcile(root, archive, plan, 'after');
      manifest.status = conflicts.length ? 'RECOVERY_REQUIRED' : 'ARCHIVED'; manifest.recoveryConflicts = conflicts;
      keepLock = conflicts.length > 0;
      try { saveManifest(archive, manifest); } catch (journalError) { keepLock = true; error.recoveryError = journalError.message; }
    }
    throw error;
  } finally { if (!keepLock) release(root, id); }
}

export function recoverRemoval(projectRoot, location, { approved = false, operationStopped = false } = {}) {
  if (!approved || !operationStopped) throw new Error('Explicit recovery approval and confirmation that the original operation has stopped are required; a PID is not proof');
  const root = realpathSync(projectRoot), { archive, manifest, plan } = loadArchive(root, location, { allowIncomplete: true });
  const lock = existsSync(path.join(root, lockPath)) ? readJson(safePath(root, lockPath)) : null;
  if (lock && (![manifest.id, manifest.restoreId].includes(lock.id) || lock.archive && lock.archive !== archive)) throw new Error('Another operation owns the project lock');
  if (!['PREPARING', 'APPLYING', 'RESTORING', 'RECOVERY_REQUIRED', 'ARCHIVED', 'ROLLED_BACK'].includes(manifest.status)) throw new Error('Archive is not recoverable in its current state');
  const id = lock?.id || manifest.id;
  if (!lock) acquire(root, id, archive);
  if (manifest.status === 'PREPARING') {
    if (!equal(census(root), plan.source)) throw new Error('Incomplete backup: project is not the untouched planned source; manual recovery required');
    manifest.status = 'ABANDONED'; saveManifest(archive, manifest); release(root, id);
    return { status: 'ABANDONED', archive, conflicts: [], validation: 'Active project matches the original source; no component operation was applied.' };
  }
  const conflicts = reconcile(root, archive, plan, 'before');
  manifest.status = conflicts.length ? 'RECOVERY_REQUIRED' : 'RESTORED'; manifest.recoveryConflicts = conflicts;
  saveManifest(archive, manifest);
  if (!conflicts.length) release(root, id);
  return { status: manifest.status, archive, conflicts, validation: 'NOT RUN; revalidate restored bytes before delivery' };
}

export function purgeRemovalArchive(projectRoot, location, { approved = false, backupNotNeeded = false } = {}) {
  if (!approved || !backupNotNeeded) throw new Error('Explicit purge approval and acknowledgement of irreversible backup loss required');
  const root = realpathSync(projectRoot), { archive, manifest, plan } = loadArchive(root, location, { allowIncomplete: true });
  if (!['ARCHIVED', 'RESTORED', 'ROLLED_BACK', 'ABANDONED'].includes(manifest.status) || existsSync(path.join(root, lockPath))) throw new Error('Do not purge an active or incomplete recovery');
  const expected = new Set(['manifest.json', 'plan.json', ...plan.operations.flatMap(op => [`originals/${op.path}`, ...(op.after ? [`proposed/${op.path}`] : [])])]);
  const expectedDirectories = new Set();
  for (const file of expected) for (let parent = path.posix.dirname(file); parent !== '.'; parent = path.posix.dirname(parent)) expectedDirectories.add(parent);
  const walk = relative => {
    for (const entry of readdirSync(relative ? safePath(archive, relative) : archive, { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Unexpected archive symlink');
      if (entry.isDirectory()) {
        if (!expectedDirectories.has(file)) throw new Error(`Unrecognized archive directory: ${file}`);
        walk(file);
      }
      else if (!entry.isFile() || !expected.has(file)) throw new Error(`Unrecognized archive content: ${file}`);
    }
  };
  walk(''); rmSync(archive, { recursive: true });
  return { status: 'PURGED', archive, note: 'Only the explicit backup was removed; shared resources and historical evidence were untouched.' };
}
