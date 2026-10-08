import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { verifyDocs } from "../verify-docs.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const project = (files) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "verify-docs-"));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
};
const kinds = (root) => verifyDocs(root).findings.map((item) => `${item.kind}:${item.message}`);

test("the repository documentation has no broken links, kit paths or commands", () => {
  assert.deepEqual(verifyDocs(repoRoot).findings, []);
});

test("broken links, kit paths and commands are reported with their line", () => {
  const root = project({
    "package.json": JSON.stringify({ scripts: { test: "x", lint: "y" } }),
    "README.md": [
      "[ok](AGENTS.md) [gone](docs/missing.md) [web](https://example.com/x.md) [anchor](#top)",
      "Use `.agents/checks/real.mjs` and `.agents/checks/ghost.mjs` and `.agents/rules/`.",
      "Run `node .agents/checks/real.mjs`, `node .agents/checks/nope.mjs`, `npm run lint`, `npm run build` and `npm run absent`.",
    ].join("\n"),
    "AGENTS.md": "# Agents\n",
    ".agents/checks/real.mjs": "",
    ".agents/rules/design-system.md": "# Rule\n",
  });
  const { findings } = verifyDocs(root);
  assert.deepEqual(findings.map((item) => [item.line, item.kind]), [[1, "link"], [2, "path"], [3, "command"], [3, "command"]]);
  assert.match(kinds(root).join("\n"), /\.agents\/checks\/ghost\.mjs does not exist/);
  assert.match(kinds(root).join("\n"), /script \.agents\/checks\/nope\.mjs does not exist/);
  assert.match(kinds(root).join("\n"), /npm script absent is not defined/);
  assert.doesNotMatch(kinds(root).join("\n"), /npm script build/, "build is added by the first import");
});

test("placeholders, generated paths and fenced listings are not checked, but shell fences are", () => {
  const root = project({
    "package.json": "{}",
    "README.md": [
      "`.agents/skills/<Nombre>/SKILL.md` `design-system/inventory.json` `src/App.tsx` `.agents/*.md` `.agents/...`",
      "```text",
      ".agents/ghost/file.md",
      "```",
      "```bash",
      "node .agents/checks/ghost.mjs",
      "```",
    ].join("\n"),
  });
  assert.deepEqual(verifyDocs(root).findings.map((item) => [item.line, item.kind]), [[6, "command"]]);
});

test("paths relative to a skill resolve beside the document or in its skill folder", () => {
  const root = project({
    "package.json": "{}",
    ".agents/skills/demo/SKILL.md": "See `references/format.md` and `scripts/run.mjs` and `evals/cases.md` and `references/gone.md`.",
    ".agents/skills/demo/references/format.md": "Back to `../SKILL.md` and `references/format.md` and `../missing.md`.",
    ".agents/skills/demo/scripts/run.mjs": "",
    ".agents/skills/demo/evals/cases.md": "",
  });
  const messages = kinds(root);
  assert.deepEqual(messages, ["path:references/gone.md does not exist beside the document or in its skill"]);
});

test("the CLI reports by default and fails only with --strict", () => {
  const script = path.join(repoRoot, ".agents/checks/verify-docs.mjs");
  const root = project({ "package.json": "{}", "README.md": "[gone](nope.md)" });
  const report = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
  assert.equal(report.status, 0);
  assert.match(report.stdout, /REPORT link README\.md:1: link target nope\.md does not exist/);
  const strict = spawnSync(process.execPath, [script, root, "--strict"], { encoding: "utf8" });
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /FAIL link README\.md:1/);
  const clean = spawnSync(process.execPath, [script, project({ "package.json": "{}", "README.md": "ok" }), "--strict"], { encoding: "utf8" });
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /PASS: 0 finding\(s\)/);
});
