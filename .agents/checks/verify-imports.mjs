import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from './verify-ds.mjs';
import { applicationSignals, diagnoseApplication } from './lib/application-diagnostics.mjs';
import { projectFile } from './lib/render-plan.mjs';
import { loadSnapshot } from './lib/figma-evidence.mjs';
import { essentialAssetGaps, essentialFontGaps } from './lib/resource-gaps.mjs';

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

export async function verifyImports(root, { applicationOptions } = {}) {
  root = path.resolve(root);
  const errors = [], warnings = [], summaries = new Map();
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
      const result = verify(root, { visualSummaries: summaries });
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
  return { schemaVersion: 1, status, structure, components, application, errors, warnings,
    scope: 'Delivery accounting from revalidated persisted confirmations, not automatic overall visual fidelity. Demo checks only applicable literals in the kit Chromium.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyImports(process.argv[2] || '.');
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
