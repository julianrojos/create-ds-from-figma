import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { planTokenFiles, tokenFileKey } from "../../../checks/lib/token-file-name.mjs";

const root = path.resolve(process.argv[2] || ".");
const statePath = path.join(root, "design-system/relationships/figma-state.json");

try {
  if (process.stdin.isTTY) throw new Error('pass collections JSON through stdin, for example with "< collections.json"');
  const input = JSON.parse(readFileSync(0, "utf8"));
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { collections: {} };
  if (!state.collections || typeof state.collections !== "object" || Array.isArray(state.collections)) {
    throw new Error("figma-state.json: collections must be an ID-keyed object");
  }
  const existing = Object.fromEntries(Object.entries(state.collections).map(([id, record]) => [id, record?.file]));
  const planned = planTokenFiles(input.collections, existing);
  const currentIds = new Set(input.collections.map((collection) => collection.id));
  const referenced = new Map(Object.entries(existing).map(([id, file]) => [tokenFileKey(String(file)), { id, file }]));
  const found = new Set();
  const tokensDir = path.join(root, "design-system/tokens");
  if (existsSync(tokensDir)) {
    for (const entry of readdirSync(tokensDir, { withFileTypes: true }).filter((item) => /\.json$/i.test(item.name))) {
      const owner = referenced.get(tokenFileKey(entry.name));
      if (!owner || owner.file !== entry.name) throw new Error(`unregistered token JSON ${entry.name}; resolve it before writing`);
      if (!entry.isFile()) throw new Error(`token JSON ${entry.name} is not a file`);
      const data = JSON.parse(readFileSync(path.join(tokensDir, entry.name), "utf8"));
      if (data?.id !== owner.id) throw new Error(`token JSON ${entry.name} differs from collection ${owner.id}`);
      found.add(owner.id);
    }
  }
  const missingCurrent = [];
  for (const [id, file] of Object.entries(existing)) {
    if (!found.has(id)) {
      if (!currentIds.has(id)) {
        throw new Error(`registered token JSON ${file} for collection ${id} is missing and the ID is not in this preflight input; restore it or request an explicit repair with source data before importing`);
      }
      missingCurrent.push({ id, file });
    }
  }
  const registeredIdsNotInInput = Object.entries(existing)
    .filter(([id]) => !currentIds.has(id))
    .map(([id, file]) => ({ id, file }));
  const diagnostics = { missingRegistered: missingCurrent, registeredIdsNotInInput };
  for (const { id, file } of diagnostics.missingRegistered) {
    console.error(`Token file preflight warning: registered token JSON ${file} for collection ${id} is missing; recreate it from observed Figma data only if the SKILL decision permits repair`);
  }
  for (const { id } of diagnostics.registeredIdsNotInInput) {
    console.error(`Token file preflight warning: collection ${id} is registered but not in this preflight input; its file is kept`);
  }
  console.log(JSON.stringify({ files: planned, diagnostics }, null, 2));
} catch (error) {
  console.error(`Token file preflight: ${error.message}`);
  process.exitCode = 1;
}
