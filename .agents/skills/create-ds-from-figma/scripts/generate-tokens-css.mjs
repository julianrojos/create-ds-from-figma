import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TOKENS_CSS_PATH, firstDifference, generateTokensCss } from "../../../checks/lib/tokens-css.mjs";

const args = process.argv.slice(2);
const check = args.includes("--check");
const root = path.resolve(args.find((arg) => !arg.startsWith("--")) || ".");
const target = path.join(root, TOKENS_CSS_PATH);

const { css, errors, warnings } = generateTokensCss(root);
for (const warning of warnings) console.error(`WARN ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  console.error("Token stylesheet: the sources are inconsistent, so nothing was generated");
  process.exitCode = 1;
} else if (check) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  const difference = firstDifference(current, css);
  if (difference) {
    console.error(`FAIL ${TOKENS_CSS_PATH} differs from the generated output at line ${difference.line}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${TOKENS_CSS_PATH} matches the generated output`);
  }
} else {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, css);
  console.log(`Wrote ${TOKENS_CSS_PATH}`);
}
