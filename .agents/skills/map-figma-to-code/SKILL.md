---
name: map-figma-to-code
description: >-
  Resolve an existing Figma-mapped Design System component to its code path and props.
  USE WHEN: a reliable component match is known and the user needs its implementation
  or props.
  DO NOT USE WHEN: no reliable match exists, or importing or implementing UI is
  the primary task; follow the owning flow, which may call this skill after a match.
---

# Map Figma to Code

## Goal

Mapped reuse does not establish equality of instance paints or bindings. Read the owning import's per-property delegation comparison. Differences need declared treatments; unresolved mappings/reads remain pending. An implemented treatment still needs its own rendered review before confirmation. Do not infer verified color from reuse or binding accounting.

Distinguish corrupt evidence from stale evidence. A stale but valid confirmed record is candidate/NOT VERIFIED for the current query, not a current confirmation or a DS conformance error. Preserve usage.md and historical reports. The verifier returns errors, warnings and current correspondence status; dependency scope is component-local plus shared/explicit inputs, not the entire repo.

Resolve a Design System component from Figma to its code implementation.
When the Figma node is nested inside another imported component, resolve it without recreating the nested UI.

For confirmed mappings, require current PASS results for every behavior case associated by baseline, with published original measurements. Review the v4 report's per-case metadata fingerprint, current examined files, original browser measurement and retained Figma PNG provenance. A full metadata audit hash may differ after prose-only changes; that alone is not staleness. Check the independent comparator and original measurement rules versions; outdated measurementVersion means recollection, not editing historical bytes. Unexecuted/noncomparable required behavior is pending verification, not a demonstrated design defect. Typed artifacts and hashes are accounting evidence, not authenticated visual truth.

Consult metadata.verification for exact candidate props, content, modes, viewport and activation instructions. Fidelity and alternate-content behavior cases are separate. Test configurations do not confirm correspondences or prove that the code admits their props; use usage.md and rendered evidence for confirmation.

Read verification.nodeCoverage exceptions as conditional rules, not permission to omit source nodes. Unresolved obligations and missing CSS syntax measurements prevent confirmation. A measured closure still lacks the general rendered judgment; preserve it as candidate. This query does not run a publishing headless adapter or change historical records.

Read required `metadata.evidence.decisions` and their snapshot observations. Classification proposals are candidates, not established prop mappings. Missing evidence is an incomplete record; manual reasons need review. This lookup never rewrites evidence or creates retrospective captures.

## Read

- `design-system/relationships/figma-code-map.json`
- `design-system/relationships/figma-state.json`
- relevant component metadata;
- required `evidence.textDimensions` and its captured sizing observations; do not treat a text sample's measured dimensions as fixed API geometry or inherit a behavior PASS from static coverage;
- the component's `usage.md` for recorded variant-to-code correspondences and their verification evidence;
- `.agents/skills/create-ds-from-figma/references/component-metadata.md` for the canonical JSON correspondences and revision-review policy;
- `src/components/`.

## Process

1. Use a reliable match already established through `.agents/skills/find-component/SKILL.md`, or run that lookup now. Stop if it reports conflicting refs or only a low-confidence clue. The matched variant's `props` are observed Figma axes and values, not the component's code API. The placed instance id is for traceability, not a stable mapping.
2. For an existing component (including a `mapped` nested instance), read its `metadata.json.variantClassification` and translate each matched Figma axis/value by its `kind`:
   - `prop`: use `codeProp`, but distinguish a candidate value from an established correspondence. An explicit mapping or implementation evidence can identify the intended candidate; check that the implemented prop type admits it. A rendered comparison of that exact configuration with the matched Figma variant can establish correspondence empirically. Type membership, similar spelling or the newly authored code alone does not prove a Figma match; an author comment documents intent, not proof that the code implements it.
   - `state`: identify the declared state and how it is set through a native prop, authored prop or parent context, according to `states[].control`; do not invent a public prop for an internal state.
   - `interaction`: identify the browser action that triggers the internal state, rather than passing the Figma value as a prop.
   - `content`: identify the recorded `part` and the implemented content API; do not turn an icon or label choice into a variant prop without evidence.
   If a correspondence or activation path cannot be established, return it as unresolved with the missing evidence. A candidate may be implemented or exercised in an isolated verification preview by the owning flow, explicitly marked unverified; it is not a confirmed mapping for reuse and cannot receive PASS before comparison. Do not silently pick a likely value for production composition. Return each established mapping, and the entry that should be recorded in the component's `usage.md` (Figma variant/ref, exact code props, states/content, examined configuration and evidence refs), for the owning import or validation flow to write; report the current verification result separately. Recheck when the relevant design or implementation changes. This lookup does not add a `codeValue` field to the metadata contract.
3. If the nested instance is `external`, keep it as part of the parent component and do not create a DS component for it.
4. If the nested instance is `missing`, return `DS_GAP` and do not generate a replacement.
5. The create/import flow writes `nestedComponents` only for a successfully imported parent. On reanalysis, `external` to `mapped` alone does not authorize an update: follow the decision table in `.agents/skills/create-ds-from-figma/SKILL.md`. Update automatically only when the main component's identity is verified unchanged, there are no other observed differences, and the code edit can be isolated without overwriting existing work. If identity cannot be verified, do not write; request an additional ref or explicit authorization for a dependency-only replacement. A `missing` diagnosis stops before writing.

## Output

Treat a changed comparatorVersion as stale, not a corrupt mapping; reason/scope prose alone does not change validity. A position PASS and a shape review have distinct scopes.

For a confirmed configuration, retain the distinction between derived renderChecks and reviewer checkReviews. A specific visual review covers a fidelity noncomparable requirement or the provisional typography threshold of a TEXT geometry PASS check (geometry:PART); it never rescues a numeric FAIL, NOT RUN or unresolved essential font. The 1px text margin is not universally calibrated. Do not infer overall fidelity from the static result or the identity match.

Read the canonical JSON under `## Figma to code correspondences` in usage.md. Each caseId points to the exact fidelity configuration in metadata.verification; confirmed references a durable rendered-comparison report with hashes. This lookup remains read-only. Check integrity, current files/configuration/revisions and the scope of the visual judgment before returning an established mapping. Structural conformance does not prove fidelity, admissible props or live Figma currency. Preserve historical evidence and report candidates requiring review when stale or unverifiable. Only an authorized import/update or explicit request may record the proposed JSON entry.

Return:

- code component;
- file path;
- code props and established values, with correspondence evidence and type admissibility;
- states and their activation paths;
- interactions and browser actions;
- content and its target part/API;
- unresolved correspondences and the evidence needed to resolve them;
- verification candidates, clearly separated from established mappings;
- for nested instances, the `nestedComponents` status and the resolved local component name when mapped.

Do not generate a replacement component when an existing mapping exists.
