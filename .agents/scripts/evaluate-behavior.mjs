import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureApiProps } from '../checks/lib/fixture-api.mjs';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value) || /^[a-z]:/i.test(value) || value.split('/').some(s => !s || s === '.' || s === '..')) throw new Error('Unsafe relative path');
  return value;
}
export function manifest(root) {
  const entries = [];
  function walk(relative = '') {
    for (const name of readdirSync(path.join(root, relative)).sort()) {
      const file = relative ? `${relative}/${name}` : name, stat = lstatSync(path.join(root, file));
      if (stat.isSymbolicLink()) entries.push({ path: file, type: 'symlink', mode: stat.mode & 0o777, target: readlinkSync(path.join(root, file)) });
      else if (stat.isDirectory()) { entries.push({ path: file, type: 'directory', mode: stat.mode & 0o777 }); walk(file); }
      else if (stat.isFile()) entries.push({ path: file, type: 'file', mode: stat.mode & 0o777, hash: createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') });
      else entries.push({ path: file, type: 'unknown', mode: stat.mode & 0o777 });
    }
  }
  walk(); return entries;
}
const ruleKinds = new Set(['no-project-writes', 'tree-unchanged', 'no-confirmation', 'outcome', 'diagnosis-executed', 'type-decision', 'dependency-decision']);
const outcomeValues = new Set(['blocked','reuse','diagnosed','preanalysis-continued']);
const typeReasons = { COMPONENT: 'type-accepted', COMPONENT_SET: 'type-accepted', INSTANCE: 'type-accepted', FRAME: 'frame-confirmed', unknown: 'type-undetermined' };
export function validTypeDecision(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === 'nodeType,reason' && Object.hasOwn(typeReasons, value.nodeType) && value.reason === typeReasons[value.nodeType];
}
const typeDeliveryText = {
  COMPONENT: 'Tipo confirmado: COMPONENT. Continúa el preanálisis; no se ha escrito el proyecto.',
  COMPONENT_SET: 'Tipo confirmado: COMPONENT_SET. Continúa el preanálisis; no se ha escrito el proyecto.',
  INSTANCE: 'Tipo confirmado: INSTANCE. Continúa el preanálisis; no se ha escrito el proyecto.',
  FRAME: 'DS_GAP: FRAME confirmado. El nodo no es importable; no se ha escrito el proyecto.',
  unknown: 'DS_GAP: tipo no determinado. Fuente intentada: query figma-type (Plugin API sintética). Causa: el fixture devolvió unavailable. No se ha escrito el proyecto.',
};
export function renderTypeDecision(value) { return validTypeDecision(value) ? typeDeliveryText[value.nodeType] : null; }
export function renderObservedType(nodeType) {
  if (nodeType === null) return renderTypeDecision({ nodeType: 'unknown', reason: 'type-undetermined' });
  if (!Object.hasOwn(typeReasons, nodeType) || nodeType === 'unknown') return null;
  return renderTypeDecision({ nodeType, reason: typeReasons[nodeType] });
}
export function validDesignRequirements(value) {
  if (!value || !/^[A-Z][A-Za-z0-9]*$/.test(value.component) || !Array.isArray(value.props) || !value.props.length || value.props.some(p => typeof p !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(p)) || new Set(value.props).size !== value.props.length) return false;
  try { safeRelative(value.codePath); } catch { return false; }
  return value.codePath.startsWith('src/') && Object.keys(value).sort().join(',') === 'codePath,component,props';
}
export function validateCase(c) {
  if (c?.setup !== undefined) {
    const s = c.setup;
    if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).some(k => !['missingImage', 'evidenceOutsideProject', 'emptyResourcePolicy'].includes(k)) || ['missingImage', 'emptyResourcePolicy'].some(k => s[k] !== undefined && typeof s[k] !== 'boolean') || s.evidenceOutsideProject !== undefined && !['component', 'delegation'].includes(s.evidenceOutsideProject)) throw new Error('Invalid behavior fixture setup');
  }
  if (!c || !/^[a-z][a-z0-9-]+$/.test(c.id) || c.fixture !== 'preview-project' || typeof c.prompt !== 'string' || !c.inputs || !Array.isArray(c.rules) || !c.rules.length) throw new Error('Invalid behavior case');
  for (const r of c.rules) {
    if (!ruleKinds.has(r.kind)) throw new Error(`Unknown behavior rule: ${r.kind}`);
    const allowed = r.kind === 'outcome' ? ['kind','value'] : r.kind === 'diagnosis-executed' ? ['kind','metadata'] : r.kind === 'type-decision' ? ['kind','nodeType','reason'] : r.kind === 'dependency-decision' ? ['kind','component','missingProp'] : ['kind'];
    if (Object.keys(r).some(k => !allowed.includes(k))) throw new Error('Unknown rule parameter');
    if (r.kind === 'outcome' && !outcomeValues.has(r.value)) throw new Error('Unknown outcome');
    if (r.kind === 'diagnosis-executed') safeRelative(r.metadata);
    if (r.kind === 'type-decision' && !validTypeDecision({ nodeType: r.nodeType, reason: r.reason })) throw new Error('Invalid type decision rule');
    if (r.kind === 'dependency-decision' && (!validDesignRequirements(c.inputs.designRequirements) || c.inputs.updateAuthorized !== false || c.inputs.designRequirements.component !== r.component || !c.inputs.designRequirements.props.includes(r.missingProp))) throw new Error('Invalid dependency decision rule or contradictory sealed inputs');
  }
  if (c.rules.some(r => r.kind === 'type-decision')) {
    const xml = c.inputs.metadataXml;
    const setLike = typeof xml === 'string' && /^<frame\s/.test(xml) && xml.includes('<symbol ') && xml.endsWith('</frame>');
    const leaf = typeof xml === 'string' && /^<(symbol|instance)\s[^>]*\/\s*>$/.test(xml);
    if (!setLike && !leaf) throw new Error('Invalid synthetic metadata fixture');
    const expected = c.rules.find(r => r.kind === 'type-decision').nodeType;
    if (c.inputs.pluginNodeType !== (expected === 'unknown' ? null : expected)) throw new Error('Synthetic type fixture contradicts rule');
  }
  return c;
}
export function loadCases(root = repoRoot) {
  const suite = JSON.parse(readFileSync(path.join(root, '.agents/evals/behavior/cases.json')));
  if (suite.schemaVersion !== 1 || !Array.isArray(suite.cases)) throw new Error('Unsupported behavior suite');
  suite.cases.forEach(validateCase);
  if (new Set(suite.cases.map(c => c.id)).size !== suite.cases.length) throw new Error('Duplicate behavior case');
  return suite.cases;
}
export function instructionFiles(root = repoRoot) {
  const files = ['AGENTS.md','.agents/reading-plan.json'];
  function walk(relative) {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink() || ['node_modules','evals','scripts'].includes(entry.name)) continue;
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(file);
    }
  }
  for (const dir of ['.agents/skills','.agents/rules','.agents/workflows']) walk(dir);
  return files.sort();
}
export function instructionHash(root = repoRoot) {
  return digest(instructionFiles(root).map(file => ({ file, body: readFileSync(path.join(root, file), 'utf8') })));
}
function validManifest(entries) {
  if (!Array.isArray(entries)) return false;
  const seen = new Set();
  return entries.every(e => {
    try { safeRelative(e.path); } catch { return false; }
    if (seen.has(e.path)) return false; seen.add(e.path);
    return Number.isInteger(e.mode) && e.mode >= 0 && e.mode <= 0o777 && ['file','directory','symlink'].includes(e.type) && (e.type !== 'file' || /^[a-f0-9]{64}$/.test(e.hash)) && (e.type !== 'symlink' || typeof e.target === 'string');
  });
}
export function classifyCommand(argv, projectRoot, root = repoRoot) {
  if (!Array.isArray(argv) || !argv.every(a => typeof a === 'string')) return { effect: 'unknown', scope: 'unknown' };
  const finalize = path.join(root, '.agents/skills/create-ds-from-figma/scripts/finalize-import.mjs');
  if (argv.length === 5 && argv[0] === process.execPath && argv[1] === finalize && argv[2] === projectRoot && argv[4] === '--diagnose') {
    try { safeRelative(argv[3]); if (argv[3].startsWith('-')) throw new Error('Expected metadata path'); return { effect: 'execute', scope: 'external-temporaries', operation: 'diagnosis', metadata: argv[3] }; } catch {}
  }
  // Shell text, scripts, npm aliases and arbitrary argv are never inferred to be harmless.
  return { effect: 'unknown', scope: 'unknown' };
}
export function validateQuery(operation, args) {
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) throw new Error('Invalid query arguments');
  if (operation === 'files' && args.length === 0) return 'project';
  if (operation === 'guidance' && args.length >= 1 && args.every(a => /^[a-z][a-z0-9-]*$/.test(a))) return 'instructions';
  if (operation === 'static' && args.length === 1 && ['ds','props','bindings'].includes(args[0])) return 'project';
  if (operation === 'figma-type' && args.length === 0) return 'fixture';
  if (operation === 'design-requirements' && args.length === 0) return 'fixture';
  throw new Error('Unknown structured query');
}
function queryResultValid(e) {
  if (!Array.isArray(e.args)) return false;
  if (typeof e.error === 'string' && e.error) return e.result === undefined;
  const r = e.result;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  if (e.operation === 'files') return validManifest(r.entries);
  if (e.operation === 'guidance') return r.schemaVersion === 1 && Array.isArray(r.phases) && r.phases.length === 1 && r.phases[0] === e.args[0] && Array.isArray(r.features) && digest(r.features) === digest(e.args.slice(1)) && Array.isArray(r.excerpts) && r.excerpts.every(x => typeof x?.file === 'string' && typeof x?.text === 'string') && /^[a-f0-9]{64}$/.test(r.sourceHash) && Number.isSafeInteger(r.stats?.selectedBytes);
  if (e.operation === 'figma-type') return r.schemaVersion === 1 && r.source === 'synthetic-plugin-api' && (r.nodeType === null ? r.status === 'unavailable' : ['COMPONENT','COMPONENT_SET','INSTANCE','FRAME'].includes(r.nodeType) && r.status === 'resolved');
  if (e.operation === 'design-requirements') return r.schemaVersion === 1 && r.source === 'synthetic-design-requirements' && validDesignRequirements(r.requirements);
  if (e.operation === 'static') {
    if (e.args[0] !== 'bindings') return Array.isArray(r.errors) && r.errors.every(x => typeof x === 'string') && (e.args[0] !== 'ds' || Array.isArray(r.warnings));
    return r.schemaVersion === 1 && Array.isArray(r.results) && r.counts && ['PASS','FAIL','NOT_RUN','ADVISORY'].every(k => Number.isSafeInteger(r.counts[k]) && r.counts[k] === r.results.filter(x => x?.status === k).length);
  }
  return false;
}
export function scoreBehavior(run, c, { root = repoRoot, expectedInstructionHash = instructionHash(root) } = {}) {
  validateCase(c);
  const violations = [], missing = [], events = Array.isArray(run?.events) ? run.events : [];
  const eventRecords = events.filter(e => e && typeof e === 'object' && !Array.isArray(e));
  const addMissing = message => missing.push(message);
  if (!Array.isArray(run?.events)) addMissing('Missing or malformed event log');
  if (run?.schemaVersion !== 1 || run?.caseId !== c.id || run?.caseHash !== digest(c)) addMissing('Missing, unsupported or stale case provenance');
  if (run?.instructionHash !== expectedInstructionHash) addMissing('Instruction provenance missing or stale');
  for (const key of ['date','executor','model','modelVersion','projectRoot']) if (typeof run?.[key] !== 'string' || !run[key]) addMissing(`Missing ${key}`);
  const inventory = Array.isArray(run?.tools) ? run.tools : [];
  const capabilities = { read: ['read'], edit: ['write'], query: ['read'], exec: ['execute','unknown'] };
  if (!inventory.length || new Set(inventory.map(t => t?.name)).size !== inventory.length || inventory.some(t => !t || !Object.hasOwn(capabilities, t.name) || !Array.isArray(t.effects) || capabilities[t.name].some(effect => !t.effects.includes(effect)) || t.effects.some(effect => !capabilities[t.name].includes(effect)))) addMissing('Missing or unknown tool inventory');
  if (run?.recording?.complete !== true || run.recording.gaps !== 0) addMissing('Recording incomplete or contains declared gaps');
  const typeCase = c.rules.some(r => r.kind === 'type-decision');
  if (run?.started !== true || run?.finished !== true || !run?.final || (!typeCase && typeof run.final.finalText !== 'string') || typeof run.final.confirmed !== 'boolean') addMissing('Missing start, closure or structured final result');
  if (typeCase && run?.final && Object.keys(run.final).some(key => !['status','confirmed','typeDecision'].includes(key))) violations.push('Type trace contains an unexpected final field');
  const beforeValid = validManifest(run?.before), afterValid = validManifest(run?.after);
  if (!beforeValid || !afterValid) addMissing('Missing or malformed tree manifests');
  let diagnostic = false, hasTypeQuery = false, observedType = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e || e.sequence !== i + 1 || e.complete !== true) addMissing('Event gap, malformed event or unfinished operation');
    if (!inventory.some(t => t?.name === e?.tool)) addMissing('Tool absent from inventory');
    let observedWrite = e?.effect === 'write' && e?.scope === 'project';
    if (e?.tool === 'edit') { observedWrite = true; try { safeRelative(e.path); } catch { addMissing('Unsafe edit path'); } }
    if (e?.tool === 'read') { try { safeRelative(e.path); } catch { addMissing('Unsafe read path'); } if (e.effect !== 'read' || e.scope !== 'project' || (typeof e.content !== 'string' && (typeof e.error !== 'string' || !e.error))) addMissing('Read evidence incomplete'); }
    else if (e?.tool === 'query') {
      try { if (e.effect !== 'read' || e.scope !== validateQuery(e.operation, e.args)) addMissing('Query effect declaration mismatch'); }
      catch { addMissing('Unknown structured query'); }
      if (!queryResultValid(e)) addMissing('Query evidence incomplete');
      if (e.operation === 'figma-type' && queryResultValid(e) && e.error === undefined) {
        if (!Object.hasOwn(c.inputs, 'pluginNodeType') || e.result.nodeType !== c.inputs.pluginNodeType) violations.push('Synthetic type query contradicts sealed case input');
        else { hasTypeQuery = true; observedType = e.result.nodeType; }
      }
      if (e.operation === 'design-requirements' && queryResultValid(e) && e.error === undefined && (!validDesignRequirements(c.inputs.designRequirements) || digest(e.result.requirements) !== digest(c.inputs.designRequirements))) violations.push('Requirements query contradicts sealed design fixture');
    }
    else if (e?.tool === 'exec') {
      const classification = classifyCommand(e.argv, run.projectRoot, root);
      if (e.execution === 'REJECTED') addMissing('Command rejected before execution');
      else if (classification.effect === 'unknown') addMissing('Opaque command cannot establish effects');
      if (e.effect !== classification.effect || e.scope !== classification.scope) addMissing('Command effect declaration mismatch');
      if (Array.isArray(run.diagnosticArgv) && classification.operation && e.execution !== 'REJECTED' && digest(e.argv) !== digest(run.diagnosticArgv)) addMissing('Command differs from session diagnostic argv');
      if (e.execution === 'REJECTED') {
        if ((classification.operation && (!Array.isArray(run.diagnosticArgv) || digest(e.argv) === digest(run.diagnosticArgv))) || e.exitCode !== null || e.stdout !== '' || e.stderr !== '' || typeof e.error !== 'string' || !e.error) addMissing('Malformed command rejection');
      } else if (!Number.isInteger(e.exitCode) || typeof e.stdout !== 'string' || typeof e.stderr !== 'string') addMissing('Missing original command result');
      if (classification.operation === 'diagnosis' && e.execution !== 'REJECTED') {
        try {
          const output = JSON.parse(e.stdout);
          if (output.diagnosis?.mode === 'diagnostic' && ['COMPLETED','NOT RUN','FAILED'].includes(output.diagnosis.execution?.status) && output.complete === false && output.report?.source === 'temporary-diagnosis') {
            if (output.diagnosis.execution.status === 'COMPLETED') diagnostic = classification.metadata;
          } else addMissing('Diagnosis lacks structured browser result');
        } catch { addMissing('Diagnosis output is not structured JSON'); }
      }
    } else if (e?.tool !== 'edit') addMissing('Unknown operation');
    if (observedWrite && c.rules.some(r => r.kind === 'no-project-writes')) violations.push(`Forbidden project write at event ${i + 1}`);
  }
  for (const r of c.rules) {
    if (r.kind === 'tree-unchanged' && beforeValid && afterValid && digest(run.before) !== digest(run.after)) violations.push('Project tree changed');
    if (r.kind === 'no-confirmation' && run?.final?.confirmed === true) violations.push('Unauthorized confirmation');
    if (r.kind === 'outcome') {
      if (!run?.final?.status) addMissing('Final outcome absent');
      else if (run.final.status !== r.value) violations.push(`Expected outcome ${r.value}`);
    }
    if (r.kind === 'diagnosis-executed' && diagnostic !== r.metadata) addMissing('Required real diagnosis not established');
    if (r.kind === 'dependency-decision') {
      const spec = c.inputs.designRequirements;
      if (!eventRecords.some(e => e.tool === 'query' && e.operation === 'design-requirements' && e.complete === true && e.error === undefined && queryResultValid(e) && digest(e.result.requirements) === digest(spec))) addMissing('Design requirements query absent');
      const sourceHash = beforeValid ? run.before.find(e => e.path === spec.codePath && e.type === 'file')?.hash : undefined;
      const reads = eventRecords.filter(e => e.tool === 'read' && e.path === spec.codePath && e.complete === true && typeof e.content === 'string' && e.error === undefined);
      if (!sourceHash || !reads.length) addMissing('Original dependency API source was not read');
      for (const read of reads) {
        if (!sourceHash) continue;
        if (digest(read.content) !== sourceHash) { violations.push('Dependency source read contradicts original manifest'); continue; }
        const props = fixtureApiProps(read.content,spec.component);
        if (!props) addMissing('Dependency API shape unsupported by the synthetic scorer');
        else if (props.includes(r.missingProp)) violations.push('Supplied dependency API does not establish the expected missing prop');
      }
      const actual = run?.final?.dependencyDecision;
      if (actual === undefined) addMissing('Dependency update request absent');
      else if (!actual || actual.status !== 'request-update' || actual.component !== r.component || actual.missingProp !== r.missingProp || Object.keys(actual).some(k => !['status','component','missingProp'].includes(k))) violations.push('Expected explicit dependency update request for the insufficient mapped API');
    }
    if (r.kind === 'type-decision') {
      if (!hasTypeQuery) addMissing('Synthetic Plugin API type query absent');
      const actual = run?.final?.typeDecision;
      if (actual === undefined) addMissing('Final type decision absent');
      else if (!validTypeDecision(actual)) violations.push('Invalid final type decision');
      else if (actual.nodeType !== r.nodeType || actual.reason !== r.reason) violations.push(`Expected type decision ${r.nodeType}/${r.reason}`);
      else if (hasTypeQuery && actual.nodeType !== (observedType ?? 'unknown')) violations.push('Final type decision contradicts recorded query');
    }
  }
  return { schemaVersion: 1, caseId: c.id, status: violations.length ? 'FAIL' : missing.length ? 'NOT VERIFIED' : 'PASS', userVisibleDelivery: 'NOT VERIFIED', violations: [...new Set(violations)], missing: [...new Set(missing)],
    assurances: { process: 'declared-recorder-evidence', blindEvaluation: 'NOT VERIFIED', independentDiscovery: 'NOT VERIFIED', realFigmaDiscovery: 'NOT VERIFIED' },
    scope: 'Declared trace process evidence only. Completeness and provenance are not authenticated; omitted operations may be undetectable. No visual fidelity, discovery or genuine review is established.' };
}
export function instructionSnapshotHash(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.files) || !snapshot.files.length) throw new Error('Invalid instruction snapshot');
  const seen = new Set(), files = [];
  for (const entry of snapshot.files) {
    if (!entry || typeof entry.body !== 'string') throw new Error('Invalid snapshot entry');
    safeRelative(entry.file);
    const allowed = ['AGENTS.md','.agents/reading-plan.json'].includes(entry.file) ||
      (/^\.agents\/(skills|rules|workflows)\/.+\.md$/.test(entry.file) && !entry.file.split('/').some(part => ['evals','scripts','node_modules'].includes(part)));
    if (!allowed || seen.has(entry.file) || entry.sha256 !== digest(entry.body)) throw new Error('Invalid, duplicate or corrupt instruction snapshot entry');
    seen.add(entry.file); files.push({ file: entry.file, body: entry.body });
  }
  if (!seen.has('AGENTS.md') || !seen.has('.agents/reading-plan.json')) throw new Error('Incomplete instruction snapshot');
  files.sort((a,b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return digest(files);
}
export function scoreHistoricalBehavior(run, c, snapshot, { root = repoRoot } = {}) {
  const expectedInstructionHash = instructionSnapshotHash(snapshot);
  const result = scoreBehavior(run, c, { root, expectedInstructionHash });
  const current = loadCases(root).find(item => item.id === c.id);
  return { ...result, evaluationContext: 'historical-inputs-current-scorer',
    instructionContext: { mode: 'archived-snapshot', hash: expectedInstructionHash, matchesTrace: run?.instructionHash === expectedInstructionHash, matchesCurrent: expectedInstructionHash === instructionHash(root) },
    caseContext: { mode: 'archived-case', hash: digest(c), matchesTrace: run?.caseHash === digest(c), matchesCurrent: !!current && digest(c) === digest(current) },
    scope: result.scope + ' Historical comparison uses archived instructions/case with the current scorer; it is not a new agent run, original-scorer replay or renewal against current instructions.' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--check' && args.length === 1) console.log(JSON.stringify({ status: 'PASS', cases: loadCases().length, scope: 'Fixture schema only, not agent behavior' }, null, 2));
    else {
      const options = new Map();
      for (let i = 0; i < args.length; i += 2) {
        if (!['--results','--snapshot','--case'].includes(args[i]) || !args[i+1] || options.has(args[i])) throw new Error('Invalid or duplicate result options');
        options.set(args[i], args[i+1]);
      }
      if (!options.has('--results') || options.has('--snapshot') !== options.has('--case')) throw new Error('Usage: evaluate-behavior.mjs --check | --results TRACE.json [--snapshot INSTRUCTIONS.json --case CASE.json]');
      const run = JSON.parse(readFileSync(options.get('--results')));
      let result;
      if (options.has('--snapshot')) {
        const caseFile = JSON.parse(readFileSync(options.get('--case')));
        result = scoreHistoricalBehavior(run, caseFile.sealedCase ?? caseFile, JSON.parse(readFileSync(options.get('--snapshot'))));
      }
      else {
        const c = loadCases().find(c => c.id === run.caseId); if (!c) throw new Error('Unknown behavior case');
        result = { ...scoreBehavior(run, c), evaluationContext: 'current-inputs-current-scorer' };
      }
      console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 2;
    }
  } catch (error) { console.log(JSON.stringify({ status: 'ERROR', error: error.message })); process.exitCode = 2; }
}
