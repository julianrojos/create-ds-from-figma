---
name: validate-ds
description: Validate generated UI against Design System token, reuse, and accessibility checks. Use before finishing any UI implementation from Figma.
---

# Validate Design System Compliance

## Goal

Validate generated UI against Design System rules.

## Read

- `.ai/checks/token-usage.md`
- `.ai/checks/component-reuse.md`
- `.ai/checks/accessibility.md`
- relevant DS component metadata;
- system rules.

## Output

Return a report:

Component reuse: PASS / FAIL
Token usage: PASS / FAIL
Accessibility: PASS / FAIL

Overall: PASS / FAIL

For every FAIL:

- identify the violation;
- identify the file;
- propose a correction.
