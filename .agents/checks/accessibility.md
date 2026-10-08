# Accessibility check

## PASS

- Every applicable requirement in `.agents/rules/design-system-accessibility.md` was checked and passed on the rendered UI.
- For each mapped component under review, the `states` in `design-system/components/<Nombre>/metadata.json` were compared with the rendered behavior, and the states with semantic meaning were identified (or an empty `states` list was confirmed).
- Requirements that do not apply are identified with a reason.

## FAIL

Any relevant accessibility rule from `.agents/rules/design-system-accessibility.md` is violated.

## NOT RUN

An applicable requirement, or the comparison of component states with the rendered UI, could not be checked. Report which one and why; do not claim PASS.
