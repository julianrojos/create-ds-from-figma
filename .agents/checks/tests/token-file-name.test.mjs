import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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

test("CLI preflight reads existing state and writes only its JSON result to stdout", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "token-preflight-"));
  try {
    const relative = "design-system/relationships/figma-state.json";
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), JSON.stringify({ collections: { one: { file: "Color.json" } } }));
    const tokensDir = path.join(root, "design-system/tokens");
    mkdirSync(tokensDir, { recursive: true });
    writeFileSync(path.join(tokensDir, "Color.json"), JSON.stringify({ id: "one" }));
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/scripts/preflight-token-files.mjs");
    const result = spawnSync(process.execPath, [script, root], {
      input: JSON.stringify({ collections: [collection("one", "Hue"), collection("two", "Color")] }), encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      files: { one: "Color.json", two: "Color (two).json" },
      diagnostics: { missingRegistered: [], registeredIdsNotInInput: [] },
    });
    assert.equal(readFileSync(path.join(root, relative), "utf8"), JSON.stringify({ collections: { one: { file: "Color.json" } } }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI preflight stops before an unregistered JSON can be overwritten", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "token-preflight-orphan-"));
  try {
    const tokensDir = path.join(root, "design-system/tokens");
    mkdirSync(tokensDir, { recursive: true });
    writeFileSync(path.join(tokensDir, "Color.json"), JSON.stringify({ id: "old" }));
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/scripts/preflight-token-files.mjs");
    const result = spawnSync(process.execPath, [script, root], {
      input: JSON.stringify({ collections: [collection("new", "Color")] }), encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unregistered token JSON Color\.json/);
    assert.equal(JSON.parse(readFileSync(path.join(tokensDir, "Color.json"), "utf8")).id, "old");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI preflight keeps and reports a registered ID missing from this input", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "token-preflight-stale-"));
  try {
    const statePath = path.join(root, "design-system/relationships/figma-state.json");
    const tokensDir = path.join(root, "design-system/tokens");
    mkdirSync(path.dirname(statePath), { recursive: true });
    mkdirSync(tokensDir, { recursive: true });
    writeFileSync(statePath, JSON.stringify({ collections: { old: { file: "Old.json" } } }));
    writeFileSync(path.join(tokensDir, "Old.json"), JSON.stringify({ id: "old" }));
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/scripts/preflight-token-files.mjs");
    const result = spawnSync(process.execPath, [script, root], {
      input: JSON.stringify({ collections: [collection("new", "New")] }), encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      files: { old: "Old.json", new: "New.json" },
      diagnostics: { missingRegistered: [], registeredIdsNotInInput: [{ id: "old", file: "Old.json" }] },
    });
    assert.match(result.stderr, /warning: collection old is registered but not in this preflight input; its file is kept/);
    assert.equal(readFileSync(path.join(tokensDir, "Old.json"), "utf8"), JSON.stringify({ id: "old" }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI preflight reserves a missing registered JSON for an observed Figma collection", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "token-preflight-missing-"));
  try {
    const statePath = path.join(root, "design-system/relationships/figma-state.json");
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ collections: { old: { file: "Old.json" } } }));
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/scripts/preflight-token-files.mjs");
    const result = spawnSync(process.execPath, [script, root], {
      input: JSON.stringify({ collections: [collection("old", "Old")] }), encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      files: { old: "Old.json" },
      diagnostics: { missingRegistered: [{ id: "old", file: "Old.json" }], registeredIdsNotInInput: [] },
    });
    assert.match(result.stderr, /warning: registered token JSON Old\.json for collection old is missing; recreate it from observed Figma data only if the SKILL decision permits repair/);
    assert.equal(readFileSync(statePath, "utf8"), JSON.stringify({ collections: { old: { file: "Old.json" } } }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI preflight blocks a missing JSON when its ID is absent from this input", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "token-preflight-unrecoverable-"));
  try {
    const statePath = path.join(root, "design-system/relationships/figma-state.json");
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ collections: { old: { file: "Old.json" } } }));
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/scripts/preflight-token-files.mjs");
    const result = spawnSync(process.execPath, [script, root], {
      input: JSON.stringify({ collections: [collection("new", "New")] }), encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /registered token JSON Old\.json for collection old is missing and the ID is not in this preflight input/);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI preflight explains the required stdin input in an interactive terminal", () => {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/scripts/preflight-token-files.mjs");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", "process.stdin.isTTY = true; await import(process.argv[1]);", script], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pass collections JSON through stdin/);
  assert.equal(result.stdout, "");
});
