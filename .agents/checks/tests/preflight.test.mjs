import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { MISSING_PREFIX_MESSAGE } from "../lib/design-system-state.mjs";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/scripts/preflight-token-files.mjs");
const roots = [];
const write = (root, relative, value) => {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value, null, 2));
};
const project = (files = {}) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "token-preflight-"));
  roots.push(root);
  for (const [relative, value] of Object.entries(files)) write(root, relative, value);
  return root;
};
const run = (root, input) => spawnSync(process.execPath, [script, root], { input: JSON.stringify(input), encoding: "utf8" });
const state = (extra = {}) => ({ tokenPrefix: null, collections: {}, variables: {}, components: {}, ...extra });
const statePath = "design-system/relationships/figma-state.json";
const variable = (id, name) => ({ id, name });
const collection = (id, name, ...variables) => ({ id, name, variables });
const tokenJson = (id, name, variables) => ({ collection: name, id, modes: ["Default"], defaultMode: "Default", variables });
const token = (id, cssName) => ({ id, cssName, type: "COLOR", valuesByMode: { Default: "#000000" } });
const fixed = (extra = {}) => state({ tokenPrefix: "ds", ...extra });

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("a blank project proposes the default prefix and names every variable", () => {
  const root = project({ [statePath]: state() });
  const result = run(root, { collections: [collection("C1", "Color Primitives", variable("V1", "Slate/100"))] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    tokenPrefix: { value: "ds", source: "default" },
    files: { C1: "Color Primitives.json" },
    variables: { V1: "--ds-color-primitives-slate-100" },
    diagnostics: { missingRegistered: [], registeredIdsNotInInput: [] },
  });
  assert.equal(JSON.parse(readFileSync(path.join(root, statePath), "utf8")).tokenPrefix, null, "the preflight never writes the state");
});

test("a requested prefix is used for a new design system and validated", () => {
  const root = project({ [statePath]: state() });
  const ok = run(root, { tokenPrefix: "sds", collections: [collection("C1", "Color", variable("V1", "Brand"))] });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout).tokenPrefix, { value: "sds", source: "input" });
  assert.equal(JSON.parse(ok.stdout).variables.V1, "--sds-color-brand");
  const bad = run(root, { tokenPrefix: "SDS", collections: [] });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /requested tokenPrefix "SDS" is not a valid prefix/);
  assert.equal(bad.stdout, "");
});

test("a fixed prefix is reused, and a different requested prefix fails instead of being ignored", () => {
  const root = project({ [statePath]: fixed() });
  const reused = run(root, { collections: [collection("C1", "Color", variable("V1", "Brand"))] });
  assert.deepEqual(JSON.parse(reused.stdout).tokenPrefix, { value: "ds", source: "state" });
  assert.equal(run(root, { tokenPrefix: "ds", collections: [] }).status, 0);
  const different = run(root, { tokenPrefix: "sds", collections: [collection("C1", "Color", variable("V1", "Brand"))] });
  assert.equal(different.status, 1);
  assert.match(different.stderr, /tokenPrefix ds is already fixed; sds was requested/);
  assert.equal(different.stdout, "");
});

test("published names without a fixed prefix fail with the shared message, and passing a prefix does not help", () => {
  const evidence = {
    "registered collection": { [statePath]: state({ collections: { C1: { name: "Color", file: "Color.json" } } }) },
    "token JSON": { [statePath]: state(), "design-system/tokens/Color.json": tokenJson("C1", "Color", {}) },
    "declaration in :root": { [statePath]: state(), "src/styles/tokens.css": ":root { --x: 1; }" },
    "declaration outside :root": { [statePath]: state(), "src/styles/tokens.css": "@media (min-width: 1px) { .a { --x: 1; } }" },
    "numeric custom property": { [statePath]: state(), "src/styles/tokens.css": ":root { --1x: 1; }" },
    "Unicode custom property": { [statePath]: state(), "src/styles/tokens.css": ":root { --é: 1; }" },
    "component in the map": { [statePath]: state(), "design-system/relationships/figma-code-map.json": { "F:1": { name: "Button" } } },
    "component in the state": { [statePath]: state({ components: { Button: {} } }) },
    "component folder": { [statePath]: state(), "design-system/components/Button/usage.md": "# Button\n" },
  };
  for (const [label, files] of Object.entries(evidence)) {
    const root = project(files);
    for (const input of [{ collections: [] }, { tokenPrefix: "ds", collections: [] }]) {
      const result = run(root, input);
      assert.equal(result.status, 1, `${label} must fail`);
      assert.ok(result.stderr.includes(MISSING_PREFIX_MESSAGE), `${label} must use the shared message`);
      assert.equal(result.stdout, "");
    }
  }
});

test("valid CSS names outside the generated naming convention do not block the preflight", () => {
  const root = project({
    [statePath]: fixed(),
    "src/styles/tokens.css": ":root { --1x: 1; --é: 2; --ds-color-brand: #000000; }",
  });
  const result = run(root, { collections: [collection("C1", "Color", variable("V1", "Brand"), variable("V2", "Ink"))] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).variables, {
    V1: "--ds-color-brand-V1",
    V2: "--ds-color-ink",
  });
});

test("an assigned css name survives a rename in Figma and new variables avoid it", () => {
  const root = project({
    [statePath]: fixed({ collections: { C1: { name: "Color", file: "Color.json" } } }),
    "design-system/tokens/Color.json": tokenJson("C1", "Color", { "Brand/Primary": token("V1", "--ds-color-brand-primary") }),
  });
  const result = run(root, { collections: [collection("C1", "Renamed Colors", variable("V1", "Main brand"), variable("V2", "Brand Primary"))] });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.variables.V1, "--ds-color-brand-primary");
  assert.match(output.variables.V2, /^--ds-renamed-colors-brand-primary$/);
  assert.equal(output.files.C1, "Color.json");
});

test("declarations without an owner and external snapshots reserve their names", () => {
  const root = project({
    [statePath]: fixed(),
    "src/styles/tokens.css": ":root { --ds-color-brand: red; --ds-color-ink: black; }",
    "design-system/relationships/figma-code-map.json": { "F:1": { name: "Button", designSystem: { metadata: "design-system/components/Button/metadata.json" } } },
    "design-system/components/Button/metadata.json": { externalVariables: [{ id: "E1", cssName: "--ds-color-ink" }] },
  });
  const result = run(root, { collections: [collection("C1", "Color", variable("V1", "Brand"), variable("V2", "Ink"), variable("V3", "Free"))] });
  assert.equal(result.status, 0, result.stderr);
  const names = JSON.parse(result.stdout).variables;
  assert.match(names.V1, /^--ds-color-brand-V1$/);
  assert.match(names.V2, /^--ds-color-ink-V2$/);
  assert.equal(names.V3, "--ds-color-free");
});

test("malformed external snapshots identify their component record", () => {
  const metadataPath = "design-system/components/Button/metadata.json";
  const root = project({
    [statePath]: fixed(),
    "design-system/relationships/figma-code-map.json": { "F:1": { name: "Button", designSystem: { metadata: metadataPath } } },
    [metadataPath]: { externalVariables: {} },
  });
  const input = { collections: [collection("C1", "Color", variable("V1", "Brand"))] };
  const malformedList = run(root, input);
  assert.equal(malformedList.status, 1);
  assert.match(malformedList.stderr, /design-system\/components\/Button\/metadata\.json: externalVariables must be a list/);
  assert.equal(malformedList.stdout, "");

  write(root, metadataPath, { externalVariables: [{ id: "E1", cssName: "--1x" }] });
  const invalidName = run(root, input);
  assert.equal(invalidName.status, 1);
  assert.match(invalidName.stderr, /design-system\/components\/Button\/metadata\.json: externalVariables\[0\]\.cssName must be a valid DS custom property name/);
  assert.equal(invalidName.stdout, "");
});

test("invalid token CSS names its file in the preflight error", () => {
  const root = project({ [statePath]: fixed(), "src/styles/tokens.css": ":root { --unfinished: 1" });
  const result = run(root, { collections: [] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/styles\/tokens\.css: invalid CSS: Unclosed block/);
  assert.equal(result.stdout, "");
});

test("a first import with only external variables fixes the prefix and the next import reuses it", () => {
  const root = project({
    [statePath]: state(),
    "design-system/relationships/figma-code-map.json": { "F:1": { name: "Button", designSystem: { metadata: "design-system/components/Button/metadata.json" } } },
    "design-system/components/Button/metadata.json": { externalVariables: [{ id: "E1", cssName: "--lib-surface" }] },
  });
  const first = run(root, { collections: [] });
  assert.equal(first.status, 1, "an imported component without a prefix is inconsistent");
  write(root, statePath, fixed({ components: { Button: {} } }));
  const second = run(root, { collections: [collection("C1", "Color", variable("V1", "Surface"))] });
  assert.equal(second.status, 0, second.stderr);
  const output = JSON.parse(second.stdout);
  assert.deepEqual(output.tokenPrefix, { value: "ds", source: "state" });
  assert.equal(output.variables.V1, "--ds-color-surface");
  assert.equal(run(root, { tokenPrefix: "other", collections: [] }).status, 1);
});

test("a new design system gets its prefix on the first call and fixing it makes the second call stable", () => {
  const root = project({ [statePath]: state() });
  const first = JSON.parse(run(root, { collections: [collection("C1", "Color", variable("V1", "Brand"))] }).stdout);
  assert.deepEqual(first.tokenPrefix, { value: "ds", source: "default" });
  write(root, statePath, fixed({ collections: { C1: { name: "Color", file: first.files.C1 } } }));
  write(root, `design-system/tokens/${first.files.C1}`, tokenJson("C1", "Color", { Brand: token("V1", first.variables.V1) }));
  const second = JSON.parse(run(root, { collections: [collection("C1", "Color", variable("V1", "Brand"), variable("V2", "Accent"))] }).stdout);
  assert.deepEqual(second.tokenPrefix, { value: "ds", source: "state" });
  assert.equal(second.variables.V1, first.variables.V1);
  assert.equal(second.variables.V2, "--ds-color-accent");
});

test("the preflight stops before an unregistered JSON can be overwritten", () => {
  const root = project({ [statePath]: fixed(), "design-system/tokens/Color.json": tokenJson("old", "Color", {}) });
  const result = run(root, { collections: [collection("new", "Color")] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unregistered token JSON Color\.json/);
});

test("a registered ID missing from this input is kept and reported", () => {
  const root = project({
    [statePath]: fixed({ collections: { old: { file: "Old.json" } } }),
    "design-system/tokens/Old.json": tokenJson("old", "Old", {}),
  });
  const result = run(root, { collections: [collection("new", "New")] });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.files, { old: "Old.json", new: "New.json" });
  assert.deepEqual(output.diagnostics, { missingRegistered: [], registeredIdsNotInInput: [{ id: "old", file: "Old.json" }] });
  assert.match(result.stderr, /warning: collection old is registered but not in this preflight input; its file is kept/);
});

test("an empty registered collection can be rebuilt, but a collection with published variables must be restored", () => {
  const root = project({ [statePath]: fixed({ collections: { old: { file: "Old.json", varCount: 0 } }, variables: { old: {} } }) });
  const reserved = run(root, { collections: [collection("old", "Old")] });
  assert.equal(reserved.status, 0, reserved.stderr);
  assert.deepEqual(JSON.parse(reserved.stdout).diagnostics.missingRegistered, [{ id: "old", file: "Old.json" }]);
  assert.match(reserved.stderr, /warning: registered token JSON Old\.json for collection old is missing/);
  const blocked = run(root, { collections: [collection("new", "New")] });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /registered token JSON Old\.json for collection old is missing and the ID is not in this preflight input/);
  assert.equal(blocked.stdout, "");

  write(root, statePath, fixed({
    collections: { old: { file: "Old.json", varCount: 1 } },
    variables: { old: { Original: { id: "V1", type: "COLOR" } } },
  }));
  const renamed = run(root, { collections: [collection("old", "Renamed", variable("V1", "Renamed variable"))] });
  assert.equal(renamed.status, 1);
  assert.match(renamed.stderr, /published ID-to-cssName assignments cannot be recovered/);
  assert.equal(renamed.stdout, "");
});

test("the preflight explains the required stdin input in an interactive terminal", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", "process.stdin.isTTY = true; await import(process.argv[1]);", script], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pass collections JSON through stdin/);
  assert.equal(result.stdout, "");
});

test("with no local collections a new design system still gets a prefix, so an external-only first import can fix it", () => {
  const root = project({ [statePath]: state() });
  const proposed = run(root, { collections: [] });
  assert.equal(proposed.status, 0, proposed.stderr);
  assert.deepEqual(JSON.parse(proposed.stdout), {
    tokenPrefix: { value: "ds", source: "default" },
    files: {},
    variables: {},
    diagnostics: { missingRegistered: [], registeredIdsNotInInput: [] },
  });
  const requested = run(root, { tokenPrefix: "sds", collections: [] });
  assert.deepEqual(JSON.parse(requested.stdout).tokenPrefix, { value: "sds", source: "input" });
  write(root, statePath, fixed());
  const later = run(root, { collections: [collection("C1", "Color", variable("V1", "Surface"))] });
  assert.deepEqual(JSON.parse(later.stdout).tokenPrefix, { value: "ds", source: "state" });
  assert.equal(JSON.parse(later.stdout).variables.V1, "--ds-color-surface");
});
