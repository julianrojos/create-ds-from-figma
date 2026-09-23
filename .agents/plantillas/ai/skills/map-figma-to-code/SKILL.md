---
name: map-figma-to-code
description: Resolve a Design System component from Figma to its code implementation and props. Use after find-component succeeds.
---

# Map Figma to Code

## Goal

Resolve a Design System component from Figma to its code implementation.

## Read

- `design-system/relationships/figma-code-map.json`
- relevant component metadata;
- `src/components/`.

## Output

Return:

- code component;
- file path;
- props / variants to use.

Do not generate a replacement component when an existing mapping exists.
