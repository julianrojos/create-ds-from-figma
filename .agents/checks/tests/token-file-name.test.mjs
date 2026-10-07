import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeCollectionId, isPortableTokenFileName, planTokenFiles } from "../lib/token-file-name.mjs";

const collection = (id, name) => ({ id, name });

test("spaces remain, unsafe characters are replaced, and conflicts suffix every new member", () => {
  assert.equal(planTokenFiles([collection("one", "Color Primitives")]).one, "Color Primitives.json");
  const planned = planTokenFiles([collection("one", "Color/Primitives"), collection("two", "Color-Primitives")]);
  assert.equal(planned.one, "Color-Primitives (one).json");
  assert.equal(planned.two, "Color-Primitives (two).json");
  const caseConflict = planTokenFiles([collection("one", "Color"), collection("two", "color")]);
  assert.equal(caseConflict.one, "Color (one).json");
  assert.equal(caseConflict.two, "color (two).json");
});

test("reserved and empty bases use Collection, and UTF-8 ID encoding is unambiguous", () => {
  assert.equal(planTokenFiles([collection("A/B", "CON")])["A/B"], "Collection (A%2FB).json");
  assert.equal(planTokenFiles([collection("A-B", "...")])["A-B"], "Collection (A-B).json");
  assert.equal(planTokenFiles([collection("id", "Trailing. ")]).id, "Trailing (id).json");
  assert.equal(planTokenFiles([collection("id", "a".repeat(251))]).id, "Collection (id).json");
  assert.equal(encodeCollectionId("\u001fA"), "%1FA");
  assert.equal(encodeCollectionId("\u01fa"), "%C7%BA");
  assert.equal(encodeCollectionId("%"), "%25");
  assert.throws(() => encodeCollectionId("\ud800"), /valid UTF-8/);
  for (const file of ["CON.json", "CON.foo.json", "../outside.json", "dir\\file.json", "Trailing .json", " Empty.json"]) {
    assert.equal(isPortableTokenFileName(file), false, file);
  }
});

test("an existing file survives a colliding addition and a Figma rename", () => {
  const existing = { one: "Color.json" };
  const planned = planTokenFiles([collection("one", "Hue"), collection("two", "color")], existing);
  assert.equal(planned.one, "Color.json");
  assert.equal(planned.two, "color (two).json");
  assert.deepEqual(existing, { one: "Color.json" });
});

test("the preflight rejects duplicate IDs and final case-insensitive filename collisions", () => {
  assert.throws(() => planTokenFiles([collection("one", "Color"), collection("one", "Other")]), /duplicate collection id/);
  assert.throws(() => planTokenFiles([collection("abc", "Color"), collection("ABC", "color")]), /token file collision/);
  assert.throws(() => planTokenFiles([collection("one", "Color")], { old: "CON.json" }), /invalid existing token file/);
});
