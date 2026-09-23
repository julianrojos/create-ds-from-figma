---
name: map-figma-to-code
description: Resolve a Design System component from Figma to its code implementation and props. Use after find-component succeeds.
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

1. Resolve the target Figma node through `figma-code-map.json`: build every stable ref available (`<FILE_KEY>:<NODE_ID>` for local components, `<FILE_KEY>:<MAIN_COMPONENT_NODE_ID>` for local nested instances, and `componentKey:<COMPONENT_KEY>` when available), then search those refs in each entry's `figma.refs` and in each `figma.variants[*].refs`. If a match is inside a variant, use that variant's `props`. If a ref matches multiple entries, or different refs from the same node match different entries, stop and report the conflict. Do not treat the placed instance id as a stable component mapping.
2. If the nested instance is `mapped`, return the local component and props to import.
3. If the nested instance is `external`, keep it as part of the parent component and do not create a DS component for it.
4. If the nested instance is `missing`, return `DS_GAP` and do not generate a replacement.
5. The create/import flow writes the parent component's `nestedComponents` entry in `figma-state.json`; this skill reads that entry and must not drop or contradict it.

## Output

Return:

- code component;
- file path;
- props / variants to use;
- for nested instances, the `nestedComponents` status and the resolved local component name when mapped.

Do not generate a replacement component when an existing mapping exists.
