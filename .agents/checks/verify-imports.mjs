import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from './verify-ds.mjs';
import { applicationSignals, diagnoseApplication } from './lib/application-diagnostics.mjs';
import { projectFile } from './lib/render-plan.mjs';
import { loadSnapshot } from './lib/figma-evidence.mjs';
import { essentialAssetGaps, essentialFontGaps } from './lib/resource-gaps.mjs';
import { deduplicateNextActions, deliveryNextActions, fontConfigurationActions } from './lib/resource-diagnostics.mjs';
import { fontConfigurations } from './lib/font-configuration.mjs';
import { delegationNextActions } from './lib/delegation-differences.mjs';
import { importDiagnostics } from './lib/import-diagnostics.mjs';
import { importReport, reportDocuments } from './lib/import-report.mjs';
import { closureConformance, staleSummary } from './lib/closure-conformance.mjs';
import { parseImportArgs } from './verify-closure.mjs';

const core = ['design-system/inventory.json', 'design-system/relationships/figma-code-map.json', 'design-system/relationships/figma-state.json'];
const notApplicable = reason => ({ status: 'NOT APPLICABLE', reason });

export function assessImportSummaries(names, summaries) {
  return names.map(name => {
    const summary = summaries.get(name), errors = [];
    if (!summary) errors.push('Visual summary missing');
    else {
      if (!summary.totalCases) errors.push('At least one fidelity case is required');
      if (summary.confirmed !== summary.totalCases || summary.pending || summary.failedRecords || summary.unestablished) errors.push('All fidelity correspondences must be confirmed and current, with none pending, failed or unestablished');
    }
    return { name, status: errors.length ? 'FAIL' : 'PASS', errors, ...(summary ? { summary } : {}) };
  });
}

export async function verifyImports(root, { applicationOptions, since } = {}) {
  root = path.resolve(root);
  const errors = [], warnings = [], summaries = new Map(), delegations = new Map();
  let closure;
  try {
    closure = closureConformance(root, { since });
    for (const finding of [...closure.components.findings, ...closure.tokens.findings].filter(f => f.status === 'FAIL')) errors.push(`Closure: ${finding.component || finding.file}: ${finding.token || ''} ${finding.reason}`);
    if (closure.status === 'NOT_RUN') errors.push('Closure: required CSS availability checks remain NOT_RUN');
  } catch (error) { closure = { status: 'FAIL', reason: error.message }; errors.push(`Closure: ${error.message}`); }
  let components = [], structure, application;
  try {
    if (!statSync(root).isDirectory()) throw new Error('Project root must be a directory');
    // Empty directories are not a scaffold; any actual generated file prevents an empty-kit pass.
    const populated = relative => {
      const directory = path.join(root, relative);
      return existsSync(directory) && readdirSync(directory, { withFileTypes: true }).some(entry =>
        !['.DS_Store', 'Thumbs.db', 'desktop.ini', '.gitkeep'].includes(entry.name) &&
        (entry.isDirectory() ? populated(`${relative}/${entry.name}`) : true));
    };
    const present = core.filter(file => existsSync(path.join(root, file)));
    if (!present.length && !applicationSignals(root).length && !populated('design-system') && !populated('src') && !populated('public')) {
      structure = notApplicable('Kit without a generated design system or application');
    } else {
      const result = verify(root, { visualSummaries: summaries, delegationSummaries: delegations });
      errors.push(...result.errors); warnings.push(...result.warnings);
      const inventory = JSON.parse(readFileSync(path.join(root, core[0]), 'utf8'));
      if (!Array.isArray(inventory.components)) throw new Error('inventory.components must be an array');
      components = assessImportSummaries(inventory.components, summaries);
      if (!result.errors.length) {
        const map = JSON.parse(readFileSync(projectFile(root, core[1])));
        for (const component of components) {
          const entry = Object.entries(map).find(([key, entry]) => !key.startsWith('_') && entry?.name === component.name)?.[1];
          if (!entry?.designSystem?.metadata) throw new Error(`${component.name}: mapped metadata entry missing`);
          const metadata = JSON.parse(readFileSync(projectFile(root, entry.designSystem.metadata)));
          const capture = loadSnapshot(root, metadata.evidence.snapshot).capture;
          component.resourceGaps = essentialFontGaps(capture, metadata);
          component.assetGaps = essentialAssetGaps(capture, metadata);
          component.fontConfiguration = fontConfigurations(root, metadata);
          warnings.push(...component.fontConfiguration.warnings.map(warning => `${component.name}: font configuration: ${warning}`));
          component.nextActions = deliveryNextActions(root, entry.designSystem.metadata, { fonts: component.resourceGaps, assets: component.assetGaps, summary: component.summary,
            configurationActions: fontConfigurationActions(root, entry.designSystem.metadata, component.fontConfiguration.configurations, metadata) });
          if (component.resourceGaps.length) component.errors.push('DS_GAP: essential font sources are unresolved; request an authorized source before completing the import');
          if (component.assetGaps.length) component.errors.push('DS_GAP: essential image sources are unresolved; request an authorized file before completing the import');
          if (component.errors.length) component.status = 'FAIL';
        }
      }
      structure = { status: result.errors.length ? 'FAIL' : 'PASS', reason: result.errors.length ? 'Design system structure or conformance checks failed; see errors' : 'Design system structure and static conformance checks passed' };
    }
  } catch (error) { errors.push(error.message); structure = { status: 'FAIL', reason: error.message }; }
  // Independent of component preflight: broken evidence must not conceal a broken demo.
  try {
    const signals = applicationSignals(root);
    application = signals.length ? { ...await diagnoseApplication(root, applicationOptions), signals }
      : notApplicable('No index.html or conventional App/app/main/index source entry; literal diagnostics do not infer arbitrary library files as applications');
  } catch (error) { application = { status: 'NOT RUN', reason: error.message, errors: [error.message] }; }
  const status = errors.length || components.some(c => c.status !== 'PASS') || !['PASS', 'NOT APPLICABLE'].includes(application.status) ? 'FAIL' : 'PASS';
  const diagnostics = importDiagnostics(root);
  warnings.push(...diagnostics.warnings.filter(warning => !warnings.includes(warning)));
  const nextActions = [...components.flatMap(component => component.nextActions || []), ...[...delegations.values()].flatMap(d => delegationNextActions(d.metadataPath, d.pendingRecords)), ...diagnostics.nextActions];
  if (errors.length) nextActions.unshift({ code: 'REPAIR_STATIC_CONFORMANCE', resources: [], prerequisites: ['Resolve the reported structural and conformance errors before collecting or registering confirmations.'], permissions: ['project-read'], command: null, requiredArguments: [] });
  if (!['PASS', 'NOT APPLICABLE'].includes(application.status)) nextActions.push({ code: 'RUN_APPLICATION_DIAGNOSTICS', resources: [],
    prerequisites: ['An available permitted browser runtime is required; if missing, npm run test:browser:setup needs installation/network permission.'],
    permissions: ['browser-execution'], command: { executable: 'node', args: ['.agents/checks/verify-imports.mjs', root] }, requiredArguments: [] });
  const actions = deduplicateNextActions(nextActions);
  const report = importReport({ status, structure, application, components, errors, warningCount: warnings.length, nextActions: actions,
    documents: reportDocuments(root, diagnostics.components) });
  return { schemaVersion: 1, status, projectCoverage:closure.coverage ?? {status:'NOT_RUN',reason:closure.reason}, staleConfirmations: staleSummary(warnings), closure, structure, components, application, errors, warnings, importDiagnostics: diagnostics.components, nextActions: actions, report,
    scope: 'Delivery accounting from revalidated persisted confirmations, not automatic overall visual fidelity. Demo checks only applicable literals in the kit Chromium.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseImportArgs(process.argv.slice(2));
    const result = await verifyImports(options.root, options);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
