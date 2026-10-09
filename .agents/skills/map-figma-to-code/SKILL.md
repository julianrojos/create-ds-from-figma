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

Resolve a Design System component from Figma to its code implementation.
When the Figma node is nested inside another imported component, resolve it without recreating the nested UI.

Read required `metadata.evidence.decisions` and their snapshot observations. Classification proposals are candidates, not established prop mappings. Missing evidence is an incomplete record; manual reasons need review. This lookup never rewrites evidence or creates retrospective captures.

## Read

- `design-system/relationships/figma-code-map.json`
- `design-system/relationships/figma-state.json`
- relevant component metadata;
- the component's `usage.md` for recorded variant-to-code correspondences and their verification evidence;
- `.agents/skills/create-ds-from-figma/references/component-metadata.md` for the correspondence table and revision-review policy;
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

Read the correspondences in `usage.md` under `## Figma to code correspondences`, which use the template columns and `candidate` / `confirmed` statuses defined in the metadata reference. This lookup is read-only: it never edits `usage.md`. When a correspondence should be created or updated, return the proposed entry with its evidence. The owning flow writes it only within an authorized component import/update or an explicit user request to record results; a standalone `validate-ds` invocation reports the proposal without writing. Before returning a mapping as established, check its documented Figma/code revision and examined configuration against the current ones. If changed or unverifiable, return it as a candidate requiring review, preserve historical evidence and state what is missing. A date or the word `confirmed` alone does not establish current validity. The table is documentation, not a machine-validated contract.

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
