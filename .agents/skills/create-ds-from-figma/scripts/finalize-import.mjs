import { mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verify, markdownProse } from '../../../checks/verify-ds.mjs';
import { verifyImports } from '../../../checks/verify-imports.mjs';
import { readCorrespondences, verifyCorrespondences } from '../../../checks/lib/correspondences.mjs';
import { projectFile } from '../../../checks/lib/render-plan.mjs';
import { comparisonReport, persistComparisonReport } from './verification-plan.mjs';
import { runBrowserVerification } from './verification-browser.mjs';
import { browserRuntime } from '../../../scripts/test-kit.mjs';
import { loadSnapshot } from '../../../checks/lib/figma-evidence.mjs';
import { essentialAssetGaps, essentialFontGaps } from '../../../checks/lib/resource-gaps.mjs';

function updatedUsage(original, record) {
  const prose = markdownProse(original);
  const start = prose.findIndex(line => /^ {0,3}## Figma to code correspondences\s*(?:#+\s*)?$/.test(line));
  const end = prose.findIndex((line, index) => index > start && /^ {0,3}#{1,2}(?:\s|$)/.test(line));
  const clean = original.replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, '')).split('\n');
  const lines = original.split('\n');
  let opening, fence, json;
  for (let i = start + 1; i < (end < 0 ? lines.length : end); i++) {
    if (!fence) {
      const match = /^ {0,3}(`{3,}|~{3,})([^\s]*)\s*$/.exec(clean[i]);
      if (match) { opening = i; fence = match[1]; json = match[2] === 'json'; }
    } else if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(clean[i])) {
      if (json) {
        lines.splice(opening, i - opening + 1, '```json', JSON.stringify(record, null, 2), '```');
        return lines.join('\n');
      }
      fence = null;
    }
  }
  throw new Error('Canonical correspondence block missing');
}

// All judgments are supplied explicitly; source facts, hashes and report identities are derived.
export function recordImportReviews(root, metadataPath, reviews) {
  root = path.resolve(root);
  const validation = verify(root);
  if (validation.errors.length) throw new Error(`Static validation failed: ${validation.errors.join('\n')}`);
  const metadataFile = projectFile(root, metadataPath), originalMetadata = readFileSync(metadataFile);
  const metadata = JSON.parse(originalMetadata);
  const map = JSON.parse(readFileSync(projectFile(root, 'design-system/relationships/figma-code-map.json')));
  const entries = Object.entries(map).filter(([key, value]) => !key.startsWith('_') && value?.designSystem?.metadata === metadataPath);
  if (entries.length !== 1) throw new Error('Metadata must resolve uniquely in the component map');
  const entry = entries[0][1], cases = metadata.verification.cases.filter(c => c.kind === 'fidelity');
  if (reviews?.schemaVersion !== 1 || !Array.isArray(reviews.cases) || !cases.length || reviews.cases.length !== cases.length || new Set(reviews.cases.map(r => r?.caseId)).size !== cases.length || reviews.cases.some(r => !cases.some(c => c.id === r?.caseId) || Object.keys(r).some(key => !['caseId', 'review'].includes(key)))) throw new Error('Exactly one explicit review per fidelity case is required');
  const usageFile = projectFile(root, entry.designSystem.usage), originalUsage = readFileSync(usageFile, 'utf8');
  const record = readCorrespondences(originalUsage, markdownProse(originalUsage));
  // Validate every review before persisting any report or modifying the canonical usage block.
  const reports = cases.map(c => comparisonReport(root, metadata, c.id, reviews.cases.find(r => r.caseId === c.id).review, entry.code.style, metadataPath));
  for (const report of reports) {
    const inputs = [...report.files, ...report.behaviors.flatMap(behavior => behavior.files)];
    if (inputs.some(input => projectFile(root, input.path) === usageFile)) throw new Error('A confirmation cannot depend on itself: usage.md is an examined input and will be rewritten');
  }
  record.correspondences = reports.map(report => ({ caseId: report.caseId, status: 'confirmed', evidence: persistComparisonReport(root, report) }));
  const next = updatedUsage(originalUsage, record);
  const checked = verifyCorrespondences(root, metadata, next, markdownProse(next), { style: entry.code.style, metadataPath });
  if (checked.errors.length || checked.current.length !== cases.length || checked.current.some(c => c.status !== 'confirmed')) throw new Error(`Confirmation proposal is not current: ${[...checked.errors, ...checked.warnings].join('\n')}`);
  const directory = mkdtempSync(path.join(path.dirname(usageFile), '.confirmation-'));
  try {
    const temporary = path.join(directory, 'usage.md');
    writeFileSync(temporary, next, { flag: 'wx', mode: statSync(usageFile).mode });
    if (projectFile(root, metadataPath) !== metadataFile || !readFileSync(metadataFile).equals(originalMetadata) || projectFile(root, entry.designSystem.usage) !== usageFile || readFileSync(usageFile, 'utf8') !== originalUsage) throw new Error('Metadata or usage changed during review; retry without overwriting');
    renameSync(temporary, usageFile);
  } finally { rmSync(directory, { recursive: true, force: true }); }
  return record.correspondences;
}

export async function finalizeImport(root, metadataPath, { reviews, collect = false, browserOptions, applicationOptions } = {}) {
  let collection, correspondences;
  const errors = [];
  try {
    const map = JSON.parse(readFileSync(projectFile(root, 'design-system/relationships/figma-code-map.json')));
    if (Object.entries(map).filter(([key, entry]) => !key.startsWith('_') && entry?.designSystem?.metadata === metadataPath).length !== 1) throw new Error('Finalization requires one mapped component metadata path');
    projectFile(root, metadataPath);
    if (reviews !== undefined && collect) throw new Error('Collect first, then review its retained artifacts; do not apply reviews to freshly replaced measurements');
    if (collect) {
      const metadata = JSON.parse(readFileSync(projectFile(root, metadataPath)));
      const { capture } = loadSnapshot(root, metadata.evidence.snapshot), gaps = essentialFontGaps(capture, metadata), images = essentialAssetGaps(capture, metadata);
      if (gaps.length || images.length) throw new Error(`DS_GAP: request authorized sources for essential resources: ${[...gaps.map(gap => `font ${gap.font.family} ${gap.font.style} (${gap.css?.weight || 'weight unresolved'})`), ...images.map(gap => `image ${gap.observation}[${gap.index}]`)].join(', ')}. Diagnostic collection remains available through verification-browser.mjs; do not invent a font package or substitute an image.`);
      const runtime = browserRuntime();
      const playwright = await import(pathToFileURL(path.join(runtime, 'node_modules/playwright/index.mjs')).href);
      collection = await runBrowserVerification(root, metadataPath, { ...browserOptions, playwright });
    }
    if (reviews !== undefined) correspondences = recordImportReviews(root, metadataPath, reviews);
  } catch (error) { errors.push(error.message); }
  const delivery = await verifyImports(root, { applicationOptions });
  const status = !errors.length && delivery.status === 'PASS' && (!collection || collection.closure.complete && !collection.blocked.length) ? 'PASS' : 'FAIL';
  return { status, errors, collection, correspondences, delivery,
    scope: 'Explicit review recording and current delivery checks, not automatic visual judgment. A collection without confirmation is not a completed import.' };
}

export function parseFinalizationArgs(args) {
  const [root, metadataPath, ...flags] = args;
  const usage = 'Usage: finalize-import.mjs ROOT METADATA --collect [--port PORT] | --reviews REVIEW_FILE | --check';
  if (!root || !metadataPath || root.startsWith('--') || metadataPath.startsWith('--')) throw new Error(usage);
  let mode, reviewFile, port;
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (['--collect', '--reviews', '--check'].includes(flag) && !mode) {
      mode = flag;
      if (flag === '--reviews') {
        reviewFile = flags[++i];
        if (!reviewFile || reviewFile.startsWith('--')) throw new Error(usage);
      }
    } else if (flag === '--port' && port === undefined) {
      const value = flags[++i];
      if (!/^\d+$/.test(value || '') || !Number.isInteger(Number(value)) || Number(value) > 65535) throw new Error('Port must be an integer from 0 (automatic) to 65535');
      port = Number(value);
    } else throw new Error(usage);
  }
  if (!mode || port !== undefined && mode !== '--collect') throw new Error(usage);
  return { root, metadataPath, mode, reviewFile, port };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { root, metadataPath, mode, reviewFile, port } = parseFinalizationArgs(process.argv.slice(2));
    const result = await finalizeImport(root, metadataPath, { collect: mode === '--collect', ...(port !== undefined ? { browserOptions: { port } } : {}), ...(mode === '--reviews' ? { reviews: JSON.parse(readFileSync(reviewFile, 'utf8')) } : {}) });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
