import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(skillDir, "SKILL.md"));
const template = readFileSync(path.join(skillDir, "plantillas/ai/skills/create-ds-from-figma/SKILL.md"));

if (!source.equals(template)) {
  console.error("FAIL: source and generated create-ds-from-figma SKILL.md differ");
  process.exitCode = 1;
} else {
  console.log("PASS: create-ds-from-figma SKILL.md copies are identical");
}
