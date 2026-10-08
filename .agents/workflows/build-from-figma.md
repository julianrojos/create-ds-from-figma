# Build UI from Figma

## Goal

Implement a Figma frame using the existing Design System.

For a component URL or an import/update of a component, follow `.agents/skills/create-ds-from-figma/SKILL.md` instead.

## Workflow

1. Inspect the requested frame and list its visible UI elements.
2. Read `design-system/inventory.json` and search `design-system/components/` and `src/components/` for existing matches. Use `.agents/skills/find-component/SKILL.md` to resolve each Figma element. Stop and report `DS_GAP` for an unmapped element; ask for the missing component URL.
3. Use `.agents/skills/map-figma-to-code/SKILL.md` and `design-system/relationships/figma-code-map.json` to resolve each mapped component to code, separating established code props, states, interactions and content through `variantClassification`. Resolve uncertain correspondences before using them in the screen: a documented candidate may be tried in an isolated verification preview and confirmed against the exact Figma variant. Do not pass Figma axes directly as code props or present an unverified candidate as a confirmed mapping.
4. Read the relevant component metadata and `design-system/relationships/figma-state.json`; respect declared `nestedComponents`.
5. Read the required tokens, `.agents/rules/design-system-composition.md` and `.agents/rules/design-system-accessibility.md`.
6. Implement the screen in `src/pages/` using the existing code components; render it from `App.tsx` when requested.
7. Add the implemented screen to `design-system/inventory.json` as `{ "name": "<Name>", "composition": { "components": ["<IncludedComponent>"], "description": "<arrangement>" } }` only after its page exists in `src/pages/`. List each used DS component name once in `composition.components`; each must already be in `inventory.components`. Preserve existing entries.
8. Ensure project dependencies are installed, then run `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` and `node .agents/checks/verify-bindings.mjs`; run the manual checks in `.agents/checks/` and follow `.agents/skills/validate-ds/SKILL.md` for rendered values.
9. Fix violations and rerun affected checks. Return PASS, FAIL or NOT RUN (with reason) for each check; never report untested behavior as passing.
