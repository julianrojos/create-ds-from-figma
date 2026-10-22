import { readFileSync } from 'node:fs';
import { projectFile } from './render-plan.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const records = value => Array.isArray(value) ? value.filter(object) : [];
const modeKey = modes => JSON.stringify(Object.entries(modes || {}).sort(([a], [b]) => a.localeCompare(b)));

// Optional narrative input is never treated as verification, nor can an unreadable fiche become an empty success.
export function reportDocuments(root, entries) {
  return entries.map(({ name, metadataPath }) => {
    try {
      const metadata = JSON.parse(readFileSync(projectFile(root, metadataPath), 'utf8'));
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Metadata must be an object');
      return { name, metadata };
    } catch (error) { return { name, unavailable: error.message }; }
  });
}

export function importReport({ status, structure, application, components = [], documents = [], diagnosticCases = [], nextActions = [], diagnostic = false, errors = [], warningCount = 0 }) {
  const names = [...new Set([...components.map(c => c.name), ...documents.map(d => d.name)])];
  const output = names.map(name => {
    const component = components.find(c => c.name === name), document = documents.find(d => d.name === name), metadata = document?.metadata;
    const invalidInputs = [];
    for (const [field, value] of [['verification.cases', metadata?.verification?.cases], ['evidence.decisions', metadata?.evidence?.decisions],
      ['evidence.dispositions', metadata?.evidence?.dispositions], ['unresolved', metadata?.unresolved], ['verification.unestablished', metadata?.verification?.unestablished]]) {
      if (value === undefined) continue;
      if (!Array.isArray(value)) invalidInputs.push(`${field}: expected an array`);
      else value.forEach((entry, index) => { if (!object(entry)) invalidInputs.push(`${field}[${index}]: expected an object`); });
    }
    const verified = new Map(records(component?.summary?.cases).map(c => [c.caseId, c]));
    const cases = records(component?.summary?.cases ? component.summary.cases.map(c => ({ ...c, id: c.caseId })) : metadata?.verification?.cases).map(c => {
      const current = verified.get(c.id), measured = diagnosticCases.find(d => d.caseId === c.id);
      return { caseId: c.id, kind: c.kind, modes: c.modes || {}, status: current?.status || (diagnostic ? 'not-revalidated' : 'pending'), computedColors: records(current?.computedColors), ...(current?.stale ? { stale: true } : {}),
        ...(measured ? { temporaryChecks: measured.summary, computedColors: records(measured.checks).filter(check => check.id.startsWith('color:')).map(({ id, status }) => ({ id, status })),
          requiredCorrections: records(measured.checks).filter(check => check.status === 'FAIL').map(({ id, status, reason }) => ({ id, status, reason })),
          requiredReviews: c.kind === 'fidelity' ? records(measured.checks).filter(check => check.status === 'NOT COMPARABLE' || check.status === 'PASS' && check.typographyTolerance?.requiresRenderedReview === true).map(({ id, status, reason }) => ({ id, status, reason })) : [],
          requiredExecution: records(measured.checks).filter(check => check.status === 'NOT RUN' || c.kind === 'behavior' && check.status === 'NOT COMPARABLE').map(({ id, status, reason }) => ({ id, status, reason })) } : {}) };
    });
    const modes = new Map();
    for (const c of cases) {
      const key = modeKey(c.modes);
      if (!modes.has(key)) modes.set(key, { modes: c.modes, fidelity: [], confirmedFidelity: [], behavior: [], verifiedBehavior: [] });
      const group = modes.get(key);
      if (c.kind === 'fidelity') { group.fidelity.push(c.caseId); if (c.status === 'confirmed') group.confirmedFidelity.push(c.caseId); }
      else if (c.kind === 'behavior') { group.behavior.push(c.caseId); if (c.status === 'verified-behavior') group.verifiedBehavior.push(c.caseId); }
    }
    return { name, status: invalidInputs.length ? 'FAIL' : component?.status || (diagnostic ? 'NOT VERIFIED' : 'UNKNOWN'), invalidInputs,
      coverage: { confirmationsRevalidated: !diagnostic && Boolean(component?.summary), fidelity: cases.filter(c => c.kind === 'fidelity').length, confirmed: diagnostic ? null : cases.filter(c => c.kind === 'fidelity' && c.status === 'confirmed').length,
        pending: diagnostic ? null : cases.filter(c => c.kind === 'fidelity' && !['confirmed', 'failed-record'].includes(c.status)).length,
        stale: cases.filter(c => c.stale).length, failedRecords: cases.filter(c => c.status === 'failed-record').length },
      ...(document?.unavailable ? { unavailable: document.unavailable } : {}),
      cases, modeCoverage: [...modes.values()],
      declaredDecisions: records(metadata?.evidence?.decisions).map(({ target, rule, reason, observations }) => ({ target, rule, reason, observations })),
      excludedObservations: records(metadata?.evidence?.dispositions).filter(d => d.kind === 'excluded'),
      unresolvedDesign: records(metadata?.unresolved), unestablished: records(metadata?.verification?.unestablished),
    };
  });
  const total = output.reduce((n, c) => n + c.coverage.fidelity, 0), confirmed = output.reduce((n, c) => n + c.coverage.confirmed, 0);
  const inputErrors = output.flatMap(c => c.invalidInputs.map(reason => `${c.name}: ${reason}`));
  return { schemaVersion: 1, source: diagnostic ? 'temporary-diagnosis' : 'revalidated-delivery', status: inputErrors.length ? 'FAIL' : status,
    headline: !output.length && structure?.status === 'NOT APPLICABLE' ? 'No generated components; not applicable.'
      : diagnostic ? `${total} declared fidelity cases; temporary diagnosis does not revalidate confirmations or confirm delivery.`
        : `${confirmed} of ${total} declared fidelity cases currently confirmed.`,
    structure: structure || { status: 'NOT RUN', reason: 'Not evaluated by this diagnostic surface.' },
    application: application ? { status: application.status, ...(application.reason ? { reason: application.reason } : {}) } : { status: 'NOT RUN' },
    components: output, pendingAuthorizations: nextActions.filter(a => a.code.startsWith('AUTHORIZE_')),
    obligations: nextActions.filter(a => !a.code.startsWith('AUTHORIZE_')), errors: [...errors, ...inputErrors], warningCount,
    limits: ['Only explicitly mapped single solid sRGB color properties are compared; computed values do not prove visible paint, mask loading, shape or glyph coverage.',
      'Mode coverage lists exact declared case configurations, not every available mode or every combination.',
      'Declared decisions and exclusions are not proof of user approval. Temporary diagnostics never replace persisted evidence and specific rendered reviews.'] };
}
