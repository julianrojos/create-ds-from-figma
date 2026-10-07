import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { TOKENS_CSS_HEADER } from "../lib/tokens-css.mjs";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/scripts/generate-tokens-css.mjs");
const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const write = (root, relative, value) => {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value, null, 2));
};
const project = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "generate-tokens-css-"));
  roots.push(root);
  write(root, "design-system/tokens/Color.json", { collection: "Color", id: "C", modes: ["Default"], defaultMode: "Default",
    variables: { ink: { id: "c1", cssName: "--ds-ink", type: "COLOR", valuesByMode: { Default: "#000000" } } } });
  write(root, "design-system/relationships/figma-state.json", { tokenPrefix: "ds",
    collections: { C: { name: "Color", modes: ["Default"], varCount: 1, file: "Color.json", modeScopes: {}, serialization: {} } } });
  return root;
};
const run = (root, ...args) => spawnSync(process.execPath, [script, root, ...args], { encoding: "utf8" });
const stylesheet = (root) => readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");

test("the generator writes src/styles/tokens.css and --check confirms it, with identical output on every run", () => {
  const root = project();
  const first = run(root);
  assert.equal(first.status, 0, first.stderr);
  const css = stylesheet(root);
  assert.ok(css.startsWith(TOKENS_CSS_HEADER));
  assert.match(css, /--ds-ink: #000000;/);
  assert.equal(run(root, "--check").status, 0);
  run(root);
  assert.equal(stylesheet(root), css, "regenerating without changes must not change the file");
});

test("--check fails on a hand-edited stylesheet or a missing one and never writes", () => {
  const root = project();
  const missing = run(root, "--check");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /differs from the generated output at line 1/);
  run(root);
  const generated = stylesheet(root);
  write(root, "src/styles/tokens.css", generated.replace("#000000", "#111111"));
  const drifted = run(root, "--check");
  assert.equal(drifted.status, 1);
  assert.match(drifted.stderr, /differs from the generated output at line 4/);
  assert.match(stylesheet(root), /#111111/, "--check must not rewrite the file");
});

test("inconsistent sources stop the generator before anything is written", () => {
  const root = project();
  write(root, "design-system/relationships/figma-state.json", { tokenPrefix: "ds", collections: { C: { file: "Color.json", modeScopes: {}, serialization: {} }, GONE: { file: "Gone.json" } } });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /collection GONE: token JSON is missing/);
  assert.match(result.stderr, /nothing was generated/);
  assert.throws(() => stylesheet(root), /ENOENT/);
});

test("conflicting external snapshots stop the generator before writing", () => {
  const root = project();
  write(root, "design-system/relationships/figma-code-map.json", {
    "F:1": { designSystem: { metadata: "design-system/components/A/metadata.json" } },
    "F:2": { designSystem: { metadata: "design-system/components/B/metadata.json" } },
  });
  write(root, "design-system/components/A/metadata.json", {
    externalVariables: [{ id: "e1", cssName: "--lib-ink", type: "COLOR", value: "#000000" }],
  });
  write(root, "design-system/components/B/metadata.json", {
    externalVariables: [{ id: "e1", cssName: "--lib-ink", type: "COLOR", value: "#ffffff" }],
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /conflicting snapshots for variable e1/);
  assert.throws(() => stylesheet(root), /ENOENT/);
});

test("an invalid mode scope stops the generator before writing", () => {
  const root = project();
  write(root, "design-system/tokens/Color.json", { collection: "Color", id: "C", modes: ["Light", "Dark"], defaultMode: "Light",
    variables: { ink: { id: "c1", cssName: "--ds-ink", type: "COLOR", valuesByMode: { Light: "#000000", Dark: "#ffffff" } } } });
  write(root, "design-system/relationships/figma-state.json", { tokenPrefix: "ds",
    collections: { C: { name: "Color", modes: ["Light", "Dark"], varCount: 1, file: "Color.json", modeScopes: {}, serialization: {} } } });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /modeScopes needs an entry/);
  assert.throws(() => stylesheet(root), /ENOENT/);
});

test("pending FLOAT variables are reported as warnings while the stylesheet is still written", () => {
  const root = project();
  write(root, "design-system/tokens/Space.json", { collection: "Space", id: "S", modes: ["Default"], defaultMode: "Default",
    variables: { gap: { id: "s1", cssName: "--ds-gap", type: "FLOAT", valuesByMode: { Default: 4 } } } });
  write(root, "design-system/relationships/figma-state.json", { tokenPrefix: "ds", collections: {
    C: { file: "Color.json", modeScopes: {}, serialization: {} }, S: { file: "Space.json", modeScopes: {}, serialization: {} } } });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /WARN 1 FLOAT variable\(s\) have no serialization decision/);
  assert.doesNotMatch(stylesheet(root), /--ds-gap/);
});
