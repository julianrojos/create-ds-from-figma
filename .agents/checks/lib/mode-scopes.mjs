// Rules for mapping Figma collection modes to CSS scopes and checking the generated declarations.
// Figma names a mode but does not say which CSS selector or media query activates it, so that
// mapping is a recorded decision: `modeScopes` in figma-state.json, one entry per non-default mode.
//   null                                                    decision pending: the mode is NOT VERIFIED
//   { "kind": "selector", "value": "[data-theme=\"dark\"]" }  one selector, emitted after the base :root
//   { "kind": "media", "query": "(min-width: 768px)", "order": 1 }  emitted in ascending `order`

import selectorParser from "postcss-selector-parser";
import { serializeNumber } from "./serialization.mjs";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const squash = (text) => String(text).replace(/\s+/g, " ").trim();

function validSelector(value) {
  if (!isText(value) || /[{};@]/.test(value)) return false;
  try {
    const parsed = selectorParser().astSync(value);
    return parsed.nodes.length === 1 && parsed.nodes[0].nodes.length > 0 && squash(value) !== ":root";
  } catch {
    return false;
  }
}

function validQuery(value) {
  if (!isText(value) || /[{};@]/.test(value)) return false;
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export function modeScopeProblems(record, data, label) {
  const errors = [];
  const warnings = [];
  const modes = Array.isArray(data?.modes) ? data.modes : [];
  const nonDefault = modes.filter((mode) => mode !== data.defaultMode);
  const scopes = record?.modeScopes;
  if (!isObject(scopes)) {
    errors.push(`${label}: modeScopes must be an object with one entry (or null) per non-default mode`);
    return { errors, warnings };
  }
  for (const key of Object.keys(scopes)) {
    if (!nonDefault.includes(key)) errors.push(`${label}: modeScopes has an entry for ${JSON.stringify(key)}, which is not a non-default mode of the collection`);
  }
  const selectors = new Map();
  const orders = new Map();
  for (const mode of nonDefault) {
    if (!Object.hasOwn(scopes, mode)) {
      errors.push(`${label}: modeScopes needs an entry (or null) for mode ${JSON.stringify(mode)}`);
      continue;
    }
    const scope = scopes[mode];
    if (scope === null) {
      warnings.push(`${label}: mode ${JSON.stringify(mode)} has no CSS scope yet; its values are NOT VERIFIED`);
      continue;
    }
    const keys = isObject(scope) ? Object.keys(scope).sort().join(",") : "";
    if (isObject(scope) && scope.kind === "selector" && keys === "kind,value" && validSelector(scope.value)) {
      const key = squash(scope.value);
      if (selectors.has(key)) errors.push(`${label}: modes ${selectors.get(key)} and ${mode} share the scope ${scope.value}`);
      else selectors.set(key, mode);
    } else if (isObject(scope) && scope.kind === "media" && keys === "kind,order,query" &&
               validQuery(scope.query) && Number.isInteger(scope.order) && scope.order >= 1) {
      if (orders.has(scope.order)) errors.push(`${label}: modes ${orders.get(scope.order)} and ${mode} share media order ${scope.order}`);
      else orders.set(scope.order, mode);
    } else {
      errors.push(`${label}: modeScopes[${JSON.stringify(mode)}] must be null, { kind: "selector", value } with one selector (not :root), or { kind: "media", query, order } with an integer order from 1`);
    }
  }
  return { errors, warnings };
}

const expectedValue = (raw, cssNameOf) => {
  if (isObject(raw)) {
    if (raw.source === "local") {
      const target = cssNameOf(raw.targetVariableId);
      return target ? `var(${target})` : undefined;
    }
    return typeof raw.value === "string" ? raw.value : undefined;
  }
  return typeof raw === "string" ? raw : undefined;
};
const expectedFloat = (raw, css, cssNameOf) => {
  if (isObject(raw)) {
    if (raw.source === "local") {
      const target = cssNameOf(raw.targetVariableId);
      return target ? `var(${target})` : undefined;
    }
    return serializeNumber(raw.value, css);
  }
  return serializeNumber(raw, css);
};
const sameValue = (left, right) => (left.startsWith("#") && right.startsWith("#")
  ? left.toUpperCase() === right.toUpperCase() : left === right);

/**
 * root          parsed tokens.css (a postcss Root)
 * collections   [{ label, record, data }] already checked by modeScopeProblems
 * cssNameOf     (variableId) => local cssName or undefined
 * resolveFloat optional (variableId) => { status, css } from serialization.mjs
 * COLOR values and FLOAT values with a serialization decision are verified; the rest stay NOT VERIFIED.
 */
export function modeDeclarationProblems({ root, collections, cssNameOf, resolveFloat }) {
  const errors = [];
  const warnings = [];
  const top = root.nodes;
  const baseIndex = top.findIndex((node) => node.type === "rule" && squash(node.selector) === ":root");
  for (const { label, record, data } of collections) {
    const mapped = Object.entries(record.modeScopes).filter(([, scope]) => scope !== null);
    const blocks = new Map();
    for (const [mode, scope] of mapped) {
      const found = top.filter((node) => (scope.kind === "selector"
        ? node.type === "rule" && squash(node.selector) === squash(scope.value)
        : node.type === "atrule" && node.name === "media" && squash(node.params) === squash(scope.query)));
      if (!found.length) {
        errors.push(`${label}: no CSS block for mode ${JSON.stringify(mode)} (${scope.kind === "selector" ? scope.value : `@media ${scope.query}`})`);
        continue;
      }
      if (baseIndex < 0 || found.some((node) => top.indexOf(node) < baseIndex)) {
        errors.push(`${label}: the CSS block for mode ${JSON.stringify(mode)} must come after the base :root block`);
      }
      const declarations = new Map();
      const rules = scope.kind === "selector"
        ? found
        : found.flatMap((atrule) => (atrule.nodes || []).filter((node) => node.type === "rule" && squash(node.selector) === ":root"));
      for (const rule of rules) {
        for (const node of rule.nodes || []) {
          if (node.type !== "decl" || !node.prop.startsWith("--")) continue;
          if (declarations.has(node.prop)) errors.push(`${label}: duplicate ${node.prop} in the CSS block for mode ${JSON.stringify(mode)}`);
          declarations.set(node.prop, node.value.trim());
        }
      }
      blocks.set(mode, { declarations, index: Math.min(...found.map((node) => top.indexOf(node))) });
    }
    const media = mapped.filter(([, scope]) => scope.kind === "media").sort((a, b) => a[1].order - b[1].order);
    for (let i = 1; i < media.length; i += 1) {
      const before = blocks.get(media[i - 1][0]);
      const after = blocks.get(media[i][0]);
      if (before && after && before.index > after.index) {
        errors.push(`${label}: media blocks must follow ascending order (${JSON.stringify(media[i - 1][0])} before ${JSON.stringify(media[i][0])})`);
      }
    }
    let unverified = false;
    for (const [mode] of mapped) {
      const block = blocks.get(mode);
      if (!block) continue;
      for (const [name, variable] of Object.entries(data.variables)) {
        let wanted;
        let base;
        if (variable.type === "COLOR") {
          wanted = expectedValue(variable.valuesByMode[mode], cssNameOf);
          base = expectedValue(variable.valuesByMode[data.defaultMode], cssNameOf);
        } else if (variable.type === "FLOAT") {
          const resolved = resolveFloat?.(variable.id);
          if (resolved?.status !== "decided") {
            unverified = true;
            continue;
          }
          wanted = expectedFloat(variable.valuesByMode[mode], resolved.css, cssNameOf);
          base = expectedFloat(variable.valuesByMode[data.defaultMode], resolved.css, cssNameOf);
        } else {
          unverified = true;
          continue;
        }
        if (wanted === undefined || base === undefined) continue;
        const declared = block.declarations.get(variable.cssName);
        if (declared === undefined) {
          if (!sameValue(wanted, base)) errors.push(`${label} ${name}: mode ${JSON.stringify(mode)} differs from the default but ${variable.cssName} is not declared in its CSS block`);
        } else if (!sameValue(declared, wanted)) {
          errors.push(`${label} ${name}: ${variable.cssName} in mode ${JSON.stringify(mode)} is ${declared}, expected ${wanted}`);
        }
      }
    }
    if (unverified) warnings.push(`${label}: only COLOR values and FLOAT values with a serialization decision are verified in mode scopes; the rest are NOT VERIFIED`);
  }
  return { errors, warnings };
}
