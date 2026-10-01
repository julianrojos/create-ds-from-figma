import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../../..");
const canonicalPath = path.join(repoRoot, ".agents/design-system-resources/skills/create-ds-from-figma/SKILL.md");
const wrapperPath = path.join(repoRoot, ".agents/skills/create-ds-from-figma/SKILL.md");
const packagePath = path.join(repoRoot, "package.json");

test("create-ds-from-figma has one detectable wrapper and one canonical document", () => {
  const canonical = readFileSync(canonicalPath, "utf8");
  const wrapper = readFileSync(wrapperPath, "utf8");

  assert.ok(!canonical.startsWith("---\n"), "canonical instructions must not duplicate skill discovery frontmatter");
  assert.ok(wrapper.startsWith("---\n"), "wrapper must keep discovery frontmatter");
  assert.match(wrapper, /^name:\s*create-ds-from-figma$/m);
  assert.match(wrapper, /^description:\s*\S/m);
  assert.ok(wrapper.includes(".agents/design-system-resources/skills/create-ds-from-figma/SKILL.md"));
  assert.ok(wrapper.includes("Do not reconstruct the workflow from this wrapper"));
  assert.ok(!wrapper.includes("Do not copy `.agents/design-system-resources`"));
});

test("create-ds-from-figma kit resources live beside the canonical document", () => {
  assert.ok(existsSync(path.join(repoRoot, ".agents/design-system-resources/skills/create-ds-from-figma/README.md")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/design-system-resources/skills/create-ds-from-figma/scripts/kit-structure.test.mjs")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/design-system-resources/skills/create-ds-from-figma/plantillas/design-system/AGENTS.md")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/design-system-resources/skills/create-ds-from-figma/plantillas/componentes/metadata.json")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/design-system-resources/checks/verify-ds.mjs")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/design-system-resources/skills/find-component/SKILL.md")));
});

test("npm test covers the canonical create-ds-from-figma test scripts", () => {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  // Check the command's contract rather than its exact spelling so adding another test target or
  // changing an unrelated script does not require updating this assertion.
  assert.match(packageJson.scripts.test, /\bnode\s+--test\b/);
  assert.ok(packageJson.scripts.test.includes(".agents/design-system-resources/skills/create-ds-from-figma/scripts/"));
  assert.ok(packageJson.scripts.test.includes("*.test.mjs"));
});
