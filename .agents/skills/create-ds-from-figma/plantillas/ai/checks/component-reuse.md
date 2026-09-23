# Component reuse check

## PASS

Existing DS components are reused whenever a matching component exists.

For each `nestedComponents` entry in `design-system/relationships/figma-state.json` with `status: "mapped"`, the parent component imports or composes the resolved local component instead of redrawing it.

## FAIL

- Native elements recreate an existing DS component.
- A local duplicate component is created.
- An existing DS component is copied and modified unnecessarily.
- A mapped nested component is rebuilt with local markup, SVG, CSS, or copied code instead of importing the resolved DS component.
- A missing nested component is silently replaced instead of reported as `DS_GAP`.
