// Local aliases are written as var(--target), so a chain that returns to its start has no usable value.
// A collection has one active mode at a time, but modes of different collections can be active together.
// Each edge of a cycle is (variable, mode of its collection), so a cycle carries one requirement per collection.
//   - two modes of the same collection can never be required together: not a cycle;
//   - scopes that cannot match the same element (same attribute, different value): not a cycle;
//   - scopes that certainly coexist (different attributes, or a selector with a media query): an error;
//   - anything else (two media queries, complex selectors, scopes not readable): the cycle is not ruled out
//     but coexistence is not proven, so it is reported as a warning (NOT VERIFIED), not as an error.
// A mode without a CSS scope yet (null) is not written to tokens.css, so it contributes no edge.

import selectorParser from "postcss-selector-parser";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const SEARCH_BUDGET = 200000;

// Reads `:root`, a tag, classes and `[attribute="value"]` conditions from one compound selector.
function compoundOf(selector) {
  try {
    const parsed = selectorParser().astSync(selector);
    if (parsed.nodes.length !== 1) return null;
    const attributes = new Map();
    const classes = new Set();
    let base = "";
    for (const node of parsed.nodes[0].nodes) {
      if (node.type === "attribute" && node.operator === "=" && typeof node.value === "string") attributes.set(node.attribute.trim().toLowerCase(), { value: node.value, insensitive: node.insensitive === true });
      else if (node.type === "class") classes.add(node.value);
      else if (node.type === "tag" || (node.type === "pseudo" && node.value === ":root")) base += String(node).trim();
      else return null;
    }
    return { base, attributes, classes };
  } catch {
    return null;
  }
}

const squash = (text) => String(text).replace(/\s+/g, " ").trim();
const asciiLower = (text) => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

// Identity of a scope that ignores how it is written (quotes, spacing around the selector, attribute order)
// but not what it matches: attribute values keep their spaces and the `i` flag lowercases only ASCII letters.
function scopeKey(scope) {
  if (!isObject(scope)) return null;
  if (scope.kind === "media") return typeof scope.query === "string" ? `media:${squash(scope.query)}` : null;
  if (typeof scope.value !== "string") return null;
  const compound = compoundOf(scope.value);
  if (!compound) return `selector-text:${scope.value}`;
  const attributes = [...compound.attributes].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([name, { value, insensitive }]) => JSON.stringify([name, insensitive ? asciiLower(value) : value, insensitive]));
  return `selector:${JSON.stringify([compound.base, [...compound.classes].sort(), attributes])}`;
}
function sameScope(left, right) {
  const key = scopeKey(left);
  return key !== null && key === scopeKey(right);
}

// True when every element matched by `specific` is also matched by `general`, so `general` is active whenever
// `specific` is. Provable for the same base, all the classes and every attribute condition of `general` present
// in `specific`; anything else is not claimed.
function implies(specific, general) {
  if (sameScope(specific, general)) return true;
  if (!isObject(specific) || !isObject(general) || specific.kind !== "selector" || general.kind !== "selector") return false;
  const a = compoundOf(specific.value);
  const b = compoundOf(general.value);
  if (!a || !b || a.base !== b.base) return false;
  for (const name of b.classes) if (!a.classes.has(name)) return false;
  for (const [name, wanted] of b.attributes) {
    const have = a.attributes.get(name);
    if (!have) return false;
    const insensitive = wanted.insensitive;
    if (insensitive ? asciiLower(have.value) !== asciiLower(wanted.value) : have.value !== wanted.value || have.insensitive) return false;
  }
  return true;
}

// "exclusive": the two scopes cannot match one element; "coexist": they certainly can; "unknown": not proven either way.
function relation(left, right) {
  if (!isObject(left) || !isObject(right)) return "unknown";
  if (left.kind === "selector" && right.kind === "selector") {
    const a = compoundOf(left.value);
    const b = compoundOf(right.value);
    if (!a || !b || a.base !== b.base) return "unknown";
    for (const [name, one] of a.attributes) {
      const other = b.attributes.get(name);
      if (!other) continue;
      // The `i` flag compares ASCII letters without case, so "dark i" and "DARK" can match the same element.
      const same = one.insensitive || other.insensitive ? asciiLower(one.value) === asciiLower(other.value) : one.value === other.value;
      if (!same) return "exclusive";
    }
    return "coexist";
  }
  if (left.kind !== right.kind) return "coexist";
  return sameScope(left, right) ? "coexist" : "unknown";
}

/**
 * collections  [{ file, data, record }] token JSON and its figma-state.json record (for modeScopes)
 * Returns { errors, warnings }, one message per distinct cycle of variables.
 */
export function aliasCycleProblems(collections) {
  const groups = new Map();
  const entries = new Map();
  for (const { file, data, record } of collections) {
    groups.set(file, { defaultMode: data?.defaultMode, scopes: isObject(record?.modeScopes) ? record.modeScopes : undefined });
    for (const variable of Object.values(isObject(data?.variables) ? data.variables : {})) {
      if (isObject(variable) && typeof variable.id === "string" && !entries.has(variable.id)) entries.set(variable.id, { variable, file });
    }
  }
  // "base" = default mode (always satisfiable), null = no CSS yet, undefined = scope not readable.
  const scopeOf = (file, mode) => {
    const group = groups.get(file);
    if (mode === group.defaultMode) return "base";
    return group.scopes === undefined || !Object.hasOwn(group.scopes, mode) ? undefined : group.scopes[mode];
  };
  const edges = new Map();
  for (const [id, { variable, file }] of entries) {
    const list = [];
    for (const [mode, raw] of Object.entries(isObject(variable.valuesByMode) ? variable.valuesByMode : {})) {
      if (isObject(raw) && raw.source === "local" && entries.has(raw.targetVariableId) && scopeOf(file, mode) !== null) {
        list.push({ mode, target: raw.targetVariableId });
      }
    }
    edges.set(id, list);
  }
  const index = new Map([...entries.keys()].map((id, position) => [id, position]));
  const found = new Map();
  let budget = SEARCH_BUDGET;

  const describe = (constraints) => {
    const used = [...constraints];
    return used.length === 1
      ? `in mode ${JSON.stringify(used[0][1])}`
      : `when ${used.map(([file, mode]) => `mode ${JSON.stringify(mode)} of ${file}`).join(" and ")} are active together`;
  };
  // "none": the required scopes exclude each other; "certain": nothing is needed or they certainly coexist; "possible": not proven.
  const realizable = (constraints) => {
    const scoped = [...constraints].map(([file, mode]) => scopeOf(file, mode)).filter((scope) => scope !== "base");
    let verdict = "certain";
    // The default value of a collection holds only while none of its own scopes overrides it. If another required
    // scope implies the scope of one of its non-default modes (same scope, or the same plus more conditions), that mode
    // is active too and the default edge is not.
    for (const [file, mode] of constraints) {
      if (scopeOf(file, mode) !== "base") continue;
      for (const [, otherScope] of Object.entries(groups.get(file).scopes ?? {})) {
        if (otherScope === null) continue;
        for (const required of scoped) {
          if (implies(required, otherScope)) return "none";
          if (relation(required, otherScope) === "unknown") verdict = "possible";
        }
      }
    }
    for (let i = 0; i < scoped.length; i += 1) {
      for (let j = i + 1; j < scoped.length; j += 1) {
        const pair = relation(scoped[i], scoped[j]);
        if (pair === "exclusive") return "none";
        if (pair === "unknown") verdict = "possible";
      }
    }
    return verdict;
  };
  // Every cycle is found once, from its variable with the lowest position.
  const search = (start, current, path, constraints) => {
    for (const { mode, target } of edges.get(current)) {
      if (budget-- <= 0) return;
      const file = entries.get(current).file;
      const required = constraints.get(file);
      if (required !== undefined && required !== mode) continue;
      const next = required === undefined ? new Map(constraints).set(file, mode) : constraints;
      if (target === start) {
        const key = path.join("\u0000");
        const verdict = realizable(next);
        // The same variables can close a cycle under several mode combinations: keep the strongest evidence.
        if (verdict === "none" || found.get(key)?.verdict === "certain" || (found.has(key) && verdict === "possible")) continue;
        const names = path.map((id) => entries.get(id).variable.cssName ?? id);
        const head = `tokens/${entries.get(start).file}: local alias cycle ${[...names, names[0]].join(" -> ")} ${describe(next)}`;
        found.set(key, { verdict, message: verdict === "certain"
          ? `${head}; none of these variables has a usable value`
          : `${head}; the scopes of these modes are not proven to exclude each other, so the cycle is not ruled out (NOT VERIFIED)` });
      } else if (index.get(target) > index.get(start) && !path.includes(target)) {
        search(start, target, [...path, target], next);
      }
    }
  };
  for (const start of entries.keys()) search(start, start, [start], new Map());
  const errors = [];
  const warnings = [];
  for (const { verdict, message } of found.values()) (verdict === "certain" ? errors : warnings).push(message);
  if (budget <= 0) errors.push("tokens: too many alias paths to rule out cycles; simplify the local aliases");
  return { errors, warnings };
}
