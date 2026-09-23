---
name: find-component
description: Resolve a UI element or Figma node to an existing Design System component. Use before creating any new UI primitive.
---

# Find Component

## Goal

Resolve a UI element to an existing Design System component.

## Input

A Figma node or UI element description.

## Read

- `design-system/components/`
- `design-system/relationships/figma-code-map.json`

## Process

1. Identify the Figma component name and properties.
2. Search the DS component metadata.
3. Match by Figma node ID when available.
4. Match by component name and variants when node ID is unavailable.
5. Return the best match.

## Output

Return:

- DS component;
- confidence;
- matched variant;
- relevant metadata path.

If no reliable match exists, return `DS_GAP`.
