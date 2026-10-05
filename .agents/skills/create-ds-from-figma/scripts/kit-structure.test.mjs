import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const skillPath = path.join(repoRoot, ".agents/skills/create-ds-from-figma/SKILL.md");
const packagePath = path.join(repoRoot, "package.json");
const readmePath = path.join(repoRoot, "README.md");
const nestedReadmePath = path.join(repoRoot, ".agents/skills/create-ds-from-figma/README.md");
const referenceDir = path.join(repoRoot, ".agents/skills/create-ds-from-figma/references");
const expectedReferences = ["component-metadata.md", "relationships.md", "tokens.md"];

test("create-ds-from-figma has one detectable canonical skill", () => {
  const skill = readFileSync(skillPath, "utf8");

  assert.ok(skill.startsWith("---\n"), "canonical skill must keep discovery frontmatter");
  assert.match(skill, /^name:\s*create-ds-from-figma$/m);
  assert.match(skill, /^description:\s*\S/m);
  assert.match(skill, /^# Crear DS desde un componente Figma$/m);
  assert.ok(!skill.includes("If that file cannot be read"));
});

test("create-ds-from-figma kit layout stays consistent", () => {
  assert.ok(existsSync(readmePath), "README belongs at the repo root");
  assert.ok(!existsSync(nestedReadmePath), "README must not be duplicated inside the canonical skill folder");
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/scripts/kit-structure.test.mjs")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/plantillas/design-system/inventory.json")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/rules/design-system.md")));
  assert.ok(readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8").includes(".agents/rules/design-system.md"));
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/plantillas/componentes/metadata.json")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/checks/verify-ds.mjs")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/find-component/SKILL.md")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/evals/cases.md")));
});

test("skill loads formats where they are needed without reference chains", (t) => {
  const skill = readFileSync(skillPath, "utf8");
  const preanalysis = skill.split("## Preanálisis antes de escribir\n")[1]?.split("Evalúa esta tabla")[0];

  assert.ok(preanalysis, "preanalysis section must exist");
  assert.match(preanalysis, /2\.[^\n]*references\/tokens\.md/);
  assert.match(preanalysis, /3\.[^\n]*references\/component-metadata\.md/);
  assert.match(preanalysis, /4\.[^\n]*references\/relationships\.md/);
  assert.deepEqual(readdirSync(referenceDir).sort(), expectedReferences);

  for (const name of expectedReferences) {
    const reference = `references/${name}`;
    assert.ok(skill.includes(reference), `skill must link ${reference}`);
    const body = readFileSync(path.join(referenceDir, name), "utf8");
    assert.doesNotMatch(body, /references\/[\w-]+\.md/, `${name} must not chain to another reference`);
  }

  const bytes = Buffer.byteLength(skill);
  if (bytes > 36_000) t.diagnostic(`SKILL.md has grown to ${bytes} bytes; review whether format detail belongs in references/`);
});

test("npm test covers the canonical create-ds-from-figma test scripts", () => {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  // Check the command's contract rather than its exact spelling so adding another test target or
  // changing an unrelated script does not require updating this assertion.
  assert.match(packageJson.scripts.test, /\bnode\s+--test\b/);
  assert.ok(packageJson.scripts.test.includes(".agents/skills/create-ds-from-figma/scripts/"));
  assert.ok(packageJson.scripts.test.includes("*.test.mjs"));
});
