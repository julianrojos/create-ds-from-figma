import assert from "node:assert/strict";
import { test } from "node:test";
import { MISSING_PREFIX_MESSAGE, assessTokenPrefix, customPropertyDeclarations } from "../lib/design-system-state.mjs";

const empty = { tokenPrefix: null, collectionIds: [], tokenFiles: [], declaredCustomProperties: [], importedComponents: [] };

test("a blank design system with no prefix is new", () => {
  assert.deepEqual(assessTokenPrefix(empty), { status: "new" });
  assert.deepEqual(assessTokenPrefix({}), { status: "new" });
});

test("any published evidence without a prefix is inconsistent and shares one message", () => {
  for (const evidence of [
    { collectionIds: ["VariableCollectionId:1:1"] },
    { tokenFiles: ["Color.json"] },
    { declaredCustomProperties: ["--x"] },
    { importedComponents: ["Button"] },
  ]) {
    const verdict = assessTokenPrefix({ ...empty, ...evidence });
    assert.equal(verdict.status, "missing");
    assert.equal(verdict.message, MISSING_PREFIX_MESSAGE);
  }
});

test("the missing-prefix message asks for a state repair and never suggests passing a prefix", () => {
  assert.match(MISSING_PREFIX_MESSAGE, /repair it explicitly/);
  assert.doesNotMatch(MISSING_PREFIX_MESSAGE, /pass(ing)? (a|the) prefix|input/i);
});

test("a valid fixed prefix is accepted with or without published names", () => {
  assert.deepEqual(assessTokenPrefix({ ...empty, tokenPrefix: "ds", importedComponents: ["Button"] }), { status: "fixed" });
});

test("an invalid prefix is reported, including an empty string", () => {
  for (const tokenPrefix of ["DS", "", "-ds", 7]) {
    assert.equal(assessTokenPrefix({ ...empty, tokenPrefix }).status, "invalid", String(tokenPrefix));
  }
});

test("custom property declarations are found in any rule and references are ignored", () => {
  const css = ":root { --a: 1; --b:2 } @media (min-width: 1px) { .x { --c : 3; color: var(--d, red); } } /* --e: 4 */";
  assert.deepEqual(customPropertyDeclarations(css), ["--a", "--b", "--c"]);
  assert.deepEqual(customPropertyDeclarations(":root { --1x: 1; --é: 2; }"), ["--1x", "--é"]);
  assert.deepEqual(customPropertyDeclarations(':root { content: "hello --fake: value"; --real: 1; }'), ["--real"]);
  assert.deepEqual(customPropertyDeclarations(""), []);
  assert.throws(() => customPropertyDeclarations(":root { --unfinished: 1"), /Unclosed block/);
});
