import assert from "node:assert/strict";
import { test } from "node:test";
import { createFloatResolver, floatAliasProblems, isLocalAliasVariable, serializationProblems, serializeNumber } from "../lib/serialization.mjs";

const px = { kind: "unit", unit: "px" };
const evidence = { type: "bindings", evidence: [{ node: "FILE:1:3", figmaProperty: "paddingLeft", mode: "Default" }] };
const float = (id, valuesByMode) => ({ id, type: "FLOAT", cssName: `--ds-${id}`, valuesByMode });
const data = (...variables) => ({ variables: Object.fromEntries(variables.map((variable) => [variable.id, variable])) });
const alias = (target) => ({ source: "local", targetVariableId: target, value: 4 });

test("numbers are written with the decided unit, without unit, or scaled, without float noise", () => {
  assert.equal(serializeNumber(4, px), "4px");
  assert.equal(serializeNumber(0.5, { kind: "unitless" }), "0.5");
  assert.equal(serializeNumber(50, { kind: "scale", factor: 0.01, unit: "" }), "0.5");
  assert.equal(serializeNumber(0.1 * 3, { kind: "unitless" }), "0.3");
  assert.equal(serializeNumber("4", px), undefined);
  assert.equal(serializeNumber(4, { kind: "other" }), undefined);
});

test("a valid serialization map is accepted and an empty one means nothing is decided", () => {
  const tokens = data(float("a", { Default: 4 }));
  const ok = serializationProblems({ serialization: { a: { css: px, source: evidence } } }, tokens, "c");
  assert.deepEqual(ok.errors, []);
  assert.deepEqual([...ok.decisions], [["a", px]]);
  assert.deepEqual(serializationProblems({ serialization: {} }, tokens, "c").errors, []);
  assert.deepEqual(serializationProblems({ serialization: { a: { css: px, source: { type: "user" } } } }, tokens, "c").errors, []);
  assert.match(serializationProblems({}, tokens, "c").errors[0], /serialization must be an object/);
});

test("entries for unknown, non-FLOAT or alias variables and malformed entries fail", () => {
  const tokens = data(
    float("a", { Default: 4 }),
    { id: "s", type: "STRING", cssName: "--ds-s", valuesByMode: { Default: "x" } },
    float("b", { Default: alias("a") }),
  );
  const problems = (entries) => serializationProblems({ serialization: entries }, tokens, "c").errors;
  assert.match(problems({ missing: { css: px, source: evidence } })[0], /not a variable of this collection/);
  assert.match(problems({ s: { css: px, source: evidence } })[0], /only defined for FLOAT/);
  assert.match(problems({ b: { css: px, source: evidence } })[0], /inherits the serialization of its targets/);
  for (const entry of [
    { css: { kind: "unit", unit: "furlong" }, source: evidence },
    { css: { kind: "unit" }, source: evidence },
    { css: { kind: "unitless", unit: "px" }, source: evidence },
    { css: { kind: "scale", factor: 0, unit: "" }, source: evidence },
    { css: { kind: "scale", factor: 0.01 }, source: evidence },
    { css: px, source: { type: "bindings", evidence: [] } },
    { css: px, source: { type: "bindings", evidence: [{ node: "FILE:1:3" }] } },
    { css: px, source: { type: "user", evidence: [] } },
    { css: px },
    { css: px, source: evidence, extra: true },
    null,
  ]) {
    assert.equal(problems({ a: entry }).length, 1, JSON.stringify(entry));
  }
});

test("decisions resolve directly, aliases inherit and pending or conflicting targets propagate", () => {
  const variables = new Map([
    ["a", float("a", { Default: 4 })],
    ["b", float("b", { Default: 8 })],
    ["via", float("via", { Light: alias("a"), Dark: alias("a") })],
    ["split", float("split", { Light: alias("a"), Dark: alias("b") })],
    ["loose", float("loose", { Light: alias("pending"), Dark: alias("a") })],
    ["pending", float("pending", { Default: 1 })],
    ["loop1", float("loop1", { Default: alias("loop2") })],
    ["loop2", float("loop2", { Default: alias("loop1") })],
    ["mixed", float("mixed", { Light: alias("a"), Dark: 5 })],
  ]);
  const resolve = createFloatResolver({ variables, decisions: new Map([["a", px], ["b", { kind: "unitless" }]]) });
  assert.deepEqual(resolve("a"), { status: "decided", css: px });
  assert.deepEqual(resolve("pending"), { status: "pending" });
  assert.deepEqual(resolve("via"), { status: "decided", css: px });
  assert.equal(resolve("split").status, "conflict");
  assert.deepEqual(resolve("loose"), { status: "pending" });
  assert.equal(resolve("loop1").status, "conflict");
  assert.deepEqual(resolve("mixed"), { status: "pending" }, "a variable that is not only local aliases needs its own decision");
  assert.deepEqual(resolve("unknown"), { status: "pending" });
});

test("only variables whose every mode is a local alias inherit", () => {
  assert.equal(isLocalAliasVariable({ Default: alias("a") }), true);
  assert.equal(isLocalAliasVariable({ Default: alias("a"), Dark: 5 }), false);
  assert.equal(isLocalAliasVariable({ Default: { source: "external", value: 4 } }), false);
  assert.equal(isLocalAliasVariable({}), false);
});

test("a mixed FLOAT variable may alias only targets that are written with the same serialization", () => {
  const mixed = (decisions) => {
    const variables = new Map([
      ["a", { ...float("a", { Light: 1, Dark: 2 }), file: "S.json" }],
      ["b", { ...float("b", { Light: 2, Dark: alias("a") }), file: "S.json" }],
    ]);
    return floatAliasProblems({ variables, resolveFloat: createFloatResolver({ variables, decisions: new Map(decisions) }) });
  };
  assert.deepEqual(mixed([["a", px], ["b", px]]), []);
  assert.deepEqual(mixed([["a", px]]), [], "an undecided variable is not written, so its aliases are not either");
  assert.match(mixed([["b", px]])[0], /--ds-b: mode "Dark" aliases --ds-a, which has no serialization decision/);
  assert.match(mixed([["a", { kind: "unitless" }], ["b", px]])[0], /different serialization/);
  assert.deepEqual(mixed([["a", { unit: "px", kind: "unit" }], ["b", px]]), [], "key order does not matter");
});
