# Token usage check

## PASS

- `node .agents/checks/verify-ds.mjs` passes, including the comparison of `src/styles/tokens.css` with the generated output. Its structural PASS alone does not complete this manual check; review pending-variable and mode warnings too.
- Each binding and measured literal has matching written identity in `verify-bindings.mjs`; its static limits are reviewed as required by `.agents/skills/validate-ds/SKILL.md`.
- Browser `getComputedStyle` matches independently derived expectations for each applicable binding, variant, state and combination of collection modes, following `.agents/skills/validate-ds/SKILL.md`. Expectations use the recorded FLOAT serialization and each alias target's own active collection mode, not a custom property read from the same component element.
- The rendered review records how the decided mode scopes were activated and how overlapping scopes affected the cascade. Static mode-block checks do not prove effective browser values.
- Literals used where Figma has no variable binding are observed and recorded in `measuredLiterals`; approximate translations pass their applicable computed or contextual comparison, not just written CSS identity.
- External snapshots are identified as evidence from another library, and the rendered comparison stays within the modes supported by that evidence.
- The collection and variable IDs captured in the JSON files were compared with the complete file-level inventory obtained from Figma, not just the component's bindings. Internal consistency alone does not establish capture completeness.

## FAIL

- Raw HEX / rgb / px values are introduced outside `src/styles/tokens.css` without a matching measured literal from Figma.
- `verify-ds.mjs` reports an error, or a genuine token/literal mismatch from `verify-bindings.mjs` remains unresolved.
- A rendered value differs from its independently established expectation, or a bound variable is replaced with a literal.
- A binding or emitted alias consumes a pending variable; do not publish a provisional value to hide the finding.
- Figma collections were collapsed into a fixed `colors` / `spacing` / `typography` trio rather than preserved as one JSON per observed collection.
- Only the variables bound to the current component were captured, or collections/variables from the complete Figma file-level inventory are missing from the JSON files.

## NOT RUN

- A binding uses a selector, CSS construct or forced Figma mode the analyser does not support. Keep it in the report for manual review; do not count it as PASS.
- The component stylesheet redefines a bound custom property or contains another declaration that may affect the bound property; static analysis cannot prove the effective value.
- Browser computed-style comparison was not performed or lacks a measured mode, unit or state; do not promote a static PASS to overall conformance.
- A required code-value correspondence, mode scope or serialization decision remains unresolved. Unused pending variables are listed as NOT VERIFIED, never as verified merely because the structural check passes.
- An approximate literal lacks its applicable computed or contextual comparison, or an external mode lacks fresh Figma evidence.
- The complete Figma file-level inventory could not be obtained or compared with the captured collections and variables; do not infer completeness from `verify-ds.mjs` alone.
- Any CSS declaration without a recorded observation that the analyser cannot compare directly, including unsupported properties, shorthands and conditional rules.
