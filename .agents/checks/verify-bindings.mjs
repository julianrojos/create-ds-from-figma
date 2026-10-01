import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const readJson = (root, relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const directClass = /^(?:\.[A-Za-z_][\w-]*)+$/;
const directVar = /^var\(\s*(--[A-Za-z_][\w-]*)\s*\)$/;
const literalProperty = /^(?:color|background-color|border(?:-(?:top|right|bottom|left))?-color|(?:min-|max-)?(?:width|height)|(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block))?|gap|row-gap|column-gap|border(?:-(?:top|right|bottom|left))?-radius|font-size|line-height|font-family)$/;

function selectorUsesClass(selector, className) {
  let found = false;
  selectorParser((selectors) => selectors.walkClasses((node) => {
    if (node.value !== className) return;
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.type === "pseudo" && [":not", ":has", ":global"].includes(parent.value.toLowerCase())) return;
    }
    found = true;
  })).processSync(selector);
  return found;
}

function borderEffect(property) {
  if (property === "border") return { scope: "all", channel: "all" };
  const match = /^border-(?:(color|width|style)|(inline|block|top|right|bottom|left|inline-start|inline-end|block-start|block-end)(?:-(color|width|style))?)$/.exec(property);
  if (!match) return null;
  return { scope: match[2] || "all", channel: match[1] || match[3] || "all" };
}

function borderEffectsOverlap(left, right) {
  const first = borderEffect(left);
  const second = borderEffect(right);
  if (!first || !second || (first.channel !== "all" && second.channel !== "all" && first.channel !== second.channel)) return false;
  if (first.scope === "all" || second.scope === "all") return true;
  const physical = new Set(["top", "right", "bottom", "left"]);
  const firstPhysical = physical.has(first.scope);
  const secondPhysical = physical.has(second.scope);
  if (firstPhysical && secondPhysical) return first.scope === second.scope;
  if (firstPhysical !== secondPhysical) return true;
  const axis = (scope) => scope.split("-")[0];
  return axis(first.scope) === axis(second.scope) &&
    (first.scope === second.scope || first.scope === axis(first.scope) || second.scope === axis(second.scope));
}

function radiusCornersOverlap(left, right) {
  const physical = /^border-(?:top|bottom)-(?:left|right)-radius$/;
  const logical = /^border-(?:start|end)-(?:start|end)-radius$/;
  return (physical.test(left) && logical.test(right)) || (logical.test(left) && physical.test(right));
}

function shorthandAffects(candidate, property) {
  if (candidate === property || candidate === "all") return true;
  if (candidate === "background") return property.startsWith("background-");
  if (candidate === "font") return property.startsWith("font-") || property === "line-height";
  if (candidate === "gap") return property === "row-gap" || property === "column-gap";
  if (candidate === "border-radius") return /^border-(?:(?:top|bottom)-(?:left|right)|(?:start|end)-(?:start|end))-radius$/.test(property);
  for (const group of ["margin", "padding"]) {
    if (candidate === group) return property.startsWith(`${group}-`);
    if (candidate === `${group}-inline` || candidate === `${group}-block`) {
      return property.startsWith(`${candidate}-`) ||
        // Any physical side may correspond to a logical side under a different writing mode.
        /^(?:top|right|bottom|left)$/.test(property.slice(group.length + 1)) && property.startsWith(`${group}-`);
    }
    if (candidate.startsWith(`${group}-`) && property.startsWith(`${group}-`) &&
        /^(?:inline|block)-(?:start|end)$/.test(candidate.slice(group.length + 1)) &&
        /^(?:top|right|bottom|left)$/.test(property.slice(group.length + 1))) return true;
  }
  return false;
}

const mayAffect = (left, right) => borderEffectsOverlap(left, right) || radiusCornersOverlap(left, right) ||
  shorthandAffects(left, right) || shorthandAffects(right, left);

function tokenNames(root) {
  const names = new Map();
  const directory = path.join(root, "design-system/tokens");
  if (!existsSync(directory)) return names;
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    const collection = readJson(root, `design-system/tokens/${file}`);
    for (const variable of Object.values(collection.variables || {})) names.set(variable.id, variable.cssName);
  }
  return names;
}

function declaration(css, selector, property, partSelector) {
  if (!directClass.test(selector)) return { reason: "selector construct not supported" };
  if (!/^\.[A-Za-z_][\w-]*$/.test(partSelector || "")) return { reason: "part class not recorded" };
  const partClass = partSelector.slice(1);
  if (!selectorUsesClass(selector, partClass)) return { reason: "selector does not contain recorded part class" };
  const rules = [];
  css.walkRules((rule) => {
    if (rule.selector === selector) rules.push(rule);
  });
  if (rules.some((rule) => rule.parent.type !== "root")) return { reason: "conditional CSS rule not evaluated" };
  if (rules.length !== 1) return { reason: rules.length ? "multiple CSS rules not evaluated" : "selector absent; inheritance not evaluated" };
  if (rules[0].nodes.some((node) => node.type !== "decl" && node.type !== "comment")) {
    return { reason: "nested CSS not evaluated" };
  }
  let override = false;
  css.walkDecls((decl) => {
    if (decl.parent !== rules[0] && mayAffect(decl.prop, property)) override = true;
  });
  const declarations = rules[0].nodes.filter((node) => node.type === "decl" && node.prop === property);
  if (declarations.length !== 1) return { reason: declarations.length ? "CSS cascade not evaluated" : "property absent; inheritance not evaluated" };
  if (rules[0].nodes.some((node) => node.type === "decl" && node.prop !== property && mayAffect(node.prop, property))) {
    override = true;
  }
  return { value: declarations[0].value.trim(), possibleOverride: override };
}

export function report(root, componentName) {
  const map = readJson(root, "design-system/relationships/figma-code-map.json");
  const localNames = tokenNames(root);
  const tokenCss = postcss.parse(readFileSync(path.join(root, "src/styles/tokens.css"), "utf8"));
  const definedNames = new Set();
  tokenCss.walkDecls((decl) => {
    if (decl.prop.startsWith("--")) definedNames.add(decl.prop);
  });
  const results = [];
  for (const entry of Object.values(map).filter((item) => item?.name && (!componentName || item.name === componentName))) {
    const metadata = readJson(root, entry.designSystem.metadata);
    const css = postcss.parse(readFileSync(path.join(root, entry.code.style), "utf8"));
    const localCustomProperties = new Set();
    css.walkDecls((decl) => {
      if (decl.prop.startsWith("--")) localCustomProperties.add(decl.prop);
    });
    const names = new Map(localNames);
    for (const variable of metadata.externalVariables || []) names.set(variable.id, variable.cssName);
    const covered = new Set();
    if (!(metadata.bindings?.length || metadata.measuredLiterals?.length)) {
      results.push({ component: entry.name, type: "coverage", status: "NOT_RUN",
        reason: "no binding or measured literal observations recorded" });
    }
    for (const [type, records] of [["binding", metadata.bindings || []], ["literal", metadata.measuredLiterals || []]]) {
      for (const record of records) {
        const result = { component: entry.name, type, part: record.part, variant: record.variant,
          property: record.cssProperty, selector: record.cssSelector };
        covered.add(`${record.cssSelector}\u0000${record.cssProperty}`);
        const found = declaration(css, record.cssSelector, record.cssProperty, metadata.parts?.[record.part]?.selector);
        if (found.reason) {
          results.push({ ...result, status: "NOT_RUN", writtenStatus: "NOT_RUN", reason: found.reason });
          continue;
        }
        if (type === "literal") {
          if (/^(?:calc|min|max|clamp|var)\(/.test(found.value)) {
            results.push({ ...result, status: "NOT_RUN", writtenStatus: "NOT_RUN", reason: "computed CSS literal not evaluated" });
          } else {
            const matches = found.value === record.value;
            const reason = matches && record.modeOverride ? "forced Figma mode not evaluated"
              : matches && found.possibleOverride ? "potential cascade override not evaluated" : undefined;
            results.push({ ...result, status: matches ? reason ? "NOT_RUN" : "PASS" : "FAIL",
              writtenStatus: matches ? "PASS" : "FAIL",
              expected: record.value, actual: found.value,
              ...(reason ? { reason } : {}) });
          }
          continue;
        }
        const expected = names.get(record.variableId);
        if (!expected || !definedNames.has(expected)) {
          results.push({ ...result, status: "FAIL", writtenStatus: "FAIL", reason: `variable ${record.variableId} has no defined CSS custom property` });
          continue;
        }
        const used = directVar.exec(found.value)?.[1];
        if (!used && /^(?:calc|min|max|clamp|var)\(/.test(found.value)) {
          results.push({ ...result, status: "NOT_RUN", writtenStatus: "NOT_RUN", reason: "computed or fallback value not evaluated" });
        } else if (found.value === "inherit" || found.value === "initial" || found.value === "unset") {
          results.push({ ...result, status: "NOT_RUN", writtenStatus: "NOT_RUN", reason: "inherited value not evaluated" });
        } else {
          const matches = used === expected;
          const reason = matches && record.modeOverride ? "forced Figma mode not evaluated"
            : matches && localCustomProperties.has(expected)
            ? "component CSS redefines bound custom property; effective value not evaluated"
            : matches && found.possibleOverride ? "potential cascade override not evaluated" : undefined;
          results.push({ ...result, status: matches ? reason ? "NOT_RUN" : "PASS" : "FAIL",
            writtenStatus: matches ? "PASS" : "FAIL",
            expected: `var(${expected})`, actual: found.value,
            ...(reason ? { reason } : {}) });
        }
      }
    }
    css.walkDecls((decl) => {
      const parent = decl.parent;
      const selector = parent.type === "rule" ? parent.selector : `@${parent.name || parent.type}`;
      if (covered.has(`${selector}\u0000${decl.prop}`)) return;
      const value = decl.value.trim();
      const subject = { component: entry.name, selector, property: decl.prop, actual: value };
      if (parent.type !== "rule" || parent.parent.type !== "root" || !directClass.test(selector)) {
        results.push({ ...subject, type: "uncovered-declaration", status: "NOT_RUN",
          reason: "conditional or complex selector declaration not evaluated" });
        return;
      }
      if (!literalProperty.test(decl.prop)) {
        results.push({ ...subject, type: "uncovered-declaration", status: "NOT_RUN",
          reason: "property not supported for direct literal comparison" });
        return;
      }
      if (directVar.test(value)) {
        results.push({ ...subject, type: "uncovered-binding", status: "NOT_RUN",
          reason: "CSS variable has no recorded Figma binding" });
        return;
      }
      const colorFunction = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/i.test(value);
      const computed = (!colorFunction && /[()]/.test(value)) ||
        /^(?:inherit|initial|unset|revert|auto)$/.test(value) || value.endsWith("%");
      results.push({ ...subject, type: "unrecorded-literal", status: computed ? "NOT_RUN" : "FAIL",
        reason: computed ? "unrecorded computed or inherited value not evaluated" : "literal has no measured Figma record" });
    });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || ".");
  const componentName = process.argv[3];
  try {
    const results = report(root, componentName);
    for (const result of results) {
      const subject = [result.component, result.type, result.variant, result.selector, result.property].filter(Boolean).join(" ");
      const written = result.writtenStatus ? ` [written ${result.writtenStatus}]` : "";
      console.log(`${result.status}${written} ${subject}: ${result.reason || `${result.actual} (expected ${result.expected})`}`);
    }
    const counts = Object.fromEntries(["PASS", "FAIL", "NOT_RUN"].map((status) => [status, results.filter((item) => item.status === status).length]));
    console.log(`REPORT ${JSON.stringify(counts)}; written identity and effective browser values must both be verified`);
  } catch (error) {
    console.error(`NOT_RUN binding report: ${error.message}`);
    process.exitCode = 1;
  }
}
