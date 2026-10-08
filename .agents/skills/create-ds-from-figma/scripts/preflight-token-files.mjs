import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import { planCssNames, DEFAULT_TOKEN_PREFIX, isValidCssName, isValidTokenPrefix } from "../../../checks/lib/css-name.mjs";
import { assessTokenPrefix, customPropertyDeclarations } from "../../../checks/lib/design-system-state.mjs";
import { planTokenFiles, tokenFileKey } from "../../../checks/lib/token-file-name.mjs";

const root = path.resolve(process.argv[2] || ".");
const statePath = path.join(root, "design-system/relationships/figma-state.json");
const mapPath = path.join(root, "design-system/relationships/figma-code-map.json");
const tokensDir = path.join(root, "design-system/tokens");
const stylesheetPath = path.join(root, "src/styles/tokens.css");
const componentsDir = path.join(root, "design-system/components");

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${path.relative(root, file) || file}: ${error.message}`);
  }
};
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

try {
  if (process.stdin.isTTY) throw new Error('pass collections JSON through stdin, for example with "< collections.json"');
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (!isObject(input) || !Array.isArray(input.collections)) throw new Error("input must be an object with a collections list");
  const state = existsSync(statePath) ? readJson(statePath) : {};
  const stateCollections = state.collections ?? {};
  if (!isObject(stateCollections)) throw new Error("figma-state.json: collections must be an ID-keyed object");
  const map = existsSync(mapPath) ? readJson(mapPath) : {};

  const tokenFiles = existsSync(tokensDir)
    ? readdirSync(tokensDir, { withFileTypes: true }).filter((item) => /\.json$/i.test(item.name))
    : [];
  let declared = [];
  if (existsSync(stylesheetPath)) {
    try {
      const css = postcss.parse(readFileSync(stylesheetPath, "utf8"), { from: stylesheetPath });
      declared = customPropertyDeclarations(css);
    } catch (error) {
      throw new Error(`src/styles/tokens.css: invalid CSS: ${error.reason || error.message}${error.line ? ` at ${error.line}:${error.column}` : ""}`);
    }
  }
  const mapEntries = Object.entries(isObject(map) ? map : {}).filter(([key, entry]) => !key.startsWith("_") && isObject(entry));
  const importedComponents = new Set([
    ...mapEntries.map(([key, entry]) => entry.name || key),
    ...Object.keys(isObject(state.components) ? state.components : {}),
    ...(existsSync(componentsDir)
      ? readdirSync(componentsDir, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name)
      : []),
  ]);

  const requested = input.tokenPrefix;
  if (requested !== undefined && !isValidTokenPrefix(requested)) {
    throw new Error(`requested tokenPrefix ${JSON.stringify(requested)} is not a valid prefix`);
  }
  const verdict = assessTokenPrefix({
    tokenPrefix: state.tokenPrefix ?? null,
    collectionIds: Object.keys(stateCollections),
    tokenFiles: tokenFiles.map((item) => item.name),
    declaredCustomProperties: declared,
    importedComponents: [...importedComponents],
  });
  if (verdict.status === "invalid" || verdict.status === "missing") throw new Error(verdict.message);
  let tokenPrefix;
  if (verdict.status === "fixed") {
    if (requested !== undefined && requested !== state.tokenPrefix) {
      throw new Error(`tokenPrefix ${state.tokenPrefix} is already fixed; ${requested} was requested. Changing it requires an explicit migration`);
    }
    tokenPrefix = { value: state.tokenPrefix, source: "state" };
  } else {
    tokenPrefix = requested === undefined
      ? { value: DEFAULT_TOKEN_PREFIX, source: "default" }
      : { value: requested, source: "input" };
  }

  const existingFiles = Object.fromEntries(Object.entries(stateCollections).map(([id, record]) => [id, record?.file]));
  const plannedFiles = planTokenFiles(input.collections, existingFiles);
  const currentIds = new Set(input.collections.map((collection) => collection.id));
  const referenced = new Map(Object.entries(existingFiles).map(([id, file]) => [tokenFileKey(String(file)), { id, file }]));
  const found = new Set();
  const existingCssNames = {};
  for (const entry of tokenFiles) {
    const owner = referenced.get(tokenFileKey(entry.name));
    if (!owner || owner.file !== entry.name) throw new Error(`unregistered token JSON ${entry.name}; resolve it before writing`);
    if (!entry.isFile()) throw new Error(`token JSON ${entry.name} is not a file`);
    const data = readJson(path.join(tokensDir, entry.name));
    if (data?.id !== owner.id) throw new Error(`token JSON ${entry.name} differs from collection ${owner.id}`);
    found.add(owner.id);
    for (const variable of Object.values(isObject(data.variables) ? data.variables : {})) {
      if (isObject(variable) && typeof variable.id === "string" && typeof variable.cssName === "string") {
        existingCssNames[variable.id] = variable.cssName;
      }
    }
  }
  const missingCurrent = [];
  for (const [id, file] of Object.entries(existingFiles)) {
    if (!found.has(id)) {
      if (!currentIds.has(id)) {
        throw new Error(`registered token JSON ${file} for collection ${id} is missing and the ID is not in this preflight input; restore it or request an explicit repair with source data before importing`);
      }
      const previousVariables = state.variables?.[id];
      if (stateCollections[id]?.varCount !== 0 || !isObject(previousVariables) || Object.keys(previousVariables).length) {
        throw new Error(`registered token JSON ${file} for collection ${id} is missing; restore it before importing because its published ID-to-cssName assignments cannot be recovered from Figma`);
      }
      missingCurrent.push({ id, file });
    }
  }

  const externalNames = [];
  for (const [, entry] of mapEntries) {
    const metadataFile = entry.designSystem?.metadata;
    if (typeof metadataFile !== "string" || path.isAbsolute(metadataFile) || metadataFile.split(/[\\/]/).includes("..")) continue;
    const full = path.join(root, metadataFile);
    if (!existsSync(full)) continue;
    const externalVariables = readJson(full).externalVariables;
    if (!Array.isArray(externalVariables)) {
      throw new Error(`${metadataFile}: externalVariables must be a list`);
    }
    for (const [index, variable] of externalVariables.entries()) {
      if (!isObject(variable) || !isValidCssName(variable.cssName)) {
        throw new Error(`${metadataFile}: externalVariables[${index}].cssName must be a valid DS custom property name`);
      }
      externalNames.push(variable.cssName);
    }
  }
  const owned = new Set([...Object.values(existingCssNames), ...externalNames]);
  const reserved = [...externalNames, ...declared.filter((name) => !owned.has(name) && isValidCssName(name))];
  const variables = planCssNames({ prefix: tokenPrefix.value, collections: input.collections, existing: existingCssNames, reserved });

  const registeredIdsNotInInput = Object.entries(existingFiles)
    .filter(([id]) => !currentIds.has(id))
    .map(([id, file]) => ({ id, file }));
  const diagnostics = { missingRegistered: missingCurrent, registeredIdsNotInInput };
  for (const { id, file } of diagnostics.missingRegistered) {
    console.error(`Token file preflight warning: registered token JSON ${file} for collection ${id} is missing; recreate it from observed Figma data only if the SKILL decision permits repair`);
  }
  for (const { id } of diagnostics.registeredIdsNotInInput) {
    console.error(`Token file preflight warning: collection ${id} is registered but not in this preflight input; its file is kept`);
  }
  console.log(JSON.stringify({ tokenPrefix, files: plannedFiles, variables, diagnostics }, null, 2));
} catch (error) {
  console.error(`Token file preflight: ${error.message}`);
  process.exitCode = 1;
}
