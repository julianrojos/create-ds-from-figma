import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import ts from "typescript";
import { aliasCycleProblems } from "./lib/alias-cycles.mjs";
import { assessTokenPrefix, customPropertyDeclarations } from "./lib/design-system-state.mjs";
import { modeDeclarationProblems, modeScopeProblems } from "./lib/mode-scopes.mjs";
import { GENERATOR_COMMAND, firstDifference, generateTokensCss } from "./lib/tokens-css.mjs";
import { bindingTypeProblem } from "./lib/property-types.mjs";
import { createFloatResolver, floatAliasProblems, isLocalAliasVariable, serializationProblems, serializeNumber } from "./lib/serialization.mjs";
import { isPortableTokenFileName, tokenFileKey } from "./lib/token-file-name.mjs";
import { verifyFigmaEvidence } from './verify-figma-evidence.mjs';

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const tokenTypes = {
  COLOR: { format: "#RRGGBB or #RRGGBBAA", valid: (value) => typeof value === "string" && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) },
  FLOAT: { format: "a finite number", valid: (value) => typeof value === "number" && Number.isFinite(value) },
  STRING: { format: "a string", valid: (value) => typeof value === "string" },
  BOOLEAN: { format: "a boolean", valid: (value) => typeof value === "boolean" },
};
// RegExp.test coerces its argument, so undefined would match as the text "undefined".
const matches = (pattern, value) => typeof value === "string" && pattern.test(value);
// Text nobody wrote. A value that is entirely <something> is a template placeholder, and TODO-style markers or
// stock filler stand in for content just as well. Angle brackets inside a longer text (a description that
// mentions <button>) are legitimate, and Spanish "Todo el ..." is ordinary prose, so the markers are
// case-sensitive uppercase words at the start and the stock phrases must be the entire value.
const stockFiller = /^(?:pendiente|por (?:rellenar|definir|completar)|lorem ipsum.*|\.{3}|…)$/i;
// A whole line that is a tag, a closing tag or a JSX self-closing element is markup in prose, not a placeholder.
// An attribute needs a value, except the HTML boolean ones, so a phrase such as "<Cuando usarlo.>" or "<Una frase.>"
// is not a tag. A placeholder shaped like one (a lone <Nombre>, one lowercase word) is not detected in the body
// of a usage.md; the heading rule still catches <Nombre> there. Wrap such a line in a code block to show it.
const booleanAttributes = "open|disabled|hidden|checked|selected|readonly|required|controls|autoplay|loop|muted";
const markupLine = new RegExp(
  "^<\\/?[A-Za-z][A-Za-z0-9:.-]*" +
  "(?:\\s+(?:[\\w:.-]+=(?:\"[^\"]*\"|'[^']*'|\\{[^{}]*\\}|[^\\s\"'<>=]+)|(?:" + booleanAttributes + ")(?![\\w:.-])))*" +
  "\\s*\\/?>$",
);
function unfilledKind(text, { prose = false } = {}) {
  const value = text.trim().replace(/^(?:[-*+]\s+)/, "");
  if (/^<[^<>]+>$/.test(value) && !(prose && markupLine.test(value))) return "template placeholder";
  if (/^(?:TODO|FIXME|TBD|XXX)\b/.test(value) || stockFiller.test(value) || stockFiller.test(value.replace(/[.:;!\s]+$/, ""))) return "filler text";
  return null;
}
function placeholderPaths(value, trail = "metadata") {
  if (typeof value === "string") {
    const kind = unfilledKind(value);
    return kind ? [{ where: trail, kind }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => placeholderPaths(item, `${trail}[${index}]`));
  if (isObject(value)) return Object.entries(value).flatMap(([key, item]) => placeholderPaths(item, `${trail}.${key}`));
  return [];
}
// The prose of a markdown file: HTML comments, fenced blocks (``` or ~~~), indented blocks and code spans are blanked,
// keeping line numbers, because code may show <Component /> freely.
function markdownProse(markdown, { keepInlineCode = false } = {}) {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, "")).split("\n");
  let fence = null;
  let previousBlankOrCode = true;
  return lines.map((line) => {
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      previousBlankOrCode = true;
      return "";
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) {
      fence = open[1];
      previousBlankOrCode = true;
      return "";
    }
    if (/^(?: {4}|\t)/.test(line) && previousBlankOrCode && line.trim()) return "";
    previousBlankOrCode = !line.trim();
    return keepInlineCode ? line : line.replace(/(`+)(?:(?!\1).)+?\1/g, "");
  });
}
function usagePlaceholders(markdown) {
  const found = [];
  markdownProse(markdown).forEach((line, index) => {
    const trimmed = line.trim();
    const kind = unfilledKind(trimmed, { prose: true }) ??
      (/^#/.test(trimmed) && /<[A-ZÁÉÍÓÚÑ][^<>]*>/.test(trimmed) ? "template placeholder" : null);
    if (kind) found.push({ line: index + 1, kind });
  });
  return found;
}
function correspondenceSectionError(markdown) {
  // Inline code stays: a table row made only of `code` cells is still a populated row.
  const lines = markdownProse(markdown, { keepInlineCode: true });
  const headings = lines.flatMap((line, index) =>
    /^ {0,3}## Figma to code correspondences\s*(?:#+\s*)?$/.test(line) ? [index] : []);
  if (headings.length !== 1) return "requires exactly one real ## Figma to code correspondences section";
  const start = headings[0] + 1;
  const next = lines.findIndex((line, index) => index >= start && /^ {0,3}#{1,2}(?:\s|$)/.test(line));
  const section = lines.slice(start, next < 0 ? lines.length : next);
  const body = section.filter((line) => line.trim());
  if (body.length === 0) return "Figma to code correspondences section is empty";
  for (const line of body) {
    const match = line.trim().match(/^None:\s*(.*)$/);
    if (!match) continue;
    // Judge the reason without its code delimiters, which are kept in the text: `TODO` is still filler.
    const reason = match[1].replace(/(`+)((?:(?!\1).)*?)\1/g, "$2").trim().replace(/[.:;!\s]+$/, "");
    if (!reason || unfilledKind(reason) || /^(?:(?:con el )?motivo real|raz[oó]n real)$/i.test(reason)) {
      return "Figma to code correspondences: None: requires a nonempty reason without placeholders or filler";
    }
    return null;
  }
  // Recognize a populated table, not its column contract or the truth of its evidence.
  const delimiter = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  // Header, delimiter and data row must be consecutive lines: blank lines split a Markdown table.
  for (let index = 1; index < section.length - 1; index++) {
    if (delimiter.test(section[index]) && section[index - 1].includes("|") &&
        /^\s*\|.*\S.*\|\s*$/.test(section[index + 1]) && !delimiter.test(section[index + 1]) &&
        section[index + 1].replace(/[|\s]/g, "")) return null;
  }
  return "Figma to code correspondences requires a populated table or None: followed by a reason";
}
const sameSet = (left, right) => left.size === right.size && [...left].every((item) => right.has(item));

function selectedClasses(selector) {
  const classes = new Set();
  selectorParser((selectors) => selectors.walkClasses((node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.type === "pseudo" && [":not", ":has", ":global"].includes(parent.value.toLowerCase())) return;
    }
    classes.add(node.value);
  })).processSync(selector);
  return classes;
}

function staticJsxParts(source, fileName) {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const parts = new Set();
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.text === "data-ds-part" &&
        node.initializer && ts.isStringLiteral(node.initializer)) parts.add(node.initializer.text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { parts, hasSyntaxErrors: tree.parseDiagnostics.length > 0 };
}

export function verify(root) {
  const errors = [];
  const warnings = [];
  const fail = (message) => errors.push(message);
  const warn = (message) => warnings.push(message);
  const readJson = (relative) => {
    try {
      return JSON.parse(readFileSync(path.join(root, relative), "utf8"));
    } catch (error) {
      fail(`${relative}: ${error.message}`);
      return undefined;
    }
  };
  const localFile = (relative, label) => {
    if (!isText(relative) || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) {
      fail(`${label}: invalid project-relative path`);
      return false;
    }
    const fullPath = path.join(root, relative);
    if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
      fail(`${label}: missing ${relative}`);
      return false;
    }
    return true;
  };

  const map = readJson("design-system/relationships/figma-code-map.json");
  const state = readJson("design-system/relationships/figma-state.json");
  if (!isObject(map) || !isObject(state)) return { errors, warnings };
  if (!isObject(state.components)) fail("figma-state.json: components must be an object");

  const entries = Object.entries(map).filter(([key]) => !key.startsWith("_"));
  const names = new Set();
  const refOwners = new Map();
  const entryKeysByName = new Map();
  const bindingRecords = [];
  for (const [key, entry] of entries) {
    if (!isObject(entry) || !isText(entry.name) || !isObject(entry.figma) || !isObject(entry.code) || !isObject(entry.designSystem)) {
      fail(`map ${key}: name, figma, code and designSystem are required`);
      continue;
    }
    const name = entry.name;
    if (names.has(name)) fail(`map: duplicate component name ${name}`);
    names.add(name);
    entryKeysByName.set(name, key);
    if (!isText(entry.code.component) || entry.code.component !== name) fail(`map ${key}: code.component must equal ${name}`);
    const hasCode = localFile(entry.code.path, `map ${key} code.path`);
    const hasStyle = localFile(entry.code.style, `map ${key} code.style`);
    localFile(entry.designSystem.metadata, `map ${key} metadata`);
    localFile(entry.designSystem.usage, `map ${key} usage`);
    const rootRefs = entry.figma.refs;
    if (!Array.isArray(rootRefs) || !rootRefs.includes(key)) fail(`map ${key}: figma.refs must include its entry key`);
    const variants = entry.figma.variants;
    if (!isObject(variants)) fail(`map ${key}: figma.variants must be an object`);
    const allRefs = [...(Array.isArray(rootRefs) ? rootRefs : [])];
    for (const [variantKey, variant] of Object.entries(isObject(variants) ? variants : {})) {
      if (!isObject(variant) || !Array.isArray(variant.refs) || variant.refs.length === 0 || !isObject(variant.props)) {
        fail(`map ${key} variant ${variantKey}: refs and props are required`);
        continue;
      }
      allRefs.push(...variant.refs);
    }
    for (const ref of allRefs) {
      if (!isText(ref) || !ref.includes(":")) {
        fail(`map ${key}: invalid ref ${JSON.stringify(ref)}`);
      } else if (refOwners.has(ref)) {
        fail(`map: duplicate ref ${ref} in ${refOwners.get(ref)} and ${key}`);
      } else {
        refOwners.set(ref, key);
      }
    }
    if (!isText(entry.designSystem.metadata) || !existsSync(path.join(root, entry.designSystem.metadata))) continue;
    const metadata = readJson(entry.designSystem.metadata);
    if (!isObject(metadata)) continue;
    if (metadata.name !== name || metadata.code?.component !== name || metadata.code?.path !== entry.code.path) {
      fail(`${name}: metadata name/code differs from map`);
    }
    for (const { where, kind } of placeholderPaths(metadata)) fail(`${name}: ${where} still holds a ${kind}; fill it in or remove it`);
    if (isText(entry.designSystem.usage) && existsSync(path.join(root, entry.designSystem.usage))) {
      const usage = readFileSync(path.join(root, entry.designSystem.usage), "utf8");
      for (const { line, kind } of usagePlaceholders(usage)) {
        fail(`${name}: ${entry.designSystem.usage}:${line} still holds a ${kind}; fill it in or remove it`);
      }
      const sectionError = correspondenceSectionError(usage);
      if (sectionError) fail(`${name}: ${entry.designSystem.usage}: ${sectionError}`);
    }
    if (typeof metadata.figma?.url === "string" && /[<>]/.test(metadata.figma.url)) {
      fail(`${name}: metadata.figma.url still holds template placeholders`);
    }
    if (metadata.figma?.fileKey !== entry.figma.fileKey || metadata.figma?.nodeId !== entry.figma.nodeId) {
      fail(`${name}: metadata Figma identity differs from map`);
    }
    if (!isObject(metadata.variants) || !Array.isArray(metadata.states) || !Array.isArray(metadata.tokens)) {
      fail(`${name}: variants must be an object; states and tokens must be lists`);
    }
    const states = new Map();
    if (Array.isArray(metadata.states)) {
      for (const [index, stateRecord] of metadata.states.entries()) {
        if (!isObject(stateRecord) || !isText(stateRecord.name) || !["consumer", "shared", "internal"].includes(stateRecord.control)) {
          fail(`${name}: states[${index}] needs name and control (consumer | shared | internal)`);
        } else if (states.has(stateRecord.name)) {
          fail(`${name}: duplicate state ${stateRecord.name}`);
        } else {
          states.set(stateRecord.name, stateRecord.control);
        }
      }
    }
    const expectedValues = new Map();
    for (const variant of Object.values(isObject(variants) ? variants : {})) {
      if (!isObject(variant?.props)) continue;
      for (const [axis, value] of Object.entries(variant.props)) {
        const values = expectedValues.get(axis) || new Set();
        values.add(String(value));
        expectedValues.set(axis, values);
      }
    }
    if (isObject(metadata.variants)) {
      if (!sameSet(new Set(Object.keys(metadata.variants)), new Set(expectedValues.keys()))) {
        fail(`${name}: metadata variants axes differ from Figma map`);
      }
      for (const [axis, values] of expectedValues) {
        const listed = metadata.variants[axis];
        if (!Array.isArray(listed) || !listed.every(isText) || listed.length !== new Set(listed).size ||
            !sameSet(new Set(listed), values)) {
          fail(`${name}: metadata variants values for ${axis} differ from Figma map`);
        }
      }
    }
    const classified = metadata.variantClassification;
    if (!isObject(classified) || !sameSet(new Set(Object.keys(classified)), new Set(expectedValues.keys()))) {
      fail(`${name}: variantClassification axes differ from Figma map`);
    }
    for (const [axis, values] of expectedValues) {
      const classifiedValues = isObject(classified?.[axis]) ? classified[axis] : {};
      if (!sameSet(new Set(Object.keys(classifiedValues)), values)) {
        fail(`${name}: variantClassification values for ${axis} differ from Figma map`);
      }
      for (const [value, decision] of Object.entries(classifiedValues)) {
        if (!isObject(decision) || !["prop", "state", "interaction", "content"].includes(decision.kind)) {
          fail(`${name}: ${axis}=${value} needs kind (prop | state | interaction | content)`);
        } else if (decision.kind === "prop" && !isText(decision.codeProp)) {
          fail(`${name}: ${axis}=${value} needs codeProp`);
        } else if (decision.kind === "content" && !isText(decision.part)) {
          fail(`${name}: ${axis}=${value} needs content part`);
        } else if (["state", "interaction"].includes(decision.kind)) {
          if (!isText(decision.state) || !states.has(decision.state)) {
            fail(`${name}: ${axis}=${value} refers to an undeclared state`);
          } else if (decision.kind === "interaction" && states.get(decision.state) !== "internal") {
            fail(`${name}: ${axis}=${value} interaction state must be internal`);
          }
        }
      }
    }
    const covered = metadata.figmaCoverage?.variants;
    if (!Array.isArray(covered) || !covered.every(isText) || new Set(covered).size !== covered.length) {
      fail(`${name}: figmaCoverage.variants must list distinct variant keys`);
    } else if (!sameSet(new Set(covered), new Set(Object.keys(isObject(variants) ? variants : {})))) {
      fail(`${name}: figmaCoverage.variants differs from figma-code-map.json`);
    }
    // Whether the tool returned styles must outlive the run: an empty list alone cannot tell "none exist" from "not returned".
    const styleCapture = metadata.figmaCoverage?.styles;
    const captureOk = isObject(styleCapture) && ["captured", "unavailable"].includes(styleCapture.status) && isText(styleCapture.source) &&
      (styleCapture.status === "unavailable" ? isText(styleCapture.reason) : !("reason" in styleCapture));
    if (!captureOk) {
      fail(`${name}: figmaCoverage.styles needs status captured (source) or unavailable (source and reason)`);
    } else if (styleCapture.status === "unavailable" && Array.isArray(metadata.styles) && metadata.styles.length) {
      fail(`${name}: figmaCoverage.styles is unavailable, so styles must be empty`);
    }
    const styleApplications = new Map();
    if (!Array.isArray(metadata.styles)) {
      fail(`${name}: styles must be a list`);
    } else {
      for (const [index, style] of metadata.styles.entries()) {
        const label = `${name}: styles[${index}]`;
        if (!isObject(style) || !matches(/^[a-z][a-z0-9-]*$/, style.ref) ||
            !["TEXT", "EFFECT", "PAINT"].includes(style.type) ||
            !isText(style.name) || !isText(style.id) || !isText(style.fileKey) ||
            ("key" in style && !isText(style.key)) || !Array.isArray(style.nodes) || !style.nodes.length) {
          fail(`${label}: ref, type, name, id, fileKey and application nodes are required`);
          continue;
        }
        if (styleApplications.has(style.ref)) fail(`${label}: duplicate style ref ${style.ref}`);
        const nodes = new Set();
        for (const [nodeIndex, application] of style.nodes.entries()) {
          const applicationLabel = `${label}.nodes[${nodeIndex}]`;
          if (!isObject(application) || !isText(application.node) ||
              !application.node.startsWith(`${entry.figma.fileKey}:`)) {
            fail(`${applicationLabel}: node must be a ref in the component's Figma file`);
            continue;
          }
          const hasRange = ["start", "end", "rangesSource"].some((field) => field in application);
          if (hasRange && (style.type !== "TEXT" ||
              !Number.isInteger(application.start) || application.start < 0 ||
              !Number.isInteger(application.end) || application.end <= application.start ||
              !isText(application.rangesSource))) {
            fail(`${applicationLabel}: a text range needs start < end and rangesSource`);
          }
          nodes.add(application.node);
        }
        if (!styleApplications.has(style.ref)) styleApplications.set(style.ref, nodes);
      }
    }
    const parts = metadata.parts;
    if (!isObject(parts) || !isObject(parts.root)) {
      fail(`${name}: parts must contain a root part`);
    } else {
      const source = hasCode ? readFileSync(path.join(root, entry.code.path), "utf8") : null;
      const jsxParts = source === null ? null : staticJsxParts(source, entry.code.path);
      if (jsxParts?.hasSyntaxErrors) fail(`${name}: TSX has syntax errors`);
      let stylesheet = null;
      if (hasStyle) {
        try {
          stylesheet = postcss.parse(readFileSync(path.join(root, entry.code.style), "utf8"), { from: entry.code.style });
        } catch (error) {
          fail(`${name}: invalid CSS in ${entry.code.style}: ${error.message}`);
        }
      }
      const styleClasses = new Set();
      stylesheet?.walkRules((rule) => {
        try {
          for (const className of selectedClasses(rule.selector)) styleClasses.add(className);
        } catch (error) {
          fail(`${name}: invalid CSS selector ${rule.selector}: ${error.message}`);
        }
      });
      const variantKeys = new Set(Object.keys(isObject(variants) ? variants : {}));
      const unvarianted = variantKeys.size === 0;
      for (const [partName, part] of Object.entries(parts)) {
        if (!/^[a-z][a-z0-9-]*$/.test(partName) || !isObject(part) ||
            !matches(/^\.[A-Za-z_][\w-]*$/, part.selector) || !isObject(part.nodes)) {
          fail(`${name}: part ${partName} needs a CSS class selector and variant-to-node refs`);
          continue;
        }
        if (jsxParts !== null && !jsxParts.parts.has(partName)) {
          fail(`${name}: part ${partName} is missing its static data-ds-part in TSX; use a literal JSX attribute such as data-ds-part="${partName}", not an expression`);
        }
        if (stylesheet !== null && !styleClasses.has(part.selector.slice(1))) {
          fail(`${name}: part ${partName} selector ${part.selector} is missing from CSS`);
        }
        if (partName !== "root" && !Object.keys(part.nodes).length) fail(`${name}: part ${partName} has no Figma nodes`);
        for (const [variantKey, ref] of Object.entries(part.nodes)) {
          if (!(variantKeys.has(variantKey) || (unvarianted && variantKey === "default")) ||
              !isText(ref) || !ref.startsWith(`${entry.figma.fileKey}:`)) {
            fail(`${name}: part ${partName} has invalid node ref for ${variantKey}`);
          } else if (partName === "root" &&
              !(unvarianted
                ? Array.isArray(rootRefs) && rootRefs.includes(ref)
                : Array.isArray(variants?.[variantKey]?.refs) && variants[variantKey].refs.includes(ref))) {
            fail(`${name}: root node ref for ${variantKey} differs from Figma map`);
          }
        }
        if (partName === "root" && !sameSet(new Set(Object.keys(part.nodes)), unvarianted ? new Set(["default"]) : variantKeys)) {
          fail(`${name}: root part must cover every Figma variant`);
        }
      }
      for (const marker of jsxParts?.parts ?? []) {
        if (!Object.hasOwn(parts, marker)) {
          warn(`${name}: TSX has a static data-ds-part="${marker}" that metadata.parts does not declare; a marker shows what the source writes, not what renders, so confirm it in the DOM`);
        }
      }
    }
    const observations = [
      ["bindings", metadata.bindings],
      ["measuredLiterals", metadata.measuredLiterals],
    ];
    const observedProperties = new Set();
    for (const [kind, records] of observations) {
      if (!Array.isArray(records)) {
        fail(`${name}: ${kind} must be a list`);
        continue;
      }
      for (const [index, record] of records.entries()) {
        const label = `${name}: ${kind}[${index}]`;
        const node = kind === "bindings" ? record?.node : record?.source;
        if (!isObject(record) || !isText(record.part) || !isText(record.variant) ||
            !isText(record.figmaProperty) || !matches(/^[a-z][a-z0-9-]*$/, record.cssProperty) ||
            !isText(record.cssSelector) || !isText(node) ||
            !isObject(parts?.[record.part]) || parts[record.part].nodes?.[record.variant] !== node) {
          fail(`${label}: part, variant, Figma node, Figma property, CSS property and selector must match the part record`);
          continue;
        }
        const partSelector = parts[record.part].selector;
        const escapedPart = partSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`${escapedPart}(?![\\w-])`).test(record.cssSelector)) {
          fail(`${label}: CSS selector must include the part class`);
        }
        const key = `${record.part}\u0000${record.variant}\u0000${record.cssProperty}`;
        if (observedProperties.has(key)) fail(`${label}: duplicate or conflicting property observation`);
        observedProperties.add(key);
        if ("styleRef" in record) {
          if (!isText(record.styleRef) || !styleApplications.has(record.styleRef)) {
            fail(`${label}: styleRef must resolve to a style in this metadata`);
          } else if (!styleApplications.get(record.styleRef).has(node)) {
            fail(`${label}: styleRef has no application at ${node}`);
          }
          if (!["style", "override", "unknown"].includes(record.styleOrigin)) {
            fail(`${label}: styleOrigin must be style, override or unknown`);
          } else if (record.styleOrigin === "unknown" ? "styleOriginSource" in record : !isText(record.styleOriginSource)) {
            fail(`${label}: styleOriginSource is required only for an evidenced style or override origin`);
          }
        } else if ("styleOrigin" in record || "styleOriginSource" in record) {
          fail(`${label}: styleOrigin needs styleRef`);
        }
        if (kind === "bindings") {
          if ("translation" in record || "figmaValue" in record) fail(`${label}: translation and figmaValue belong to measuredLiterals`);
          if (!isText(record.variableId)) fail(`${label}: variableId is required`);
          else bindingRecords.push({ name, label, variableId: record.variableId, node: record.node, cssProperty: record.cssProperty,
            modeOverride: record.modeOverride });
          if ("modeOverride" in record &&
              (!isObject(record.modeOverride) || !isText(record.modeOverride.collectionId) || !isText(record.modeOverride.modeName))) {
            fail(`${label}: modeOverride needs collectionId and modeName`);
          }
        } else {
          if (!isText(record.value)) fail(`${label}: measured literal value must be a nonempty CSS string`);
          if (!["direct", "approximate"].includes(record.translation)) {
            fail(`${label}: translation must be direct or approximate`);
          }
          if (record.translation === "approximate" && !("figmaValue" in record)) {
            fail(`${label}: approximate translation needs figmaValue`);
          }
          if ("figmaValue" in record && (!isObject(record.figmaValue) ||
              record.figmaValue.source !== "PLUGIN" || !isText(record.figmaValue.field) ||
              !Object.hasOwn(record.figmaValue, "value") || record.figmaValue.value === null)) {
            fail(`${label}: figmaValue needs source PLUGIN, field and non-null value`);
          }
          if (isObject(record.figmaValue) && Object.hasOwn(record.figmaValue, "unit")) {
            fail(`${label}: raw units belong inside value, not figmaValue.unit`);
          }
        }
      }
    }
    const recordedGaps = new Set();
    for (const field of ["unresolved", "notApplicable"]) {
      const gaps = metadata[field];
      if (!Array.isArray(gaps)) {
        fail(`${name}: ${field} must be a list`);
        continue;
      }
      for (const [index, gap] of gaps.entries()) {
        if (!isObject(gap) || ![gap.field, gap.reason, gap.source].every(isText)) {
          fail(`${name}: ${field}[${index}] needs field, reason and source`);
        } else if (recordedGaps.has(gap.field)) {
          fail(`${name}: ${gap.field} appears more than once across gap lists`);
        } else {
          recordedGaps.add(gap.field);
        }
        if (field === "unresolved") {
          if (typeof gap?.blocking !== "boolean") fail(`${name}: unresolved[${index}].blocking must be boolean`);
          if (gap?.blocking === true) fail(`${name}: blocking unresolved gap cannot be registered`);
        } else if (isObject(gap) && "blocking" in gap) {
          fail(`${name}: notApplicable[${index}] cannot be blocking`);
        }
      }
    }
    if (!Array.isArray(metadata.notBuilt)) {
      fail(`${name}: notBuilt must be a list`);
    } else {
      for (const [index, exclusion] of metadata.notBuilt.entries()) {
        if (!isObject(exclusion) || ![exclusion.item, exclusion.reason, exclusion.evidence].every(isText)) {
          fail(`${name}: notBuilt[${index}] needs item, reason and evidence`);
        }
      }
    }
  }

  const stateComponents = isObject(state.components) ? state.components : {};
  if (!sameSet(names, new Set(Object.keys(stateComponents)))) fail("figma-state.json components differ from mapped components");
  for (const [name, component] of Object.entries(stateComponents)) {
    if (!isObject(component) || !Array.isArray(component.nestedComponents)) {
      fail(`state ${name}: nestedComponents must be a list`);
      continue;
    }
    for (const nested of component.nestedComponents) {
      if (!isObject(nested) || !["mapped", "external"].includes(nested.status)) {
        fail(`state ${name}: nested status must be mapped or external`);
        continue;
      }
      if (nested.status === "mapped") {
        if (!names.has(nested.resolvedComponent)) fail(`state ${name}: unresolved mapped component ${nested.resolvedComponent}`);
        const localRef = isText(nested.mainComponentRef) && nested.mainComponentRef.startsWith(`${state.fileKey}:`);
        const fileKey = nested.mainComponentFileKey || (localRef ? state.fileKey : null);
        const refs = [nested.mainComponentRef, nested.mainComponentKey && `componentKey:${nested.mainComponentKey}`,
          nested.mainComponentNodeId && fileKey && `${fileKey}:${nested.mainComponentNodeId}`].filter(Boolean);
        const owners = new Set(refs.map((ref) => refOwners.get(ref)).filter(Boolean));
        if (!entryKeysByName.has(nested.resolvedComponent) || owners.size !== 1 || !owners.has(entryKeysByName.get(nested.resolvedComponent))) {
          fail(`state ${name}: mapped nested ${nested.resolvedComponent} has no consistent stable ref`);
        }
      } else if ("resolvedComponent" in nested) {
        fail(`state ${name}: external nested component cannot have resolvedComponent`);
      }
    }
  }

  const componentDir = path.join(root, "design-system/components");
  if (existsSync(componentDir)) {
    for (const item of readdirSync(componentDir, { withFileTypes: true })) {
      if (item.isDirectory() && !names.has(item.name)) fail(`component record ${item.name} has no map entry`);
    }
  }

  const inventoryPath = "design-system/inventory.json";
  if (localFile(inventoryPath, "inventory")) {
    const inventory = readJson(inventoryPath);
    if (isObject(inventory)) {
      const componentNames = new Set();
      const screenNames = new Set();
      if (!Array.isArray(inventory.components)) {
        fail(`${inventoryPath}: components must be a list`);
      } else {
        for (const name of inventory.components) {
          if (!isText(name)) {
            fail(`${inventoryPath}: each components entry must be a nonempty name`);
            continue;
          }
          if (componentNames.has(name)) fail(`${inventoryPath}: duplicate components name ${name}`);
          componentNames.add(name);
        }
      }
      if (!Array.isArray(inventory.screens)) {
        fail(`${inventoryPath}: screens must be a list`);
      } else {
        for (const item of inventory.screens) {
          if (!isObject(item) || !isText(item.name) || !isObject(item.composition) ||
              !isText(item.composition.description) || !Array.isArray(item.composition.components) ||
              item.composition.components.length === 0) {
            fail(`${inventoryPath}: each screens entry needs name and composition with description and nonempty components list`);
            continue;
          }
          if (screenNames.has(item.name)) fail(`${inventoryPath}: duplicate screens name ${item.name}`);
          screenNames.add(item.name);
          const used = new Set();
          for (const component of item.composition.components) {
            if (!isText(component)) {
              fail(`${inventoryPath}: screen ${item.name} has an invalid component name`);
            } else if (used.has(component)) {
              fail(`${inventoryPath}: screen ${item.name} repeats component ${component}`);
            } else {
              used.add(component);
              if (!componentNames.has(component)) fail(`${inventoryPath}: screen ${item.name} uses unincluded component ${component}`);
            }
          }
        }
      }
      if (Array.isArray(inventory.components) && !sameSet(names, componentNames)) {
        fail(`${inventoryPath}: component inventory differs from map`);
      }
      for (const screen of screenNames) {
        const screenFile = path.join(root, "src/pages", `${screen}.tsx`);
        const screenIndex = path.join(root, "src/pages", screen, "index.tsx");
        if (!existsSync(screenFile) && !existsSync(screenIndex)) fail(`screen ${screen} is listed but has no page implementation`);
      }
    } else if (inventory !== undefined) {
      fail(`${inventoryPath}: expected an object`);
    }
  }

  const tokensDir = path.join(root, "design-system/tokens");
  const tokenCollections = new Map();
  const tokenFiles = new Map();
  const localVariables = new Map();
  const externalVariables = new Map();
  const cssNameOwners = new Map();
  const aliases = [];
  const baseDeclarations = new Map();
  const stylesheetFile = path.join(root, "src/styles/tokens.css");
  let stylesheetRoot = null;
  let stylesheetParseFailed = false;
  const parsedStylesheet = () => {
    if (stylesheetRoot || stylesheetParseFailed || !existsSync(stylesheetFile) || !statSync(stylesheetFile).isFile()) return stylesheetRoot;
    try {
      stylesheetRoot = postcss.parse(readFileSync(stylesheetFile, "utf8"), { from: "src/styles/tokens.css" });
    } catch (error) {
      fail(`token stylesheet: invalid CSS: ${error.message}`);
      stylesheetParseFailed = true;
    }
    return stylesheetRoot;
  };
  if (entries.length) {
    if (localFile("src/styles/tokens.css", "token stylesheet")) {
      const cssText = readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
      if (!cssText.trim()) fail("token stylesheet: src/styles/tokens.css is empty");
      parsedStylesheet()?.walkRules(":root", (rule) => {
        if (rule.parent.type !== "root") return;
        for (const decl of rule.nodes.filter((node) => node.type === "decl")) {
          if (baseDeclarations.has(decl.prop)) fail(`token stylesheet: duplicate base declaration ${decl.prop}`);
          baseDeclarations.set(decl.prop, decl.value.trim());
        }
      });
    }
  }
  if (existsSync(tokensDir)) {
    for (const file of readdirSync(tokensDir).filter((item) => /\.json$/i.test(item))) {
      if (!isPortableTokenFileName(file)) fail(`tokens/${file}: invalid portable JSON filename`);
      const fileKey = tokenFileKey(file);
      if (tokenFiles.has(fileKey)) fail(`tokens: filename collision between ${tokenFiles.get(fileKey)} and ${file}`);
      else tokenFiles.set(fileKey, file);
      const data = readJson(`design-system/tokens/${file}`);
      if (!isObject(data) || !isObject(data.variables)) {
        fail(`tokens/${file}: variables must be an object`);
        continue;
      }
      if (!isText(data.collection) || !isText(data.id)) {
        fail(`tokens/${file}: collection and id must be nonempty text`);
      } else if (tokenCollections.has(data.id)) {
        fail(`tokens/${file}: duplicate collection id ${data.id}`);
      } else {
        tokenCollections.set(data.id, { file, data });
      }
      const modes = Array.isArray(data.modes) && data.modes.length > 0 && data.modes.every(isText) &&
        new Set(data.modes).size === data.modes.length ? new Set(data.modes) : null;
      if (!modes) fail(`tokens/${file}: modes must be a nonempty list of distinct names`);
      if (!isText(data.defaultMode) || !modes?.has(data.defaultMode)) {
        fail(`tokens/${file}: defaultMode must name a collection mode`);
      }
      for (const [name, variable] of Object.entries(data.variables)) {
        if (!isObject(variable) || !isText(variable.id) || !matches(/^--[A-Za-z_][\w-]*$/, variable.cssName) ||
            !tokenTypes[variable.type] || !isObject(variable.valuesByMode)) {
          fail(`tokens/${file} ${name}: id, cssName, type and valuesByMode are required`);
          continue;
        }
        if ("scopes" in variable && (!Array.isArray(variable.scopes) || !variable.scopes.every(isText))) {
          fail(`tokens/${file} ${name}: scopes, when present, must be the list of scope names Figma returned`);
        }
        if (cssNameOwners.has(variable.cssName)) fail(`tokens/${file} ${name}: duplicate cssName ${variable.cssName}`);
        else cssNameOwners.set(variable.cssName, variable.id);
        if (localVariables.has(variable.id)) fail(`tokens/${file} ${name}: duplicate variable id ${variable.id}`);
        else localVariables.set(variable.id, { id: variable.id, file, name, type: variable.type, cssName: variable.cssName, valuesByMode: variable.valuesByMode,
          baseValue: variable.valuesByMode[data.defaultMode], collectionId: data.id, modes });
        if (modes && !sameSet(new Set(Object.keys(variable.valuesByMode)), modes)) {
          fail(`tokens/${file} ${name}: valuesByMode keys differ from collection modes`);
        }
        for (const [mode, value] of Object.entries(variable.valuesByMode)) {
          if (isObject(value)) {
            if (variable.type === "COLOR" && ["r", "g", "b"].every((channel) => channel in value) && !("targetVariableId" in value)) {
              fail(`tokens/${file} ${name} mode ${mode}: convert Figma RGB(A) to ${tokenTypes.COLOR.format}`);
            } else {
              aliases.push({ file, name, mode, type: variable.type, value });
            }
          } else if (!tokenTypes[variable.type].valid(value)) {
            fail(`tokens/${file} ${name} mode ${mode}: invalid direct value; ${variable.type} requires ${tokenTypes[variable.type].format}`);
          }
        }
      }
    }
  }
  const stateCollections = isObject(state.collections) ? state.collections : null;
  const stateVariables = isObject(state.variables) ? state.variables : null;
  if (!stateCollections) fail("figma-state.json: collections must be an ID-keyed object");
  if (!stateVariables) fail("figma-state.json: variables must be grouped by collection ID");
  const modeChecks = [];
  const floatDecisions = new Map();
  if (stateCollections) {
    const referencedFiles = new Map();
    for (const [id, record] of Object.entries(stateCollections)) {
      if (!isText(id) || !isObject(record) || !isText(record.name) ||
          !Array.isArray(record.modes) || !record.modes.length || !record.modes.every(isText) ||
          new Set(record.modes).size !== record.modes.length ||
          !Number.isInteger(record.varCount) || record.varCount < 0 ||
          !isPortableTokenFileName(record.file)) {
        fail(`state collection ${id}: name, modes, varCount and portable file are required`);
        continue;
      }
      const fileKey = tokenFileKey(record.file);
      if (referencedFiles.has(fileKey)) fail(`state collections ${id} and ${referencedFiles.get(fileKey)} share token file ${record.file}`);
      else referencedFiles.set(fileKey, id);
      const token = tokenCollections.get(id);
      if (!token) {
        fail(`state collection ${id}: missing token JSON`);
        continue;
      }
      if (token.file !== record.file) fail(`state collection ${id}: file differs from token JSON ${token.file}`);
      if (token.data.collection !== record.name || !Array.isArray(token.data.modes) ||
          JSON.stringify(token.data.modes) !== JSON.stringify(record.modes) ||
          Object.keys(token.data.variables).length !== record.varCount) {
        fail(`state collection ${id}: name, modes or varCount differ from token JSON`);
      }
      const scopes = modeScopeProblems(record, token.data, `state collection ${id}`);
      for (const message of scopes.errors) fail(message);
      for (const message of scopes.warnings) warn(message);
      if (!scopes.errors.length) modeChecks.push({ label: `tokens/${token.file}`, record, data: token.data });
      const serialization = serializationProblems(record, token.data, `state collection ${id}`);
      for (const message of serialization.errors) fail(message);
      for (const [variableId, css] of serialization.decisions) floatDecisions.set(variableId, css);
    }
    for (const [id, { file, data }] of tokenCollections) {
      if (!Object.hasOwn(stateCollections, id)) fail(`tokens/${file}: collection id ${id} is absent from figma-state.json`);
      if (!stateVariables) continue;
      const group = stateVariables[id];
      if (!isObject(group) || !sameSet(new Set(Object.keys(group)), new Set(Object.keys(data.variables)))) {
        fail(`state variables ${id}: variable names differ from token JSON`);
        continue;
      }
      for (const [name, variable] of Object.entries(data.variables)) {
        if (!isObject(group[name]) || group[name].id !== variable?.id || group[name].type !== variable?.type) {
          fail(`state variables ${id}/${name}: id or type differs from token JSON`);
        }
      }
    }
    for (const file of tokenFiles.values()) {
      if (![...tokenCollections.values()].some((token) => token.file === file)) {
        fail(`tokens/${file}: JSON has no valid collection id`);
      }
    }
  }
  if (stateVariables && stateCollections) {
    for (const id of Object.keys(stateVariables)) {
      if (!Object.hasOwn(stateCollections, id)) fail(`state variables ${id}: no collection entry`);
    }
    for (const id of Object.keys(stateCollections)) {
      if (!Object.hasOwn(stateVariables, id)) fail(`state collection ${id}: missing variables group`);
    }
  }
  const cycles = aliasCycleProblems([...tokenCollections.values()].map(({ file, data }) =>
    ({ file, data, record: stateCollections?.[data.id] })));
  for (const message of cycles.errors) fail(message);
  for (const message of cycles.warnings) warn(message);
  const resolveFloat = createFloatResolver({ variables: localVariables, decisions: floatDecisions });
  for (const message of floatAliasProblems({ variables: localVariables, resolveFloat })) fail(message);
  const pendingFloats = new Map();
  if (entries.length) {
    for (const [cssName, id] of cssNameOwners) {
      const declaration = baseDeclarations.get(cssName);
      const variable = localVariables.get(id);
      if (variable?.type === "FLOAT") {
        const resolved = resolveFloat(id);
        if (resolved.status === "conflict") {
          fail(`token stylesheet: ${cssName}: ${resolved.message}`);
        } else if (resolved.status === "pending") {
          pendingFloats.set(variable.file, [...(pendingFloats.get(variable.file) || []), variable.name]);
          if (declaration !== undefined) fail(`token stylesheet: ${cssName} is declared without a serialization decision; remove it until the unit is decided`);
        } else if (declaration === undefined) {
          fail(`token stylesheet: missing base declaration ${cssName}`);
        } else {
          const raw = variable.baseValue;
          const expected = isLocalAliasVariable(variable.valuesByMode)
            ? `var(${localVariables.get(raw.targetVariableId)?.cssName})`
            : serializeNumber(isObject(raw) ? raw.value : raw, resolved.css);
          if (declaration !== expected) fail(`token stylesheet: ${cssName} must be ${expected} to match its serialization decision`);
        }
        continue;
      }
      if (declaration === undefined) {
        fail(`token stylesheet: missing base declaration ${cssName}`);
        continue;
      }
      if (!variable) continue;
      const raw = variable.baseValue;
      const value = isObject(raw) ? raw.value : raw;
      if (isObject(raw) && raw.source === "local") {
        const targetName = localVariables.get(raw.targetVariableId)?.cssName;
        if (targetName && declaration !== `var(${targetName})`) {
          fail(`token stylesheet: ${cssName} must alias ${targetName}`);
        }
      } else if (variable.type === "COLOR" && typeof value === "string" && declaration.toUpperCase() !== value.toUpperCase()) {
        fail(`token stylesheet: ${cssName} base color differs from token JSON`);
      } else if (variable.type === "STRING" && typeof value === "string" &&
          declaration !== value && declaration !== JSON.stringify(value) && declaration !== `'${value.replace(/'/g, "\\'")}'`) {
        fail(`token stylesheet: ${cssName} base string differs from token JSON`);
      } else if (variable.type === "BOOLEAN" && typeof value === "boolean" && declaration !== String(value)) {
        fail(`token stylesheet: ${cssName} base boolean differs from token JSON`);
      }
    }
  }
  for (const [file, names] of pendingFloats) {
    warn(`tokens/${file}: ${names.length} FLOAT variable(s) have no serialization decision and are not written to tokens.css (NOT VERIFIED): ${names.slice(0, 3).join(", ")}${names.length > 3 ? ", ..." : ""}`);
  }
  for (const [key, entry] of entries) {
    if (!isObject(entry?.designSystem) || !isText(entry.designSystem.metadata) ||
        !existsSync(path.join(root, entry.designSystem.metadata))) continue;
    const metadata = readJson(entry.designSystem.metadata);
    if (!isObject(metadata)) continue;
    if (!Array.isArray(metadata.externalVariables)) {
      fail(`${entry.name || key}: externalVariables must be a list`);
      continue;
    }
    for (const [index, variable] of metadata.externalVariables.entries()) {
      const label = `${entry.name || key}: externalVariables[${index}]`;
      if (!isObject(variable) || !isText(variable.id) || !matches(/^--[A-Za-z_][\w-]*$/, variable.cssName) ||
          !tokenTypes[variable.type] || !isText(variable.source) ||
          !variable.source.startsWith(`${entry.figma.fileKey}:`) || !tokenTypes[variable.type].valid(variable.value)) {
        fail(`${label}: id, cssName, type, resolved value and source node ref are required`);
        continue;
      }
      if (localVariables.has(variable.id)) fail(`${label}: variable id is already local`);
      if (!bindingRecords.some((binding) => binding.name === entry.name &&
          binding.variableId === variable.id && binding.node === variable.source)) {
        fail(`${label}: source must identify a node with this external binding`);
      }
      if (cssNameOwners.has(variable.cssName) && cssNameOwners.get(variable.cssName) !== variable.id) {
        fail(`${label}: cssName ${variable.cssName} conflicts with another variable`);
      }
      if (externalVariables.has(variable.id)) {
        const previous = externalVariables.get(variable.id);
        if (previous.cssName !== variable.cssName || previous.type !== variable.type || previous.value !== variable.value) {
          fail(`${label}: conflicting snapshots for variable ${variable.id}`);
        }
      } else externalVariables.set(variable.id, variable);
      cssNameOwners.set(variable.cssName, variable.id);
      const declaration = baseDeclarations.get(variable.cssName);
      if (variable.type === "FLOAT") {
        if (declaration !== undefined) fail(`${label}: ${variable.cssName} is declared without a serialization decision; external FLOAT snapshots are not written yet`);
      } else if (declaration === undefined) fail(`${label}: missing base declaration ${variable.cssName}`);
      else if (variable.type === "COLOR" && declaration.toUpperCase() !== variable.value.toUpperCase()) {
        fail(`${label}: base color differs from resolved snapshot`);
      } else if (variable.type === "BOOLEAN" && declaration !== String(variable.value)) {
        fail(`${label}: base boolean differs from resolved snapshot`);
      } else if (variable.type === "STRING" && declaration !== variable.value &&
          declaration !== JSON.stringify(variable.value) && declaration !== `'${variable.value.replace(/'/g, "\\'")}'`) {
        fail(`${label}: base string differs from resolved snapshot`);
      }
      warn(`${label}: external variable ${variable.id} uses a resolved snapshot`);
    }
  }
  for (const binding of bindingRecords) {
    const variable = localVariables.get(binding.variableId) || externalVariables.get(binding.variableId);
    if (!variable) fail(`${binding.label}: variableId ${binding.variableId} is missing from token inventory`);
    else if (bindingTypeProblem(binding.cssProperty, variable.type)) {
      fail(`${binding.label}: ${bindingTypeProblem(binding.cssProperty, variable.type)} (variable ${binding.variableId})`);
    }
    else if (externalVariables.get(binding.variableId)?.type === "FLOAT") {
      fail(`${binding.label}: ${externalVariables.get(binding.variableId).cssName} is an external FLOAT snapshot without a serialization decision, so it cannot be consumed yet`);
    }
    else if (localVariables.has(binding.variableId) && localVariables.get(binding.variableId).type === "FLOAT" &&
        resolveFloat(binding.variableId).status !== "decided") {
      const resolved = resolveFloat(binding.variableId);
      fail(`${binding.label}: ${localVariables.get(binding.variableId).cssName} has ${resolved.status === "conflict" ? `a serialization conflict (${resolved.message})` : "no serialization decision"}, so it cannot be consumed yet`);
    }
    else if (binding.modeOverride && localVariables.has(binding.variableId) &&
        (binding.modeOverride.collectionId !== variable.collectionId || !variable.modes?.has(binding.modeOverride.modeName))) {
      fail(`${binding.label}: modeOverride does not match the bound variable collection and modes`);
    } else if (binding.modeOverride && externalVariables.has(binding.variableId)) {
      warn(`${binding.label}: external forced mode is not structurally verified`);
    }
  }
  const declaredCustomProperties = parsedStylesheet() ? customPropertyDeclarations(stylesheetRoot) : [];
  const publishedEvidence = {
    tokenPrefix: state.tokenPrefix ?? null,
    collectionIds: isObject(state.collections) ? Object.keys(state.collections) : [],
    tokenFiles: existsSync(tokensDir) ? readdirSync(tokensDir).filter((item) => /\.json$/i.test(item)) : [],
    declaredCustomProperties,
    importedComponents: [...new Set([
      ...entries.map(([key, entry]) => (isObject(entry) && isText(entry.name) ? entry.name : key)),
      ...Object.keys(isObject(state.components) ? state.components : {}),
      ...(existsSync(componentDir) ? readdirSync(componentDir, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name) : []),
    ])],
  };
  const prefixVerdict = assessTokenPrefix(publishedEvidence);
  if (prefixVerdict.status === "invalid" || prefixVerdict.status === "missing") {
    fail(`figma-state.json: ${prefixVerdict.message}`);
  } else if (prefixVerdict.status === "fixed") {
    const required = `--${state.tokenPrefix}-`;
    for (const [id, variable] of localVariables) {
      if (!variable.cssName.startsWith(required)) fail(`tokens/${variable.file} ${variable.name}: cssName ${variable.cssName} must start with ${required} (tokenPrefix ${state.tokenPrefix})`);
    }
  }
  if (entries.length && modeChecks.length && stylesheetRoot) {
    const modes = modeDeclarationProblems({ root: stylesheetRoot, collections: modeChecks, cssNameOf: (id) => localVariables.get(id)?.cssName, resolveFloat });
    for (const message of modes.errors) fail(`token stylesheet: ${message}`);
    for (const message of modes.warnings) warn(message);
  }
  if (entries.length && stylesheetRoot && !stylesheetParseFailed) {
    const generated = generateTokensCss(root);
    if (generated.errors.length) {
      for (const message of generated.errors) fail(`token stylesheet generation: ${message}`);
    } else {
      const difference = firstDifference(readFileSync(stylesheetFile, "utf8"), generated.css);
      if (difference) {
        fail(`token stylesheet: src/styles/tokens.css differs from the generated output at line ${difference.line}; it is a build product, so regenerate it with ${GENERATOR_COMMAND}`);
      }
    }
  }
  if (entries.length && localVariables.size === 0 && externalVariables.size === 0) {
    fail("design-system/tokens: an imported component requires at least one variable in a collection JSON or an external variable snapshot");
  }
  for (const { file, name, mode, type, value } of aliases) {
    if (!isText(value.targetVariableId) || !["local", "external"].includes(value.source) ||
        !("value" in value) || ("alias" in value && !isText(value.alias))) {
      fail(`tokens/${file} ${name} mode ${mode}: alias source, targetVariableId and resolved value are required; alias name must be nonempty when present`);
      continue;
    }
    if (!tokenTypes[type].valid(value.value)) {
      fail(`tokens/${file} ${name} mode ${mode}: alias resolved value for ${type} must be ${tokenTypes[type].format}`);
    }
    const target = localVariables.get(value.targetVariableId);
    if (value.source === "local") {
      if (!target) fail(`tokens/${file} ${name}: local alias target ${value.targetVariableId} not found`);
      else {
        if (target.type !== type) fail(`tokens/${file} ${name}: local alias target ${value.targetVariableId} has type ${target.type}, expected ${type}`);
        if ("alias" in value && value.alias !== target.name) fail(`tokens/${file} ${name}: local alias name differs from target ${target.name}`);
      }
    } else if (target) {
      fail(`tokens/${file} ${name}: alias marked external but target ${value.targetVariableId} is local`);
    } else {
      warn(`tokens/${file} ${name}: external alias ${value.targetVariableId} uses a resolved snapshot; verify it against the source library when possible`);
    }
  }
  const evidence = verifyFigmaEvidence(root);
  for (const error of evidence.errors) {
    if (!errors.includes(error)) errors.push(error);
  }
  warnings.push(...evidence.warnings);
  return { errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || ".");
  const { errors, warnings } = verify(root);
  for (const warning of warnings) console.warn(`WARN ${warning}`);
  for (const error of errors) console.error(`FAIL ${error}`);
  console.log(`${errors.length ? "FAIL" : "PASS"}: ${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length) process.exitCode = 1;
}
