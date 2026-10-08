import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { TOKENS_CSS_HEADER, cssString, firstDifference, generateTokensCss, renderTokensCss } from "../lib/tokens-css.mjs";

const px = { kind: "unit", unit: "px" };
const evidence = { type: "user" };
const variable = (id, cssName, type, valuesByMode) => ({ id, cssName, type, valuesByMode });
const collection = (file, id, modes, variables, record = {}) => ({
  file,
  data: { collection: file, id, modes, defaultMode: modes[0], variables },
  record: { modeScopes: Object.fromEntries(modes.slice(1).map((mode) => [mode, null])), serialization: {}, ...record },
});
const alias = (target, value) => ({ source: "local", targetVariableId: target, value });

test("every type is written in the default mode, in collection order, with a generated header", () => {
  const { css, errors, warnings } = renderTokensCss({ collections: [
    collection("Text.json", "T", ["Default"], {
      family: variable("t1", "--ds-text-family", "STRING", { Default: "Inter" }),
      on: variable("t2", "--ds-text-on", "BOOLEAN", { Default: true }),
    }),
    collection("Color.json", "C", ["Default"], {
      ink: variable("c1", "--ds-color-ink", "COLOR", { Default: "#000000" }),
      link: variable("c2", "--ds-color-link", "COLOR", { Default: alias("c1", "#000000") }),
    }),
  ] });
  assert.deepEqual([errors, warnings], [[], []]);
  assert.equal(css, `${TOKENS_CSS_HEADER}
:root {
  /* Color.json */
  --ds-color-ink: #000000;
  --ds-color-link: var(--ds-color-ink);
  /* Text.json */
  --ds-text-family: "Inter";
  --ds-text-on: true;
}
`);
});

test("FLOAT variables are written only with a decision, and pending ones are reported", () => {
  const spaces = {
    gap: variable("s1", "--ds-gap", "FLOAT", { Default: 4 }),
    pad: variable("s2", "--ds-pad", "FLOAT", { Default: alias("s1", 4) }),
    free: variable("s3", "--ds-free", "FLOAT", { Default: 9 }),
    sub: variable("s4", "--ds-sub", "FLOAT", { Default: alias("s3", 9) }),
  };
  const withDecision = renderTokensCss({ collections: [collection("Space.json", "S", ["Default"], spaces,
    { serialization: { s1: { css: px, source: evidence } } })] });
  assert.deepEqual(withDecision.errors, []);
  assert.match(withDecision.css, /--ds-gap: 4px;\n {2}--ds-pad: var\(--ds-gap\);\n}/);
  assert.doesNotMatch(withDecision.css, /--ds-free|--ds-sub/);
  assert.match(withDecision.warnings[0], /2 FLOAT variable\(s\) have no serialization decision/);
  const none = renderTokensCss({ collections: [collection("Space.json", "S", ["Default"], spaces)] });
  assert.doesNotMatch(none.css, /--ds-gap|--ds-pad/);
});

test("mode scopes become blocks after :root that list only the values that differ", () => {
  const { css, errors } = renderTokensCss({ collections: [collection("Color.json", "C", ["Light", "Dark", "Print", "Wide"], {
    ink: variable("c1", "--ds-ink", "COLOR", { Light: "#000000", Dark: "#FFFFFF", Print: "#000000", Wide: "#111111" }),
    link: variable("c2", "--ds-link", "COLOR", { Light: alias("c1", "#000000"), Dark: alias("c3", "#AAAAAA"), Print: alias("c1", "#000000"), Wide: alias("c1", "#000000") }),
    soft: variable("c3", "--ds-soft", "COLOR", { Light: "#111111", Dark: "#AAAAAA", Print: "#111111", Wide: "#111111" }),
  }, { modeScopes: {
    Dark: { kind: "selector", value: '[data-theme="dark"]' },
    Print: { kind: "media", query: "print", order: 2 },
    Wide: { kind: "media", query: "(min-width: 80rem)", order: 1 },
  } })] });
  assert.deepEqual(errors, []);
  assert.equal(css.split("\n").slice(1).join("\n"), `:root {
  /* Color.json */
  --ds-ink: #000000;
  --ds-link: var(--ds-ink);
  --ds-soft: #111111;
}
[data-theme="dark"] {
  --ds-ink: #FFFFFF;
  --ds-link: var(--ds-soft);
  --ds-soft: #AAAAAA;
}
@media (min-width: 80rem) {
  :root {
    --ds-ink: #111111;
  }
}
@media print {
  :root {
  }
}
`);
});

test("pending modes produce no block and a decided FLOAT is serialized in each mode", () => {
  const space = collection("Space.json", "S", ["Compact", "Roomy", "Later"], {
    gap: variable("s1", "--ds-gap", "FLOAT", { Compact: 4, Roomy: 8, Later: 12 }),
  }, { serialization: { s1: { css: px, source: evidence } }, modeScopes: { Roomy: { kind: "selector", value: ".roomy" }, Later: null } });
  const { css } = renderTokensCss({ collections: [space] });
  assert.match(css, /\.roomy \{\n {2}--ds-gap: 8px;\n}/);
  assert.doesNotMatch(css, /12px|Later/);
});

test("external snapshots are written sorted and deduplicated, and external FLOAT stays pending", () => {
  const { css, warnings } = renderTokensCss({ collections: [], externals: [
    { id: "e2", cssName: "--lib-b", type: "COLOR", value: "#222222" },
    { id: "e1", cssName: "--lib-a", type: "STRING", value: "x" },
    { id: "e1", cssName: "--lib-a", type: "STRING", value: "x" },
    { id: "e3", cssName: "--lib-gap", type: "FLOAT", value: 4 },
  ] });
  assert.match(css, /external variables[^\n]*\n {2}--lib-a: "x";\n {2}--lib-b: #222222;\n}/);
  assert.doesNotMatch(css, /--lib-gap/);
  assert.match(warnings[0], /external: --lib-gap/);
});

test("conflicting external snapshots and names fail instead of selecting one", () => {
  const sameId = renderTokensCss({ collections: [], externals: [
    { id: "e1", cssName: "--lib-ink", type: "COLOR", value: "#000000" },
    { id: "e1", cssName: "--lib-ink", type: "COLOR", value: "#ffffff" },
  ] });
  assert.ok(sameId.errors.some((message) => message.includes("conflicting snapshots for variable e1")));
  assert.equal(sameId.css, "");

  const sameName = renderTokensCss({ collections: [], externals: [
    { id: "e1", cssName: "--lib-ink", type: "COLOR", value: "#000000" },
    { id: "e2", cssName: "--lib-ink", type: "COLOR", value: "#ffffff" },
  ] });
  assert.ok(sameName.errors.some((message) => message.includes("external cssName --lib-ink conflicts")));
});

test("missing cssName is reported directly and signed zero snapshots agree", () => {
  const missing = renderTokensCss({ collections: [collection("Color.json", "C", ["Default"], {
    a: variable("c1", undefined, "COLOR", { Default: "#000000" }),
    b: variable("c2", undefined, "COLOR", { Default: "#ffffff" }),
  })] });
  assert.equal(missing.errors.filter((message) => message.includes("needs a valid cssName")).length, 2);
  assert.ok(missing.errors.every((message) => !message.includes("duplicate cssName")));

  const zero = renderTokensCss({ collections: [], externals: [
    { id: "e1", cssName: "--lib-gap", type: "FLOAT", value: 0 },
    { id: "e1", cssName: "--lib-gap", type: "FLOAT", value: -0 },
  ] });
  assert.deepEqual(zero.errors, []);
});

test("an invalid mode scope prevents CSS generation", () => {
  const result = renderTokensCss({ collections: [collection("Color.json", "C", ["Light", "Dark"], {
    ink: variable("c1", "--ds-ink", "COLOR", { Light: "#000000", Dark: "#ffffff" }),
  }, { modeScopes: { Dark: { kind: "unknown" } } })] });
  assert.ok(result.errors.some((message) => message.includes('modeScopes["Dark"]')));
  assert.equal(result.css, "");
});

test("the output does not depend on the order of the inputs", () => {
  const one = collection("A.json", "A", ["Default"], { a: variable("a1", "--ds-a", "COLOR", { Default: "#000000" }) });
  const two = collection("B.json", "B", ["Default"], { b: variable("b1", "--ds-b", "COLOR", { Default: "#111111" }) });
  assert.equal(renderTokensCss({ collections: [one, two] }).css, renderTokensCss({ collections: [two, one] }).css);
});

test("an alias with targets that need different serializations is an error and is not written", () => {
  const { css, errors } = renderTokensCss({ collections: [collection("Space.json", "S", ["A", "B"], {
    a: variable("s1", "--ds-a", "FLOAT", { A: 1, B: 1 }),
    b: variable("s2", "--ds-b", "FLOAT", { A: 2, B: 2 }),
    mix: variable("s3", "--ds-mix", "FLOAT", { A: alias("s1", 1), B: alias("s2", 2) }),
  }, { serialization: { s1: { css: px, source: evidence }, s2: { css: { kind: "unitless" }, source: evidence } } })] });
  assert.ok(errors.some((item) => item.includes("its alias targets need different serializations")));
  assert.doesNotMatch(css, /--ds-mix/);
});

test("a mixed FLOAT alias to a pending or differently serialized target is an error", () => {
  const space = (serialization) => collection("Space.json", "S", ["Light", "Dark"], {
    a: variable("a", "--ds-a", "FLOAT", { Light: 1, Dark: 2 }),
    b: variable("b", "--ds-b", "FLOAT", { Light: 2, Dark: alias("a", 1) }),
  }, { serialization, modeScopes: { Dark: { kind: "selector", value: '[data-theme="dark"]' } } });
  assert.deepEqual(renderTokensCss({ collections: [space({ a: { css: px, source: evidence }, b: { css: px, source: evidence } })] }).errors, []);
  const pending = renderTokensCss({ collections: [space({ b: { css: px, source: evidence } })] });
  assert.ok(pending.errors.some((item) => item.includes("--ds-b: mode \"Dark\" aliases --ds-a, which has no serialization decision")));
  const unitless = renderTokensCss({ collections: [space({ a: { css: { kind: "unitless" }, source: evidence }, b: { css: px, source: evidence } })] });
  assert.ok(unitless.errors.some((item) => item.includes("different serialization")));
});

test("local alias cycles are errors, including a variable that points to itself", () => {
  const { errors } = renderTokensCss({ collections: [collection("Color.json", "C", ["Default"], {
    a: variable("a", "--ds-a", "COLOR", { Default: alias("b", "#000000") }),
    b: variable("b", "--ds-b", "COLOR", { Default: alias("a", "#000000") }),
    s: variable("s", "--ds-s", "COLOR", { Default: alias("s", "#000000") }),
  })] });
  assert.equal(errors.filter((item) => item.includes("local alias cycle")).length, 2);
});

test("a cycle across collections that can be active together is an error", () => {
  const { errors } = renderTokensCss({ collections: [
    collection("A.json", "A", ["Light", "Dark"], { a: variable("a", "--ds-a", "COLOR", { Light: "#000000", Dark: alias("b", "#000000") }) },
      { modeScopes: { Dark: { kind: "selector", value: ':root[data-theme="dark"]' } } }),
    collection("B.json", "B", ["Wide", "Narrow"], { b: variable("b", "--ds-b", "COLOR", { Wide: "#111111", Narrow: alias("a", "#000000") }) },
      { modeScopes: { Narrow: { kind: "media", query: "(max-width: 40rem)", order: 1 } } }),
  ] });
  assert.ok(errors.some((item) => item.includes("active together")));
});

test("a cross-collection cycle between mutually exclusive scopes is not an error, and an unproven one is a warning", () => {
  const pair = (second, first = { kind: "selector", value: ':root[data-theme="dark"]' }) => renderTokensCss({ collections: [
    collection("A.json", "A", ["Light", "Dark"], { a: variable("a", "--ds-a", "COLOR", { Light: "#000000", Dark: alias("b", "#000000") }) },
      { modeScopes: { Dark: first } }),
    collection("B.json", "B", ["Light", "Dark"], { b: variable("b", "--ds-b", "COLOR", { Light: "#111111", Dark: alias("a", "#000000") }) },
      { modeScopes: { Dark: second } }),
  ] });
  const exclusive = pair({ kind: "selector", value: ':root[data-theme="light"]' });
  assert.deepEqual([exclusive.errors, exclusive.warnings], [[], []]);
  const unproven = pair({ kind: "media", query: "(min-width: 60rem)", order: 1 }, { kind: "media", query: "(max-width: 40rem)", order: 1 });
  assert.deepEqual(unproven.errors, []);
  assert.ok(unproven.warnings.some((item) => item.includes("NOT VERIFIED") && item.includes("local alias cycle")));
});

test("strings are escaped as CSS strings", () => {
  assert.equal(cssString("Inter"), '"Inter"');
  assert.equal(cssString('a"b\\c'), '"a\\"b\\\\c"');
  assert.equal(cssString("a\nb"), '"a\\a b"');
});

test("the first difference between two stylesheets is reported by line", () => {
  assert.equal(firstDifference("a\nb\n", "a\nb\n"), null);
  assert.deepEqual(firstDifference("a\nx\n", "a\nb\n"), { line: 2, actual: "x", expected: "b" });
});

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const write = (root, relative, value) => {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(value, null, 2));
};

test("generation from disk joins state records, token JSON and external snapshots, and reports missing sources", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tokens-css-"));
  roots.push(root);
  const token = { collection: "Color", id: "C", modes: ["Default"], defaultMode: "Default",
    variables: { ink: variable("c1", "--ds-ink", "COLOR", { Default: "#000000" }) } };
  write(root, "design-system/tokens/Color.json", token);
  write(root, "design-system/relationships/figma-state.json", { collections: { C: { name: "Color", modes: ["Default"], varCount: 1, file: "Color.json", modeScopes: {}, serialization: {} } } });
  write(root, "design-system/relationships/figma-code-map.json", { "F:1": { name: "Button", designSystem: { metadata: "design-system/components/Button/metadata.json" } } });
  write(root, "design-system/components/Button/metadata.json", { externalVariables: [{ id: "e1", cssName: "--lib-surface", type: "COLOR", value: "#112233" }] });
  const ok = generateTokensCss(root);
  assert.deepEqual(ok.errors, []);
  assert.match(ok.css, /--ds-ink: #000000;/);
  assert.match(ok.css, /--lib-surface: #112233;/);
  write(root, "design-system/relationships/figma-state.json", { collections: { C: { file: "Color.json" }, GONE: { file: "Gone.json" } } });
  assert.ok(generateTokensCss(root).errors.some((item) => item.includes("collection GONE: token JSON is missing")));
});

test("external snapshots enter generated CSS only after the component is registered in the map", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tokens-css-map-order-"));
  roots.push(root);
  write(root, "design-system/relationships/figma-state.json", { collections: {} });
  write(root, "design-system/components/Button/metadata.json", {
    externalVariables: [{ id: "e1", cssName: "--lib-surface", type: "COLOR", value: "#112233" }],
  });
  const premature = generateTokensCss(root);
  assert.equal(premature.css, "");
  assert.ok(premature.errors.some((message) => message.includes("has externalVariables but is not registered")));
  write(root, "design-system/relationships/figma-code-map.json", {
    "F:1": { name: "Button", designSystem: { metadata: "design-system/components/Button/metadata.json" } },
  });
  assert.match(generateTokensCss(root).css, /--lib-surface: #112233;/);
});

test("malformed external snapshot lists stop CSS generation with the record path", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tokens-css-bad-external-"));
  roots.push(root);
  const metadataPath = "design-system/components/Button/metadata.json";
  write(root, "design-system/relationships/figma-state.json", { collections: {} });
  write(root, metadataPath, { externalVariables: {} });
  const unmapped = generateTokensCss(root);
  assert.equal(unmapped.css, "");
  assert.ok(unmapped.errors.some((message) => message.includes(`${metadataPath}: externalVariables must be a list`)));

  write(root, "design-system/relationships/figma-code-map.json", {
    "F:1": { name: "Button", designSystem: { metadata: metadataPath } },
  });
  const mapped = generateTokensCss(root);
  assert.equal(mapped.css, "");
  assert.ok(mapped.errors.some((message) => message.includes(`${metadataPath}: externalVariables must be a list`)));
});
