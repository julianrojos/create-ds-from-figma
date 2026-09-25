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
11. Run all checks in `.ai/checks/` before finishing.

When the user says **crea un DS** or pastes a Figma **component** (not a screen), follow `.ai/skills/create-ds-from-figma/SKILL.md`. Analyze Figma and nested dependencies before writing. If a local dependency is missing, report `DS_GAP` without creating files, unless the user expressly asks to prepare only the project scaffold. On a repeat URL, update only a verified `external` to `mapped` dependency with an isolated code edit; other updates need an explicit request. Keep `Incluidos` as the last line when merging these instructions into an existing AGENTS.md.

If an element cannot be mapped to the Design System:

- do not silently invent a replacement;
- report the gap;
- explain what information is missing.

Incluidos: —
