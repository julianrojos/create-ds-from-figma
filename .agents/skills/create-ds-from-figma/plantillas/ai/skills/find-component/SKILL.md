---
name: find-component
description: Resolve a UI element or Figma node to an existing Design System component. Use before creating any new UI primitive.
---

# Find Component

## Goal

Resolve a UI element to an existing Design System component.

## Input

A Figma node or UI element description.

For a nested component, include the instance node id for traceability only, Figma name, parent component name, `fileKey`, `mainComponentRef` when available, `mainComponentNodeId`, `mainComponentFileKey` (remote only) or `mainComponentKey` when available, whether the main component is local or `remote`, and any available component properties or variants.

## Read

- `design-system/components/`
- `src/components/`
- `design-system/relationships/figma-code-map.json`
- `design-system/relationships/figma-state.json`

`figma-state.json` records only successfully imported components. A `missing` nested instance is a diagnosis, not a persisted component or dependency.

## Process

1. Identify the Figma component name and properties.
2. Search the DS component metadata and code. A component is available only when its map entry and implementation exist; never treat a blocked or incomplete state entry as a match.
3. For a nested instance, do **not** resolve by the placed instance id; keep it only for `figma-state.json` traceability.
4. If a nested instance has no `mainComponentRef`, first try to obtain one with `get_design_context` or `use_figma`.
5. Build all stable refs available: `<FILE_KEY>:<NODE_ID>` for local components, `<FILE_KEY>:<MAIN_COMPONENT_NODE_ID>` for local nested instances, `<MAIN_COMPONENT_FILE_KEY>:<MAIN_COMPONENT_NODE_ID>` for remote nested instances only when the tool returns both values, and `componentKey:<COMPONENT_KEY>` when available.
6. Resolve with one rule: search every stable ref in each entry's `figma.refs` and in each `figma.variants[*].refs`.
7. A ref must resolve to only one map entry, and all refs from the same Figma node/instance must resolve to the same entry. If the same ref appears in multiple entries, or if different refs from the same node resolve to different entries, stop and report the conflict.
8. If any ref matches `figma.refs`, return the component without a matched variant unless variants/properties identify one separately. If any ref matches a variant's `refs`, return that variant as `matched variant` and use its `props`.
9. If no stable ref is available, read existing `figma-state.json` for prior decisions about imported components, then use component name and variants only as a low-confidence clue. Low confidence is not enough to return `mapped`; do not create a new `figma-code-map.json` entry from this fallback.
10. For nested instances, classify the result. Only component instances are nested components; vectors, shapes and images are not:
    - `mapped` when a reliable match exists in `figma-code-map.json`, whether the component is local or from another library;
    - `missing` when there is no mapping and the main component is local to the DS file;
    - `external` when there is no mapping and the main component is `remote` (another library).
11. If it cannot be determined whether the main component is local or `remote`, do not guess: ask.
12. Return the best match.

If the requested root component is already mapped, return that match. Repeating its URL does not authorize a general rewrite. The import workflow may update only a verified `external` to `mapped` dependency with a localized code edit; other changes require an explicit update request.

## Output

Return:

- DS component;
- confidence;
- matched variant;
- nested status: `mapped`, `missing`, or `external` when relevant;
- relevant metadata path.

If no reliable match exists, return `match: not found` regardless of caller. For a nested instance also return `nested status: missing` or `external` according to its origin. The import workflow treats a new root as importable; a screen workflow converts `not found` to `DS_GAP`; the nested import flow stops with `DS_GAP` only for `missing`. Classification does not change the neutral lookup result.
