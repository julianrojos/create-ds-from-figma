# Build UI from Figma

## Goal

Implement a Figma frame using the existing Design System.

## Workflow

1. Read the target Figma frame.
2. List all visible UI elements.
3. Resolve each element to an existing DS component.
4. Resolve Figma components to code components.
5. Read the relevant component metadata.
6. Read `figma-state.json` and respect each component's declared `nestedComponents`.
7. Read the required tokens.
8. Read composition and accessibility rules.
9. Implement the screen using existing code components.
10. Run Design System checks.
11. Fix violations.
12. Return PASS or FAIL with a short report.

## Do not

- recreate existing DS components;
- invent arbitrary token values;
- introduce new variants without reporting them;
- ignore unmapped Figma elements;
- redraw a mapped nested component instead of using the resolved DS component.
