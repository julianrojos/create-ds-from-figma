import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMutations } from './lib/mutation-runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const comparison = '.agents/checks/lib/render-comparison.mjs';
const actions = '.agents/checks/lib/diagnosis-actions.mjs';
const resources = '.agents/checks/lib/resource-diagnostics.mjs';
const vectorExport = '.agents/checks/lib/vector-export.mjs';
const collector = '.agents/skills/create-ds-from-figma/scripts/lib/capture-vectors.mjs';
const svgSafety = '.agents/checks/lib/svg-safety.mjs';
const pixels = '.agents/checks/lib/pixel-residual.mjs';
const pixelCli = '.agents/skills/create-ds-from-figma/scripts/pixel-diagnose.mjs';
const vectorCli = '.agents/skills/create-ds-from-figma/scripts/figma-vectors.mjs';
runMutations({ root, name: 'diagnosis',
  tests: ['.agents/checks/tests/render-comparison.test.mjs', '.agents/checks/tests/diagnosis-actions.test.mjs', '.agents/checks/tests/verification-resources.test.mjs', '.agents/checks/tests/vector-export.test.mjs', '.agents/checks/tests/pixel-residual.test.mjs', '.agents/checks/tests/svg-safety.test.mjs'],
  scope: 'Targeted absence, next-action, image-provenance, vector-export, SVG-safety and pixel-residual regressions, not exhaustive mutation coverage or real Figma fidelity.',
  mutants: [
    [comparison, 'absence-without-coverage', '&& coverage && !coverage.errors.length && !coverage.pending.length', '&& true'],
    [comparison, 'absence-for-unmapped-part', "&& Object.keys(mapping.nodes || {}).length && coverage", '&& coverage'],
    [comparison, 'visible-part-passes-absence', "shown.length ? 'FAIL' : 'PASS'", "'PASS'"],
    [comparison, 'hidden-part-fails-absence', "const shown = seen.elements.filter(e => e.geometry?.visible !== false);", "const shown = seen.elements;"],
    [comparison, 'malformed-measurement-is-absence', "|| seen.count !== seen.elements.length) { add(absent", "|| false) { add(absent"],
    [comparison, 'missing-measurement-is-absence', "if (!measurement) { add(absent, 'NOT RUN', 'No browser measurement.'); continue; }", "if (!measurement) { add(absent, 'PASS', 'No browser measurement.'); continue; }"],
    [actions, 'font-result-as-difference', "check.status === 'FAIL' && !check.id.startsWith('font:')", "check.status === 'FAIL'"],
    [actions, 'ignore-unrun-behavior', "['NOT COMPARABLE', 'NOT RUN'].includes(check.status)", "['NOT COMPARABLE'].includes(check.status)"],
    [actions, 'behavior-relation-generated', "      command: null }] : []),", "      command: { executable: 'npm', args: ['run', 'finalize:import'] } }] : []),"],
    [actions, 'fidelity-cases-as-behavior', "diagnosticCases.filter(c => c.kind === 'behavior')", 'diagnosticCases'],
    [resources, 'sha256-as-image-identity', "createHash('sha1')", "createHash('sha256')"],
    [resources, 'mismatch-as-match', 'digests.every(digest => digest === imageHash)', 'true'],
    [resources, 'unreadable-file-as-mismatch', "} catch (error) { return { status: 'UNKNOWN', reason: error.message }; }\n}", "} catch (error) { return { status: 'DIFFERS_FROM_FIGMA_IMAGE_HASH', reason: error.message }; }\n}"],
    [vectorExport, 'accept-unknown-envelope-fields', " || Object.keys(envelope).sort().join() !== 'capturedAt,hash,schemaVersion,vectorExport'", ''],
    [vectorExport, 'accept-different-node', 'nodeId !== undefined && nodeId !== expected.vectorExport.source.nodeId', 'false'],
    [vectorExport, 'accept-unbounded-svg', 'if (bytes > MAX_SVG_BYTES || total > MAX_TOTAL_BYTES)', 'if (false)'],
    [vectorExport, 'accept-noncanonical-date', 'new Date(time).toISOString() !== capturedAt', 'false'],
    [collector, 'skip-hidden-vectors', 'if (kinds.has(node.type)) found.push(node);', 'if (kinds.has(node.type) && node.visible !== false) found.push(node);'],
    [collector, 'drop-render-bounds', 'renderBounds: rect(render), svg', 'renderBounds: null, svg'],
    [collector, 'ignore-file-identity', 'if (figma.fileKey !== fileKey) throw', 'if (false) throw'],
    [vectorCli, 'overwrite-exported-svg', "writeFileSync(output, bytes, { flag: 'wx' });", "writeFileSync(output, bytes, { flag: 'w' });"],
    [resources, 'approve-vector-connection-for-user', "args: [VECTOR_SCRIPT, 'capture', capture.source.fileKey, capture.source.rootNodeId] }", "args: [VECTOR_SCRIPT, 'capture', capture.source.fileKey, capture.source.rootNodeId, '--approve-connection'] }"],
    [resources, 'vectors-as-essential', "essentiality: 'UNCLASSIFIED',\n    representation", "essentiality: 'ESSENTIAL',\n    representation"],
    [pixels, 'no-local-alignment', 'for (const shift of shiftsFor(maxShift)) {', 'for (const shift of shiftsFor(0)) {'],
    [pixels, 'transparent-as-black', 'png.data[i * 4 + c] * alpha + 255 * (1 - alpha)', 'png.data[i * 4 + c] * alpha'],
    [pixels, 'any-difference-is-strong', 'export const STRONG_DIFFERENCE = 0.08;', 'export const STRONG_DIFFERENCE = 0;'],
    [pixels, 'accept-region-outside-image', 'region.x + region.width <= image.width && region.y + region.height <= image.height', 'true'],
    [pixels, 'unranked-regions', '.sort((a, b) => b.strongPercent - a.strongPercent || (a.id < b.id ? -1 : 1))', ''],
    [pixels, 'verdict-instead-of-advice', "status: 'NOT VERIFIED'", "status: 'PASS'"],
    [pixelCli, 'overwrite-heatmap', "writeFileSync(options.get('--heatmap'), map.png, { flag: 'wx' });", "writeFileSync(options.get('--heatmap'), map.png, { flag: 'w' });"],
    [svgSafety, 'accept-doctype', "parser.on('doctype', () => reject('a DOCTYPE or entity declaration'));", ''],
    [svgSafety, 'accept-forbidden-elements', 'if (FORBIDDEN.has(tag.local.toLowerCase())) return reject(', 'if (false) return reject('],
    [svgSafety, 'accept-event-handlers', "if (name.startsWith('on')) {", 'if (false) {'],
    [svgSafety, 'accept-other-root', "if (tag.local !== 'svg' || tag.uri !== SVG) return reject(", 'if (false) return reject('],
    [svgSafety, 'unbounded-document', 'if (elements > MAX_ELEMENTS || depth > MAX_DEPTH) return reject(', 'if (false) return reject('],
    [svgSafety, 'accept-unclosed-document', 'parser.write(svg).close();', 'parser.write(svg);'],
    [vectorExport, 'skip-svg-validation', 'const problem = svgProblem(v.svg);', 'const problem = null;'],
    [pixels, 'no-comparison-budget', '  checkedBudget(operations, maxOperations);\n', ''],
    [pixels, 'no-heatmap-budget', 'checkedBudget(estimateOperations([window], maxShift) + reference.width * reference.height, maxOperations);', ''],
    [pixels, 'unbounded-region-count', 'if (Array.isArray(regions) && regions.length > MAX_REGIONS)', 'if (false)'],
    [pixels, 'heatmap-aligns-whole-image', 'const width = Math.min(reference.width, ALIGNMENT_WINDOW), height = Math.min(reference.height, ALIGNMENT_WINDOW);', 'const width = reference.width, height = reference.height;'],
    [pixels, 'prune-too-eagerly', 'if (sum > limit) return null;', 'if (sum > limit * 0.5) return null;'],
    [pixels, 'ties-prefer-larger-shift', 'a.cost - b.cost || a.dy - b.dy', 'b.cost - a.cost || a.dy - b.dy'],
    [svgSafety, 'accept-external-reference', "if (!allowedReference(value)) reject(`${attribute.name} that is neither", 'if (false) reject(`${attribute.name} that is neither'],
    [svgSafety, 'skip-value-grammar', "const css = valueProblem(value) ?? (name === 'style' ? styleProblem(value) : null);", 'const css = null;'],
    [svgSafety, 'allow-css-escapes', 'const FORBIDDEN_CHARACTERS = /\\\\|\\/\\*|@/;', 'const FORBIDDEN_CHARACTERS = /(?!)/;'],
    [svgSafety, 'allow-unknown-functions', 'if (!FUNCTIONS.has(match[1].toLowerCase())) return', 'if (false) return'],
    [svgSafety, 'allow-external-url-targets', 'if (!allowedReference(reference)) return', 'if (false) return'],
    [svgSafety, 'allow-any-style-property', 'if (!STYLE_PROPERTIES.has(property)) return', 'if (false) return'],
    [svgSafety, 'allow-xml-base', "if (!['space', 'lang'].includes(name)) reject(", 'if (false) reject('],
    [svgSafety, 'allow-any-xlink-attribute', "if (attribute.uri === XLINK) { if (name !== 'href') {", 'if (attribute.uri === XLINK) { if (false) {'],
    [svgSafety, 'allow-style-element', "'script', 'style', 'foreignobject'", "'script', 'foreignobject'"],
    [pixels, 'outside-candidate-is-free', 'if (cx < 0 || cy < 0 || cx >= candidate.width || cy >= candidate.height) return 1;', 'if (cx < 0 || cy < 0 || cx >= candidate.width || cy >= candidate.height) return 0;'],
    [pixels, 'coverage-not-reported', 'coveragePercent: round(coverage(candidate, region, best.dx, best.dy))', 'coveragePercent: 100'],
    [pixels, 'dimensions-checked-after-decoding', "if (!width || !height || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) fail('image dimensions are outside the supported range');", ''],
    [pixels, 'accept-interlaced-images', 'if (bytes[28] !== 0) fail(', 'if (false) fail('],
    [pixels, 'no-side-limit', 'width > MAX_SIDE || height > MAX_SIDE || ', ''],
    [pixels, 'no-file-size-limit', 'if (bytes.length > MAX_FILE_BYTES) fail(', 'if (false) fail('],
    [pixels, 'no-signature-check', '!SIGNATURE.equals(bytes.subarray(0, 8)) || ', ''],
  ] });
