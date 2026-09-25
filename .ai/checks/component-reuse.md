# Component reuse check

## PASS

Existing DS components are reused whenever a matching component exists.

For each `nestedComponents` entry in `design-system/relationships/figma-state.json` with `status: "mapped"`, the parent component imports or composes the resolved local component instead of redrawing it.

For each mapped nested entry, at least one stable main-component ref resolves through `figma-code-map.json` to the entry whose `code.component` is `resolvedComponent`. Check `mainComponentRef` and any other available refs (`componentKey:<mainComponentKey>` or `<FILE_KEY>:<mainComponentNodeId>`); use the DS file key for local components and `mainComponentFileKey` for remote ones. All refs that resolve must point to the same map entry, including refs in `figma.variants[*].refs`. The placed instance's `figmaNodeId` is not a stable main-component ref.

Every entry under `figma-state.json.components` has an available implementation. Persisted `nestedComponents` contain only `mapped` or `external`; a `missing` dependency stops import before writing. After an isolated `external` to `mapped` update, the parent's code and dependency status agree without replacing unrelated edits.

## FAIL

- Native elements recreate an existing DS component.
- A local duplicate component is created.
- An existing DS component is copied and modified unnecessarily.
- A mapped nested component is rebuilt with local markup, SVG, CSS, or copied code instead of importing the resolved DS component.
- A missing nested component is silently replaced instead of reported as `DS_GAP`.
- A blocked component or `missing` nested dependency is stored as an imported component.
- An `external` dependency is changed to `mapped` in state without replacing its local redraw with an import in the parent code.
- A `mapped` nested dependency has no stable main-component ref resolving to its `resolvedComponent`, or its available refs resolve to different map entries.
