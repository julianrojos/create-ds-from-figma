# Token usage check

## PASS

- Values come from `design-system/tokens/<Coleccion>.json` and `src/styles/tokens.css`.
- Every Figma variable collection has a JSON file.
- Aliases in CSS point at other custom properties, not a duplicated hex.

## FAIL

- Raw HEX / rgb / px values are introduced outside `src/styles/tokens.css`.
- Tokens were collapsed into a fixed `colors` / `spacing` / `typography` trio.
- Only the variables bound to the current component were exported.
- A Figma collection is missing from `design-system/tokens/`.
