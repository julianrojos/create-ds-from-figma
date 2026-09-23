# Build UI from Figma

## Goal

Implement a Figma frame using the existing Design System.

## Workflow

1. Read the target Figma frame.
2. List all visible UI elements.
3. Resolve each element to an existing DS component.
4. Resolve Figma components to code components.
5. Read the relevant component metadata.
6. Read the required tokens.
7. Read composition and accessibility rules.
8. Implement the screen using existing code components.
9. Run Design System checks.
10. Fix violations.
11. Return PASS or FAIL with a short report.

## Do not

- recreate existing DS components;
- invent arbitrary token values;
- introduce new variants without reporting them;
- ignore unmapped Figma elements.
