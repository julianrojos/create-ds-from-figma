import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function loadSuite(directory = root) {
  const skills = path.join(directory, '.agents/skills');
  const catalog = [], cases = [];
  for (const name of readdirSync(skills, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    const body = readFileSync(path.join(skills, name, 'SKILL.md'), 'utf8');
    const header = body.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
    if (!header) throw new Error(`Missing frontmatter: ${name}`);
    const metadata = YAML.parse(header, { uniqueKeys: true, strict: true });
    if (metadata.name !== name || typeof metadata.description !== 'string') throw new Error(`Invalid discovery metadata: ${name}`);
    const suite = JSON.parse(readFileSync(path.join(skills, name, 'evals/routing.json'), 'utf8'));
    if (suite.schemaVersion !== 1 || suite.skill !== name || !Array.isArray(suite.cases) || suite.cases.length < 3 || !['activate', 'exclude', 'boundary'].every(kind => suite.cases.some(c => c.kind === kind))) throw new Error(`Expected activate/exclude/boundary cases: ${name}`);
    for (const c of suite.cases) {
      if (!['activate', 'exclude', 'boundary'].includes(c.kind) || ['id', 'prompt', 'context', 'expectedPrimary'].some(key => typeof c[key] !== 'string' || !c[key].trim()) || !Array.isArray(c.forbiddenActions) || !c.forbiddenActions.length || c.forbiddenActions.some(a => typeof a !== 'string' || !a.trim())) throw new Error(`Invalid routing case: ${name}`);
      if (c.kind === 'activate' && c.expectedPrimary !== name || c.kind === 'exclude' && c.expectedPrimary === name) throw new Error(`Invalid positive/negative routing expectation: ${c.id}`);
      cases.push(c);
    }
    catalog.push({ name, description: metadata.description });
  }
  const allowed = new Set([...catalog.map(c => c.name), 'none', 'build-from-figma']);
  if (new Set(cases.map(c => c.id)).size !== cases.length || cases.some(c => !allowed.has(c.expectedPrimary))) throw new Error('Duplicate IDs or unknown routing targets');
  return { catalog, cases, catalogHashVersion: 2, catalogHash: digest(catalog), suiteHash: digest(cases) };
}

export function blindPrompts(suite) {
  return { schemaVersion: 1, catalogHashVersion: suite.catalogHashVersion, catalogHash: suite.catalogHash, suiteHash: suite.suiteHash, catalog: suite.catalog,
    instructions: 'Select the primary route only. build-from-figma is the existing screen workflow; none means no skill is needed yet. Do not execute the requests. Return observations [{id, primary, reason}]. Use the current catalog and context; do not invent a match or perform writes.',
    cases: suite.cases.map(({ id, prompt, context }) => ({ id, prompt, context })) };
}

export function scoreRouting(suite, run) {
  if (run?.schemaVersion !== 1 || typeof run.executor !== 'string' || !run.executor.trim() || typeof run.model !== 'string' || !run.model.trim() || typeof run.createdAt !== 'string' || !Number.isFinite(Date.parse(run.createdAt))) throw new Error('Missing evaluator provenance (use model=unreported when unavailable)');
  if (run.catalogHashVersion !== suite.catalogHashVersion) throw new Error('Unsupported or historical catalog hash protocol; retain the original run without rewriting its hashes');
  if (run.catalogHash !== suite.catalogHash || run.suiteHash !== suite.suiteHash) throw new Error('Routing results are stale: catalog or suite changed');
  if (!Array.isArray(run.observations) || run.observations.length !== suite.cases.length || new Set(run.observations.map(o => o?.id)).size !== suite.cases.length) throw new Error('Every case needs exactly one observed result');
  const allowed = new Set([...suite.catalog.map(c => c.name), 'none', 'build-from-figma']);
  if (run.observations.some(o => !suite.cases.some(c => c.id === o?.id) || !allowed.has(o.primary) || typeof o.reason !== 'string' || !o.reason.trim())) throw new Error('Unknown case, route or missing observed reason');
  const results = suite.cases.map(c => {
    const observation = run.observations.find(o => o.id === c.id);
    return { id: c.id, expected: c.expectedPrimary, actual: observation.primary, status: observation.primary === c.expectedPrimary ? 'PASS' : 'FAIL', reason: observation.reason };
  });
  return { schemaVersion: 1, catalogHashVersion: suite.catalogHashVersion, catalogHash: suite.catalogHash, suiteHash: suite.suiteHash, status: results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', executor: run.executor, model: run.model, createdAt: run.createdAt, passed: results.filter(r => r.status === 'PASS').length, total: results.length, results,
    evidenceLevel: 'smoke-selection', modelRecorded: !['unreported', 'unknown', 'none'].includes(run.model.toLowerCase()), runtimeDiscovery: 'NOT RUN',
    limitations: ['Evaluator is given the local catalog; actual runtime discovery is not exercised.', 'No task execution or permission compliance is observed.', 'One run does not establish cross-model reliability.'],
    scope: 'Primary-route selection in this catalog/context only. Does not prove execution behavior, permissions, browser/Figma fidelity or performance across models/runtimes. Provenance is declared, not authenticated.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log('Usage: npm run eval:routing -- --check | --prompts | --results FILE\nAll modes read only. --check validates fixtures; --prompts hides labels; --results scores an actual evaluator run without invoking a model.');
    else {
      if (!(args.length === 1 && ['--check', '--prompts'].includes(args[0]) || args.length === 2 && args[0] === '--results')) throw new Error('Use --help for routing evaluation arguments');
      const suite = loadSuite();
      const result = args[0] === '--check' ? { status: 'PASS', cases: suite.cases.length, scope: 'Fixture structure only; routing NOT RUN.' } : args[0] === '--prompts' ? blindPrompts(suite) : scoreRouting(suite, JSON.parse(readFileSync(path.resolve(args[1]), 'utf8')));
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === 'FAIL' ? 1 : 0;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
