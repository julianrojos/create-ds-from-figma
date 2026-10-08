// How a numeric (FLOAT) Figma variable is written in CSS.
// Figma does not say whether 4 means 4px, 4 or 400%, and one custom property can only have one
// serialization, so the choice is a recorded decision in figma-state.json:
//   collections[ID].serialization[variableId] = { css, source }
//   css     { kind: "unit", unit: "px" } | { kind: "unitless" } | { kind: "scale", factor: 0.01, unit: "" }
//   source  { type: "bindings", evidence: [{ node, figmaProperty, mode? }] } | { type: "user" }
// A variable without a decision is pending: it is not written to tokens.css and no binding may use it.
// A variable whose modes are all local aliases inherits the serialization of its targets.

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;
export const SERIALIZATION_UNITS = ["px", "rem", "em", "%", "ms", "s", "deg"];

// Canonical identity of a serialization, independent of key order.
const cssKey = (css) => JSON.stringify([css.kind, css.unit ?? null, css.factor ?? null]);

const format = (number) => String(Number(number.toPrecision(12)));

export function serializeNumber(value, css) {
  if (typeof value !== "number" || !Number.isFinite(value) || !isObject(css)) return undefined;
  if (css.kind === "unit") return `${format(value)}${css.unit}`;
  if (css.kind === "unitless") return format(value);
  if (css.kind === "scale") return `${format(value * css.factor)}${css.unit}`;
  return undefined;
}

export const isLocalAliasVariable = (valuesByMode) => isObject(valuesByMode) && Object.values(valuesByMode).length > 0 &&
  Object.values(valuesByMode).every((raw) => isObject(raw) && raw.source === "local");

function validCss(css) {
  if (!isObject(css)) return false;
  const keys = Object.keys(css).sort().join(",");
  if (css.kind === "unit") return keys === "kind,unit" && SERIALIZATION_UNITS.includes(css.unit);
  if (css.kind === "unitless") return keys === "kind";
  if (css.kind === "scale") {
    return keys === "factor,kind,unit" && typeof css.factor === "number" && Number.isFinite(css.factor) && css.factor > 0 &&
      (css.unit === "" || SERIALIZATION_UNITS.includes(css.unit));
  }
  return false;
}

function validSource(source) {
  if (!isObject(source)) return false;
  if (source.type === "user") return Object.keys(source).length === 1;
  return source.type === "bindings" && Object.keys(source).sort().join(",") === "evidence,type" &&
    Array.isArray(source.evidence) && source.evidence.length > 0 &&
    source.evidence.every((item) => isObject(item) && isText(item.node) && isText(item.figmaProperty) &&
      (item.mode === undefined || isText(item.mode)) && Object.keys(item).every((key) => ["node", "figmaProperty", "mode"].includes(key)));
}

/** Returns { errors, decisions: Map<variableId, css> } for one collection record. */
export function serializationProblems(record, data, label) {
  const errors = [];
  const decisions = new Map();
  const entries = record?.serialization;
  if (!isObject(entries)) {
    errors.push(`${label}: serialization must be an object keyed by FLOAT variable ID (empty when nothing is decided)`);
    return { errors, decisions };
  }
  const byId = new Map(Object.values(data?.variables ?? {}).filter(isObject).map((variable) => [variable.id, variable]));
  for (const [id, entry] of Object.entries(entries)) {
    const variable = byId.get(id);
    if (!variable) {
      errors.push(`${label}: serialization has an entry for ${id}, which is not a variable of this collection`);
    } else if (variable.type !== "FLOAT") {
      errors.push(`${label}: serialization for ${id} is only defined for FLOAT variables; ${variable.type} stays undecided`);
    } else if (isLocalAliasVariable(variable.valuesByMode)) {
      errors.push(`${label}: ${id} is a local alias and inherits the serialization of its targets; remove its entry`);
    } else if (!isObject(entry) || Object.keys(entry).sort().join(",") !== "css,source" || !validCss(entry.css) || !validSource(entry.source)) {
      errors.push(`${label}: serialization for ${id} needs css ({ kind: "unit", unit } | { kind: "unitless" } | { kind: "scale", factor, unit }) and a source ({ type: "bindings", evidence: [{ node, figmaProperty }] } or { type: "user" })`);
    } else {
      decisions.set(id, entry.css);
    }
  }
  return { errors, decisions };
}

/**
 * variables  Map<variableId, { type, valuesByMode }> for every local variable
 * decisions  Map<variableId, css> already validated
 * Returns resolve(id) => { status: "decided", css } | { status: "pending" } | { status: "conflict", message }
 */
export function createFloatResolver({ variables, decisions }) {
  const cache = new Map();
  const resolve = (id, trail = []) => {
    if (cache.has(id) && !trail.length) return cache.get(id);
    const variable = variables.get(id);
    let result;
    if (!variable || variable.type !== "FLOAT") {
      result = { status: "pending" };
    } else if (!isLocalAliasVariable(variable.valuesByMode)) {
      result = decisions.has(id) ? { status: "decided", css: decisions.get(id) } : { status: "pending" };
    } else if (trail.includes(id)) {
      result = { status: "conflict", message: `alias cycle through ${[...trail, id].join(" -> ")}` };
    } else {
      const targets = [...new Set(Object.values(variable.valuesByMode).map((raw) => raw.targetVariableId))];
      const resolved = targets.map((target) => resolve(target, [...trail, id]));
      const conflict = resolved.find((item) => item.status === "conflict");
      if (conflict) result = conflict;
      else if (resolved.some((item) => item.status === "pending")) result = { status: "pending" };
      else if (new Set(resolved.map((item) => cssKey(item.css))).size > 1) {
        result = { status: "conflict", message: "its alias targets need different serializations" };
      } else result = { status: "decided", css: resolved[0].css };
    }
    if (!trail.length) cache.set(id, result);
    return result;
  };
  return (id) => resolve(id);
}

/**
 * A variable with its own decision may alias a local target in some modes (a mixed variable).
 * Every aliased mode writes var(--target), so the target must be written too and use the same serialization.
 * variables    Map<variableId, { cssName, file, type, valuesByMode }> for every local variable
 * resolveFloat the resolver from createFloatResolver
 * Returns a list of error messages. All-alias variables are not checked here: the resolver makes them inherit.
 */
export function floatAliasProblems({ variables, resolveFloat }) {
  const errors = [];
  for (const variable of variables.values()) {
    if (variable.type !== "FLOAT" || !isObject(variable.valuesByMode) || isLocalAliasVariable(variable.valuesByMode)) continue;
    const own = resolveFloat(variable.id);
    if (own.status !== "decided") continue;
    for (const [mode, raw] of Object.entries(variable.valuesByMode)) {
      if (!isObject(raw) || raw.source !== "local") continue;
      const target = variables.get(raw.targetVariableId);
      if (!target || target.type !== "FLOAT") continue;
      const where = `tokens/${variable.file} ${variable.cssName}: mode ${JSON.stringify(mode)} aliases ${target.cssName}`;
      const resolved = resolveFloat(target.id);
      if (resolved.status === "pending") errors.push(`${where}, which has no serialization decision and is not written to tokens.css`);
      else if (resolved.status === "decided" && cssKey(resolved.css) !== cssKey(own.css)) {
        errors.push(`${where}, which uses a different serialization; one custom property cannot be both`);
      }
    }
  }
  return errors;
}
