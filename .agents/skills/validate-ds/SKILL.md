---
name: validate-ds
description: >-
  Validate implemented UI against Design System tokens, reuse, bindings and accessibility.
  USE WHEN: the user asks to validate existing UI or an implementation is ready
  for final checks, including UI built from Figma.
  DO NOT USE WHEN: only identifying, mapping or planning UI and there is no
  implementation to verify yet.
---

# Validate Design System Compliance

## Goal

Validate generated UI against Design System rules.

## Read

- `.agents/checks/token-usage.md`
- `.agents/checks/component-reuse.md`
- `.agents/checks/accessibility.md`
- install project dependencies, then run `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` and `node .agents/checks/verify-bindings.mjs` from the project root;
- relevant DS component metadata;
- system rules.

## API state control

For each state with `control: consumer` or `shared`, manually verify how the consumer sets it (native prop, authored prop or parent-controlled context). `verify-props.mjs` checks declared props and classified variant props, but does not prove this state-control path exists. Record the result under Prop vocabulary and TSX; do not infer PASS from the script alone.

## Part mapping

For each recorded `metadata.json` part, inspect the rendered DOM: its `data-ds-part` and the CSS Module class named by `selector` must be on the same element. Author the marker as a literal JSX string attribute, such as `data-ds-part="root"`, not an expression. `verify-ds.mjs` checks that this literal attribute and the class selector exist, but cannot establish their DOM relationship. Record the result under Structural validation; if DOM inspection was not done, report it as NOT RUN rather than PASS.

## Binding report

Review every FAIL and NOT_RUN from `verify-bindings.mjs`. It reports every unobserved CSS declaration: direct literals on supported properties can be FAIL, while unsupported properties, uncovered `var()` declarations, shorthands and conditional rules are NOT_RUN. For each recorded binding or literal, `writtenStatus` says whether the direct declaration names the measured token or literal; `status` also reflects limits of the same-file analysis. A PASS does not prove the effective value. Local custom-property redefinitions and other potentially related declarations in that file become NOT_RUN. CSS in global stylesheets, other components and libraries is outside this static check. A reported FAIL is a finding, not yet a CI gate. Resolve genuine token or literal mismatches, and list unsupported constructs under Token usage as NOT RUN with their reason. Do not turn a missing Figma binding into a `notApplicable` exception.

## Computed binding values

In the browser preview, check every `metadata.json.bindings` record in each applicable rendered variant and color mode. Trigger interaction states (including hover) rather than inferring them from a default screenshot. Locate the component instance and its `[data-ds-part="<part>"]` element, confirm the expected CSS Module class is on that element, and read `getComputedStyle(element).getPropertyValue(cssProperty).trim()`. If the part is absent or ambiguous, report FAIL or NOT RUN with the exact variant and reason; do not silently skip it.

Derive the expected value **independently of that element** from the binding's `variableId` and the measured token JSON's `valuesByMode[mode]` (following the recorded alias target or resolved value). Use `modeOverride` only when Figma forced it. `externalVariables.value` covers its recorded base mode only; other external modes need fresh Figma evidence. Convert the expected Figma value to a CSS value with the observed unit, then normalize expected and actual through the browser before comparing (for example, hex colors become `rgb(...)`). If the unit, mode, state or normalization cannot be established, mark that record NOT RUN with a reason. Never compare the property with the custom property read from the same element: a local override could make both wrong values agree. For fonts, computed `font-family` does not prove which font was actually rendered; keep the visual/font-loading check too.

Report each check as `variant | mode | part | cssProperty | variableId | expected | actual | PASS / FAIL / NOT RUN (reason)` with the browser URL and Figma node ref. Correct genuine mismatches before finishing. For overall conformance, every recorded binding and literal needs `writtenStatus: PASS`; every binding also needs a computed PASS in each applicable variant and mode. A static `status: NOT_RUN` caused only by a potential cascade override or forced mode may be resolved by that computed PASS. Other static NOT_RUN findings need explicit review or remain NOT VERIFIED. If browser evaluation is unavailable, mark the computed check NOT RUN and Overall NOT VERIFIED.

## Visual comparison

For a component imported from Figma, start the project with `npm run dev` and compare the implemented component in a browser with screenshots of the exact Figma component or variant nodes listed in its map. If `App.tsx` shows another component, use a temporary preview harness and remove it after the check; do not overwrite the user's app. Use the same visible label/content, size and color mode on both sides. Cover each distinct visual treatment and size, including default, hover, disabled and optional content where Figma provides them. Trigger interactive states in the browser; do not infer hover from a static default screenshot. Compare geometry, spacing, typography, colors and assets, and correct in-scope differences. Record the compared Figma refs, browser URL or screenshots, states covered and any remaining mismatch. Figma does not define an unobserved focus style: check keyboard focus visibility under Accessibility instead of claiming a Figma visual match.

If Figma or a browser is unavailable, report this check as NOT RUN with the reason and Overall as NOT VERIFIED. Do not silently treat the comparison as irrelevant for an imported visual component.

## Output

Return a report:

Structural validation: PASS / FAIL / NOT RUN (reason)
Prop vocabulary and TSX: PASS / FAIL / NOT RUN (reason)
Component reuse: PASS / FAIL / NOT RUN (reason)
Token usage: PASS / FAIL / NOT RUN (reason)
Written binding identity and static report: PASS / FAIL / NOT RUN (reason)
Computed binding values: PASS / FAIL / NOT RUN (reason)
Accessibility: PASS / FAIL / NOT RUN (reason)
Figma-browser visual comparison: PASS / FAIL / NOT RUN (reason)

Overall: PASS / FAIL / NOT VERIFIED

For every FAIL:

- identify the violation;
- identify the file;
- propose a correction.

Only report PASS for a check that was performed. A structural PASS does not prove visual or accessibility conformance. Overall PASS requires the written identity, computed values and all other relevant checks to pass; a static cascade NOT RUN alone can be resolved as described above. Otherwise explain the missing evidence under NOT VERIFIED.
