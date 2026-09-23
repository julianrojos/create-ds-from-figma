# Design System Agent Instructions

When implementing UI from Figma:

1. Inspect the requested Figma frame.
2. Identify the Design System components being used.
3. Search `design-system/components/` before creating any new component.
4. Check `design-system/relationships/figma-code-map.json`.
5. Reuse existing components from `src/components/`.
6. Use only Design System tokens.
7. Do not invent colors, spacing or typography values.
8. Follow `design-system/system/composition-rules.md`.
9. Follow `design-system/system/accessibility.md`.
10. Run all checks in `.ai/checks/` before finishing.

When the user says **crea un DS** or pastes a Figma **component** (not a screen), follow `.ai/skills/create-ds-from-figma/SKILL.md`. First time: scaffold the tree + that component. Later: only fill the new component.

If an element cannot be mapped to the Design System:

- do not silently invent a replacement;
- report the gap;
- explain what information is missing.

Incluidos: —
