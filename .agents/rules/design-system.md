# Design System rules

Apply when reading, editing or generating `src/` or `design-system/` files.

- Before adding a UI component, search `design-system/inventory.json`, `design-system/components/` and `src/components/`; reuse an existing match.
- Resolve Figma components through `design-system/relationships/figma-code-map.json`. Check `figma-state.json` for nested dependencies.
- Reuse a mapped nested component from `src/components/`; do not redraw it. Report new variants before implementing them.
- Use only Design System tokens. Do not invent color, spacing or typography values.
- Follow `design-system/system/composition-rules.md` and `design-system/system/accessibility.md`.
- Consult `.agents/prop-vocabulary.json` when naming props.
- Do not invent a substitute for an unmapped element. Report `DS_GAP` and explain what is missing.
- Record only implemented components and screens in `design-system/inventory.json`.
- Install the dependencies in `package.json` before running Node checks if they are missing: `verify-ds.mjs` and `verify-bindings.mjs` require PostCSS and postcss-selector-parser; `verify-ds.mjs` and `verify-props.mjs` require TypeScript.
- Before finishing UI work, run the checks in `.agents/checks/` and follow `.agents/skills/validate-ds/SKILL.md` for rendered values. Report checks not run and why.
