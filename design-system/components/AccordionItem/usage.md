# AccordionItem usage

## Use

Use it to show one question, section title, or compact disclosure row that can reveal supporting content.

The Figma component set is 640px wide, but product layouts should let the parent define the rendered width.

## Do not

- recreate this component with ad-hoc styles when it exists;
- hardcode colors, spacing or typography;
- create new visual variants without adding them to the Design System;
- use it for navigation to another page.

## Accessibility

- Render the header control as a button.
- Keep `aria-expanded` synchronized with the open state.
- Associate the button and region with stable IDs.
