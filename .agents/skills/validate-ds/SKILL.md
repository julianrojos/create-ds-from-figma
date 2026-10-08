---
name: validate-ds
description: >-
  Validate implemented UI against Design System composition, tokens, reuse, bindings and accessibility.
  USE WHEN: the user asks to validate existing UI or an implementation is ready
  for final checks, including UI built from Figma.
  DO NOT USE WHEN: only identifying, mapping or planning UI and there is no
  implementation to verify yet.
---

# Validate Design System Compliance

## Goal

Validate generated UI against Design System rules.

## Write scope

A standalone request to validate UI is read-only with respect to DS documentation and implementation: report findings and proposed correspondence entries without editing `usage.md` or fixing source files. An unavailable verification changes the current report, not the historical record automatically.

Write correspondence entries only within an authorized component import/update, or when the user explicitly asks to record the validation results. Keep edits within that authorization; permission to record a result does not authorize implementation fixes. A temporary verification harness may be used as described below and must leave the user's files unchanged after review. The sections below describe checks and proposed corrections; apply permanent changes only when their scope is authorized.

## Read

- `.agents/checks/token-usage.md`
- `.agents/checks/component-reuse.md`
- `.agents/checks/accessibility.md`
- install project dependencies, then run `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` and `node .agents/checks/verify-bindings.mjs` from the project root;
- relevant DS component metadata;
- `design-system/relationships/figma-state.json`, the relevant collection JSON files and `.agents/skills/create-ds-from-figma/references/tokens.md` for mode scopes, alias resolution and serialization;
- `.agents/rules/design-system.md`, `.agents/rules/design-system-composition.md` and `.agents/rules/design-system-accessibility.md`.

## API state control

Prepare each Figma variant through `.agents/skills/map-figma-to-code/SKILL.md`: use `variantClassification` to separate code props, states, interactions and content.

1. Exercise an established mapping, or an explicitly documented candidate in a verification preview. Activate states through their actual control paths, trigger interactions in the browser and supply content to its recorded part/API. A prop type proves admissibility, not correspondence to Figma.
2. Compare the exact code configuration with the matched Figma variant under the same content, state, size and modes. This rendered comparison can establish correspondence empirically for the examined configuration; newly authored code alone cannot. Report observed mismatches and propose corrections; apply them only within an authorized implementation scope, then recheck before confirming the correspondence. Unresolved mismatches remain FAIL.
3. Record `Figma variant/ref | exact code props | states/interactions/content | examined configuration | evidence refs | PASS / FAIL / NOT RUN` in the current report. Propose an entry for the fixed `## Figma to code correspondences` section of `usage.md` using the template columns and `candidate` / `confirmed` statuses from the metadata reference. Write it only under the Write scope above. Record the examined Figma/code revision or explicitly state which revision could not be identified. A confirmation is limited to that configuration and revision; recheck when these change or their current validity cannot be established. Preserve historical evidence and propose `candidate` for an unverified current correspondence, without silently changing its historical entry in a standalone validation. A date alone and a previous documented match are not a current PASS.

If the correspondence remains unresolved or the comparison cannot be performed, that configuration has no PASS and Overall remains NOT VERIFIED. Candidates are allowed for verification, not as silently assumed confirmed mappings in production composition.

For each state with `control: consumer` or `shared`, manually verify how the consumer sets it (native prop, authored prop or parent-controlled context). `verify-props.mjs` checks declared props and classified variant props, but does not prove this state-control path exists. Record the result under Prop vocabulary and TSX; do not infer PASS from the script alone.

## Part mapping

For each recorded `metadata.json` part, inspect the rendered DOM: its `data-ds-part` and the CSS Module class named by `selector` must be on the same element. Author the marker as a literal JSX string attribute, such as `data-ds-part="root"`, not an expression. `verify-ds.mjs` checks that this literal attribute and the class selector exist, but cannot establish their DOM relationship. Record the result under Structural validation; if DOM inspection was not done, report it as NOT RUN rather than PASS.

## Composition

Check the implemented UI against every applicable requirement in `.agents/rules/design-system-composition.md`, using the rendered structure and source where needed. Record which requirements do not apply and why. Report Composition PASS only after checking all applicable requirements; report FAIL for a violation or NOT RUN with a reason when a required review was not performed. Static verifier results alone do not establish composition compliance.

## Binding report

Lines marked ADVISORY (a binding straight to a variable of a primitive collection) never change a status: mirror Figma's binding and list them under Token usage as a suggestion, not as a finding. Review every FAIL and NOT_RUN from `verify-bindings.mjs`. It reports every unobserved CSS declaration: direct literals on supported properties can be FAIL, while unsupported properties, uncovered `var()` declarations, shorthands and conditional rules are NOT_RUN. For each recorded binding or literal, `writtenStatus` says whether the direct declaration names the measured token or literal; `status` also reflects limits of the same-file analysis. A PASS does not prove the effective value. Local custom-property redefinitions and other potentially related declarations in that file become NOT_RUN. CSS in global stylesheets, other components and libraries is outside this static check. A reported FAIL is a finding, not yet a CI gate. Report genuine token or literal mismatches and propose corrections; apply fixes only within an authorized implementation scope. List unsupported constructs under Token usage as NOT RUN with their reason. Do not turn a missing Figma binding into a `notApplicable` exception.

## Figma style provenance

Read `metadata.json.figmaCoverage.styles` first. `captured` with an empty `styles` list means the component has no styles: report NOT APPLICABLE. `unavailable` means the tool did not return them: report NOT RUN with the recorded source and reason, not automatically `DS_GAP` if essential values were measured. With `captured` and recorded styles, inspect each application and its `styleRef` uses against the Figma evidence available in this run. Report style provenance separately from value fidelity, and it never changes Overall by itself. `styleOrigin: unknown` must not be promoted to `style` or `override` merely because values match or differ. Style ranges document where a style applied; they do not verify property values for each text segment. If nonessential mixed text remains in `unresolved`, name its part and report it NOT VERIFIED even if the scalar properties that were measured pass. Essential mixed differences that cannot be implemented faithfully remain `DS_GAP`, not a passing `notBuilt` exclusion.

## Computed binding values

In the browser preview, check every `metadata.json.bindings` record in each applicable rendered variant and combination of collection modes, not only color themes:

1. Activate each collection's nondefault mode through its recorded `modeScopes`: apply the selector in its actual DOM context or satisfy the media query, preserving the recorded emission order.
2. Record the active mode of each relevant collection independently, including alias targets. Overlapping scopes require checking which declaration wins through specificity and cascade; emission order alone is not proof.
3. A scope of `null`, or an activation that cannot be established, leaves that mode NOT RUN and Overall NOT VERIFIED; never invent an attribute, class or breakpoint.
4. Trigger interaction states (including hover) rather than inferring them from a default screenshot. Locate the component instance and its `[data-ds-part="<part>"]` element, confirm the expected CSS Module class is on that element, and read `getComputedStyle(element).getPropertyValue(cssProperty).trim()`.
5. If the part is absent or ambiguous, report FAIL or NOT RUN with the exact variant and reason; do not silently skip it.

Derive the expected value **independently of that element** from the binding's `variableId` and the measured token JSON:

- Select `valuesByMode` using that variable's collection mode. Follow each local alias by `targetVariableId`, selecting the destination collection's own active mode, never the origin's mode name by assumption.
- Local CSS aliases use `var(--target)`, so the origin's stored resolved snapshot alone cannot establish the browser result across independent axes.
- External aliases use their recorded resolved value for the origin mode; direct `externalVariables.value` snapshots cover only their recorded base mode, and other external modes need fresh Figma evidence.
- Use `modeOverride` only when Figma forced it, and demonstrate how the rendered configuration realizes that forced value rather than assuming a global scope does so.

For a `FLOAT`, apply the recorded `state.collections[collectionId].serialization[variableId].css` decision (unit, unitless or scale factor and unit), following alias inheritance and compatibility as defined in the token reference. Do not infer units or scale from `cssProperty`, variable names or scopes. A pending or conflicting decision cannot yield PASS; a binding consuming a pending variable is a finding to resolve, not permission to publish a provisional number.

Normalize the independently serialized expectation and actual value through the browser before comparing (for example, hex colors become `rgb(...)`). If serialization, mode, state or normalization cannot be established, mark that record NOT RUN with a reason. Never compare the property with the custom property read from the same element: a local override could make both wrong values agree. For fonts, computed `font-family` does not prove which font was actually rendered; keep the visual/font-loading check too.

Report each check as `variant | collectionId-to-active-mode mapping | part | cssProperty | variableId | expected | actual | PASS / FAIL / NOT RUN (reason)` with the browser URL, activation configuration and Figma node ref. Report genuine mismatches and propose corrections. Apply fixes only when the implementation scope is authorized; otherwise finish with the findings unresolved and do not claim PASS. For overall conformance, every recorded binding and literal needs `writtenStatus: PASS`; every binding also needs a computed PASS in each applicable variant and mode combination. A static `status: NOT_RUN` caused only by a potential cascade override or forced mode may be resolved by that computed PASS. Other static NOT_RUN findings need explicit review or remain NOT VERIFIED. If browser evaluation is unavailable, mark the computed check NOT RUN and Overall NOT VERIFIED.

## Approximate measured literals

Keep three results distinct for each `measuredLiterals` record with `translation: approximate`: its written CSS identity from `verify-bindings`, its browser-computed value when an **independent, comparable** Figma expectation exists, and a contextual visual comparison otherwise. The static report intentionally leaves such a literal at `status: NOT_RUN` even when `writtenStatus: PASS`. A CSS mismatch is FAIL and cannot be rescued by a visual match.

Only derive `fontSize × percentage` for `figmaValue.source: REST` with `figmaValue.field: lineHeightPercentFontSize`; the font size must be observed independently in the same Figma context. Another percentage field does not prove that formula. For a comparable expected value, read `getComputedStyle` in every applicable variant, mode and state and report `variant | mode | part | cssProperty | figmaValue | expected | actual | PASS / FAIL / NOT RUN`, with browser URL and Figma ref. Do not derive the expected value from the same browser element. A computed PASS resolves only this comparable value, not style provenance or visual fidelity.

For `AUTO` or another value without an independent comparable expectation, compare the exact Figma and browser contexts visually: font, content, size, mode and state. Record the examined configurations, screenshots or refs, and differences. A contextual PASS applies only to those configurations; never claim `normal` and `AUTO` are generally equivalent. Text-box height alone is insufficient evidence. If neither comparison can be performed, report NOT RUN with reason and Overall NOT VERIFIED. Every approximate literal needs a PASS in its applicable computed or contextual lane for Overall PASS; do not require both lanes when one is inapplicable.

## Visual comparison

For a component imported from Figma, start the project with `npm run dev` and compare the implemented component in a browser with screenshots of the exact Figma component or variant nodes listed in its map. If `App.tsx` shows another component, use a temporary preview harness and remove it after the check; do not overwrite the user's app. Use the same visible label/content, size and applicable collection-mode configuration on both sides. Cover each distinct visual treatment and size, including default, hover, disabled and optional content where Figma provides them. Trigger interactive states in the browser; do not infer hover from a static default screenshot. Compare geometry, spacing, typography, colors and assets; report differences and propose corrections. Correct them only when implementation changes are authorized, and rerun the affected comparison before claiming PASS. Record the compared Figma refs, browser URL or screenshots, active modes, states covered and any remaining mismatch. Figma does not define an unobserved focus style: check keyboard focus visibility under Accessibility instead of claiming a Figma visual match.

If Figma or a browser is unavailable, report this check as NOT RUN with the reason and Overall as NOT VERIFIED. Do not silently treat the comparison as irrelevant for an imported visual component.

## Output

Return a report:

Structural validation: PASS / FAIL / NOT RUN (reason)
Figma style provenance: PASS / FAIL / NOT RUN (reason; or NOT APPLICABLE)
Prop vocabulary and TSX: PASS / FAIL / NOT RUN (reason)
Component reuse: PASS / FAIL / NOT RUN (reason)
Composition: PASS / FAIL / NOT RUN (reason)
Token usage: PASS / FAIL / NOT RUN (reason)
Written binding identity and static report: PASS / FAIL / NOT RUN (reason)
Computed binding values: PASS / FAIL / NOT RUN (reason)
Approximate literal computed values: PASS / FAIL / NOT RUN (reason; or NOT APPLICABLE)
Approximate literal contextual comparison: PASS / FAIL / NOT RUN (reason; or NOT APPLICABLE)
Accessibility: PASS / FAIL / NOT RUN (reason)
Figma-browser visual comparison: PASS / FAIL / NOT RUN (reason)

Overall: PASS / FAIL / NOT VERIFIED

For every FAIL:

- identify the violation;
- identify the file;
- propose a correction.

Only report PASS for a check that was performed. A structural PASS does not prove visual or accessibility conformance. Overall PASS requires the written identity, computed binding values, an applicable rendered PASS for every approximate literal, and all other relevant checks to pass. Style provenance is reported on its own line and does not downgrade Overall: unverified provenance (`unknown` origin or `unavailable` capture) says nothing about the measured values. A nonessential mixed-text part left in `unresolved` does leave Overall NOT VERIFIED, not PASS. A static cascade NOT RUN alone can be resolved as described above. Otherwise explain the missing evidence under NOT VERIFIED.
