# Token usage check

## PASS

- Values come from `design-system/tokens/<Coleccion>.json` and `src/styles/tokens.css`.
- Every Figma variable collection has a JSON file.
- Every variable has one value per declared collection mode, with no unknown modes.
- COLOR values are serialized from Figma RGB(A) as `#RRGGBB` or `#RRGGBBAA`; FLOAT, STRING and BOOLEAN values match their declared types.
- Local aliases in CSS point at the custom property of the local target identified by `targetVariableId`.
- External aliases have a resolved per-mode value in CSS and are reported as snapshots of another library.

## FAIL

- Raw HEX / rgb / px values are introduced outside `src/styles/tokens.css`.
- Tokens were collapsed into a fixed `colors` / `spacing` / `typography` trio.
- Only the variables bound to the current component were exported.
- A Figma collection is missing from `design-system/tokens/`.
- An external alias emits a `var()` whose target has no local CSS definition, or has no resolved value.
