import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalJson, loadSnapshot } from './figma-evidence.mjs';
import { objectRecords, projectFile, sha256 } from './render-plan.mjs';
import { caseInputs, checkedArtifacts, checkInputHash, validateMeasurementInputs, renderedChecks } from './comparison-evidence.mjs';
import { assertConfirmationChecks, COMPARATOR_VERSION, renderResultFacts } from './render-comparison.mjs';
import { StaleEvidenceError, UnverifiedEvidenceError } from './evidence-status.mjs';
import { createDependencySession } from './local-dependencies.mjs';
import { verifyBehaviorEvidence } from './behavior-evidence.mjs';
import { evidenceSessionFor } from './evidence-session.mjs';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;

export function readCorrespondences(markdown, prose) {
  const headings = prose.flatMap((line, index) => /^ {0,3}## Figma to code correspondences\s*(?:#+\s*)?$/.test(line) ? [index] : []);
  if (headings.length !== 1) throw new Error('correspondences requires exactly one real section');
  const start = headings[0] + 1, end = prose.findIndex((line, i) => i >= start && /^ {0,3}#{1,2}(?:\s|$)/.test(line));
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, c => c.replace(/[^\n]/g, '')).split('\n').slice(start, end < 0 ? undefined : end);
  let fence = null, contents = [], blocks = [], outside = [];
  for (const line of lines) {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) { if (fence.json) blocks.push(contents.join('\n')); fence = null; contents = []; }
      else contents.push(line);
    } else {
      const match = /^ {0,3}(`{3,}|~{3,})([^\s]*)\s*$/.exec(line);
      if (match) { fence = { 0: match[1][0], length: match[1].length, json: match[2] === 'json' }; }
      else outside.push(line);
    }
  }
  if (fence || blocks.length !== 1 || outside.some(l => /^\s*(?:\||None:)/.test(l) || /^\s*:?-{3,}:?\s*\|/.test(l))) throw new Error('correspondences requires one canonical JSON block, without a manual table or None');
  let record;
  try { record = JSON.parse(blocks[0]); } catch { throw new Error('correspondences JSON is invalid'); }
  if (!object(record) || record.schemaVersion !== 1 || !Array.isArray(record.correspondences)) throw new Error('correspondences requires schemaVersion 1 and a correspondences array');
  return record;
}

export function verifyCorrespondences(root, metadata, markdown, prose, { style, metadataPath, dependencySession, ...options } = {}) {
  const errors = [], warnings = [], current = [];
  let evidenceSession = options.evidenceSession;
  let record;
  try { record = readCorrespondences(markdown, prose); } catch (error) { return { errors: [error.message], warnings, current }; }
  const cases = new Map((Array.isArray(metadata.verification?.cases) ? metadata.verification.cases : []).filter(c => c?.kind === 'fidelity').map(c => [c.id, c]));
  const seen = new Set();
  const hashedFile = ref => {
    if (!object(ref) || !text(ref.path) || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw new Error('File path and SHA-256 are required');
    const bytes = readFileSync(projectFile(root, ref.path));
    if (sha256(bytes) !== ref.sha256) throw new Error(`Stale or corrupted evidence: ${ref.path}`);
    return bytes;
  };
  for (const [index, row] of record.correspondences.entries()) {
    const label = `correspondences[${index}]`, configuration = cases.get(row?.caseId);
    if (!object(row) || !text(row.caseId) || Object.keys(row).some(k => !['caseId', 'status', 'evidence'].includes(k)) || !configuration || seen.has(row.caseId) || !['candidate', 'confirmed'].includes(row.status)) { errors.push(`${label}: unique fidelity caseId and candidate/confirmed status required; configuration belongs to metadata`); continue; }
    seen.add(row.caseId);
    if (row.status === 'candidate') { if ('evidence' in row) errors.push(`${label}: candidate is not a confirmation; do not attach a confirmation record`); current.push({ caseId: row.caseId, status: 'candidate' }); continue; }
    try {
      dependencySession ||= createDependencySession(root);
      evidenceSession ||= evidenceSessionFor(root, options);
      const context = { ...options, dependencySession, evidenceSession };
      if (!row.evidence?.path?.startsWith('design-system/verification/')) throw new Error('Confirmed evidence must be retained in design-system/verification');
      const report = JSON.parse(hashedFile(row.evidence).toString('utf8'));
      if (report.schemaVersion !== 4 || report.kind !== 'rendered-comparison' || report.result !== 'PASS' || report.caseId !== row.caseId || !object(report.configuration) || report.configuration.id !== row.caseId || !/^[a-f0-9]{64}$/.test(report.snapshotHash || '') || !/^[a-f0-9]{64}$/.test(report.metadataHash || '') || !text(report.sourceSnapshot)) throw new Error('Confirmation report has an invalid case, snapshot or rendered PASS contract');
      if (!object(report.comparison) || !['agent-rendered-review', 'tool-rendered-comparison'].includes(report.comparison.method) || !text(report.comparison.reason) || report.comparison.figmaRef !== report.configuration.figmaRef) throw new Error('Explicit rendered comparison method, source ref and judgment required');
      for (const key of ['figmaRevision', 'codeRevision']) if (!object(report[key]) || !(text(report[key].id) || report[key].id === null && text(report[key].reason))) throw new Error('Record revision IDs or explicit unavailability reasons');
      if (!Array.isArray(report.files) || !Array.isArray(report.artifacts) || !report.artifacts.length) throw new Error('Declared input files and at least one retained rendered artifact required');
      const files = new Set();
      const stale = [];
      const recordedFacts = renderResultFacts(report.renderChecks);
      assertConfirmationChecks(report.renderChecks, report.checkReviews, report.artifacts.map(a => a.path));
      if (report.renderChecks.comparatorVersion !== COMPARATOR_VERSION) stale.push(`Comparator version changed: ${report.renderChecks.comparatorVersion} -> ${COMPARATOR_VERSION}`);
      for (const file of report.files) {
        if (!object(file) || !text(file.path) || path.isAbsolute(file.path) || file.path.includes('\\') || file.path.split('/').some(p => ['.', '..'].includes(p)) || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || files.has(file.path)) throw new Error('Unique safe input paths and SHA-256 required');
        files.add(file.path);
        try { checkInputHash(root, file); } catch (error) { if (error instanceof StaleEvidenceError) stale.push(error.message); else throw error; }
      }
      // Integrity is checked against the retained historical configuration, even when stale.
      const source = loadSnapshot(root, report.sourceSnapshot, context);
      if (source.hash !== report.snapshotHash || !files.has(report.sourceSnapshot)) throw new Error('Historical source snapshot hash or examined input is invalid');
      const historical = { ...metadata, evidence: { ...metadata.evidence, snapshot: report.sourceSnapshot, hash: report.snapshotHash } };
      checkedArtifacts(root, report.artifacts, historical, report.configuration, { ...context, checkCurrentInputs: false });
      stale.push(...verifyBehaviorEvidence(root, metadata, historical, report, context));
      if (report.snapshotHash !== metadata.evidence?.hash || canonicalJson(report.configuration) !== canonicalJson(configuration)) stale.push('Source snapshot or examined configuration changed');
      const inputs = caseInputs(root, metadata, configuration, style, context);
      if (report.metadataHash !== inputs.metadataHash) stale.push('Stale verification decisions for this configuration');
      stale.push(...inputs.warnings);
      if (metadataPath && (report.metadataAudit?.path !== metadataPath || !/^[a-f0-9]{64}$/.test(report.metadataAudit?.sha256 || ''))) throw new Error('Historical metadata audit hash required');
      for (const file of inputs.files) if (!files.has(file)) stale.push(`Missing examined input hash: ${file}`);
      for (const artifact of report.artifacts.filter(a => a.kind === 'browser-measurement')) {
        const receipt = JSON.parse(readFileSync(projectFile(root, artifact.publication.path), 'utf8'));
        try { validateMeasurementInputs(root, receipt, metadata, configuration, context); }
        catch (error) { if (error instanceof StaleEvidenceError || error instanceof UnverifiedEvidenceError) stale.push(error.message); else throw error; }
      }
      if (stale.length) {
        warnings.push(`${label}: confirmed evidence is no longer current; NOT VERIFIED: ${[...new Set(stale)].join('; ')}`);
        current.push({ caseId: row.caseId, registeredStatus: 'confirmed', status: 'candidate', verification: 'NOT VERIFIED' });
      } else {
        const result = renderedChecks(root, metadata, configuration, report.artifacts, context);
        if (canonicalJson(renderResultFacts(result)) !== canonicalJson(recordedFacts)) throw new Error('Recorded render checks differ from recomputed source/measurement checks');
        assertConfirmationChecks(result, report.checkReviews, report.artifacts.map(a => a.path));
        current.push({ caseId: row.caseId, status: 'confirmed', checks: result.summary, behaviorCaseIds: report.behaviors.map(b => b.caseId),
          computedColors: result.checks.filter(check => check.id.startsWith('color:')).map(({ id, status }) => ({ id, status })),
          behaviorColors: report.behaviors.map(b => ({ caseId: b.caseId, checks: b.renderChecks.checks.filter(check => check.id.startsWith('color:')).map(({ id, status }) => ({ id, status })) })),
          behaviorChecks: Object.fromEntries(['PASS', 'FAIL', 'NOT COMPARABLE', 'NOT RUN'].map(status => [status, report.behaviors.reduce((sum, b) => sum + b.renderChecks.summary[status], 0)])) });
      }
    } catch (error) { errors.push(`${label}: ${error.message}`); current.push({ caseId: row.caseId, status: 'failed-record' }); }
  }
  for (const id of cases.keys()) if (!seen.has(id)) errors.push(`correspondences: missing fidelity case ${id}`);
  return { errors, warnings, current };
}

export function correspondenceSummary(metadata, result) {
  const cases = objectRecords(metadata.verification?.cases).filter(c => c.kind === 'fidelity');
  const current = new Map(result.current.map(c => [c.caseId, c]));
  return { confirmed: cases.filter(c => current.get(c.id)?.status === 'confirmed').length,
    cases: objectRecords(metadata.verification?.cases).map(c => ({ caseId: c.id, kind: c.kind, modes: c.modes,
      computedColors: c.kind === 'fidelity' ? current.get(c.id)?.computedColors || []
        : result.current.filter(row => row.status === 'confirmed').flatMap(row => row.behaviorColors || []).find(b => b.caseId === c.id)?.checks || [],
      status: c.kind === 'fidelity' ? current.get(c.id)?.status || 'missing'
        : result.current.some(row => row.status === 'confirmed' && row.behaviorCaseIds?.includes(c.id)) ? 'verified-behavior' : 'pending',
      ...(current.get(c.id)?.registeredStatus === 'confirmed' ? { stale: true } : {}) })),
    pending: cases.filter(c => !['confirmed', 'failed-record'].includes(current.get(c.id)?.status)).length,
    failedRecords: cases.filter(c => current.get(c.id)?.status === 'failed-record').length,
    unestablished: Array.isArray(metadata.verification?.unestablished) ? metadata.verification.unestablished.length : 0, totalCases: cases.length,
    confirmedAutomaticChecks: Object.fromEntries(['PASS', 'FAIL', 'NOT COMPARABLE', 'NOT RUN'].map(status => [status, result.current.reduce((sum, c) => sum + (c.checks?.[status] || 0), 0)])),
    confirmedBehaviorChecks: Object.fromEntries(['PASS', 'FAIL', 'NOT COMPARABLE', 'NOT RUN'].map(status => [status, result.current.reduce((sum, c) => sum + (c.behaviorChecks?.[status] || 0), 0)])),
    scope: 'Confirmation accounting, not an automatic judgment of overall visual fidelity.' };
}
