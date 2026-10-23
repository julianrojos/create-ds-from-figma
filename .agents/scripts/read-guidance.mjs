import { readFileSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const kitRoot = fileURLToPath(new URL('../../', import.meta.url));
export function headings(text) {
  let fence = null, offset = 0;
  const result = [];
  for (const line of text.split(/(?<=\n)/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (!fence) {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trimEnd());
      if (match) result.push({ level: match[1].length, title: match[2], start: offset });
    }
    offset += line.length;
  }
  return result;
}

export function sectionRange(text, title, children = false) {
  const list = headings(text), matches = list.filter(h => h.title === title);
  if (matches.length !== 1) throw new Error(`Missing or ambiguous section: ${title}`);
  const item = matches[0], index = list.indexOf(item);
  const next = list.slice(index + 1).find(h => !children || h.level <= item.level);
  return { start: item.start, end: next?.start ?? text.length };
}

// Output-derived conditions are selected after execution, never guessed before measuring.
export function diagnosticReadingFeatures(result) {
  if (!result || !['FAIL', 'NOT VERIFIED'].includes(result.status) || result.complete !== false || !Array.isArray(result.errors) || !Array.isArray(result.nextActions)) throw new Error('Expected a finalize:import --diagnose result');
  if (!result.diagnosis) {
    if (result.status !== 'FAIL') throw new Error('Diagnostic execution evidence missing');
    return [];
  }
  if (result.diagnosis.mode !== 'diagnostic') throw new Error('Expected diagnostic mode');
  const diagnostics = result.diagnosis.diagnostics;
  const summary = diagnostics?.compositionSummary;
  if (summary && ['PASS','FAIL','NOT RUN','NOT COMPARABLE'].some(key => !Number.isSafeInteger(summary[key]) || summary[key] < 0)) throw new Error('Invalid composition counters');
  if (diagnostics?.cases && !Array.isArray(diagnostics.cases)) throw new Error('Invalid diagnostic cases');
  const hasChecks = summary && Object.values(summary).some(value => value > 0);
  const hasResults = diagnostics?.cases?.some(c => c?.composition);
  const hasAction = result.nextActions.some(a => ['REVIEW_COMPOSITION_DIAGNOSTICS','RETRY_COMPOSITION_DIAGNOSTICS'].includes(a?.code));
  return hasChecks || hasResults || hasAction ? ['composition'] : [];
}

export function loadReadingPlan(root = kitRoot) {
  const plan = JSON.parse(readFileSync(path.join(root, '.agents/reading-plan.json'), 'utf8'));
  if (plan.schemaVersion !== 2 || !plan.phases || !plan.scenarios) throw new Error('Invalid reading plan');
  return plan;
}

export function readGuidance(phaseNames, features = [], { root = kitRoot, plan = loadReadingPlan(root) } = {}) {
  const enabled = new Set(features), files = new Map(), selected = [];
  const known = new Set(Object.values(plan.phases).flatMap(p => p.sections.flatMap(s => s.when || [])));
  for (const flag of enabled) if (!known.has(flag)) throw new Error(`Unknown feature: ${flag}`);
  const boundary = realpathSync(path.join(root, '.agents')) + path.sep;
  for (const name of phaseNames) {
    const phase = plan.phases[name];
    if (!phase) throw new Error(`Unknown phase: ${name}`);
    for (const spec of phase.sections) {
      const file = path.resolve(root, spec.file);
      if (!realpathSync(file).startsWith(boundary)) throw new Error('Guidance must remain inside .agents');
      if (!files.has(spec.file)) files.set(spec.file, readFileSync(file, 'utf8'));
      const range = sectionRange(files.get(spec.file), spec.section, spec.children ?? false);
      if (!spec.when || spec.when.some(f => enabled.has(f))) selected.push({ file: spec.file, section: spec.section, ...range });
    }
  }
  // Union overlapping selections: shared contract sections are emitted once.
  const excerpts = [];
  for (const [file, text] of files) {
    const ranges = selected.filter(s => s.file === file).sort((a, b) => a.start - b.start);
    const union = [];
    for (const range of ranges) {
      const last = union.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else union.push({ ...range });
    }
    for (const range of union) excerpts.push({ file, start: range.start, end: range.end, text: text.slice(range.start, range.end) });
  }
  const conditions = Object.fromEntries(Object.entries(plan.featureConditions || {}).filter(([flag]) => phaseNames.some(name => plan.phases[name].sections.some(spec => spec.when?.includes(flag)))));
  const selectedText = excerpts.map(e => e.text).join('\n');
  return { schemaVersion: 1, phases: phaseNames, features, conditions, sections: selected, excerpts,
    stats: { selectedBytes: Buffer.byteLength(selectedText), selectedWords: selectedText.trim().split(/\s+/).filter(Boolean).length,
      wholeReferencedFilesBytes: [...files].filter(([file]) => selected.some(section => section.file === file)).reduce((n, [, text]) => n + Buffer.byteLength(text), 0) },
    sourceHash: createHash('sha256').update(JSON.stringify({ plan, files: [...files] })).digest('hex'),
    scope: 'Selected documentation only; bytes/words, not measured model tokens. Conditions must be established from observations; omitted sections do not waive obligations. Shared/existing context is not counted.' };
}

// Inventory the filesystem independently of the pointers, so a new file cannot hide.
export function checkReadingPlan(root = kitRoot) {
  const plan = loadReadingPlan(root), features = [...new Set(Object.values(plan.phases).flatMap(p => p.sections.flatMap(s => s.when || [])))];
  const all = readGuidance(Object.keys(plan.phases), features, { root, plan });
  for (const spec of Object.values(plan.scenarios)) readGuidance(spec.phases, spec.features, { root, plan });
  const files = [];
  const boundary = realpathSync(path.join(root, '.agents')) + path.sep;
  function walk(directory) {
    if (!realpathSync(directory).startsWith(boundary)) throw new Error('References must remain inside .agents');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink in reference inventory: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name.endsWith('.md')) files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  const skills = path.join(root, '.agents/skills');
  for (const skill of readdirSync(skills, { withFileTypes: true }).filter(e => e.isDirectory())) {
    const directory = path.join(skills, skill.name);
    if (readdirSync(directory).includes('references')) walk(path.join(directory, 'references'));
  }
  const exclusions = plan.exclusions || [], used = new Set(), problems = [];
  let selectedSections = 0, excludedSections = 0;
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8'), list = headings(text);
    const units = list.map((h, i) => ({ section: h.title, start: h.start, end: list[i + 1]?.start ?? text.length }));
    if ((text.slice(0, list[0]?.start ?? text.length)).trim()) units.unshift({ section: null, start: 0, end: list[0]?.start ?? text.length });
    for (const unit of units) {
      const label = `${file} :: ${unit.section ?? '<preamble>'}`;
      const selected = all.excerpts.some(e => e.file === file && e.start <= unit.start && e.end >= unit.end);
      const matching = exclusions.filter(e => e.file === file && e.section === unit.section);
      if (matching.length > 1) problems.push(`Duplicate exclusion: ${label}`);
      if (selected) {
        selectedSections++;
        if (matching.length) problems.push(`Selected and excluded: ${label}`);
      } else if (!matching.length) problems.push(`Unaccounted guidance: ${label}`);
      else {
        const exclusion = matching[0]; used.add(exclusion); excludedSections++;
        if (typeof exclusion.reason !== 'string' || !exclusion.reason.trim()) problems.push(`Missing exclusion reason: ${label}`);
        if (exclusion.kind !== 'navigation') problems.push(`Invalid exclusion kind: ${label}`);
        else if (text.slice(unit.start, unit.end).replace(/^#{1,6}[^\n]*(?:\n|$)/, '').trim()) problems.push(`Navigation exclusion contains content: ${label}`);
      }
    }
  }
  for (const exclusion of exclusions) if (!used.has(exclusion)) problems.push(`Unused exclusion: ${exclusion.file} :: ${exclusion.section}`);
  if (problems.length) throw new Error(problems.join('\n'));
  return { status: 'PASS', phases: Object.keys(plan.phases).length, files: files.length, selectedSections, excludedSections,
    scope: 'Every reference heading/preamble selected; only empty navigation headings may be excluded. Pointers and scenarios resolve. Does not prove semantic completeness or agent compliance.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log('Usage: npm run read:guidance -- PHASE [--with FEATURE ...] [--stats]\n       npm run read:guidance -- --scenario NAME [--stats]\n       npm run read:guidance -- --diagnosis RESULT.json [--stats]\n       npm run read:guidance -- --check\nReads only named sections; --stats emits byte/word counts without content. No writes/network/code execution. See .agents/reading-plan.json for names and conditions.');
    else if (args.length === 1 && args[0] === '--check') console.log(JSON.stringify(checkReadingPlan(), null, 2));
    else {
      const plan = loadReadingPlan();
      let phases, features = [], stats = false, i;
      if (args[0] === '--diagnosis') {
        if (!args[1]) throw new Error('Missing diagnostic JSON file');
        phases = ['import-diagnose-results']; features = diagnosticReadingFeatures(JSON.parse(readFileSync(args[1], 'utf8'))); i = 2;
      } else if (args[0] === '--scenario') {
        const scenario = plan.scenarios[args[1]];
        if (!scenario) throw new Error('Unknown scenario');
        phases = scenario.phases; features = [...scenario.features]; i = 2;
      } else { phases = [args[0]]; i = 1; }
      for (; i < args.length; i++) {
        if (args[i] === '--stats' && !stats) stats = true;
        else if (args[i] === '--with' && args[i + 1]) features.push(args[++i]);
        else throw new Error('Invalid reading arguments; use --help');
      }
      const result = readGuidance(phases, features, { plan });
      if (stats) { const { excerpts, ...report } = result; console.log(JSON.stringify(report, null, 2)); }
      else {
        console.error(JSON.stringify({ features: result.features, conditions: result.conditions, stats: result.stats, scope: result.scope }));
        for (const e of result.excerpts) console.log(`\nSource: ${e.file}\n${e.text}`);
      }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
