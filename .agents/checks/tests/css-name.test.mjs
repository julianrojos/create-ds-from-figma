import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CSS_NAME_MAX,
  encodeVariableId,
  isValidCssName,
  isValidTokenPrefix,
  planCssNames,
  slugSegment,
} from "../lib/css-name.mjs";

const fixture = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/css-names.json"), "utf8"));

for (const item of fixture.cases) {
  test(`css names: ${item.name}`, () => {
    const input = { prefix: item.prefix, collections: item.collections, existing: item.existing, reserved: item.reserved };
    if (item.error) assert.throws(() => planCssNames(input), (error) => error.message.includes(item.error));
    else assert.deepEqual(planCssNames(input), item.expected);
  });
}

test("every planned name is a valid custom property within the length limit", () => {
  for (const item of fixture.cases.filter((entry) => entry.expected)) {
    for (const name of Object.values(item.expected)) {
      assert.ok(isValidCssName(name), `${name} must be a valid custom property name`);
      assert.ok(name.length <= CSS_NAME_MAX, `${name} must not exceed ${CSS_NAME_MAX} characters`);
    }
  }
});

test("token prefixes use lowercase ASCII segments joined by single hyphens", () => {
  for (const prefix of ["ds", "my-ds", "ds2", "a"]) assert.equal(isValidTokenPrefix(prefix), true, prefix);
  for (const prefix of ["", "DS", "-ds", "ds-", "ds--x", "1ds", "d_s", "a".repeat(21), null, undefined, 7]) {
    assert.equal(isValidTokenPrefix(prefix), false, String(prefix));
  }
});

test("segment slugs strip accents, collapse separators and trim hyphens", () => {
  assert.equal(slugSegment("Tamaño"), "tamano");
  assert.equal(slugSegment("  Color / Primary--Dark "), "color-primary-dark");
  assert.equal(slugSegment("日本語"), "");
});

test("the variable id encoding is injective and stays inside the css name alphabet", () => {
  const ids = ["VariableID:1:2", "VariableID_3a1_3a2", "a_b", "a__b", "a-b", "a/b", "A", "a", "ñ", "n̈", "_2f", "/"];
  const encoded = ids.map(encodeVariableId);
  assert.equal(new Set(encoded).size, ids.length);
  for (const value of encoded) assert.match(value, /^[A-Za-z0-9_-]+$/);
  assert.throws(() => encodeVariableId("\ud800"), /valid UTF-8/);
});
