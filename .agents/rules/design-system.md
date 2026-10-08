# Design System rules

Apply when reading, editing or generating `src/` or `design-system/` files.

- Before adding a UI component, search `design-system/inventory.json`, `design-system/components/` and `src/components/`; reuse an existing match.
- Resolve Figma components through `design-system/relationships/figma-code-map.json`. Check `figma-state.json` for nested dependencies.
- Reuse a mapped nested component from `src/components/`; do not redraw it. Report new variants before implementing them.
- Use Design System tokens for observed Figma variable bindings. Where Figma has no variable binding, use only an observed literal recorded in the component's `measuredLiterals`, preserving any approximate-translation verification requirement. Do not invent color, spacing or typography values or replace a bound token with a literal.
- Read and follow `.agents/rules/design-system-composition.md` and `.agents/rules/design-system-accessibility.md`.
- Consult `.agents/prop-vocabulary.json` when naming props. Name boolean props as a bare adjective or state (`disabled`, `loading`), never `is*`, `has*` or `show*`, and write props in camelCase.
- Do not invent a substitute for an unmapped element. Report `DS_GAP` and explain what is missing.
- Record only implemented components and screens in `design-system/inventory.json`.
- Never edit `src/styles/tokens.css` by hand; regenerate it with `node .agents/skills/create-ds-from-figma/scripts/generate-tokens-css.mjs .` after changing token JSON, `figma-state.json` or `externalVariables`.
- Install the dependencies in `package.json` before running Node checks if they are missing: `verify-ds.mjs` and `verify-bindings.mjs` require PostCSS and postcss-selector-parser; `verify-ds.mjs` and `verify-props.mjs` require TypeScript.
- Before finishing UI work, run `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` and `node .agents/checks/verify-bindings.mjs` from the repo root. Complete the manual `.md` checks in `.agents/checks/` and follow `.agents/skills/validate-ds/SKILL.md` for rendered values. `.agents/checks/tests/` contains kit tests and `.agents/checks/lib/` contains shared code; neither is a check to run for each UI task. Report checks not run and why.
