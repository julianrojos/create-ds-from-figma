import assert from "node:assert/strict";
import { test } from "node:test";
import { aliasCycleProblems } from "../lib/alias-cycles.mjs";

const alias = (target) => ({ source: "local", targetVariableId: target, value: "#000000" });
const color = (id, valuesByMode) => ({ id, cssName: `--ds-${id}`, type: "COLOR", valuesByMode });
const collection = (file, id, modes, variables, modeScopes) => ({
  file,
  data: { collection: file, id, modes, defaultMode: modes[0], variables: Object.fromEntries(variables.map((variable) => [variable.id, variable])) },
  record: modeScopes ? { modeScopes } : undefined,
});
const selector = (value) => ({ kind: "selector", value });
const media = (query, order) => ({ kind: "media", query, order });

test("chains, shared targets and external aliases are not cycles", () => {
  assert.deepEqual(aliasCycleProblems([collection("C.json", "C", ["Default"], [
    color("a", { Default: alias("b") }),
    color("b", { Default: alias("c") }),
    color("c", { Default: "#111111" }),
    color("d", { Default: alias("c") }),
    color("e", { Default: { source: "external", targetVariableId: "other", value: "#222222" } }),
  ], {})]), { errors: [], warnings: [] });
});

test("a self alias and a longer loop are each reported once", () => {
  const { errors } = aliasCycleProblems([collection("C.json", "C", ["Default"], [
    color("s", { Default: alias("s") }),
    color("a", { Default: alias("b") }),
    color("b", { Default: alias("c") }),
    color("c", { Default: alias("a") }),
    color("tail", { Default: alias("a") }),
  ], {})]);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /--ds-s -> --ds-s in mode "Default"/);
  assert.match(errors[1], /--ds-a -> --ds-b -> --ds-c -> --ds-a/);
});

test("a cycle that exists in only one mode is found, and mixed modes without a loop are not", () => {
  const dark = collection("C.json", "C", ["Light", "Dark"], [
    color("a", { Light: "#000000", Dark: alias("b") }),
    color("b", { Light: alias("a"), Dark: alias("a") }),
  ], { Dark: selector('[data-theme="dark"]') });
  const { errors } = aliasCycleProblems([dark]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /in mode "Dark"/);
  assert.deepEqual(aliasCycleProblems([collection("C.json", "C", ["Light", "Dark"], [
    color("a", { Light: "#000000", Dark: "#111111" }),
    color("b", { Light: alias("a"), Dark: alias("a") }),
  ], { Dark: null })]), { errors: [], warnings: [] });
});

test("a cycle across collections is found", () => {
  const { errors } = aliasCycleProblems([
    collection("A.json", "A", ["Default"], [color("a", { Default: alias("b") })], {}),
    collection("B.json", "B", ["Default"], [color("b", { Default: alias("a") })], {}),
  ]);
  assert.equal(errors.length, 1);
});

const crossing = (first, second) => aliasCycleProblems([
  collection("A.json", "A", ["Light", "Dark"], [color("a", { Light: "#000000", Dark: alias("b") })], { Dark: first }),
  collection("B.json", "B", ["Wide", "Narrow"], [color("b", { Wide: "#111111", Narrow: alias("a") })], { Narrow: second }),
]);

test("scopes that certainly coexist make a cross-collection cycle an error", () => {
  for (const [first, second] of [
    [selector(':root[data-theme="dark"]'), selector(':root[data-density="compact"]')],
    [selector(':root[data-theme="dark"]'), media("(max-width: 40rem)", 1)],
    [media("print", 1), selector(".narrow")],
  ]) {
    const { errors, warnings } = crossing(first, second);
    assert.equal(errors.length, 1, JSON.stringify([first, second]));
    assert.match(errors[0], /--ds-a -> --ds-b -> --ds-a when mode "Dark" of A\.json and mode "Narrow" of B\.json are active together/);
    assert.deepEqual(warnings, []);
  }
});

test("scopes that exclude each other make the cycle unrealizable", () => {
  assert.deepEqual(crossing(selector(':root[data-theme="dark"]'), selector(':root[data-theme="light"]')), { errors: [], warnings: [] });
  assert.deepEqual(crossing(selector('[data-theme=dark]'), selector('[data-theme="light"]')), { errors: [], warnings: [] });
});

test("when coexistence is not proven the cycle is a warning, not an error", () => {
  for (const [first, second] of [
    [media("(max-width: 40rem)", 1), media("(min-width: 60rem)", 1)],
    [selector("html.dark > body"), selector(".narrow")],
    [selector(":root[data-theme=dark]"), selector("html[data-theme=light]")],
    [selector(":root[data-theme=dark]"), undefined],
  ]) {
    const { errors, warnings } = crossing(first, second);
    assert.deepEqual(errors, [], JSON.stringify([first, second]));
    assert.equal(warnings.length, 1, JSON.stringify([first, second]));
    assert.match(warnings[0], /NOT VERIFIED/);
  }
});

test("a mode without a CSS scope yet writes nothing, so it cannot close a cycle", () => {
  assert.deepEqual(crossing(selector(':root[data-theme="dark"]'), null), { errors: [], warnings: [] });
});

test("edges that would need two modes of the same collection at once are not a cycle", () => {
  assert.deepEqual(aliasCycleProblems([
    collection("A.json", "A", ["Light", "Dark"], [
      color("a", { Light: "#000000", Dark: alias("b") }),
      color("b", { Light: alias("a"), Dark: "#111111" }),
    ], { Dark: selector('[data-theme="dark"]') }),
  ]), { errors: [], warnings: [] });
});

test("the case-insensitive flag makes values that differ only by ASCII case coexist", () => {
  const { errors } = crossing(selector(":root[data-theme=dark i]"), selector(":root[data-theme=DARK]"));
  assert.equal(errors.length, 1);
  assert.deepEqual(crossing(selector(":root[data-theme=dark]"), selector(":root[data-theme=DARK]")), { errors: [], warnings: [] });
  assert.equal(crossing(selector(':root[data-theme="dark" s]'), selector(":root[data-theme=DARK i]")).errors.length, 1);
});

test("a default-mode edge does not hold while a shared scope overrides it", () => {
  const dark = selector(':root[data-theme="dark"]');
  const shared = (aDark) => aliasCycleProblems([
    collection("A.json", "A", ["Light", "Dark"], [color("a", { Light: alias("b"), Dark: aDark })], { Dark: dark }),
    collection("B.json", "B", ["Light", "Dark"], [color("b", { Light: "#111111", Dark: alias("a") })], { Dark: dark }),
  ]);
  assert.deepEqual(shared("#000000"), { errors: [], warnings: [] }, "Dark of A replaces the default whenever Dark of B applies");
  assert.equal(shared(alias("b")).errors.length, 1, "if Dark of A also aliases b the cycle is real");
});

test("a default-mode edge next to an unreadable overriding scope is not ruled out", () => {
  const { errors, warnings } = aliasCycleProblems([
    collection("A.json", "A", ["Light", "Dark"], [color("a", { Light: alias("b"), Dark: "#000000" })], { Dark: selector("html.dark > body") }),
    collection("B.json", "B", ["Light", "Dark"], [color("b", { Light: "#111111", Dark: alias("a") })], { Dark: selector(":root[data-theme=dark]") }),
  ]);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
});

test("equivalent spellings of one scope are the same scope, but attribute values keep their spaces", () => {
  const shared = (aScope, bScope) => aliasCycleProblems([
    collection("A.json", "A", ["Light", "Dark"], [color("a", { Light: alias("b"), Dark: "#000000" })], { Dark: aScope }),
    collection("B.json", "B", ["Light", "Dark"], [color("b", { Light: "#111111", Dark: alias("a") })], { Dark: bScope }),
  ]);
  assert.deepEqual(shared(selector(':root[data-theme="dark"]'), selector(":root[data-theme=dark]")), { errors: [], warnings: [] });
  assert.deepEqual(shared(selector(" :root[data-theme='dark']"), selector(':root[data-theme="dark"]')), { errors: [], warnings: [] });
  assert.deepEqual(shared(selector(":root.x[b=1][a=2]"), selector(":root.x[a=2][b=1]")), { errors: [], warnings: [] });
  // "a  b" and "a b" are different attribute values: the scopes exclude each other, so the default edge holds and the cycle is real.
  assert.equal(shared(selector(':root[data-state="a b"]'), selector(':root[data-state="a  b"]')).errors.length, 1);
  assert.equal(shared(selector(".dark"), selector(".light")).errors.length, 1);
});

test("a more specific scope activates the more general one, so it also overrides the default edge", () => {
  const pair = (aScope, bScope) => aliasCycleProblems([
    collection("A.json", "A", ["Light", "Dark"], [color("a", { Light: alias("b"), Dark: "#000000" })], { Dark: aScope }),
    collection("B.json", "B", ["Light", "Dark"], [color("b", { Light: "#111111", Dark: alias("a") })], { Dark: bScope }),
  ]);
  const dark = selector(":root[data-theme=dark]");
  const compact = selector(":root[data-theme=dark][data-density=compact]");
  assert.deepEqual(pair(dark, compact), { errors: [], warnings: [] }, "compact implies dark");
  assert.equal(pair(compact, dark).errors.length, 1, "dark does not imply compact: a world with only dark keeps the default edge");
  assert.deepEqual(pair(selector(":root.x[a=1]"), selector(":root.x.y[a=1][b=2]")), { errors: [], warnings: [] });
  assert.equal(pair(selector(":root[a=1]"), selector(":root[a=2][b=2]")).errors.length, 1);
  assert.deepEqual(pair(selector(":root[a=dark i]"), selector(":root[a=DARK][b=2]")), { errors: [], warnings: [] }, "a case-sensitive value matches under `i`");
  assert.equal(pair(selector(":root[a=dark]"), selector(":root[a=dark i][b=2]")).errors.length, 1, "an `i` condition also matches values the general one does not");
});

test("conclusive evidence for a cycle replaces an earlier warning for the same variables", () => {
  const three = () => aliasCycleProblems([
    collection("A.json", "A", ["Base", "X", "Y"], [color("a", { Base: "#000000", X: alias("b"), Y: alias("b") })],
      { X: media("(max-width: 40rem)", 1), Y: selector(":root[data-theme=dark]") }),
    collection("B.json", "B", ["Base", "X", "Y"], [color("b", { Base: "#111111", X: alias("a"), Y: alias("a") })],
      { X: media("(min-width: 60rem)", 1), Y: media("print", 2) }),
  ]);
  const { errors, warnings } = three();
  assert.equal(errors.length, 1, "theme selector + print media can coexist: proven");
  assert.deepEqual(warnings, [], "the earlier NOT VERIFIED report for the same variables is replaced");
  assert.match(errors[0], /mode "Y" of A\.json and mode "X" of B\.json/);
});
