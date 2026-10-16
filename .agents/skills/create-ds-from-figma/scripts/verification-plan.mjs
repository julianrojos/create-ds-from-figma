import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSnapshot, sealCapture } from '../../../checks/lib/figma-evidence.mjs';
import { projectFile, renderRequirements, sha256, verifyRenderPlan } from '../../../checks/lib/render-plan.mjs';
import { verify } from '../../../checks/verify-ds.mjs';
import { caseInputs, checkedArtifacts, renderedChecks, validateBrowserMeasurement } from '../../../checks/lib/comparison-evidence.mjs';
import { assertConfirmationChecks, compareRendered } from '../../../checks/lib/render-comparison.mjs';
import { publishMeasurement } from '../../../checks/lib/publish-measurement.mjs';
import { createDependencySession } from '../../../checks/lib/local-dependencies.mjs';
import { deriveBehaviorEvidence } from '../../../checks/lib/behavior-evidence.mjs';
import { closeVerification } from '../../../checks/lib/verification-closure.mjs';
import { waitForMeasurement } from '../../../checks/lib/wait-measurement.mjs';
import { collectCssDiagnostics } from '../../../checks/lib/css-diagnostics.mjs';
import { renderDiagnostics } from '../../../checks/lib/render-diagnostics.mjs';
import { snapshotResources } from '../../../checks/lib/resource-diagnostics.mjs';

const forbidden = (record, keys) => {
  if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).some(k => !keys.includes(k))) throw new Error(`Decision accepts only ${keys.join(', ')}`);
};

export function materializePlan(metadata, capture, decisions) {
  for (const key of ['stylesheets', 'cases', 'unestablished']) if (!Array.isArray(decisions[key])) throw new Error(`Decision ${key} must be an array`);
  const requirements = renderRequirements(capture), result = structuredClone(metadata);
  const select = (records, expected, keys, factual) => {
    if (!Array.isArray(records)) throw new Error('Decision records must be arrays');
    const seen = new Set();
    const result = records.map(record => {
      forbidden(record, keys);
      const identity = record.id ?? record.observation;
      const fact = expected.find(r => (r.id ?? r.observation) === identity && (record.index === undefined || r.index === record.index));
      const key = `${identity}:${record.index ?? ''}`;
      if (!fact || seen.has(key)) throw new Error(`Unknown or duplicated requirement ${key}`);
      seen.add(key);
      return { ...factual(fact), ...record };
    });
    if (result.length !== expected.length) throw new Error('Every source requirement needs an explicit treatment decision');
    return expected.map(fact => result.find(record => (record.id ?? record.observation) === (fact.id ?? fact.observation) && (fact.index === undefined || record.index === fact.index)));
  };
  result.verification = { schemaVersion: 1,
    geometryPolicy: 'mapped-layout-v1',
    nodeCoverage: decisions.nodeCoverage ?? [],
    fonts: select(decisions.fonts, requirements.fonts, ['id', 'css', 'source'], r => ({ id: r.id })),
    assets: select(decisions.assets, requirements.assets, ['observation', 'index', 'source'], r => ({ observation: r.observation, index: r.index, imageHash: r.imageHash })),
    stylesheets: decisions.stylesheets, inputs: decisions.inputs ?? [], unestablished: decisions.unestablished,
    cases: (decisions.cases || []).map(c => {
      if (c.kind !== 'fidelity') return structuredClone(c);
      if ('content' in c) throw new Error('Fidelity content is derived, not an agent decision');
      if (!requirements.variants.includes(c.figmaRef)) throw new Error('Unknown source variant');
      const id = c.figmaRef.slice(capture.source.fileKey.length + 1), nodes = new Map(capture.nodes.map(n => [n.id, n]));
      const ids = new Set(), visit = key => { if (ids.has(key)) return; ids.add(key); for (const child of nodes.get(key)?.children || []) visit(child); };
      visit(id);
      return { ...c, content: Object.fromEntries(capture.nodes.filter(n => ids.has(n.id) && n.type === 'TEXT' && typeof n.properties.characters === 'string').map(n => [`${capture.source.fileKey}:${n.id}`, n.properties.characters])) };
    }),
  };
  result.evidence.textDimensions = select(decisions.textDimensions, requirements.dimensions,
    ['observation', 'treatment', 'cssSelector', 'cssProperty', 'instance'], r => ({ observation: r.observation, behavior: r.behavior, rule: r.rule, observations: r.observations }));
  // Optional implementation records keep API/CSS decisions while deriving their source identity.
  for (const key of ['bindings', 'measuredLiterals']) if (decisions[key]) {
    const kind = key === 'bindings' ? 'binding' : 'property';
    result[key] = decisions[key].map(record => {
      forbidden(record, ['observation', 'part', 'variant', 'cssSelector', 'cssProperty', 'modeOverride', 'value', 'translation', 'reason', 'styleRef', 'styleOrigin', 'styleOriginSource']);
      const o = capture.observations.find(o => o.id === record.observation && o.kind === kind);
      if (!o) throw new Error(`Unknown ${key} observation ${record.observation}`);
      if (key === 'bindings') return { ...record, node: `${capture.source.fileKey}:${o.node}`, figmaProperty: o.field, variableId: o.variableId };
      return { ...record, source: `${capture.source.fileKey}:${o.node}`, figmaProperty: o.field,
        ...(record.translation === 'approximate' ? { figmaValue: { source: 'PLUGIN', field: o.field, value: o.value } } : {}) };
    });
  }
  return result;
}

export function comparisonReport(root, metadata, caseId, review, style, metadataPath) {
  const dependencySession = createDependencySession(root);
  if (!/^[a-zA-Z0-9_-]+$/.test(caseId)) throw new Error('Unsafe case ID');
  const configuration = metadata.verification?.cases.find(c => c.id === caseId && c.kind === 'fidelity');
  if (!configuration || review.result !== 'PASS' || !['agent-rendered-review', 'tool-rendered-comparison'].includes(review.comparison?.method) || typeof review.comparison.reason !== 'string' || !review.comparison.reason.trim()) throw new Error('A real rendered PASS judgment and an established fidelity case are required');
  for (const key of ['figmaRevision', 'codeRevision']) if (!(typeof review[key]?.id === 'string' && review[key].id.trim() || review[key]?.id === null && typeof review[key].reason === 'string' && review[key].reason.trim())) throw new Error('Revision IDs or explicit unavailability reasons required');
  if (!Array.isArray(review.artifacts) || !review.artifacts.length || !Array.isArray(review.inputs || [])) throw new Error('Retained artifact paths and optional extra input paths required');
  const hashFile = file => ({ path: file, sha256: sha256(readFileSync(projectFile(root, file))) });
  const scoped = caseInputs(root, metadata, configuration, style, { dependencySession });
  const inputs = [...new Set([...scoped.files, ...(review.inputs || [])])].sort();
  const artifacts = checkedArtifacts(root, review.artifacts, metadata, configuration, { derive: true, dependencySession });
  const renderChecks = renderedChecks(root, metadata, configuration, artifacts);
  assertConfirmationChecks(renderChecks, review.checkReviews, artifacts.map(a => a.path));
  const behaviors = deriveBehaviorEvidence(root, metadata, configuration, artifacts, review.behaviors ?? [], { dependencySession });
  return { schemaVersion: 4, kind: 'rendered-comparison', result: 'PASS', caseId, snapshotHash: metadata.evidence.hash, sourceSnapshot: metadata.evidence.snapshot,
    configuration: structuredClone(configuration), comparison: { method: review.comparison.method, reason: review.comparison.reason, figmaRef: configuration.figmaRef },
    metadataHash: scoped.metadataHash, ...(metadataPath ? { metadataAudit: hashFile(metadataPath) } : {}),
    figmaRevision: review.figmaRevision, codeRevision: review.codeRevision, files: inputs.map(hashFile), artifacts,
    renderChecks, checkReviews: review.checkReviews || [], behaviors };
}

export function persistComparisonReport(root, report) {
  if (!/^[a-zA-Z0-9_-]+$/.test(report.caseId)) throw new Error('Unsafe case ID');
  const base = realpathSync(root), parent = realpathSync(path.join(root, 'design-system'));
  if (!parent.startsWith(base + path.sep)) throw new Error('Report directory escapes project');
  const directory = path.join(parent, 'verification');
  if (existsSync(directory) && !realpathSync(directory).startsWith(base + path.sep)) throw new Error('Report directory escapes project');
  if (!existsSync(directory)) mkdirSync(directory);
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'), hash = sha256(bytes);
  const relative = `design-system/verification/${report.caseId}-${hash}.json`, output = path.join(base, relative);
  if (existsSync(output)) { if (sha256(readFileSync(projectFile(root, relative))) !== hash) throw new Error('Existing report differs'); }
  else writeFileSync(output, bytes, { flag: 'wx' });
  return { path: relative, sha256: hash };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , command, ...args] = process.argv;
    if (command === 'diagnose' && args.length === 1) {
      const result = collectCssDiagnostics(args[0], [], { application: true });
      console.log(JSON.stringify(result, null, 2));
      if (result.errors.length) process.exitCode = 1;
    } else if (command === 'close' && args.length === 3) {
      const [root, metadataPath, manifestPath] = args;
      const result = closeVerification(root, metadataPath, JSON.parse(readFileSync(manifestPath, 'utf8')));
      console.log(JSON.stringify(result, null, 2));
      if (!result.complete) process.exitCode = 1;
    } else if (command === 'wait' && [2, 3].includes(args.length)) {
      const [directory, caseId, timeout] = args;
      console.log(JSON.stringify(await waitForMeasurement(directory, caseId, { timeoutMs: timeout === undefined ? 20000 : Number(timeout) }), null, 2));
    } else if (command === 'requirements' && args.length === 1) {
      const snapshot = JSON.parse(readFileSync(args[0], 'utf8')), sealed = sealCapture(snapshot.capture);
      if (sealed.hash !== snapshot.hash) throw new Error('Snapshot hash mismatch');
      const diagnostic = snapshotResources(snapshot.capture);
      console.log(JSON.stringify({ snapshotHash: snapshot.hash, ...renderRequirements(snapshot.capture), resources: diagnostic.resources, nextActions: diagnostic.nextActions, resourceScope: diagnostic.scope }, null, 2));
    } else if (command === 'compare' && [4, 5].includes(args.length)) {
      const [root, metadataPath, caseId, bodyPath, baselinePath] = args;
      const metadata = JSON.parse(readFileSync(projectFile(root, metadataPath), 'utf8'));
      const snapshot = loadSnapshot(root, metadata.evidence.snapshot);
      if (snapshot.hash !== metadata.evidence.hash) throw new Error('Metadata snapshot hash mismatch');
      const plan = verifyRenderPlan(path.resolve(root), metadata, snapshot.capture);
      if (plan.errors.length) throw new Error(plan.errors.join('\n'));
      const configuration = metadata.verification?.cases.find(c => c.id === caseId);
      if (!configuration) throw new Error('Unknown case');
      const body = JSON.parse(readFileSync(bodyPath, 'utf8'));
      validateBrowserMeasurement(body, metadata, configuration);
      let baselineMeasurement;
      if (baselinePath) {
        const baseline = metadata.verification.cases.find(c => c.id === configuration.baseline && c.kind === 'fidelity');
        if (configuration.kind !== 'behavior' || !baseline) throw new Error('Baseline body requires a behavior case with a fidelity baseline');
        baselineMeasurement = JSON.parse(readFileSync(baselinePath, 'utf8'));
        validateBrowserMeasurement(baselineMeasurement, metadata, baseline);
      }
      const result = compareRendered(snapshot.capture, metadata, configuration, body, { baselineMeasurement });
      console.log(JSON.stringify({ ...result, diagnostics: renderDiagnostics(result) }, null, 2));
      if (result.summary.FAIL) process.exitCode = 1;
    } else if (command === 'apply' && args.length === 3) {
      const [root, metadataPath, decisionsPath] = args, file = projectFile(root, metadataPath);
      const original = readFileSync(file), metadata = JSON.parse(original.toString('utf8')), snapshot = loadSnapshot(root, metadata.evidence.snapshot);
      if (metadata.evidence.hash !== snapshot.hash) throw new Error('Metadata snapshot hash mismatch');
      const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'));
      if (decisions.snapshotHash !== snapshot.hash) throw new Error('Decisions must identify the exact snapshot hash');
      const next = materializePlan(metadata, snapshot.capture, decisions);
      const validation = verify(path.resolve(root), { metadataOverrides: new Map([[metadataPath, next]]) });
      if (validation.errors.length) throw new Error(`Proposal rejected before writing:\n${validation.errors.join('\n')}`);
      const staging = mkdtempSync(path.join(path.dirname(file), '.metadata-'));
      try {
        const temporary = path.join(staging, 'metadata.json');
        writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: statSync(file).mode });
        if (projectFile(root, metadataPath) !== file || !readFileSync(file).equals(original)) throw new Error('Metadata changed during validation; retry without overwriting');
        renameSync(temporary, file);
      } finally { rmSync(staging, { recursive: true, force: true }); }
      console.log(JSON.stringify({ status: 'applied', warnings: validation.warnings, scope: 'DS conformance; not rendered fidelity' }));
    } else if (command === 'publish' && args.length === 4) {
      const [root, metadataPath, caseId, receiptPath] = args;
      const metadata = JSON.parse(readFileSync(projectFile(root, metadataPath), 'utf8'));
      const snapshot = loadSnapshot(root, metadata.evidence.snapshot);
      if (snapshot.hash !== metadata.evidence.hash) throw new Error('Metadata snapshot hash mismatch');
      console.log(JSON.stringify(publishMeasurement(root, metadata, caseId, receiptPath), null, 2));
    } else if (command === 'report' && args.length === 4) {
      const [root, metadataPath, caseId, reviewPath] = args;
      const metadata = JSON.parse(readFileSync(projectFile(root, metadataPath), 'utf8')), snapshot = loadSnapshot(root, metadata.evidence.snapshot);
      if (metadata.evidence.hash !== snapshot.hash) throw new Error('Metadata snapshot hash mismatch');
      const map = JSON.parse(readFileSync(projectFile(root, 'design-system/relationships/figma-code-map.json'), 'utf8'));
      const entry = Object.entries(map).find(([key, entry]) => !key.startsWith('_') && entry?.designSystem?.metadata === metadataPath)?.[1];
      if (!entry || entry.code.path !== metadata.code.path) throw new Error('Report metadata must belong to the component map');
      const report = comparisonReport(root, metadata, caseId, JSON.parse(readFileSync(reviewPath, 'utf8')), entry.code.style, metadataPath);
      console.log(JSON.stringify({ ...persistComparisonReport(root, report), limitation: 'Judgment supplied by reviewer; hashes and configuration generated, not authenticity or visual proof.' }));
    } else throw new Error('Usage: verification-plan.mjs diagnose ROOT | requirements SNAPSHOT | wait DIRECTORY CASE [TIMEOUT_MS] | close ROOT METADATA MANIFEST | compare ROOT METADATA CASE BODY [BASELINE_BODY] | apply ROOT METADATA DECISIONS | publish ROOT METADATA CASE RECEIPT | report ROOT METADATA CASE REVIEW');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
