import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalJson, loadSnapshot, verifyEvidence } from './figma-evidence.mjs';
import { projectFile, verifyRenderPlan } from './render-plan.mjs';
import { readArtifact, renderedChecks, validateMeasurementInputs } from './comparison-evidence.mjs';
import { assertConfirmationChecks } from './render-comparison.mjs';
import { requirePassed } from './behavior-evidence.mjs';
import { StaleEvidenceError, UnverifiedEvidenceError } from './evidence-status.mjs';
import { createDependencySession } from './local-dependencies.mjs';
import { mappedComponentsOf } from '../verify-figma-evidence.mjs';
import { verifyIntrinsicCss } from './intrinsic-css.mjs';
import { verifyTokenStyles } from './token-styles.mjs';
import { verifyCorrespondences } from './correspondences.mjs';
import { markdownProse } from '../verify-ds.mjs';
import { collectCssDiagnostics } from './css-diagnostics.mjs';
import { renderDiagnostics } from './render-diagnostics.mjs';
import { evidenceSessionFor } from './evidence-session.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Consume original published bytes before checking currency, so stale inputs cannot hide corruption.
function measurement(root, metadata, configuration, artifacts, options) {
  if (!Array.isArray(artifacts) || artifacts.filter(a => a?.kind === 'browser-measurement').length !== 1 || new Set(artifacts.map(a => a?.path)).size !== artifacts.length) throw new Error('Exactly one published browser measurement and unique artifact paths required');
  for (const artifact of artifacts) if (!/^[a-f0-9]{64}$/.test(artifact?.sha256 || '')) throw new Error('Published artifact SHA-256 required');
  const original = artifacts.find(a => a.kind === 'browser-measurement');
  const body = JSON.parse(readFileSync(projectFile(root, original.path), 'utf8'));
  const historical = { ...metadata, evidence: { ...metadata.evidence, hash: body.snapshotHash } };
  readArtifact(root, original, historical, body.configuration, { ...options, derive: true, checkCurrentInputs: false });
  if (body.snapshotHash !== metadata.evidence.hash || canonicalJson(body.configuration) !== canonicalJson(configuration)) throw new StaleEvidenceError('Measurement snapshot or configuration changed; collect again');
  const checked = artifacts.map(a => readArtifact(root, a, metadata, configuration, { ...options, derive: true, checkCurrentInputs: false }));
  const receipt = JSON.parse(readFileSync(projectFile(root, original.publication.path), 'utf8'));
  validateMeasurementInputs(root, receipt, metadata, configuration, options);
  return { body, artifacts: checked };
}

export function closeVerification(root, metadataPath, manifest, context = {}) {
  root = path.resolve(root);
  const result = { state: 'pending', complete: false, failures: [], pending: [], stale: [], warnings: [], cases: [],
    scope: 'Current mapped geometry, font resources and mandatory behavior; not complete visual fidelity or full application validation.' };
  const issue = (list, caseId, reason) => result[list].push({ caseId, reason });
  try {
    const evidenceSession = evidenceSessionFor(root, context);
    if (!object(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases) || Object.keys(manifest).some(k => !['schemaVersion', 'cases'].includes(k))) throw new Error('Closure manifest requires schemaVersion 1 and cases');
    const metadata = evidenceSession.json(metadataPath);
    const configurations = metadata.verification?.cases, seen = new Set();
    if (!Array.isArray(configurations) || configurations.some(c => !object(c) || typeof c.id !== 'string' || !c.id.trim() || !['fidelity', 'behavior'].includes(c.kind)) || new Set(configurations.map(c => c.id)).size !== configurations.length) throw new Error('Closure requires readable, unique fidelity/behavior cases to enumerate pending work');
    for (const record of manifest.cases) {
      if (!object(record) || !configurations.some(c => c.id === record.caseId) || seen.has(record.caseId) || Object.keys(record).some(k => !['caseId', 'artifacts', 'checkReviews'].includes(k))) throw new Error('Closure cases must be unique established caseIds with artifacts and optional checkReviews');
      seen.add(record.caseId);
    }
    for (const configuration of configurations) if (!seen.has(configuration.id)) issue('pending', configuration.id, 'Published measurement missing');
    for (const exclusion of Array.isArray(metadata.verification.unestablished) ? metadata.verification.unestablished : []) if (object(exclusion)) issue('pending', null, `Unestablished correspondence: ${exclusion.reason}`);
    if (!configurations.some(c => c.kind === 'fidelity')) issue('pending', null, 'No established fidelity cases');
    const snapshot = loadSnapshot(root, metadata.evidence.snapshot, { evidenceSession });
    if (snapshot.hash !== metadata.evidence.hash) throw new Error('Metadata snapshot hash mismatch');
    const map = evidenceSession.json('design-system/relationships/figma-code-map.json');
    const entries = Object.entries(map).filter(([key, value]) => !key.startsWith('_') && value?.designSystem?.metadata === metadataPath);
    if (entries.length !== 1 || canonicalJson(entries[0][1].code?.path) !== canonicalJson(metadata.code?.path) || entries[0][1].code?.component !== metadata.code?.component) throw new Error('Closure metadata must resolve uniquely in the component map');
    const entry = entries[0][1], dependencySession = createDependencySession(root), options = { ...context, dependencySession, evidenceSession };
    const names = new Set((metadata.evidence?.dispositions || []).filter(d => d.kind === 'delegated').map(d => d.resolvedComponent));
    const evidence = verifyEvidence(metadata, snapshot.capture, { mappedComponents: names.size ? mappedComponentsOf(root, Object.entries(map).filter(([key]) => !key.startsWith('_')), { ...options, names }) : [] });
    const validations = [evidence, verifyRenderPlan(root, metadata, snapshot.capture, { delegations: evidence.review.delegations, reserved: [entry.designSystem?.usage] }),
      verifyIntrinsicCss(root, metadata, entry.code.style), verifyTokenStyles(root, metadata, options),
      collectCssDiagnostics(root, [metadata.code.path, entry.code.style, ...(metadata.verification.stylesheets || [])])];
    for (const validation of validations) {
      validation.errors.forEach(reason => issue('failures', null, reason));
      result.warnings.push(...validation.warnings);
    }
    if (result.failures.length) {
      for (const configuration of configurations) if (seen.has(configuration.id)) issue('pending', configuration.id, 'Measurement currency and rendered checks not evaluated because static validation failed');
      result.state = 'failed'; return result;
    }
    const measurements = new Map();
    for (const configuration of configurations) {
      const record = manifest.cases.find(r => r.caseId === configuration.id);
      if (!record) continue;
      try { measurements.set(configuration.id, measurement(root, metadata, configuration, record.artifacts, options)); }
      catch (error) { issue(error instanceof StaleEvidenceError ? 'stale' : error instanceof UnverifiedEvidenceError ? 'pending' : 'failures', configuration.id, error.message); }
    }
    for (const configuration of configurations) {
      const measured = measurements.get(configuration.id);
      if (!measured) continue;
      const record = manifest.cases.find(r => r.caseId === configuration.id);
      const checks = renderedChecks(root, metadata, configuration, measured.artifacts, { ...options, baselineMeasurement: measurements.get(configuration.measurementBaseline ?? configuration.baseline)?.body });
      const diagnostics = renderDiagnostics(checks);
      result.cases.push({ caseId: configuration.id, checks, diagnostics });
      result.warnings.push(...diagnostics.map(d => `${configuration.id} ${d.checkId}: ${d.reason} Delta width=${d.delta.width}px, height=${d.delta.height}px`));
      for (const check of checks.checks) if (check.status === 'FAIL') issue('failures', configuration.id, `${check.id}: ${check.reason}`);
      try {
        if (configuration.kind === 'behavior') {
          if (record.checkReviews?.length) throw new Error('Behavior checks cannot be rescued by manual reviews');
          requirePassed(checks);
        } else assertConfirmationChecks(checks, record.checkReviews, measured.artifacts.map(a => a.path));
      } catch (error) {
        if (!checks.summary.FAIL) issue('pending', configuration.id, error.message);
      }
    }
    const usage = readFileSync(projectFile(root, entry.designSystem.usage), 'utf8');
    const correspondences = verifyCorrespondences(root, metadata, usage, markdownProse(usage), { ...options, style: entry.code.style, metadataPath });
    correspondences.errors.forEach(reason => issue('failures', null, reason));
    result.warnings.push(...correspondences.warnings);
    for (const record of correspondences.current) if (record.registeredStatus === 'confirmed' && record.status !== 'confirmed') issue('stale', record.caseId, 'Registered confirmation is no longer current');
    const confirmed = correspondences.current.filter(c => c.status === 'confirmed').length;
    result.state = result.failures.length ? 'failed' : result.pending.length || result.stale.length ? 'pending' : confirmed === configurations.filter(c => c.kind === 'fidelity').length ? 'confirmed' : 'measured';
    result.complete = result.state === 'confirmed';
  } catch (error) { issue('failures', null, error.message); result.state = 'failed'; }
  return result;
}
