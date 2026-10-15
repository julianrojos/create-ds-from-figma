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

## Captured evidence

Run `node .agents/checks/verify-figma-evidence.mjs .` and read the component's required immutable `metadata.evidence.snapshot`. Missing evidence is FAIL, without exceptions. Capture issues, manual decisions, composite translations and delegated overrides remain NOT VERIFIED pending review. Detailed grouped findings are in each component's review report. This checks accounting against the import capture, not live completeness or rendering. Optional rereads do not authorize updates.

## API state control

Read required `metadata.verification` and run `node .agents/checks/verify-render-plan.mjs .`. This checks captured font/image resources, essential typography coverage and concrete fidelity/behavior configurations, not rendering. Unresolved resources/correspondences remain NOT VERIFIED; essential gaps still block import.

Use `node .agents/skills/create-ds-from-figma/scripts/verification-preview.mjs . design-system/components/Name/metadata.json 5174` with project React/React DOM/Vite dependencies installed and a free port. This isolated view does not overwrite App.tsx or inherit providers/plugins/global imports. Adjust the declared viewport and activate real states; unsupported runtime context is NOT RUN. The page transfers original computed measurements to a temporary directory with browser/server SHA-256 agreement. Inspect window.__dsVerification.status; recorded means transferred, not validated. Collect again after interactions with the exposed collect function through an authorized tool/console. Stop the server after review; retain needed reports in an authorized durable location before using them as evidence.

Read receipt viewportMatches, files and inputsUnchangedSinceStart. Hashes cover declared inputs, not every dependency or the exact code loaded by the browser; restart after changes. Check actual text/part classes, loaded FontFace descriptors and rendered glyph font, image loading, modes and states independently. Neither document.fonts.check nor computed font-family proves glyph font. The collector never assigns PASS, certifies authenticity or confirms correspondence. Use its measures for the independent value and visual checks below.

The static render gate requires definitions for DS tokens referenced by metadata, bindings and reachable CSS var calls in runtime-imported CSS or verification.stylesheets. Audit-only inputs and type-only imports do not load styles. Reachable declarations are not proof that a selector/mode is active: verify their effective values in the browser. Dependency resolution reads only root tsconfig.json and project-contained extends; external inheritance remains NOT VERIFIED, never an implicit parent configuration.

Receipts also require the original case metadataHash. Publication, new reports and confirmed validation recheck the original measurement's semantic fingerprint and input hashes, not just newly generated report hashes. Changed implementation or relevant decisions require a new collection; metadata prose alone is audit-only. Scope parts to the unique outer root in the harness, excluding nested roots and their homonymous parts; verify nested components separately as needed. Missing or sibling outer roots remain errors.

Stale but internally valid confirmation evidence reports candidate/NOT VERIFIED for the current run, without failing DS conformance or editing usage. Corrupted reports/artifacts still fail, including when inputs are stale. Dependency scope follows local AST/CSS references, hashed resources and explicit verification.inputs, not the entire source tree or complete relationship files. Shared file changes may invalidate several cases. Unresolved aliases, nonliteral imports/globs and external symlinks remain NOT VERIFIED; do not infer completeness from an extra file list. Reports retain sourceSnapshot to check historical artifact integrity independently of current staleness.

Press F8 to collect again without moving the pointer after an interaction such as hover; the receipt does not prove activation. A case marked unestablished requires no invented baseline/behavior case and remains NOT VERIFIED, while its captured resource and typography obligations remain.

Read required `metadata.evidence.textDimensions` and `review.textDimensions` from the evidence report. Static coverage classifies captured dimensions and checks treatment links; it does not prove intrinsic CSS sizing. WIDTH_AND_HEIGHT makes both dimensions content-dependent; HEIGHT fixes width but derives height. FILL, conflicting dimension bindings or unsupported sizing stay unknown under this first rule. Hidden text is not automatically excluded: exercise configurations that activate optional content. Follow validated mapped delegations into the reused component when checking behavior.

Keep fidelity and behavior checks separate. First compare exact source content and geometry with Figma. Then vary content within the declared API contract to test intrinsic sizing, anchoring and clipping. For a single-initial component, exercise the observed letter and wider letters such as W and M in every applicable size/shape, checking that its text box is not frozen to the source letter's width. Do not infer geometric centering from text alignment or demand equal widths for different glyphs. Test empty content or length limits only when the API establishes their meaning; otherwise request criterion before inventing an expected result. Extra cases do not become confirmed Figma variants. Record their configurations, results and artifacts separately. No browser or unknown behavior means NOT RUN/NOT VERIFIED, never PASS from a translation reason or matching source measurement alone.

Prepare each Figma variant through `.agents/skills/map-figma-to-code/SKILL.md`: use `variantClassification` to separate code props, states, interactions and content.

1. Exercise an established mapping, or an explicitly documented candidate in a verification preview. Activate states through their actual control paths, trigger interactions in the browser and supply content to its recorded part/API. A prop type proves admissibility, not correspondence to Figma.
2. Compare the exact code configuration with the matched Figma variant under the same content, state, size and modes. This rendered comparison can establish correspondence empirically for the examined configuration; newly authored code alone cannot. Report observed mismatches and propose corrections; apply them only within an authorized implementation scope, then recheck before confirming the correspondence. Unresolved mismatches remain FAIL.
3. Record the exact configuration and PASS / FAIL / NOT RUN in the current report. Propose a JSON correspondence `{ caseId, status }` for usage.md, referencing a fidelity case in metadata.verification instead of repeating props/content/modes. confirmed also requires evidence path/SHA-256 of a retained rendered-comparison report with exact configuration, snapshot hash, examined input hashes, artifacts, revision IDs or explicit unavailability reasons, and an explicit agent/tool rendered judgment. Write only under the Write scope above. verify-ds validates accounting, integrity and staleness, not the truth of a visual judgment. Preserve historical reports; a stale or unverified current configuration remains candidate in the current report, without rewriting the historical record during standalone validation. Measurement receipts are never automatically promoted to confirmed.

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

First verify each literal's `observation` against the linked snapshot: approximate `figmaValue` must have `source: PLUGIN` and the exact observation field and raw value. For `lineHeight` with `{ unit: "PERCENT", value: p }`, derive the independent pixel expectation as `fontSize × p / 100` only when the font size is independently observed in Figma for the same node, variant and modes. For `segments[n].lineHeight`, use the font size of that same segment and range. A mixed or unavailable font size does not authorize that formula; another percentage field does not either. For `{ unit: "PIXELS", value: n }`, the comparable expectation is `n` pixels; `{ unit: "AUTO" }` requires the contextual lane below. Do not relabel REST data as PLUGIN. For a comparable expected value, read `getComputedStyle` in every applicable variant, mode and state and report `variant | mode | part | cssProperty | figmaValue | expected | actual | PASS / FAIL / NOT RUN`, with browser URL and Figma ref. Do not derive the expected value from the same browser element. A computed PASS resolves only this comparable value, not style provenance or visual fidelity.

For `AUTO` or another value without an independent comparable expectation, compare the exact Figma and browser contexts visually: font, content, size, mode and state. Record the examined configurations, screenshots or refs, and differences. A contextual PASS applies only to those configurations; never claim `normal` and `AUTO` are generally equivalent. Text-box height alone is insufficient evidence. If neither comparison can be performed, report NOT RUN with reason and Overall NOT VERIFIED. Every approximate literal needs a PASS in its applicable computed or contextual lane for Overall PASS; do not require both lanes when one is inapplicable.

## Visual comparison

Confirmation reports use schemaVersion 2. Retain original browser-measurement JSON with its published original receipt and a Figma PNG under design-system/verification/artifacts. PNG decoding checks CRC and derives image width/height; they must stay within 1 px of the captured node bounds times the declared scale (WITHIN_ONE_PIXEL_OF_NODE_BOUNDS), a tolerance that does not assume Figma's fractional export rounding. If the captured size is unreadable, dimensionComparison stays NOT VERIFIED. A matching size does not show that the image depicts the node. Scope/scale remain reviewer declarations, not proof of authenticity or fidelity. Review that the image depicts the complete intended node/configuration. The reviewer still supplies the comparison judgment. Both publish and report require mapped component CSS even outside src/. Local src/public/token files, Figma relationships, manifests, locks and Vite/TypeScript configurations are hashed conservatively; include other examined inputs explicitly. Installed node_modules, remote resources, system fonts and browser changes remain outside that closure. Metadata staleness uses the relevant per-case semantic fingerprint; its full hash is historical audit data.

When persistent writes are authorized, publish a measurement with `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs publish . METADATA CASE RECEIPT`. It validates original receipt/body hashes, unchanged inputs and viewport, preserves both byte streams and verifies destination hashes. Use its returned artifact in REVIEW; do not transcribe values. Publication never supplies PASS or authenticity. Standalone validation does not authorize publication.

For an authorized confirmed entry after a real rendered comparison, use `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs report . METADATA CASE REVIEW`. Review supplies the explicit rendered judgment, revision IDs/unavailability reasons and paths to retained original artifacts; the script derives configuration and input/artifact hashes. It does not perform the comparison, certify authenticity or promote a measurement receipt. A standalone validation does not authorize writing this persistent report or usage.md.

For a component imported from Figma, start the project with `npm run dev` and compare the implemented component in a browser with screenshots of the exact Figma component or variant nodes listed in its map. If `App.tsx` shows another component, use a temporary preview harness and remove it after the check; do not overwrite the user's app. Use the same visible label/content, size and applicable collection-mode configuration on both sides. Cover each distinct visual treatment and size, including default, hover, disabled and optional content where Figma provides them. Trigger interactive states in the browser; do not infer hover from a static default screenshot. Compare geometry, spacing, typography, colors and assets; report differences and propose corrections. Correct them only when implementation changes are authorized, and rerun the affected comparison before claiming PASS. Record the compared Figma refs, browser URL or screenshots, active modes, states covered and any remaining mismatch. Figma does not define an unobserved focus style: check keyboard focus visibility under Accessibility instead of claiming a Figma visual match.

If Figma or a browser is unavailable, report this check as NOT RUN with the reason and Overall as NOT VERIFIED. Do not silently treat the comparison as irrelevant for an imported visual component.

## Output

Return a report:

Structural validation: PASS / FAIL / NOT RUN (reason)
Captured evidence: PASS / FAIL / NOT VERIFIED / NOT RUN (reason)
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
