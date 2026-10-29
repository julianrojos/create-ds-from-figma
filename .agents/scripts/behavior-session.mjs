import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, lstatSync, realpathSync, renameSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreviewProject } from '../checks/tests/fixtures/preview-project.mjs';
import { delegationFixture } from '../checks/tests/fixtures/delegation-fixture.mjs';
import { readGuidance } from './read-guidance.mjs';
import { browserRuntime } from './test-kit.mjs';
import { repoRoot, loadCases, digest, instructionHash, instructionFiles, manifest, safeRelative, classifyCommand, scoreBehavior, validateQuery, validTypeDecision, renderObservedType } from './evaluate-behavior.mjs';

const sessionQueues = new Map();
const maxLockWaitMs = 240000;
function writeJson(session, name, value) {
  const temporary = path.join(session, `.${name}-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    renameSync(temporary, path.join(session, name));
  } finally { rmSync(temporary, { force: true }); }
}
function save(session, run) { writeJson(session, 'trace.json', run); }
function sessionDirectory(session) {
  session = realpathSync(session);
  if (!path.basename(session).startsWith('ds-behavior-session-') || path.dirname(session) !== realpathSync(os.tmpdir())) throw new Error('Expected external temporary session');
  return session;
}
function load(session) {
  if (existsSync(path.join(session, 'completion.json'))) throw new Error('Session already closed');
  const run = JSON.parse(readFileSync(path.join(session, 'trace.json')));
  if (path.dirname(realpathSync(run.projectRoot)) !== realpathSync(os.tmpdir()) || !path.basename(run.projectRoot).startsWith('ds-preview-fixture-')) throw new Error('Unsafe project root');
  if (run.finished) throw new Error('Session already closed');
  return { session, run };
}
async function acquireSessionLock(session, lockTimeoutMs) {
  const lock = path.join(session, '.session-lock'), deadline = performance.now() + lockTimeoutMs;
  for (;;) {
    try { mkdirSync(lock, { mode: 0o700 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (performance.now() >= deadline) throw new Error(`Session busy: ${lock}. Lock preserved; do not remove an active or abandoned lock automatically.`);
      await delay(Math.min(25, Math.max(1, deadline - performance.now())));
    }
  }
  const owner = { id: randomUUID(), pid: process.pid, createdAt: new Date().toISOString() };
  try { writeJson(lock, 'owner.json', owner); }
  catch (error) { rmSync(lock, { recursive: true, force: true }); throw error; }
  return () => {
    const current = JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8'));
    if (current.id !== owner.id) throw new Error('Session lock ownership changed; lock preserved');
    rmSync(lock, { recursive: true });
  };
}
function withSession(sessionPath, operation, { lockTimeoutMs = maxLockWaitMs } = {}) {
  if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 0 || lockTimeoutMs > maxLockWaitMs) throw new Error('Invalid session lock timeout');
  const session = sessionDirectory(sessionPath), previous = sessionQueues.get(session) || Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    let release;
    try { release = await acquireSessionLock(session, lockTimeoutMs); }
    catch (error) {
      writeJson(session, `.recording-gap-${randomUUID()}.json`, { error: error.message, pid: process.pid, createdAt: new Date().toISOString() });
      throw error;
    }
    try { return await operation(load(session)); }
    finally { release(); }
  });
  sessionQueues.set(session, pending);
  const clean = () => { if (sessionQueues.get(session) === pending) sessionQueues.delete(session); };
  pending.then(clean, clean);
  return pending;
}
function projectFile(root, relative) {
  safeRelative(relative);
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    try { if (lstatSync(cursor).isSymbolicLink()) throw new Error('Symlink paths are not allowed for tool operations'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return cursor;
}
function sealedCase(run) {
  const c = loadCases().find(item => item.id === run.caseId);
  if (!c || digest(c) !== run.caseHash) throw new Error('Sealed behavior case differs from session hash');
  return c;
}
export function beginSession(caseId, { model = 'unreported', modelVersion = 'unreported', executor = 'external-agent' } = {}) {
  const c = loadCases().find(c => c.id === caseId); if (!c) throw new Error('Unknown behavior case');
  const session = mkdtempSync(path.join(os.tmpdir(), 'ds-behavior-session-'));
  const setup = c.setup || {};
  const runtime = browserRuntime(), fixture = createPreviewProject({ runtimeModules: path.join(runtime, 'node_modules'), ...(setup.missingImage ? { image: 'missing-essential-image.png' } : {}) });
  // Fix known nonessential literal CSS for a static, executable synthetic component.
  const cssFile = path.join(fixture.root, 'src/PreviewGlyph.module.css');
  writeFileSync(cssFile, readFileSync(cssFile, 'utf8').replace('border: 1px solid black;', 'border: 1px solid var(--ds-color-id);'));
  const metadataFile = path.join(fixture.root, fixture.metadataPath), metadata = JSON.parse(readFileSync(metadataFile));
  metadata.verification.stylesheets.push('src/styles/tokens.css');
  writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  if (setup.evidenceOutsideProject) {
    // Reuse the synthetic capture as supplied evidence outside the evaluated project.
    renameSync(fixture.root, path.join(session, 'synthetic-evidence'));
    fixture.root = mkdtempSync(path.join(os.tmpdir(), 'ds-preview-fixture-'));
    const capture = setup.evidenceOutsideProject === 'delegation' ? delegationFixture().capture : JSON.parse(readFileSync(path.join(session, 'synthetic-evidence', metadata.evidence.snapshot))).capture;
    writeFileSync(path.join(session, 'supplied-capture.json'), JSON.stringify(capture, null, 2));
  }
  if (setup.emptyResourcePolicy) writeFileSync(path.join(fixture.root, 'resource-policy.json'), JSON.stringify({ schemaVersion: 1, maxBytes: 1024, rules: [] }));
  const hasTypeFixture = c.rules.some(rule => rule.kind === 'type-decision');
  const visibleInputs = { ...c.inputs };
  delete visibleInputs.pluginNodeType;
  delete visibleInputs.designRequirements;
  const fixtureContext = hasTypeFixture ? { typeFixture: 'synthetic-plugin-api', blockedBeforeImplementation: true }
    : caseId === 'candidate-correspondence' || caseId === 'repeated-url' || c.rules.some(r=>r.kind==='dependency-decision') ? { metadata: fixture.metadataPath }
    : { evidenceOutsideProject: path.join(session, 'supplied-capture.json'), blockedBeforeImplementation: true };
  writeFileSync(path.join(fixture.root, 'behavior-input.json'), JSON.stringify({ caseId: c.id, facts: visibleInputs, fixture: 'Synthetic process fixture; no Figma fidelity claim.', ...fixtureContext }, null, 2));
  const diagnosticArgv = [process.execPath, path.join(repoRoot, '.agents/skills/create-ds-from-figma/scripts/finalize-import.mjs'), fixture.root, fixture.metadataPath, '--diagnose'];
  const run = { schemaVersion: 1, diagnosticArgv, caseId, caseHash: digest(c), instructionHash: instructionHash(), date: new Date().toISOString(), executor, model, modelVersion,
    projectRoot: fixture.root, started: true, finished: false, tools: [{ name: 'read', effects: ['read'] }, { name: 'exec', effects: ['execute','unknown'] }, { name: 'edit', effects: ['write'] }, { name: 'query', effects: ['read'] }],
    recording: { complete: false, gaps: 0 }, before: manifest(fixture.root), events: [] };
  save(session, run);
  const instructions = instructionFiles();
  for (const file of instructions) { const target = path.join(session, 'instructions', file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, readFileSync(path.join(repoRoot, file))); }
  return { session, projectRoot: fixture.root, caseId, prompt: c.prompt, inputs: visibleInputs, metadata: fixture.metadataPath,
    diagnosticArgv,
    readingPolicy: { required:'Use the recorder for all project reads; shell/exec reads do not count', command:[process.execPath,fileURLToPath(import.meta.url),'read',session,'RELATIVE'], queries:'Use query files, guidance or static for exploration and checks' },
    instructions: path.join(session, 'instructions'), recorder: fileURLToPath(import.meta.url), node: process.execPath, queries: { files: 'query SESSION files', guidance: 'query SESSION guidance PHASE [FEATURE...] (equivalent to read:guidance -- PHASE --with FEATURE)', static: 'query SESSION static ds|props|bindings (kit APIs; no project script/config execution)', ...(hasTypeFixture ? { figmaType: 'query SESSION figma-type (sealed synthetic Plugin API type fixture)' } : {}), ...(c.inputs.designRequirements ? {designRequirements:'query SESSION design-requirements (sealed synthetic design specification)'} : {}) }, scope: 'All project operations must use this recorder. Provenance/completeness remain declared, not authenticated.' };
}
export async function recordRead(sessionPath, relative, options) {
  return withSession(sessionPath, async ({ session, run }) => {
    const e = { sequence: run.events.length + 1, tool: 'read', effect: 'read', scope: 'project', path: relative, complete: false };
    run.events.push(e); save(session, run);
    try { e.content = readFileSync(projectFile(run.projectRoot, relative), 'utf8'); }
    catch (error) { e.error = error.message; }
    finally { e.complete = true; save(session, run); }
    return e;
  }, options);
}
export async function recordQuery(sessionPath, operation, args = [], options) {
  return withSession(sessionPath, async ({ session, run }) => {
    const e = { sequence: run.events.length + 1, tool: 'query', operation, args, effect: 'read', scope: 'unknown', complete: false };
    run.events.push(e); save(session, run);
    try {
      e.scope = validateQuery(operation, args);
      if (operation === 'files') e.result = { entries: manifest(run.projectRoot) };
      else if (operation === 'guidance') e.result = readGuidance([args[0]], args.slice(1), { root: path.join(session, 'instructions') });
      else if (operation === 'figma-type') {
        const c = sealedCase(run);
        if (!Object.hasOwn(c.inputs, 'pluginNodeType')) throw new Error('No sealed synthetic type fixture for this case');
        e.result = { schemaVersion: 1, source: 'synthetic-plugin-api', status: c.inputs.pluginNodeType === null ? 'unavailable' : 'resolved', nodeType: c.inputs.pluginNodeType };
      }
      else if (operation === 'design-requirements') {
        const c = sealedCase(run);
        if (!c.inputs.designRequirements) throw new Error('No sealed design requirements for this case');
        e.result = {schemaVersion:1,source:'synthetic-design-requirements',requirements:c.inputs.designRequirements};
      }
      else if (args[0] === 'ds') e.result = (await import('../checks/verify-ds.mjs')).verify(run.projectRoot);
      else if (args[0] === 'props') {
        const ts = (await import('typescript')).default;
        e.result = (await import('../checks/verify-props.mjs')).verifyProps(run.projectRoot, ts);
      } else e.result = (await import('../checks/verify-bindings.mjs')).structuredReport(run.projectRoot);
    } catch (error) { e.error = error.message; }
    finally { e.complete = true; save(session, run); }
    return e;
  }, options);
}
export async function recordExec(sessionPath, argv, options) {
  return withSession(sessionPath, async ({ session, run }) => {
    const e = { sequence: run.events.length + 1, tool: 'exec', argv, ...classifyCommand(argv, run.projectRoot), complete: false };
    run.events.push(e); save(session, run);
    if (e.operation !== 'diagnosis' || !Array.isArray(run.diagnosticArgv) || digest(argv) !== digest(run.diagnosticArgv)) {
      Object.assign(e, { execution: 'REJECTED', exitCode: null, stdout: '', stderr: '', error: 'Only the exact diagnostic argv is allowed; command was not executed. For project reads use recorder read SESSION RELATIVE, or query SESSION files; exec cat does not count as a recorded read.', complete: true });
      save(session, run); return e;
    }
    e.execution = 'ATTEMPTED'; save(session, run);
    try {
      const result = spawnSync(argv[0], argv.slice(1), { cwd: run.projectRoot, encoding: 'utf8', shell: false, maxBuffer: 32 * 1024 * 1024, timeout: 180000 });
      Object.assign(e, { exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error?.message || null });
    } catch (error) { Object.assign(e, { exitCode: null, stdout: '', stderr: '', error: error.message }); }
    finally { e.complete = true; save(session, run); }
    return e;
  }, options);
}
export async function recordEdit(sessionPath, relative, content, options) {
  return withSession(sessionPath, async ({ session, run }) => {
    const e = { sequence: run.events.length + 1, tool: 'edit', effect: 'write', scope: 'project', path: relative, content, complete: false };
    run.events.push(e); save(session, run);
    try { const file = projectFile(run.projectRoot, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); e.result = 'written'; }
    catch (error) { e.error = error.message; }
    e.complete = true; save(session, run); return e;
  }, options);
}
export async function finishSession(sessionPath, final, options) {
  return withSession(sessionPath, async ({ session, run }) => {
    const c = sealedCase(run), typeCase = c.rules.some(rule => rule.kind === 'type-decision');
    if (!final || typeof final.confirmed !== 'boolean' || !['blocked','reuse','diagnosed','preanalysis-continued'].includes(final.status) || (typeCase ? !validTypeDecision(final.typeDecision) || Object.keys(final).some(key => !['status','confirmed','typeDecision'].includes(key)) : typeof final.finalText !== 'string' || final.typeDecision !== undefined)) throw new Error('Invalid structured final');
    run.final = final;
    run.after = manifest(run.projectRoot); run.finished = true; run.recording.complete = true;
    const admissionGaps = readdirSync(session).filter(name => name.startsWith('.recording-gap-') && name.endsWith('.json')).length;
    if (Number.isSafeInteger(run.recording.gaps) && run.recording.gaps >= 0) run.recording.gaps += admissionGaps;
    const score = scoreBehavior(run, c);
    const observedQuery = typeCase && score.status === 'PASS' ? run.events.findLast(e => e.tool === 'query' && e.operation === 'figma-type' && e.error === undefined && e.result?.nodeType === c.inputs.pluginNodeType) : null;
    const deliveryText = observedQuery ? renderObservedType(observedQuery.result.nodeType) : null;
    if (typeCase && score.status === 'PASS' && deliveryText === null) throw new Error('Passing type decision has no observed delivery');
    const delivery = typeCase && score.status === 'PASS' ? { deliveryText } : typeCase ? { evaluationMessage: `Evaluación ${score.status}: no hay diagnóstico de tipo entregable.` } : {};
    const completion = path.join(session, 'completion.json');
    writeJson(session, 'completion.json', { ...run, sealedCase: c, sealedScore: score, ...delivery });
    const projectionErrors = [];
    for (const [name, value] of [['trace.json', run], ['case.json', c], ['score.json', score]]) {
      try { writeJson(session, name, value); }
      catch (error) { projectionErrors.push({ file: name, error: error.message }); }
    }
    return { session, trace: completion, ...score, ...(projectionErrors.length ? { projectionErrors } : {}), ...delivery };
  }, options);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2); let result;
    if (command === 'begin') {
      const [caseId, ...flags] = args, options = {};
      for (let i = 0; i < flags.length; i += 2) { const key = { '--model':'model','--model-version':'modelVersion','--executor':'executor' }[flags[i]]; if (!key || !flags[i+1]) throw new Error('Invalid begin options'); options[key] = flags[i+1]; }
      result = beginSession(caseId, options);
    } else if (command === 'read' && args.length === 2) result = await recordRead(...args);
    else if (command === 'query' && args.length >= 2) result = await recordQuery(args[0], args[1], args.slice(2));
    else if (command === 'exec' && args[1] === '--') result = await recordExec(args[0], args.slice(2));
    else if (command === 'edit' && args.length === 3) result = await recordEdit(args[0], args[1], args[2]);
    else if (command === 'finish' && args.length === 2) result = await finishSession(args[0], JSON.parse(readFileSync(args[1], 'utf8')));
    else throw new Error('Usage: behavior-session.mjs begin CASE [--model M --model-version V --executor E] | read SESSION RELATIVE | query SESSION files|guidance PHASE [FEATURE...]|static ds|props|bindings|figma-type|design-requirements | exec SESSION -- ARGV... | edit SESSION RELATIVE CONTENT | finish SESSION FINAL_JSON_PATH');
    console.log(JSON.stringify(result, null, 2));
    if (result?.execution === 'REJECTED') process.exitCode = 2;
  } catch (error) { console.log(JSON.stringify({ status: 'ERROR', error: error.message })); process.exitCode = 2; }
}
