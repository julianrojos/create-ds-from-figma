import { readFileSync } from 'node:fs';
import { canonicalJson } from './figma-evidence.mjs';
import { objectRecords, projectFile, sha256 } from './render-plan.mjs';
import { caseInputs, checkInputHash, readArtifact, renderedChecks, validateMeasurementInputs } from './comparison-evidence.mjs';
import { COMPARATOR_VERSION, renderResultFacts } from './render-comparison.mjs';
import { StaleEvidenceError, UnverifiedEvidenceError } from './evidence-status.mjs';

const casesFor = (metadata, baseline) => objectRecords(metadata.verification?.cases).filter(c => c.kind === 'behavior' && c.baseline === baseline.id);
const readBody = (root, artifact) => JSON.parse(readFileSync(projectFile(root, artifact.path), 'utf8'));
const baselineBody = (root, artifacts) => readBody(root, artifacts.find(a => a.kind === 'browser-measurement'));

export function requirePassed(result) {
  renderResultFacts(result);
  for (const check of result.checks) if (check.status !== 'PASS') {
    const pending = ['NOT RUN', 'NOT COMPARABLE'].includes(check.status);
    throw new Error(`Required behavior blocked: ${check.id} ${check.status}${pending ? '; confirmation pending (NOT VERIFIED), not a demonstrated visual defect; no review rescues it, so declare the missing expectation or measure again' : '; required check failed; inspect its scope before claiming a visual defect'}`);
  }
}

export function deriveBehaviorEvidence(root, metadata, baseline, artifacts, decisions, options = {}) {
  const cases = casesFor(metadata, baseline);
  if (!Array.isArray(decisions) || decisions.length !== cases.length || new Set(decisions.map(d => d?.caseId)).size !== decisions.length || decisions.some(d => !cases.some(c => c.id === d?.caseId))) throw new Error('Every associated behavior case needs exactly one published browser artifact');
  const body = baselineBody(root, artifacts);
  return cases.map(configuration => {
    const decision = decisions.find(d => d.caseId === configuration.id);
    if (Object.keys(decision).some(k => !['caseId', 'artifact'].includes(k)) || decision.artifact?.kind !== 'browser-measurement') throw new Error('Behavior evidence accepts only caseId and a browser-measurement artifact');
    const artifact = readArtifact(root, decision.artifact, metadata, configuration, { ...options, derive: true });
    const inputs = caseInputs(root, metadata, configuration, undefined, options);
    const renderChecks = renderedChecks(root, metadata, configuration, [artifact], { baselineMeasurement: body });
    requirePassed(renderChecks);
    return { caseId: configuration.id, configuration: structuredClone(configuration), metadataHash: inputs.metadataHash,
      files: inputs.files.map(file => ({ path: file, sha256: sha256(readFileSync(projectFile(root, file))) })), artifact, renderChecks };
  });
}

// Check retained bytes even for stale records; only current records are recomputed.
export function verifyBehaviorEvidence(root, metadata, historical, report, options = {}) {
  if (!Array.isArray(report.behaviors)) throw new Error('Associated behavior evidence array required');
  const seen = new Set(), stale = [], base = baselineBody(root, report.artifacts);
  const expected = casesFor(metadata, metadata.verification.cases.find(c => c.id === report.caseId) || { id: report.caseId });
  for (const record of report.behaviors) {
    const configuration = record?.configuration;
    if (!configuration || configuration.kind !== 'behavior' || configuration.baseline !== report.caseId || record.caseId !== configuration.id || seen.has(record.caseId) || !/^[a-f0-9]{64}$/.test(record.metadataHash || '') || !Array.isArray(record.files)) throw new Error('Unique historical behavior configuration, fingerprint and files required');
    seen.add(record.caseId);
    requirePassed(record.renderChecks);
    if (record.artifact?.kind !== 'browser-measurement' || !/^[a-f0-9]{64}$/.test(record.artifact.sha256 || '')) throw new Error('Behavior needs a hashed published browser measurement');
    readArtifact(root, record.artifact, historical, configuration, { checkCurrentInputs: false });
    const files = new Set(), localStale = [];
    for (const file of record.files) {
      if (!file || typeof file.path !== 'string' || files.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) throw new Error('Unique behavior input paths and hashes required');
      files.add(file.path);
      try { checkInputHash(root, file); } catch (error) { if (error instanceof StaleEvidenceError) localStale.push(error.message); else throw error; }
    }
    const current = expected.find(c => c.id === record.caseId);
    if (!current || canonicalJson(current) !== canonicalJson(configuration) || report.snapshotHash !== metadata.evidence.hash || canonicalJson(base.configuration) !== canonicalJson(metadata.verification.cases.find(c => c.id === report.caseId) ?? null)) localStale.push(`Behavior configuration changed: ${record.caseId}`);
    if (record.renderChecks.comparatorVersion !== COMPARATOR_VERSION) localStale.push(`Behavior comparator version changed: ${record.caseId}`);
    if (current) {
      const inputs = caseInputs(root, metadata, current, undefined, options);
      if (inputs.metadataHash !== record.metadataHash) localStale.push(`Behavior decisions changed: ${record.caseId}`);
      localStale.push(...inputs.warnings);
      for (const file of inputs.files) if (!files.has(file)) localStale.push(`Missing behavior examined input hash: ${file}`);
      const receipt = readBody(root, record.artifact.publication);
      try { validateMeasurementInputs(root, receipt, metadata, current, options); }
      catch (error) { if (error instanceof StaleEvidenceError || error instanceof UnverifiedEvidenceError) localStale.push(error.message); else throw error; }
    }
    if (!localStale.length) {
      const result = renderedChecks(root, metadata, current, [record.artifact], { baselineMeasurement: base });
      if (canonicalJson(renderResultFacts(result)) !== canonicalJson(renderResultFacts(record.renderChecks))) throw new Error('Recorded behavior checks differ from recomputed measurements');
      requirePassed(result);
    }
    stale.push(...localStale);
  }
  // Missing evidence in the same plan is invalid; plan additions/removals stale old confirmations.
  const missing = expected.filter(c => !seen.has(c.id));
  if (missing.length) {
    const inputs = caseInputs(root, metadata, metadata.verification.cases.find(c => c.id === report.caseId), undefined, options);
    if (inputs.metadataHash === report.metadataHash) throw new Error('Required behavior evidence is missing');
    stale.push('Associated behavior coverage changed');
  }
  return stale;
}
