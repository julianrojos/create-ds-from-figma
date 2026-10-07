import assert from "node:assert/strict";
import { test } from "node:test";
import { bindingTypeProblem } from "../lib/property-types.mjs";

test("a COLOR variable on a size, spacing or numeric property is reported", () => {
  for (const property of ["padding-left", "margin", "gap", "width", "min-height", "border-radius", "border-top-left-radius",
    "border-top-width", "font-size", "font-weight", "line-height", "opacity", "z-index", "inset-inline-start", "transition-duration"]) {
    assert.match(bindingTypeProblem(property, "COLOR"), /COLOR variable cannot drive/, property);
  }
});

test("a FLOAT variable on a color-only property is reported", () => {
  for (const property of ["color", "background-color", "border-color", "border-top-color", "border-inline-start-color", "outline-color", "fill", "stroke", "caret-color"]) {
    assert.match(bindingTypeProblem(property, "FLOAT"), /FLOAT variable cannot drive/, property);
  }
});

test("compatible or ambiguous combinations are never reported", () => {
  for (const [property, type] of [
    ["background-color", "COLOR"], ["color", "COLOR"], ["border-color", "COLOR"], ["background", "COLOR"], ["border", "COLOR"],
    ["box-shadow", "COLOR"], ["box-shadow", "FLOAT"], ["outline", "COLOR"], ["background", "FLOAT"],
    ["padding-left", "FLOAT"], ["opacity", "FLOAT"], ["font-family", "STRING"], ["content", "STRING"], ["display", "BOOLEAN"],
    ["padding-left", "STRING"], ["color", "STRING"], ["--custom", "COLOR"],
  ]) {
    assert.equal(bindingTypeProblem(property, type), null, `${property} ${type}`);
  }
  assert.equal(bindingTypeProblem(undefined, "COLOR"), null);
});
