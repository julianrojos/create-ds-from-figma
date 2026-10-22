import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = fileURLToPath(new URL('../../', import.meta.url));
export const help = `Usage: npm run verify:all -- kit [--dry-run]
       npm run verify:all -- import --root ROOT --metadata PATH [--metadata PATH ...] [--dry-run]
       npm run verify:all -- screen --root ROOT [--metadata PATH ...] [--dry-run]

Profiles are explicit; changes are never inferred from Git.
kit: full unit + real Chromium tests, strict documentation checks, routing fixture checks and complete reference-heading accounting.
import: static DS/props/bindings checks, temporary diagnosis for each supplied component,
        current persisted import gate. All changed components must be supplied.
screen: static DS/props/bindings checks and temporary diagnosis for supplied components.
        Rendered screen comparison, composition and accessibility remain manual.

--metadata is project-relative and repeatable. No dependencies are installed.
--dry-run prints the plan/effects without launching checks, project code or browsers.
No collect/reviews/publication is supported. UI checks do not certify delivery.
Exit 0: requested automated checks passed (or plan printed); 1: failure/pending automatic
check; 2: invalid arguments or runner failure. Read automationStatus and scope.
Child output goes to stderr; stdout contains a single JSON report (invoke Node directly
to avoid npm's own headers). Tests may write test-results and temporary directories;
UI diagnosis executes project code and may have project-defined side effects.
`;

// DS records and finalizer inputs use forward slashes on every host.
export function relativeMetadataPath(root, file, paths = path) {
  return paths.relative(root, file).split(paths.sep).join('/');
}

export function parseArgs(args, { cwd = process.cwd(), toolsRoot = kitRoot } = {}) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const [profile, ...flags] = args;
  if (!['kit', 'import', 'screen'].includes(profile)) throw new Error(help);
  let root, dryRun = false;
  const metadata = [];
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === '--dry-run' && !dryRun) dryRun = true;
    else if (flag === '--root' && root === undefined) {
      root = flags[++i];
      if (!root || root.startsWith('--')) throw new Error('Missing --root value');
    } else if (flag === '--metadata') {
      const value = flags[++i];
      if (!value || value.startsWith('--') || path.isAbsolute(value)) throw new Error('--metadata requires a project-relative path');
      metadata.push(value);
    } else throw new Error(`Unknown or repeated option: ${flag}`);
  }
  if (profile === 'kit' && (root !== undefined || metadata.length)) throw new Error('kit checks this kit; --root/--metadata are UI-profile options');
  if (profile !== 'kit' && root === undefined) throw new Error('UI profiles require explicit --root');
  if (profile === 'import' && !metadata.length) throw new Error('import requires every changed --metadata path');
  root = realpathSync(path.resolve(profile === 'kit' ? toolsRoot : cwd, profile === 'kit' ? '.' : root));
  if (!statSync(root).isDirectory()) throw new Error('Root must be a directory');
  const seen = new Set();
  const normalized = metadata.map(value => {
    const resolved = path.resolve(root, value);
    const within = file => file.startsWith(root + path.sep);
    if (!within(resolved) || !existsSync(resolved) || !within(realpathSync(resolved)) || !statSync(resolved).isFile()) throw new Error(`Unsafe or missing metadata: ${value}`);
    const relative = relativeMetadataPath(root, realpathSync(resolved));
    if (seen.has(relative)) throw new Error(`Duplicate metadata: ${value}`);
    seen.add(relative);
    return relative;
  });
  return { profile, root, metadata: normalized, dryRun };
}

export function makePlan(options, { toolsRoot = kitRoot } = {}) {
  const { root, profile, metadata } = options;
  const node = (id, script, args, effects, extra = {}) => ({ id, executable: process.execPath, args: [path.join(toolsRoot, script), ...args], cwd: root, effects, ...extra });
  if (profile === 'kit') return [
    { id: 'tests', executable: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['test'], cwd: root, effects: ['execute kit tests and locked Chromium', 'temporary-write', 'test-results-write'], timeoutMs: 900_000 },
    node('docs', '.agents/checks/verify-docs.mjs', [root, '--strict'], ['project-read']),
    node('reading-plan', '.agents/scripts/read-guidance.mjs', ['--check'], ['kit-read; pointers, conditions and reference-heading accounting']),
    node('routing-fixtures', '.agents/scripts/evaluate-routing.mjs', ['--check'], ['kit-read; validates fixtures, not agent routing']),
  ];
  return [
    node('structure', '.agents/checks/verify-ds.mjs', [root], ['project-read']),
    node('props', '.agents/checks/verify-props.mjs', [root], ['project-read']),
    node('bindings', '.agents/checks/verify-bindings.mjs', [root, '--json'], ['project-read'], { kind: 'bindings' }),
    ...metadata.map((file, index) => node(`diagnose:${index + 1}`, '.agents/skills/create-ds-from-figma/scripts/finalize-import.mjs', [root, file, '--diagnose'],
      ['execute project component code', 'browser-execution', 'local-server', 'temporary-write; project code may have its own effects'],
      { kind: 'diagnostic', requires: ['structure', 'props'], timeoutMs: 300_000 })),
    ...(profile === 'import' ? [node('imports', '.agents/checks/verify-imports.mjs', [root], ['project-read', 'locked-browser-execution; no project code'])] : []),
  ];
}

export function classify(step, child) {
  if (child.error || child.signal || child.status === null) return { status: 'FAIL', reason: child.error?.message || `Terminated: ${child.signal || 'unknown'}` };
  if (step.kind === 'diagnostic') {
    let result;
    try { result = JSON.parse(child.stdout); } catch { return { status: 'FAIL', reason: 'Diagnostic did not return valid JSON' }; }
    const diagnosis = result?.diagnosis;
    const summaryValid = summary => summary && ['PASS', 'FAIL', 'NOT COMPARABLE', 'NOT RUN'].every(key => Number.isSafeInteger(summary[key]) && summary[key] >= 0);
    // Exit 1 is expected for a clean temporary diagnostic. It never means delivery PASS.
    if (child.status !== 1 || result.status !== 'NOT VERIFIED' || result.complete !== false || result.errors?.length !== 0 || diagnosis?.execution?.status !== 'COMPLETED') return { status: 'FAIL', reason: 'Diagnosis failed or was not executed', result };
    if (!summaryValid(diagnosis.diagnostics?.summary) || !summaryValid(diagnosis.diagnostics?.compositionSummary) || !Array.isArray(diagnosis.diagnostics?.cases) || !diagnosis.diagnostics.cases.length || !Array.isArray(diagnosis.blocked) || diagnosis.blocked.length || !['PASS', 'NOT VERIFIED', 'NOT APPLICABLE'].includes(diagnosis.application?.status)) return { status: 'FAIL', reason: 'Incomplete diagnostic results or blocked execution', result };
    if (['summary', 'compositionSummary'].some(key => ['FAIL', 'NOT RUN'].some(status => diagnosis.diagnostics?.[key]?.[status] > 0)) || ['FAIL', 'NOT RUN'].includes(diagnosis.application?.status)) return { status: 'FAIL', reason: 'Diagnosis contains failing or unexecuted checks', result };
    return { status: 'DIAGNOSTIC', reason: 'Temporary feedback completed; no evidence published or confirmation made', result };
  }
  if (child.status !== 0) return { status: 'FAIL', reason: `Exit ${child.status}` };
  if (step.kind === 'bindings') {
    let report;
    try { report = JSON.parse(child.stdout); } catch { return { status: 'FAIL', reason: 'Binding report is not JSON' }; }
    if (report?.schemaVersion !== 1 || !Array.isArray(report.results) || !report.counts) return { status: 'FAIL', reason: 'Invalid binding report schema' };
    const statuses = ['PASS', 'FAIL', 'NOT_RUN', 'ADVISORY'];
    const counts = Object.fromEntries(statuses.map(status => [status, report.results.filter(item => item?.status === status).length]));
    if (report.results.some(item => !item || !statuses.includes(item.status)) || statuses.some(key => !Number.isSafeInteger(report.counts[key]) || report.counts[key] !== counts[key])) return { status: 'FAIL', reason: 'Binding records and counts disagree' };
    if (counts.FAIL) return { status: 'FAIL', reason: 'Binding findings require correction', counts };
    return { status: 'PASS', counts, ...(counts.NOT_RUN ? { reviewRequired: true, reason: 'Static NOT_RUN needs the independent computed/manual review defined by validate-ds' } : {}) };
  }
  return { status: 'PASS' };
}

export function runPlan(options, { run = spawnSync, log = console.error, toolsRoot = kitRoot, kill = process.kill } = {}) {
  const plan = makePlan(options, { toolsRoot });
  const scope = options.profile === 'kit' ? 'Kit automated regression checks; not an agent behavior evaluation or Figma fidelity proof.' : 'Requested automated UI checks only. Manual composition/accessibility, actual state paths and independent rendered review remain required; no publication or confirmation is performed.';
  if (options.dryRun) return { schemaVersion: 1, profile: options.profile, automationStatus: 'PLANNED', exitCode: 0, scope, plan };
  const checks = [];
  for (const step of plan) {
    if (step.requires?.some(id => checks.find(check => check.id === id)?.status !== 'PASS')) {
      checks.push({ id: step.id, status: 'NOT RUN', reason: 'Required static checks failed; project code was not launched', effects: step.effects });
      continue;
    }
    log(`[${step.id}] ${step.effects.join('; ')}`);
    let child;
    try {
      child = run(step.executable, step.args, { cwd: step.cwd, encoding: 'utf8', shell: false, detached: process.platform !== 'win32', timeout: step.timeoutMs || 120_000, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024 });
    } catch (error) { child = { error, status: null }; }
    if ((child.error || child.signal) && process.platform !== 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
      try { kill(-child.pid, 'SIGKILL'); } catch { /* The launched process group may already have exited. */ }
    }
    if (child.stdout) log(child.stdout);
    if (child.stderr) log(child.stderr);
    checks.push({ id: step.id, effects: step.effects, exitCode: child.status ?? null, ...classify(step, child) });
  }
  const failed = checks.some(check => ['FAIL', 'NOT RUN'].includes(check.status));
  return { schemaVersion: 1, profile: options.profile, automationStatus: failed ? 'FAIL' : 'PASS', exitCode: failed ? 1 : 0, scope,
    ...(options.profile !== 'kit' ? { deliveryStatus: 'NOT VERIFIED BY THIS COMMAND', pendingManualChecks: ['composition and reuse', 'accessibility/keyboard/focus', 'independent Figma/browser comparison and actual state/mode activation'], metadataCoverage: 'Caller-supplied changed component list; not automatically discovered or guaranteed complete.' } : {}), checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(help);
    else {
      const result = runPlan(options);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.exitCode;
    }
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
