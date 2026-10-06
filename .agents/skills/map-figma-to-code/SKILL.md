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

## Read

- `design-system/relationships/figma-code-map.json`
- `design-system/relationships/figma-state.json`
- relevant component metadata;
- `src/components/`.

## Process

1. Use a reliable match already established through `.agents/skills/find-component/SKILL.md`, or run that lookup now. Stop if it reports conflicting refs or only a low-confidence clue. Read the matched `figma-code-map.json` entry and use the matched variant's `props` when present; the placed instance id is for traceability, not a stable mapping.
2. If the nested instance is `mapped`, return the local component and props to import.
3. If the nested instance is `external`, keep it as part of the parent component and do not create a DS component for it.
4. If the nested instance is `missing`, return `DS_GAP` and do not generate a replacement.
5. The create/import flow writes `nestedComponents` only for a successfully imported parent. On reanalysis, `external` to `mapped` alone does not authorize an update: follow the decision table in `.agents/skills/create-ds-from-figma/SKILL.md`. Update automatically only when the main component's identity is verified unchanged, there are no other observed differences, and the code edit can be isolated without overwriting existing work. If identity cannot be verified, do not write; request an additional ref or explicit authorization for a dependency-only replacement. A `missing` diagnosis stops before writing.

## Output

Return:

- code component;
- file path;
- props / variants to use;
- for nested instances, the `nestedComponents` status and the resolved local component name when mapped.

Do not generate a replacement component when an existing mapping exists.
