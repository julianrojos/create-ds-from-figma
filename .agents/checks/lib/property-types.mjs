// Unambiguous mismatches between the type of a Figma variable and the CSS property a binding proposes.
// Only clear cases are listed: a COLOR variable on a pure size, spacing or numeric property, and a FLOAT
// variable on a property that can only hold a color. Shorthands that may mix a color with other values
// (background, border, outline, box-shadow, text-shadow) accept both types, and STRING and BOOLEAN are not judged.

const colorOnly = /^(?:color|background-color|(?:border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?-color)|outline-color|text-decoration-color|caret-color|accent-color|column-rule-color|fill|stroke|stop-color|flood-color|lighting-color)$/;
const numericOnly = /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap|(?:top|right|bottom|left)|inset(?:-(?:inline|block)(?:-(?:start|end))?)?|border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?-width|border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius|outline-(?:width|offset)|font-size|font-weight|line-height|letter-spacing|word-spacing|opacity|z-index|flex(?:-(?:grow|shrink|basis))?|order|transition-duration|animation-duration|aspect-ratio)$/;

export function bindingTypeProblem(cssProperty, variableType) {
  if (typeof cssProperty !== "string") return null;
  if (variableType === "COLOR" && numericOnly.test(cssProperty)) {
    return `a COLOR variable cannot drive ${cssProperty}, which takes a number or length`;
  }
  if (variableType === "FLOAT" && colorOnly.test(cssProperty)) {
    return `a FLOAT variable cannot drive ${cssProperty}, which takes a color`;
  }
  return null;
}
