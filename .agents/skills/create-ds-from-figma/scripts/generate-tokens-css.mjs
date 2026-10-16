import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TOKENS_CSS_PATH, firstDifference, generateTokensCss } from "../../../checks/lib/tokens-css.mjs";
import { readInventory } from "../../../checks/lib/variable-inventory.mjs";
import { tokenInventoryComparison } from "../../../checks/lib/inventory-tokens.mjs";

const args = process.argv.slice(2);
const check = args.includes("--check");
const remaining = args.filter(arg => arg !== '--check');
const root = path.resolve(remaining[0] && !remaining[0].startsWith('--') ? remaining.shift() : '.');
const target = path.join(root, TOKENS_CSS_PATH);

try {
if (remaining.length && (remaining.length !== 2 || remaining[0] !== '--inventory' || !remaining[1] || remaining[1].startsWith('--'))) throw new Error('Use ROOT [--check] [--inventory PATH]');
if (remaining.length) {
  const compared = tokenInventoryComparison(root, readInventory(remaining[1]));
  console.log(JSON.stringify({ inventory: compared }));
  if (compared.errors.length) throw new Error(compared.errors.join('\n'));
}
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
} catch (error) { console.error(`Token stylesheet: ${error.message}`); process.exitCode = 1; }
