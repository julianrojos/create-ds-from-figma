import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import ts from "typescript";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const tokenTypes = {
  COLOR: { format: "#RRGGBB or #RRGGBBAA", valid: (value) => typeof value === "string" && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) },
  FLOAT: { format: "a finite number", valid: (value) => typeof value === "number" && Number.isFinite(value) },
  STRING: { format: "a string", valid: (value) => typeof value === "string" },
  BOOLEAN: { format: "a boolean", valid: (value) => typeof value === "boolean" },
};
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
      return null;
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
            !/^\.[A-Za-z_][\w-]*$/.test(part.selector) || !isObject(part.nodes)) {
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
            !isText(record.figmaProperty) || !/^[a-z][a-z0-9-]*$/.test(record.cssProperty) ||
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
        if (kind === "bindings") {
          if (!isText(record.variableId)) fail(`${label}: variableId is required`);
          else bindingRecords.push({ name, label, variableId: record.variableId, node: record.node,
            modeOverride: record.modeOverride });
          if ("modeOverride" in record &&
              (!isObject(record.modeOverride) || !isText(record.modeOverride.collectionId) || !isText(record.modeOverride.modeName))) {
            fail(`${label}: modeOverride needs collectionId and modeName`);
          }
        } else if (!isText(record.value)) {
          fail(`${label}: measured literal value must be a nonempty CSS string`);
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

  const agentPath = "AGENTS.md";
  const rulesPath = "design-system/system/composition-rules.md";
  if (localFile(agentPath, "inventory") && localFile(rulesPath, "inventory")) {
    const agentText = readFileSync(path.join(root, agentPath), "utf8");
    const agentLine = agentText.trimEnd().split(/\r?\n/).at(-1);
    const match = /^Incluidos:\s*(.*)$/.exec(agentLine);
    if (!match) fail("AGENTS.md: Incluidos must be the last line");
    const agentNames = new Set(match && match[1] !== "—" ? match[1].split(",").map((item) => item.trim()).filter(Boolean) : []);
    const rules = readFileSync(path.join(root, rulesPath), "utf8");
    const included = /(?:^|\n)## Incluidos\s*\n([\s\S]*?)(?=\n## |$)/.exec(rules);
    if (!included) fail("composition-rules.md: missing Incluidos section");
    const ruleNames = new Set();
    const screenNames = new Set();
    for (const line of (included?.[1] || "").split(/\r?\n/)) {
      const item = /^- \*\*([^*]+)\*\*( \(pantalla\))?/.exec(line);
      if (item) (item[2] ? screenNames : ruleNames).add(item[1]);
    }
    for (const screen of screenNames) {
      const screenFile = path.join(root, "src/pages", `${screen}.tsx`);
      const screenIndex = path.join(root, "src/pages", screen, "index.tsx");
      if (!existsSync(screenFile) && !existsSync(screenIndex)) fail(`screen ${screen} is listed but has no page implementation`);
    }
    if (!sameSet(names, ruleNames)) fail("composition-rules.md component inventory differs from map");
    if (!sameSet(new Set([...names, ...screenNames]), agentNames)) fail("AGENTS.md inventory differs from component and screen inventory");
  }

  const tokensDir = path.join(root, "design-system/tokens");
  const localVariables = new Map();
  const externalVariables = new Map();
  const cssNameOwners = new Map();
  const aliases = [];
  const baseDeclarations = new Map();
  if (entries.length) {
    if (localFile("src/styles/tokens.css", "token stylesheet")) {
      const cssText = readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
      if (!cssText.trim()) fail("token stylesheet: src/styles/tokens.css is empty");
      else {
        try {
          postcss.parse(cssText).walkRules(":root", (rule) => {
            if (rule.parent.type !== "root") return;
            for (const decl of rule.nodes.filter((node) => node.type === "decl")) {
              if (baseDeclarations.has(decl.prop)) fail(`token stylesheet: duplicate base declaration ${decl.prop}`);
              baseDeclarations.set(decl.prop, decl.value.trim());
            }
          });
        } catch (error) {
          fail(`token stylesheet: invalid CSS: ${error.message}`);
        }
      }
    }
  }
  if (existsSync(tokensDir)) {
    for (const file of readdirSync(tokensDir).filter((item) => item.endsWith(".json"))) {
      const data = readJson(`design-system/tokens/${file}`);
      if (!isObject(data) || !isObject(data.variables)) {
        fail(`tokens/${file}: variables must be an object`);
        continue;
      }
      const modes = Array.isArray(data.modes) && data.modes.length > 0 && data.modes.every(isText) &&
        new Set(data.modes).size === data.modes.length ? new Set(data.modes) : null;
      if (!modes) fail(`tokens/${file}: modes must be a nonempty list of distinct names`);
      if (!isText(data.defaultMode) || !modes?.has(data.defaultMode)) {
        fail(`tokens/${file}: defaultMode must name a collection mode`);
      }
      for (const [name, variable] of Object.entries(data.variables)) {
        if (!isObject(variable) || !isText(variable.id) || !/^--[A-Za-z_][\w-]*$/.test(variable.cssName) ||
            !tokenTypes[variable.type] || !isObject(variable.valuesByMode)) {
          fail(`tokens/${file} ${name}: id, cssName, type and valuesByMode are required`);
          continue;
        }
        if (cssNameOwners.has(variable.cssName)) fail(`tokens/${file} ${name}: duplicate cssName ${variable.cssName}`);
        else cssNameOwners.set(variable.cssName, variable.id);
        if (localVariables.has(variable.id)) fail(`tokens/${file} ${name}: duplicate variable id ${variable.id}`);
        else localVariables.set(variable.id, { file, name, type: variable.type, cssName: variable.cssName,
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
  if (entries.length) {
    for (const [cssName, id] of cssNameOwners) {
      const declaration = baseDeclarations.get(cssName);
      if (declaration === undefined) {
        fail(`token stylesheet: missing base declaration ${cssName}`);
        continue;
      }
      const variable = localVariables.get(id);
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
      } else if (variable.type === "FLOAT" && typeof value === "number" &&
          !new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:px)?$`).test(declaration)) {
        fail(`token stylesheet: ${cssName} base number differs from token JSON`);
      } else if (variable.type === "STRING" && typeof value === "string" &&
          declaration !== value && declaration !== JSON.stringify(value) && declaration !== `'${value.replace(/'/g, "\\'")}'`) {
        fail(`token stylesheet: ${cssName} base string differs from token JSON`);
      } else if (variable.type === "BOOLEAN" && typeof value === "boolean" && declaration !== String(value)) {
        fail(`token stylesheet: ${cssName} base boolean differs from token JSON`);
      }
    }
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
      if (!isObject(variable) || !isText(variable.id) || !/^--[A-Za-z_][\w-]*$/.test(variable.cssName) ||
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
      if (declaration === undefined) fail(`${label}: missing base declaration ${variable.cssName}`);
      else if (variable.type === "COLOR" && declaration.toUpperCase() !== variable.value.toUpperCase()) {
        fail(`${label}: base color differs from resolved snapshot`);
      } else if (variable.type === "FLOAT" && !new RegExp(`^${String(variable.value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:px)?$`).test(declaration)) {
        fail(`${label}: base number differs from resolved snapshot`);
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
    else if (binding.modeOverride && localVariables.has(binding.variableId) &&
        (binding.modeOverride.collectionId !== variable.collectionId || !variable.modes?.has(binding.modeOverride.modeName))) {
      fail(`${binding.label}: modeOverride does not match the bound variable collection and modes`);
    } else if (binding.modeOverride && externalVariables.has(binding.variableId)) {
      warn(`${binding.label}: external forced mode is not structurally verified`);
    }
  }
  if (entries.length && localVariables.size === 0 && externalVariables.size === 0) {
    fail("design-system/tokens: an imported component requires at least one collection JSON or an external variable snapshot");
    fail("design-system/tokens: an imported component requires at least one variable");
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
