import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const skillPath = path.join(repoRoot, ".agents/skills/create-ds-from-figma/SKILL.md");
const packagePath = path.join(repoRoot, "package.json");
const readmePath = path.join(repoRoot, "README.md");
const nestedReadmePath = path.join(repoRoot, ".agents/skills/create-ds-from-figma/README.md");
const referenceDir = path.join(repoRoot, ".agents/skills/create-ds-from-figma/references");
const expectedReferences = ["component-metadata.md", "figma-evidence.md", "relationships.md", "tokens.md"];

test("skill catalog has scoped discovery metadata", (t) => {
  const skillDir = path.join(repoRoot, ".agents/skills");
  for (const entry of readdirSync(skillDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skill = readFileSync(path.join(skillDir, entry.name, "SKILL.md"), "utf8");
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
    assert.ok(frontmatter, `${entry.name} must have frontmatter`);
    const metadata = YAML.parse(frontmatter, { uniqueKeys: true, strict: true });
    assert.ok(metadata && typeof metadata === "object" && !Array.isArray(metadata), `${entry.name} metadata must be a mapping`);
    assert.equal(metadata.name, entry.name, `${entry.name} must match its directory`);
    assert.equal(typeof metadata.description, "string", `${entry.name} must have a description`);
    const description = metadata.description.trim();
    assert.ok(description, `${entry.name} must have a nonempty description`);
    assert.ok(description.includes("USE WHEN:"), `${entry.name} must state when to use it`);
    assert.ok(description.includes("DO NOT USE WHEN:"), `${entry.name} must state when not to use it`);
    const words = description.split(/\s+/).length;
    if (words > 100) t.diagnostic(`${entry.name} description has ${words} words; review discovery cost`);
  }
});

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
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/plantillas/design-system/inventory.json")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/rules/design-system.md")));
  for (const [name, oldName] of [
    ["design-system-composition.md", "composition-rules.md"],
    ["design-system-accessibility.md", "accessibility.md"],
  ]) {
    const rulePath = `.agents/rules/${name}`;
    assert.ok(existsSync(path.join(repoRoot, rulePath)), `${rulePath} must exist in the kit`);
    const oldPath = `.agents/skills/create-ds-from-figma/plantillas/design-system/system/${oldName}`;
    assert.ok(!existsSync(path.join(repoRoot, oldPath)), `${oldPath} must not duplicate a kit rule`);
  }
  assert.ok(readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8").includes(".agents/rules/design-system.md"));
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/plantillas/componentes/metadata.json")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/checks/verify-ds.mjs")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/checks/lib/token-file-name.mjs")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/scripts/preflight-token-files.mjs")));
  for (const file of ["checks/lib/css-name.mjs", "checks/lib/design-system-state.mjs", "checks/lib/mode-scopes.mjs", "checks/lib/serialization.mjs", "checks/lib/tokens-css.mjs", "checks/lib/property-types.mjs", "checks/verify-docs.mjs", "skills/create-ds-from-figma/scripts/generate-tokens-css.mjs", "checks/tests/fixtures/css-names.json"]) {
    assert.ok(existsSync(path.join(repoRoot, ".agents", file)), `${file} must exist`);
  }
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/find-component/SKILL.md")));
  assert.ok(existsSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/evals/cases.md")));
});

test("DS guidance entry points link the canonical rules", () => {
  const rule = readFileSync(path.join(repoRoot, ".agents/rules/design-system.md"), "utf8");
  const workflow = readFileSync(path.join(repoRoot, ".agents/workflows/build-from-figma.md"), "utf8");
  const accessibilityCheck = readFileSync(path.join(repoRoot, ".agents/checks/accessibility.md"), "utf8");

  for (const name of ["design-system-composition.md", "design-system-accessibility.md"]) {
    const rulePath = `.agents/rules/${name}`;
    assert.ok(rule.includes(rulePath), `DS rule must link ${rulePath}`);
    assert.ok(workflow.includes(rulePath), `Figma workflow must link ${rulePath}`);
  }
  assert.ok(accessibilityCheck.includes(".agents/rules/design-system-accessibility.md"), "accessibility check must link its rule");
});

test("skill helpers use current inventory, state and validation rules", () => {
  const state = JSON.parse(readFileSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/plantillas/design-system/relationships/figma-state.json"), "utf8"));
  for (const field of ["runId", "fileUrl"]) assert.ok(!(field in state), `${field} is not part of runtime state`);
  assert.ok(!state._schema.notes.some((note) => note.includes("Legacy phase and pages")));
  assert.equal(state.tokenPrefix, null, "the blank kit must not fix a token prefix before the first import");
  assert.equal(Object.values(state._schema.collections)[0].modeScopes["<modo no predeterminado>"], null, "the template documents pending mode scopes as null");
  assert.ok(Object.keys(Object.values(state._schema.collections)[0].serialization).length > 0, "the template documents a serialization entry");
  assert.deepEqual(state.collections, {});
  assert.deepEqual(state.variables, {});
  assert.ok(state._schema.collections["<VariableCollectionId>"].file.endsWith(".json"));

  const find = readFileSync(path.join(repoRoot, ".agents/skills/find-component/SKILL.md"), "utf8");
  const map = readFileSync(path.join(repoRoot, ".agents/skills/map-figma-to-code/SKILL.md"), "utf8");
  const validate = readFileSync(path.join(repoRoot, ".agents/skills/validate-ds/SKILL.md"), "utf8");
  const accessibilityCheck = readFileSync(path.join(repoRoot, ".agents/checks/accessibility.md"), "utf8");
  assert.ok(find.includes("design-system/inventory.json"));
  assert.ok(map.includes(".agents/skills/find-component/SKILL.md"));
  assert.ok(validate.includes(".agents/rules/design-system-composition.md"));
  assert.match(validate, /^Composition: PASS \/ FAIL \/ NOT RUN/m);
  assert.ok(accessibilityCheck.includes(".agents/rules/design-system-accessibility.md"));
  assert.match(accessibilityCheck, /^## NOT RUN$/m);
});

test("first import preserves repo tooling and screens use their workflow", () => {
  const skill = readFileSync(skillPath, "utf8");
  const scaffold = skill.split("## Árbol generado\n")[1]?.split("## Preanálisis antes de escribir")[0];
  assert.ok(scaffold, "generated tree section must exist");
  for (const file of ["index.html", "tsconfig.json", "package.json", "package-lock.json"]) {
    assert.ok(scaffold.includes(file), `scaffold must account for ${file}`);
  }
  for (const existing of ["scripts.test", "yaml", ".gitignore"]) {
    assert.ok(scaffold.includes(existing), `first import must preserve ${existing}`);
  }
  assert.match(skill, /Si falta `design-system\/inventory\.json` y la decisión permite reparar el scaffold/);
  assert.match(skill, /reconstruye `components`/);
  assert.match(skill, /reconstruye `screens`/);
  const screens = skill.split("## Pantallas\n")[1]?.split("## Prohibido")[0];
  assert.ok(screens?.includes(".agents/workflows/build-from-figma.md"));
  assert.ok(screens.includes("`DS_GAP` sin escribir"));
});

test("skill loads formats where they are needed without reference chains", (t) => {
  const skill = readFileSync(skillPath, "utf8");
  const preanalysis = skill.split("## Preanálisis antes de escribir\n")[1]?.split("Evalúa esta tabla")[0];

  assert.ok(preanalysis, "preanalysis section must exist");
  assert.match(preanalysis, /2\.[^\n]*references\/tokens\.md/);
  assert.match(preanalysis, /3\.[^\n]*references\/component-metadata\.md/);
  assert.match(preanalysis, /4\.[^\n]*references\/relationships\.md/);
  assert.ok(preanalysis.includes("preflight-token-files.mjs"), "token filenames must be planned before writing");
  const tokensReference = readFileSync(path.join(repoRoot, ".agents/skills/create-ds-from-figma/references/tokens.md"), "utf8");
  assert.ok(tokensReference.includes(".agents/checks/tests/fixtures/css-names.json"), "tokens.md must cite the shared css name cases");
  assert.ok(tokensReference.includes("tokenPrefix") && tokensReference.includes("cssName"), "tokens.md must define the css name contract");
  assert.ok(tokensReference.includes("modeScopes") && tokensReference.includes("NOT VERIFIED"), "tokens.md must define mode scopes and their pending state");
  assert.ok(tokensReference.includes("serialization") && tokensReference.includes("pendiente"), "tokens.md must define FLOAT serialization and the pending state");
  assert.ok(tokensReference.includes("generate-tokens-css.mjs") && tokensReference.includes("producto de compilación"), "tokens.md must say tokens.css is generated");
  assert.ok(skill.includes("generate-tokens-css.mjs"), "the skill must tell the agent to generate tokens.css");
  assert.ok(preanalysis.includes("tokenPrefix") && preanalysis.includes("`variables`"), "the preanalysis must use the prefix and variable names from the preflight");
  assert.ok(preanalysis.includes('"collections": []'), "the preanalysis must run the preflight even with no local collections to obtain the prefix");
  assert.deepEqual(readdirSync(referenceDir).sort(), expectedReferences);

  for (const name of expectedReferences) {
    const reference = `references/${name}`;
    assert.ok(skill.includes(reference), `skill must link ${reference}`);
    const body = readFileSync(path.join(referenceDir, name), "utf8");
    assert.doesNotMatch(body, /references\/[\w-]+\.md/, `${name} must not chain to another reference`);
    for (const sibling of expectedReferences.filter((candidate) => candidate !== name)) {
      const escaped = sibling.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mention = new RegExp(`(?<![\\w-])${escaped}(?![\\w-]|\\.[\\w])`);
      assert.ok(mention.test(`Consulta \`${sibling}\`.`), "detect a bare reference filename");
      assert.ok(mention.test(`Consulta ${sibling}.`), "detect a filename followed by sentence punctuation");
      assert.ok(mention.test(`[Formato](./${sibling})`), "detect a relative Markdown link");
      assert.ok(!mention.test(`other-${sibling}.backup`), "do not match a different filename");
      assert.doesNotMatch(body, mention, `${name} must not chain to ${sibling}, even without references/`);
    }
  }

  const bytes = Buffer.byteLength(skill);
  if (bytes > 36_000) t.diagnostic(`SKILL.md has grown to ${bytes} bytes; review whether format detail belongs in references/`);
});

test("verifier dependencies and workflow commands stay available", () => {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const workflow = readFileSync(path.join(repoRoot, ".agents/workflows/build-from-figma.md"), "utf8");
  const firstCheck = "node .agents/checks/verify-ds.mjs";
  const checkStep = workflow.split(/(?=^\d+\.\s)/m).find((step) => step.includes(firstCheck));
  assert.ok(checkStep, "workflow must have a verification step");
  const beforeChecks = checkStep.slice(0, checkStep.indexOf(firstCheck));
  assert.match(beforeChecks, /\b(?:install\w*|instal\w*|npm\s+(?:ci|install))\b/i, "install dependencies before running checks");
  assert.match(beforeChecks, /\b(?:dependenc\w*|packages?|paquetes?)\b/i, "name the prerequisite before running checks");

  for (const dependency of ["postcss", "postcss-selector-parser", "typescript"]) {
    assert.ok(packageJson.devDependencies?.[dependency], `${dependency} must be a dev dependency`);
  }
  for (const check of ["verify-ds", "verify-props", "verify-bindings"]) {
    assert.ok(existsSync(path.join(repoRoot, `.agents/checks/${check}.mjs`)));
    assert.ok(workflow.includes(`node .agents/checks/${check}.mjs`));
  }
});

test("npm test covers the skill and check tests", () => {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  // Check the command's contract rather than its exact spelling so adding another test target or
  // changing an unrelated script does not require updating this assertion.
  assert.match(packageJson.scripts.test, /\bnode\s+--test\b/);
  assert.ok(packageJson.scripts.test.includes(".agents/skills/create-ds-from-figma/scripts/"));
  assert.ok(packageJson.scripts.test.includes(".agents/checks/tests/"));
  assert.ok(packageJson.scripts.test.includes("*.test.mjs"));
});
