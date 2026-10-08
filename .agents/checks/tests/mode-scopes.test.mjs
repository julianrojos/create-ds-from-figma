import assert from "node:assert/strict";
import { test } from "node:test";
import postcss from "postcss";
import { modeDeclarationProblems, modeScopeProblems } from "../lib/mode-scopes.mjs";

const data = (variables = {}, modes = ["Light", "Dark", "Print"]) => ({ modes, defaultMode: modes[0], variables });
const dark = { kind: "selector", value: '[data-theme="dark"]' };
const print = { kind: "media", query: "print", order: 1 };

test("a scope per non-default mode is valid, null is pending and the default mode needs none", () => {
  assert.deepEqual(modeScopeProblems({ modeScopes: { Dark: dark, Print: print } }, data(), "c"), { errors: [], warnings: [] });
  const pending = modeScopeProblems({ modeScopes: { Dark: null, Print: print } }, data(), "c");
  assert.deepEqual(pending.errors, []);
  assert.match(pending.warnings[0], /mode "Dark" has no CSS scope yet; its values are NOT VERIFIED/);
  assert.deepEqual(modeScopeProblems({ modeScopes: {} }, data({}, ["Only"]), "c"), { errors: [], warnings: [] });
});

test("missing, orphan and default-mode entries fail", () => {
  assert.match(modeScopeProblems({ modeScopes: { Dark: dark } }, data(), "c").errors[0], /needs an entry \(or null\) for mode "Print"/);
  assert.match(modeScopeProblems({ modeScopes: { Dark: dark, Print: print, Light: dark } }, data(), "c").errors[0], /"Light", which is not a non-default mode/);
  assert.match(modeScopeProblems({ modeScopes: { Dark: dark, Print: print, Gone: null } }, data(), "c").errors[0], /"Gone"/);
  assert.match(modeScopeProblems({}, data(), "c").errors[0], /modeScopes must be an object/);
  assert.match(modeScopeProblems({ modeScopes: [] }, data(), "c").errors[0], /modeScopes must be an object/);
});

test("scopes must be one selector or one balanced media query with a positive integer order", () => {
  const invalid = [
    { kind: "selector", value: ":root" },
    { kind: "selector", value: ".a, .b" },
    { kind: "selector", value: "" },
    { kind: "selector", value: ".a { color: red }" },
    { kind: "selector", value: ".a", extra: 1 },
    { kind: "media", query: "(min-width: 768px", order: 1 },
    { kind: "media", query: "@media print", order: 1 },
    { kind: "media", query: "print", order: 0 },
    { kind: "media", query: "print", order: 1.5 },
    { kind: "media", query: "print" },
    { kind: "class", value: ".a" },
    "dark",
  ];
  for (const scope of invalid) {
    assert.equal(modeScopeProblems({ modeScopes: { Dark: scope, Print: null } }, data(), "c").errors.length, 1, JSON.stringify(scope));
  }
  assert.equal(modeScopeProblems({ modeScopes: { Dark: { kind: "selector", value: ':root[data-theme="dark"]' }, Print: print } }, data(), "c").errors.length, 0);
});

test("two modes cannot share a selector or a media order", () => {
  assert.match(modeScopeProblems({ modeScopes: { Dark: dark, Print: dark } }, data(), "c").errors[0], /share the scope/);
  const wide = { kind: "media", query: "(min-width: 1px)", order: 1 };
  assert.match(modeScopeProblems({ modeScopes: { Dark: wide, Print: print } }, data(), "c").errors[0], /share media order 1/);
});

const colors = () => data({
  ink: { id: "V1", cssName: "--ds-ink", type: "COLOR", valuesByMode: { Light: "#000000", Dark: "#FFFFFF", Print: "#000000" } },
  link: { id: "V2", cssName: "--ds-link", type: "COLOR", valuesByMode: {
    Light: { source: "local", targetVariableId: "V1", value: "#000000" },
    Dark: { source: "local", targetVariableId: "V3", value: "#AAAAAA" },
    Print: { source: "local", targetVariableId: "V1", value: "#000000" } } },
  soft: { id: "V3", cssName: "--ds-soft", type: "COLOR", valuesByMode: { Light: "#111111", Dark: "#AAAAAA", Print: "#111111" } },
});
const cssNameOf = (id) => ({ V1: "--ds-ink", V2: "--ds-link", V3: "--ds-soft" })[id];
const check = (css, scopes = { Dark: dark, Print: print }, tokens = colors()) => modeDeclarationProblems({
  root: postcss.parse(css), collections: [{ label: "tokens/Color.json", record: { modeScopes: scopes }, data: tokens }], cssNameOf });
const base = ":root { --ds-ink: #000000; --ds-link: var(--ds-ink); --ds-soft: #111111; }";
const good = `${base} [data-theme="dark"] { --ds-ink: #ffffff; --ds-link: var(--ds-soft); --ds-soft: #AAAAAA; } @media print { :root { } }`;

test("scoped CSS that matches each mode value passes, and values equal to the default may be omitted", () => {
  assert.deepEqual(check(good), { errors: [], warnings: [] });
});

test("a differing value that is missing or wrong in a scoped block fails", () => {
  const missing = check(`${base} [data-theme="dark"] { --ds-ink: #FFFFFF; --ds-soft: #AAAAAA; } @media print { :root { } }`);
  assert.ok(missing.errors.some((item) => item.includes("link: mode \"Dark\" differs from the default but --ds-link is not declared")));
  const wrong = check(good.replace("--ds-ink: #ffffff", "--ds-ink: #EEEEEE"));
  assert.ok(wrong.errors.some((item) => item.includes("--ds-ink in mode \"Dark\" is #EEEEEE, expected #FFFFFF")));
  const redundant = check(good.replace("@media print { :root { } }", "@media print { :root { --ds-ink: #123456; } }"));
  assert.ok(redundant.errors.some((item) => item.includes("--ds-ink in mode \"Print\" is #123456, expected #000000")));
});

test("a missing block, a block before the base and descending media order fail", () => {
  assert.ok(check(base).errors.some((item) => item.includes('no CSS block for mode "Dark"')));
  assert.ok(check(`[data-theme="dark"] { --ds-ink: #FFFFFF; } ${base} @media print { :root { } }`).errors.some((item) => item.includes("must come after the base :root block")));
  const wide = { kind: "media", query: "(min-width: 1px)", order: 2 };
  const text = `${base} @media (min-width: 1px) { :root { --ds-ink: #FFFFFF; --ds-link: var(--ds-soft); --ds-soft: #AAAAAA; } } @media print { :root { } }`;
  assert.ok(check(text, { Dark: wide, Print: print }).errors.some((item) => item.includes("ascending order")));
  assert.deepEqual(check(text, { Dark: { ...wide, order: 1 }, Print: { ...print, order: 2 } }).errors.length, 0);
});

test("duplicate declarations in a block fail and pending modes are not checked", () => {
  assert.ok(check(good.replace("--ds-soft: #AAAAAA;", "--ds-soft: #AAAAAA; --ds-soft: #AAAAAA;")).errors.some((item) => item.includes("duplicate --ds-soft")));
  assert.deepEqual(check(base, { Dark: null, Print: null }), { errors: [], warnings: [] });
});

test("types other than COLOR are reported as not verified instead of passing silently", () => {
  const tokens = data({ gap: { id: "V9", cssName: "--ds-gap", type: "FLOAT", valuesByMode: { Light: 4, Dark: 8, Print: 4 } } });
  const result = check(`:root { --ds-gap: 4px; } [data-theme="dark"] { --ds-gap: 8px; } @media print { :root { } }`, undefined, tokens);
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings[0], /only COLOR values and FLOAT values with a serialization decision/);
});
