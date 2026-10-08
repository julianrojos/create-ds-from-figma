// Pure rules for CSS custom-property names assigned to Figma variables.
// No file or Figma access: callers pass in what they have already read.

export const DEFAULT_TOKEN_PREFIX = "ds";
export const TOKEN_PREFIX_MAX = 20;
export const CSS_NAME_MAX = 120;

const prefixPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const cssNamePattern = /^--[A-Za-z_][\w-]*$/;

export const isValidTokenPrefix = (prefix) =>
  typeof prefix === "string" && prefix.length <= TOKEN_PREFIX_MAX && prefixPattern.test(prefix);

export const isValidCssName = (name) => typeof name === "string" && cssNamePattern.test(name);

// NFKD without combining marks, lowercase, each run of characters outside [a-z0-9] becomes one "-".
export function slugSegment(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Injective encoding inside [A-Za-z0-9_-]: letters, digits and "-" are kept, "_" becomes "__",
// every other UTF-8 byte becomes "_" plus two lowercase hex digits.
export function encodeVariableId(id) {
  if (typeof id !== "string" || Buffer.from(id, "utf8").toString("utf8") !== id) {
    throw new Error("variable id must be valid UTF-8 text");
  }
  return [...Buffer.from(id, "utf8")].map((byte) => {
    if ((byte >= 48 && byte <= 57) || (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) || byte === 45) {
      return String.fromCharCode(byte);
    }
    return byte === 95 ? "__" : `_${byte.toString(16).padStart(2, "0")}`;
  }).join("");
}

const isText = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * Assigns a custom-property name to every variable that does not have one yet.
 *
 * prefix       canonical token prefix, already fixed by the caller
 * collections  [{ id, name, variables: [{ id, name }] }] read from the Figma file
 * existing     { variableId: cssName } already published; never changed
 * reserved     names declared elsewhere (external snapshots, CSS declarations without an owner)
 *
 * Returns { variableId: cssName } for existing and new variables. Throws instead of guessing.
 */
export function planCssNames({ prefix, collections, existing = {}, reserved = [] }) {
  if (!isValidTokenPrefix(prefix)) throw new Error(`invalid token prefix ${JSON.stringify(prefix)}`);
  if (!Array.isArray(collections)) throw new Error("collections must be a list");
  const head = `--${prefix}-`;
  const planned = Object.assign(Object.create(null), existing);
  const taken = new Map();
  for (const [id, name] of Object.entries(existing)) {
    if (!isText(id) || !isValidCssName(name)) throw new Error(`invalid existing css name for ${id}: ${JSON.stringify(name)}`);
    if (taken.has(name)) throw new Error(`css name collision: ${name} is assigned to ${taken.get(name)} and ${id}`);
    taken.set(name, id);
  }
  for (const name of reserved) {
    if (!isValidCssName(name)) throw new Error(`invalid reserved css name ${JSON.stringify(name)}`);
    if (!taken.has(name)) taken.set(name, "reserved declaration");
  }

  const incoming = [];
  const seen = new Set();
  for (const collection of collections) {
    if (!collection || !isText(collection.name) || !Array.isArray(collection.variables)) {
      throw new Error("each collection needs a nonempty name and a variables list");
    }
    for (const variable of collection.variables) {
      if (!variable || !isText(variable.id) || !isText(variable.name)) {
        throw new Error(`collection ${collection.name}: each variable needs a nonempty id and name`);
      }
      if (seen.has(variable.id)) throw new Error(`duplicate variable id ${variable.id}`);
      seen.add(variable.id);
      if (Object.hasOwn(existing, variable.id)) continue;
      const collectionSlug = slugSegment(collection.name);
      const variableSlug = slugSegment(variable.name);
      incoming.push({
        id: variable.id,
        base: `${head}${collectionSlug || "collection"}-${variableSlug || "variable"}`,
        lossy: !collectionSlug || !variableSlug,
      });
    }
  }

  const counts = new Map();
  for (const item of incoming) counts.set(item.base, (counts.get(item.base) || 0) + 1);
  const final = new Map();
  for (const item of incoming) {
    const suffixed = item.lossy || counts.get(item.base) > 1 || taken.has(item.base) || item.base.length > CSS_NAME_MAX;
    let name = item.base;
    if (suffixed) {
      const suffix = `-${encodeVariableId(item.id)}`;
      const room = CSS_NAME_MAX - suffix.length;
      if (room <= head.length) throw new Error(`css name suffix for ${item.id} does not fit in ${CSS_NAME_MAX} characters`);
      name = `${item.base.slice(0, room).replace(/-+$/, "")}${suffix}`;
    }
    if (taken.has(name) || final.has(name)) {
      throw new Error(`css name collision: ${name} for ${item.id} and ${taken.get(name) || final.get(name)}`);
    }
    final.set(name, item.id);
    planned[item.id] = name;
  }
  return { ...planned };
}
