# Design System accessibility

Apply when building or reviewing UI in `src/` or `design-system/`.

Target: WCAG 2.2 AA.

- Give every interactive element an accessible name.
- Support keyboard interaction for every interactive control.
- Keep keyboard focus visible.
- Keep focus order logical. In dialogs and other focus-managed UI, place focus appropriately on entry; on exit, return it to the trigger when it remains available and fits the workflow, otherwise move it to a logical target.
- Do not convey information through color alone.
- Associate each form control with a label.
- Give icon-only controls an accessible name.
- Expose semantic states the control actually has through native HTML attributes first and ARIA when needed (for example, disabled, required, invalid, expanded or selected).
- Do not expose visual-only interactions such as hover through ARIA.
- Associate error messages with their controls.
