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
- `node .ai/checks/verify-ds.mjs` from the project root;
- `node .ai/checks/verify-props.mjs` after installing TypeScript dependencies;
- relevant DS component metadata;
- system rules.

## API state control

For each state with `control: consumer` or `shared`, manually verify how the consumer sets it (native prop, authored prop or parent-controlled context). `verify-props.mjs` checks declared props and classified variant props, but does not prove this state-control path exists. Record the result under Prop vocabulary and TSX; do not infer PASS from the script alone.

## Visual comparison

For a component imported from Figma, start the project with `npm run dev` and compare the implemented component in a browser with screenshots of the exact Figma component or variant nodes listed in its map. If `App.tsx` shows another component, use a temporary preview harness and remove it after the check; do not overwrite the user's app. Use the same visible label/content, size and color mode on both sides. Cover each distinct visual treatment and size, including default, hover, disabled and optional content where Figma provides them. Trigger interactive states in the browser; do not infer hover from a static default screenshot. Compare geometry, spacing, typography, colors and assets, and correct in-scope differences. Record the compared Figma refs, browser URL or screenshots, states covered and any remaining mismatch. Figma does not define an unobserved focus style: check keyboard focus visibility under Accessibility instead of claiming a Figma visual match.

If Figma or a browser is unavailable, report this check as NOT RUN with the reason and Overall as NOT VERIFIED. Do not silently treat the comparison as irrelevant for an imported visual component.

## Output

Return a report:

Structural validation: PASS / FAIL / NOT RUN (reason)
Prop vocabulary and TSX: PASS / FAIL / NOT RUN (reason)
Component reuse: PASS / FAIL / NOT RUN (reason)
Token usage: PASS / FAIL / NOT RUN (reason)
Accessibility: PASS / FAIL / NOT RUN (reason)
Figma-browser visual comparison: PASS / FAIL / NOT RUN (reason)

Overall: PASS / FAIL / NOT VERIFIED

For every FAIL:

- identify the violation;
- identify the file;
- propose a correction.

Only report PASS for a check that was performed. A structural PASS does not prove visual or accessibility conformance. Overall PASS requires all checks relevant to the component to pass; otherwise explain the missing evidence under NOT VERIFIED.
