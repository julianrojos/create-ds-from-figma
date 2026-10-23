---
name: validate-ds
description: >-
  Validate implemented UI against Design System composition, tokens, reuse, bindings and accessibility.
  USE WHEN: the user asks to validate existing UI or an implementation is ready
  for final checks, including UI built from Figma.
  DO NOT USE WHEN: only identifying, mapping or planning UI and there is no
  implementation to verify yet.
---

# Validate Design System Compliance

Validate implemented UI against the existing DS. Follow `AGENTS.md` and the
applicable DS rules. Routing, permission boundaries and output remain here;
read only the applicable sections selected by `.agents/reading-plan.json`.

## Write scope

A standalone request to validate UI is read-only with respect to DS documentation and implementation: report findings and proposed correspondence entries without editing `usage.md` or fixing source files. An unavailable verification changes the current report, not the historical record automatically.

Write correspondence entries only within an authorized component import/update, or when the user explicitly asks to record the validation results. Keep edits within that authorization; permission to record a result does not authorize implementation fixes. A temporary verification harness may be used as described below and must leave the user's files unchanged after review. The sections below describe checks and proposed corrections; apply permanent changes only when their scope is authorized.

Contrato transversal: [INV-PREWRITE, INV-DIAGNOSE, INV-STATUS e INV-DELIVERY](../../../AGENTS.md#invariantes-de-proceso).

## Stop conditions and result boundaries

- Without an implementation, return to identifying/planning; do not import a component.
- Never invent Figma observations, token units/modes, state activation or visual approval.
- Missing essential resources block a new import before code. A temporary diagnosis
  of existing code does not authorize creating that blocked import.
- No Figma/browser execution means NOT RUN and Overall NOT VERIFIED. Static PASS,
  a measurement receipt or transferred data cannot establish visual PASS.
- Keep failed, stale, unsupported and unexecuted checks distinct. No review rescues
  objective FAIL/NOT RUN or noncomparable mandatory behavior. Preserve original evidence.

## Phases

| Phase | Required input | Evidence before advancing |
| --- | --- | --- |
| Scope and static checks | Implemented UI, applicable rules and authorization | Findings and read/write scope; static checks executed |
| Resources and captured evidence | Metadata, original snapshot and available source files | Resource/configuration/loading distinctions, coverage, validity and pending obligations |
| Rendered checks | Exact content, modes, states and browser | DOM part mapping, actual activation, independent expected/computed values, behavior results |
| Visual comparison | Exact Figma refs and retained case artifacts | Position/shape, typography, colors/assets and specific reviews checked separately |
| Report | Results from performed checks | Original output categories, current evidence and explicit pending items; no implicit writes |

## Read

- `.agents/checks/token-usage.md`
- `.agents/checks/component-reuse.md`
- `.agents/checks/accessibility.md`
- install project dependencies, then run `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` and `node .agents/checks/verify-bindings.mjs` from the project root;
- relevant DS component metadata;
- `design-system/relationships/figma-state.json`, the relevant collection JSON files and `.agents/skills/create-ds-from-figma/references/tokens.md` for mode scopes, alias resolution and serialization;
- `.agents/rules/design-system.md`, `.agents/rules/design-system-composition.md` and `.agents/rules/design-system-accessibility.md`.

## Process

1. Establish the requested scope and inspect the implementation and applicable
   `.agents/rules/design-system-composition.md` and accessibility rules. Install
   missing dependencies only with the required environment permission.
2. Run `npm run read:guidance -- validate-static` before static checks. Add
   `--with evidence` for imported Figma evidence, `--with styles` for provenance,
   or `--with resources`, `composition`, `recovery` only when those findings apply.
   The excerpts come from [resources and evidence](references/resources-and-evidence.md). It preserves snapshot/version contracts, resource and
   application diagnostics, native-state/color limits, delegation and stale records.
3. Execute the static commands listed above and complete the manual checks.
   Before temporary diagnosis, read import-diagnose with applicable features
   from the same plan; missing execution remains NOT RUN. After execution, read
   import-diagnose-results and add --with composition when output includes composition
   checks/actions, before interpreting, correcting or retrying. The flag selects
   documentation; --diagnose runs composition automatically.
4. Run `npm run read:guidance -- validate-render` before opening the browser.
   Add approximate/modes/float/color/native-states with repeated `--with` only
   for observed applicable facts. See [rendered checks](references/rendered-checks.md).
   Follow exact variantClassification and recorded modeScopes; activate states
   through actual control paths. Validate each part's marker and CSS class on
   the same DOM element. Check intrinsic dimensions with admitted alternate content.
5. Verify every binding's expected value independently from the rendered element,
   resolving aliases with each collection's active mode and recorded serialization.
   Do not compare two values read from the same potentially overridden element.
   Inspect literals, approximate translations, provenance and unresolved mixed text
   through their separate lanes; unsupported expectations remain unverified.
6. On existing code, temporary `npm run finalize:import -- ROOT METADATA --diagnose`
   executes project code/browser and writes temporary output only. Follow the
   reference for failures, composition, resources and bounded collection. A clean
   diagnostic still returns NOT VERIFIED/exit 1 and cannot confirm delivery.
7. Read `npm run read:guidance -- validate-visual` before reviewing/confirming;
   it selects [visual comparison and currency](references/visual-evidence.md). Compare exact configurations against Figma, preserve
   artifacts, and check general plus specific required reviews. TEXT geometric
   PASS is provisional; all linked mandatory behavior must PASS. Unavailable
   comparisons cannot be rescued by a matching type, hash or static result.
8. Report findings and proposed corrections. Apply permanent changes only within
   existing authorization; recording results alone does not authorize code fixes.
   Import delivery still requires current persisted confirmations and
   `npm run verify:imports`; the grouped command does not supply visual judgment.

## Output

Return a report:

Structural validation: PASS / FAIL / NOT RUN (reason)
Captured evidence: PASS / FAIL / NOT VERIFIED / NOT RUN (reason)
Figma style provenance: PASS / FAIL / NOT RUN (reason; or NOT APPLICABLE)
Prop vocabulary and TSX: PASS / FAIL / NOT RUN (reason)
Component reuse: PASS / FAIL / NOT RUN (reason)
Composition: PASS / FAIL / NOT RUN (reason)
Token usage: PASS / FAIL / NOT RUN (reason)
Written binding identity and static report: PASS / FAIL / NOT RUN (reason)
Computed binding values: PASS / FAIL / NOT RUN (reason)
Approximate literal computed values: PASS / FAIL / NOT RUN (reason; or NOT APPLICABLE)
Approximate literal contextual comparison: PASS / FAIL / NOT RUN (reason; or NOT APPLICABLE)
Accessibility: PASS / FAIL / NOT RUN (reason)
Figma-browser visual comparison: PASS / FAIL / NOT RUN (reason)

Overall: PASS / FAIL / NOT VERIFIED

For every FAIL:

- identify the violation;
- identify the file;
- propose a correction.

Only report PASS for a check that was performed. A structural PASS does not prove visual or accessibility conformance. Overall PASS requires the written identity, computed binding values, an applicable rendered PASS for every approximate literal, and all other relevant checks to pass. Style provenance is reported on its own line and does not downgrade Overall: unverified provenance (`unknown` origin or `unavailable` capture) says nothing about the measured values. A nonessential mixed-text part left in `unresolved` does leave Overall NOT VERIFIED, not PASS. A static cascade NOT RUN alone can be resolved as described above. Otherwise explain the missing evidence under NOT VERIFIED.

Unknown applicability must be resolved, not assumed absent. Use --stats to
inspect selected bytes/words; do not load all references to discover a section.
