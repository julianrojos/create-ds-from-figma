# Design System Agent Instructions

When implementing UI from Figma:

1. Inspect the requested Figma frame.
2. Identify the Design System components being used.
3. Search `design-system/components/` before creating any new component.
4. Check `design-system/relationships/figma-code-map.json`.
5. Check `design-system/relationships/figma-state.json` for nested component dependencies.
6. Reuse existing components from `src/components/`.
7. Use only Design System tokens.
8. Do not invent colors, spacing or typography values.
9. Follow `design-system/system/composition-rules.md`.
10. Follow `design-system/system/accessibility.md`.
11. Install project dependencies before running the Node checks; `verify-ds.mjs` and `verify-bindings.mjs` require PostCSS and postcss-selector-parser, while `verify-ds.mjs` and `verify-props.mjs` require TypeScript.
12. Run `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` and `node .agents/checks/verify-bindings.mjs` from the project root. Run the manual checks in `.agents/checks/` and report any check not run with its reason.
13. Check `.agents/prop-vocabulary.json` before naming props.
14. Follow `.agents/skills/validate-ds/SKILL.md` to check computed binding values in the browser; static token checks alone do not prove the rendered value.

When the user says **crea un DS** or pastes a Figma **component** (not a screen), follow `.agents/skills/create-ds-from-figma/SKILL.md`. Analyze Figma and nested dependencies before writing. If a local dependency is missing, report `DS_GAP` without creating files, unless the user expressly asks to prepare only the project scaffold. On a repeat URL, update only a verified `external` to `mapped` dependency with an isolated code edit; other updates need an explicit request. Keep `Incluidos` as the last line of this file. Do not merge these instructions into the repo-root AGENTS.md.

If an element cannot be mapped to the Design System:

- do not silently invent a replacement;
- report the gap;
- explain what information is missing.

Incluidos: —
