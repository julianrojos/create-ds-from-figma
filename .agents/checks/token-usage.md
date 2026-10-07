# Token usage check

## PASS

- Values come from each JSON named by `figma-state.json.collections[<ID>].file` in `design-system/tokens/` and from `src/styles/tokens.css`.
- Every Figma variable collection has a JSON file.
- Every variable has one value per declared collection mode, with no unknown modes.
- COLOR values are serialized from Figma RGB(A) as `#RRGGBB` or `#RRGGBBAA`; FLOAT, STRING and BOOLEAN values match their declared types.
- Local aliases in CSS point at the custom property of the local target identified by `targetVariableId`.
- External aliases have a resolved per-mode value in CSS and are reported as snapshots of another library.
- Each exported variable records a unique `cssName`; a direct CSS declaration uses the exact variable ID bound to that Figma node, not merely a token of the same type.
- The base `:root` declaration matches the JSON value or the exact local alias target; additional mode scopes still need manual review.
- A literal without a Figma variable has an exact `measuredLiterals` record with a node ref and matching CSS value.
- A directly bound external variable has an `externalVariables` resolved snapshot with its real ID, CSS name, value and bound source node. It is not presented as a local variable.
- Browser `getComputedStyle` matches the independently resolved Figma value for each covered binding, variant and mode; do not compare against a custom property read from the same component element.
- Each collection declares its observed `defaultMode`; base `:root` values come from that mode, regardless of array order.

## FAIL

- Raw HEX / rgb / px values are introduced outside `src/styles/tokens.css` without a matching measured literal from Figma.
- Tokens were collapsed into a fixed `colors` / `spacing` / `typography` trio.
- Only the variables bound to the current component were exported.
- A Figma collection is missing from `design-system/tokens/`.
- An external alias emits a `var()` whose target has no local CSS definition, or has no resolved value.

## NOT RUN

- A binding uses a selector, CSS construct or forced Figma mode the analyser does not support. Keep it in the report for manual review; do not count it as PASS.
- The component stylesheet redefines a bound custom property or contains another declaration that may affect the bound property; static analysis cannot prove the effective value.
- Browser computed-style comparison was not performed or lacks a measured mode, unit or state; do not promote a static PASS to overall conformance.
- Any CSS declaration without a recorded observation that the analyser cannot compare directly, including unsupported properties, shorthands and conditional rules.
