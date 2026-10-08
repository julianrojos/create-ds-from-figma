import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { verify } from "../verify-ds.mjs";
import { MISSING_PREFIX_MESSAGE } from "../lib/design-system-state.mjs";
import { generateTokensCss } from "../lib/tokens-css.mjs";

const template = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/plantillas");
const templateFile = (relative) => {
  const source = path.join(template, relative);
  assert.ok(existsSync(source), `verify-ds tests require skill template ${source}`);
  return source;
};
const active = new Set();
const correspondences = "\n## Figma to code correspondences\n\n| Figma variant/ref | Code props | States, interactions and content | Status | Examined configuration | Figma/code revision | Evidence or missing verification |\n| --- | --- | --- | --- | --- | --- | --- |\n| Size=Small / FILE:1:3 | size=Small | Default content | candidate | Base mode | Fixture snapshot | Browser comparison not performed |\n";
const write = (root, relative, value) => {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value, null, 2));
};
const fixture = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "verify-ds-"));
  active.add(root);
  cpSync(templateFile("design-system/inventory.json"), path.join(root, "design-system/inventory.json"));
  cpSync(templateFile("design-system/relationships/figma-code-map.json"), path.join(root, "design-system/relationships/figma-code-map.json"));
  cpSync(templateFile("design-system/relationships/figma-state.json"), path.join(root, "design-system/relationships/figma-state.json"));
  return root;
};
// tokens.css is a build product: tests that expect a valid project regenerate it from the sources.
const regenerate = (root) => {
  const generated = generateTokensCss(root);
  assert.deepEqual(generated.errors, [], "the fixture sources must be consistent");
  write(root, "src/styles/tokens.css", generated.css);
};
const read = (root, relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const collection = (name, id, modes, variables) => ({ collection: name, id, modes, defaultMode: modes[0], variables });
const token = (id, type, valuesByMode) => ({ id, cssName: `--ds-${id}`, type, valuesByMode });
const writeCollection = (root, file, data) => {
  write(root, `design-system/tokens/${file}`, data);
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  state.tokenPrefix = "ds";
  state.collections[data.id] = { name: data.collection, modes: data.modes, varCount: Object.keys(data.variables).length, file,
    serialization: {},
    modeScopes: Object.fromEntries(data.modes.filter((mode) => mode !== data.defaultMode).map((mode) => [mode, null])) };
  state.variables[data.id] = Object.fromEntries(Object.entries(data.variables).map(([name, variable]) =>
    [name, { id: variable.id, type: variable.type }]));
  write(root, relative, state);
};
const assertOnlyPendingModes = (root) => {
  const { errors, warnings } = verify(root);
  assert.deepEqual(errors, []);
  assert.ok(warnings.length > 0 && warnings.every((item) => item.includes("has no CSS scope yet; its values are NOT VERIFIED")), warnings.join("\n"));
};
const withExampleComponent = () => {
  const root = fixture();
  const metadataPath = "design-system/components/ExampleComponent/metadata.json";
  const metadata = JSON.parse(readFileSync(templateFile("componentes/metadata.json"), "utf8"));
  metadata.name = "ExampleComponent";
  metadata.description = "Example component.";
  metadata.figma = { fileKey: "FILE", nodeId: "1:2", url: "https://www.figma.com/design/FILE?node-id=1-2", componentSet: "ExampleComponent" };
  metadata.code = { path: "src/components/ExampleComponent/ExampleComponent.tsx", component: "ExampleComponent" };
  metadata.variants = { Size: ["Small"] };
  metadata.variantClassification = { Size: { Small: { kind: "prop", codeProp: "size" } } };
  metadata.figmaCoverage.variants = ["Size=Small"];
  metadata.figmaCoverage.styles = { status: "captured", source: "test fixture" };
  metadata.parts = { root: { selector: ".root", nodes: { "Size=Small": "FILE:1:3" } } };
  write(root, metadataPath, metadata);
  write(root, "design-system/components/ExampleComponent/usage.md", `# ExampleComponent\n${correspondences}`);
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps { size?: 'Small' }\nexport const ExampleComponent = (props: ExampleComponentProps) => <span data-ds-part=\"root\" />;\n");
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root {}\n");
  writeCollection(root, "Colors.json", collection("Colors", "COL", ["Default"], {
    foreground: token("foreground-id", "COLOR", { Default: "#000000" }),
  }));
  const map = read(root, "design-system/relationships/figma-code-map.json");
  map["FILE:1:2"] = {
    name: "ExampleComponent",
    figma: { fileKey: "FILE", nodeId: "1:2", refs: ["FILE:1:2"], variants: { "Size=Small": { refs: ["FILE:1:3"], props: { Size: "Small" } } } },
    designSystem: { metadata: metadataPath, usage: "design-system/components/ExampleComponent/usage.md" },
    code: { component: "ExampleComponent", path: "src/components/ExampleComponent/ExampleComponent.tsx", style: "src/components/ExampleComponent/ExampleComponent.module.css" },
  };
  write(root, "design-system/relationships/figma-code-map.json", map);
  const state = read(root, "design-system/relationships/figma-state.json");
  state.fileKey = "FILE";
  state.tokenPrefix = "ds";
  state.components.ExampleComponent = { figmaNodeId: "1:2", nestedComponents: [] };
  write(root, "design-system/relationships/figma-state.json", state);
  write(root, "design-system/inventory.json", { components: ["ExampleComponent"], screens: [] });
  regenerate(root);
  return root;
};

test.after(() => {
  for (const root of active) rmSync(root, { recursive: true, force: true });
});

test("empty kit is valid", () => {
  assert.deepEqual(verify(fixture()), { errors: [], warnings: [] });
});

test("collection JSONs match ID-keyed state, including names, modes, counts and variables", () => {
  const root = fixture();
  const file = "Color Primitives.json";
  writeCollection(root, file, collection("Color Primitives", "COL", ["Light", "Dark"], {
    foreground: token("foreground-id", "COLOR", { Light: "#000000", Dark: "#FFFFFF" }),
  }));
  assertOnlyPendingModes(root);
  const statePath = "design-system/relationships/figma-state.json";
  const state = read(root, statePath);
  state.collections.COL.name = "Wrong";
  write(root, statePath, state);
  assert.ok(verify(root).errors.some((item) => item.includes("name, modes or varCount differ")));
  state.collections.COL.name = "Color Primitives";
  state.collections.COL.varCount = 2;
  write(root, statePath, state);
  assert.ok(verify(root).errors.some((item) => item.includes("name, modes or varCount differ")));
  state.collections.COL.varCount = 1;
  state.variables.COL.foreground.id = "wrong";
  write(root, statePath, state);
  assert.ok(verify(root).errors.some((item) => item.includes("id or type differs")));
  state.variables.COL.foreground.id = "foreground-id";
  state.collections.COL.file = "../outside.json";
  write(root, statePath, state);
  assert.ok(verify(root).errors.some((item) => item.includes("portable file are required")));
});

test("a Figma collection rename keeps its file, while same-named collections use distinct IDs", () => {
  const root = fixture();
  writeCollection(root, "Color.json", collection("Color", "COL-ONE", ["Default"], {}));
  writeCollection(root, "Color (COL-TWO).json", collection("Color", "COL-TWO", ["Default"], {}));
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  const first = read(root, "design-system/tokens/Color.json");
  first.collection = "Hue";
  write(root, "design-system/tokens/Color.json", first);
  const statePath = "design-system/relationships/figma-state.json";
  const state = read(root, statePath);
  state.collections["COL-ONE"].name = "Hue";
  write(root, statePath, state);
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
});

test("orphan, missing and duplicate collection JSONs fail independently", () => {
  const root = fixture();
  const data = collection("Colors", "COL", ["Default"], {});
  writeCollection(root, "Colors.json", data);
  write(root, "design-system/tokens/Other.json", data);
  assert.ok(verify(root).errors.some((item) => item.includes("duplicate collection id COL")));
  rmSync(path.join(root, "design-system/tokens/Other.json"));
  const statePath = "design-system/relationships/figma-state.json";
  const state = read(root, statePath);
  delete state.collections.COL;
  write(root, statePath, state);
  assert.ok(verify(root).errors.some((item) => item.includes("absent from figma-state.json")));
  state.collections.COL = { name: "Colors", modes: ["Default"], varCount: 0, file: "Colors.json" };
  write(root, statePath, state);
  rmSync(path.join(root, "design-system/tokens/Colors.json"));
  assert.ok(verify(root).errors.some((item) => item.includes("state collection COL: missing token JSON")));
});

test("inventory must exist and contain valid unique entries", () => {
  const root = withExampleComponent();
  const inventoryPath = "design-system/inventory.json";
  rmSync(path.join(root, inventoryPath));
  assert.ok(verify(root).errors.some((item) => item.includes(`missing ${inventoryPath}`)));
  write(root, inventoryPath, "null");
  assert.ok(verify(root).errors.some((item) => item.includes(`${inventoryPath}: expected an object`)));
  write(root, inventoryPath, { components: ["ExampleComponent", "ExampleComponent"], screens: [] });
  assert.ok(verify(root).errors.some((item) => item.includes("duplicate components name")));
  write(root, inventoryPath, { components: [{ name: "ExampleComponent", usage: "Old format." }], screens: [] });
  assert.ok(verify(root).errors.some((item) => item.includes("each components entry must be a nonempty name")));
  write(root, inventoryPath, { components: [""], screens: [] });
  assert.ok(verify(root).errors.some((item) => item.includes("each components entry must be a nonempty name")));
});

test("an imported component is valid", () => {
  assert.deepEqual(verify(withExampleComponent()), { errors: [], warnings: [] });
});

test("a component without variants uses its root ref as the default part observation", () => {
  const root = withExampleComponent();
  const mapPath = "design-system/relationships/figma-code-map.json";
  const map = read(root, mapPath);
  map["FILE:1:2"].figma.variants = {};
  write(root, mapPath, map);
  const metadataPath = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, metadataPath);
  metadata.variants = {};
  metadata.variantClassification = {};
  metadata.figmaCoverage.variants = [];
  metadata.parts.root.nodes = { default: "FILE:1:2" };
  metadata.bindings = [{ part: "root", variant: "default", node: "FILE:1:2", figmaProperty: "fills[0]",
    cssProperty: "background-color", cssSelector: ".root", variableId: "foreground-id" }];
  write(root, metadataPath, metadata);
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  metadata.parts.root.nodes.default = "FILE:1:9";
  write(root, metadataPath, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("root node ref")));
});

test("malformed root and variant refs return errors instead of throwing", () => {
  const root = withExampleComponent();
  const mapPath = "design-system/relationships/figma-code-map.json";
  const map = read(root, mapPath);
  map["FILE:1:2"].figma.variants["Size=Small"].refs = null;
  write(root, mapPath, map);
  assert.ok(verify(root).errors.some((item) => item.includes("variant Size=Small: refs and props are required")));
  map["FILE:1:2"].figma.variants = {};
  map["FILE:1:2"].figma.refs = null;
  write(root, mapPath, map);
  const metadataPath = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, metadataPath);
  metadata.variants = {};
  metadata.variantClassification = {};
  metadata.figmaCoverage.variants = [];
  metadata.parts.root.nodes = { default: "FILE:1:2" };
  write(root, metadataPath, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("figma.refs must include its entry key")));
});

test("a direct external binding needs a sourced resolved snapshot", () => {
  const root = withExampleComponent();
  const metadataPath = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, metadataPath);
  metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]",
    cssProperty: "background-color", cssSelector: ".root", variableId: "VariableID:external" }];
  metadata.externalVariables = [{ id: "VariableID:external", cssName: "--external-surface", type: "COLOR",
    value: "#112233", source: "FILE:1:3" }];
  write(root, metadataPath, metadata);
  regenerate(root);
  const valid = verify(root);
  assert.deepEqual(valid.errors, []);
  assert.ok(valid.warnings.some((item) => item.includes("resolved snapshot")));
  metadata.externalVariables[0].source = "FILE:1:9";
  write(root, metadataPath, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("source must identify a node with this external binding")));
  metadata.externalVariables[0].source = "FILE:1:3";
  metadata.externalVariables[0].value = "#445566";
  write(root, metadataPath, metadata);
  const drifted = verify(root).errors;
  assert.ok(drifted.some((item) => item.includes("base color differs from resolved snapshot")));
  assert.ok(drifted.some((item) => item.includes("differs from the generated output")));
  metadata.externalVariables = [];
  write(root, metadataPath, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("variableId VariableID:external is missing")));
});

test("an external-only component does not require a fictitious local collection", () => {
  const root = withExampleComponent();
  rmSync(path.join(root, "design-system/tokens/Colors.json"));
  const statePath = "design-system/relationships/figma-state.json";
  const state = read(root, statePath);
  delete state.collections.COL;
  delete state.variables.COL;
  write(root, statePath, state);
  const metadataPath = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, metadataPath);
  metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]",
    cssProperty: "background-color", cssSelector: ".root", variableId: "VariableID:external" }];
  metadata.externalVariables = [{ id: "VariableID:external", cssName: "--external-surface", type: "COLOR",
    value: "#112233", source: "FILE:1:3" }];
  write(root, metadataPath, metadata);
  regenerate(root);
  assert.deepEqual(verify(root).errors, []);
});

test("parts require mapped Figma nodes and matching TSX and CSS markers", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.parts.root.nodes["Size=Small"] = "FILE:wrong";
  metadata.parts.initials = { selector: ".initials", nodes: { "Size=Small": "FILE:1:4" } };
  write(root, relative, metadata);
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("root node ref")));
  assert.ok(errors.some((item) => item.includes("part initials is missing its static data-ds-part")));
  assert.ok(errors.some((item) => item.includes("part initials selector .initials is missing from CSS")));
});

test("a part class in a combined selector counts, but comments and class prefixes do not", () => {
  const root = withExampleComponent();
  const style = "src/components/ExampleComponent/ExampleComponent.module.css";
  write(root, style, ".primary.root {}");
  assert.deepEqual(verify(root).errors, []);
  write(root, style, "/* .root {} */\n.rooted {}");
  assert.ok(verify(root).errors.some((item) => item.includes("selector .root is missing from CSS")));
  write(root, style, '.wrapper[data-name=".root"] {}');
  assert.ok(verify(root).errors.some((item) => item.includes("selector .root is missing from CSS")));
  write(root, style, ".wrapper:not(.root) {}");
  assert.ok(verify(root).errors.some((item) => item.includes("selector .root is missing from CSS")));
  write(root, style, ":is(.root, .other) {}");
  assert.deepEqual(verify(root).errors, []);
});

test("invalid component CSS is reported without interrupting validation", () => {
  const root = withExampleComponent();
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root { color: red;");
  const result = verify(root);
  assert.ok(result.errors.some((item) => item.includes("invalid CSS") && item.includes("ExampleComponent.module.css")));
});

test("part markers must be literal JSX attributes, not comments or strings", () => {
  const root = withExampleComponent();
  const file = "src/components/ExampleComponent/ExampleComponent.tsx";
  write(root, file, "// data-ds-part=\"root\"\nexport const ExampleComponent = () => <span />;");
  assert.ok(verify(root).errors.some((item) => item.includes("part root is missing its static data-ds-part")));
  write(root, file, "export const ExampleComponent = () => <span title='data-ds-part=\"root\"' />;");
  assert.ok(verify(root).errors.some((item) => item.includes("part root is missing its static data-ds-part")));
  write(root, file, "export const ExampleComponent = () => <span data-ds-part={name} />;");
  assert.ok(verify(root).errors.some((item) => item.includes("part root is missing its static data-ds-part")));
  write(root, file, 'export const ExampleComponent = () => <span data-ds-part={"root"} />;');
  assert.ok(verify(root).errors.some((item) => item.includes('use a literal JSX attribute such as data-ds-part="root"')));
  write(root, file, "export const ExampleComponent = () => <span data-ds-part=\"root\" />;");
  assert.deepEqual(verify(root).errors, []);
});

test("root part covers every mapped variant", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.parts.root.nodes = {};
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("root part must cover every Figma variant")));
});

test("bindings require a mapped part node and an exported variable", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]", cssProperty: "background-color", cssSelector: ".root", variableId: "missing" }];
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("variableId missing is missing")));
  metadata.measuredLiterals = [{ part: "root", variant: "Size=Small", source: "FILE:1:3", figmaProperty: "fills[0]", cssProperty: "background-color", cssSelector: ".root", value: "#000000", translation: "direct" }];
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("duplicate or conflicting property observation")));
});

test("Figma style applications and literal translations keep their provenance", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.styles = [{ ref: "text-button", type: "TEXT", name: "UI/Button", id: "S:1", fileKey: "FILE",
    nodes: [{ node: "FILE:1:3" }] }];
  metadata.measuredLiterals = [{ part: "root", variant: "Size=Small", source: "FILE:1:3",
    figmaProperty: "lineHeight", cssProperty: "line-height", cssSelector: ".root", value: "20px",
    translation: "approximate", figmaValue: { source: "REST", field: "lineHeightPercentFontSize", value: 125 },
    styleRef: "text-button", styleOrigin: "unknown" }];
  write(root, relative, metadata);
  assert.deepEqual(verify(root).errors, []);

  const expectError = (change, message) => {
    const changed = structuredClone(metadata);
    change(changed);
    write(root, relative, changed);
    assert.ok(verify(root).errors.some((item) => item.includes(message)), message);
  };
  expectError((item) => item.styles.push(structuredClone(item.styles[0])), "duplicate style ref text-button");
  expectError((item) => item.measuredLiterals[0].styleRef = "missing", "styleRef must resolve");
  expectError((item) => item.styles[0].nodes[0].node = "FILE:1:9", "styleRef has no application");
  expectError((item) => item.measuredLiterals[0].styleOrigin = "style", "styleOriginSource is required");
  expectError((item) => delete item.measuredLiterals[0].figmaValue, "approximate translation needs figmaValue");
  expectError((item) => item.measuredLiterals[0].figmaValue.field = "", "figmaValue needs source");
  expectError((item) => item.styles[0].nodes[0] = { node: "FILE:1:3", start: 3, end: 3,
    rangesSource: "getStyledTextSegments" }, "a text range needs start < end");
  expectError((item) => delete item.measuredLiterals[0].translation, "translation must be direct or approximate");
  expectError((item) => item.styles[0].type = "COLOR", "ref, type, name, id, fileKey and application nodes are required");
  expectError((item) => item.measuredLiterals[0].styleOriginSource = "evidence", "styleOriginSource is required only");
  const bound = structuredClone(metadata);
  bound.measuredLiterals = [];
  bound.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]",
    cssProperty: "color", cssSelector: ".root", variableId: "foreground-id", styleRef: "text-button",
    styleOrigin: "override", styleOriginSource: "Plugin segment property override: fills[0]" }];
  write(root, relative, bound);
  assert.deepEqual(verify(root).errors, []);
  delete bound.bindings[0].styleOriginSource;
  write(root, relative, bound);
  assert.ok(verify(root).errors.some((item) => item.includes("styleOriginSource is required only")));
});

test("an absent style ref or CSS property is rejected instead of matching as text", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.styles = [{ ref: "text-button", type: "TEXT", name: "UI/Button", id: "S:1", fileKey: "FILE", nodes: [{ node: "FILE:1:3" }] }];
  write(root, relative, metadata);
  assert.deepEqual(verify(root).errors, []);
  delete metadata.styles[0].ref;
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("ref, type, name, id, fileKey and application nodes are required")));
  metadata.styles = [];
  metadata.measuredLiterals = [{ part: "root", variant: "Size=Small", source: "FILE:1:3", figmaProperty: "width", cssSelector: ".root", value: "4px", translation: "direct" }];
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("CSS property and selector must match the part record")));
});

test("unfilled template placeholders are rejected, but angle brackets inside a text are not", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.description = "Wraps a native <button> element.";
  write(root, relative, metadata);
  assert.deepEqual(verify(root).errors, []);
  const filled = structuredClone(metadata);
  filled.description = "<Una frase.>";
  filled.figmaCoverage.styles = { status: "unavailable", source: "<herramienta y llamada intentadas>", reason: "<por qué no se capturaron>" };
  write(root, relative, filled);
  const errors = verify(root).errors;
  for (const where of ["metadata.description", "metadata.figmaCoverage.styles.source", "metadata.figmaCoverage.styles.reason"]) {
    assert.ok(errors.some((item) => item.includes(`${where} still holds a template placeholder`)), where);
  }
  const url = structuredClone(metadata);
  url.figma.url = "https://www.figma.com/design/<FILE_KEY>?node-id=<NODE_ID_GUION>";
  write(root, relative, url);
  assert.ok(verify(root).errors.some((item) => item.includes("figma.url still holds template placeholders")));
});

test("filler text and an unfilled usage.md are rejected, ordinary prose and code spans are not", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const usage = "design-system/components/ExampleComponent/usage.md";
  const metadata = read(root, relative);
  metadata.description = "Todo el contenido va dentro; ver `<Nombre>` y TODO en prosa no al inicio.";
  write(root, relative, metadata);
  write(root, usage, `# ExampleComponent usage\n\n## Use\n\nUse \`<ExampleComponent>\` for actions.\n\n\`\`\`tsx\n<Nombre />\n\`\`\`\n${correspondences}`);
  assert.deepEqual(verify(root).errors, []);
  for (const filler of ["TODO", "TODO: describe", "FIXME later", "TBD", "pendiente", "Por definir.", "lorem ipsum dolor", "..."]) {
    const changed = structuredClone(metadata);
    changed.description = filler;
    write(root, relative, changed);
    assert.ok(verify(root).errors.some((item) => item.includes("metadata.description still holds a filler text")), filler);
  }
  const changed = structuredClone(metadata);
  changed.figmaCoverage.styles = { status: "unavailable", source: "get_design_context", reason: "pendiente" };
  write(root, relative, changed);
  assert.ok(verify(root).errors.some((item) => item.includes("figmaCoverage.styles.reason still holds a filler text")));
  write(root, relative, metadata);
  write(root, usage, "# <Nombre> usage\n\n## Use\n\n<Cuándo usarlo.>\n\n- TODO\n");
  const errors = verify(root).errors;
  for (const line of [1, 5, 7]) {
    assert.ok(errors.some((item) => item.includes(`usage.md:${line} still holds a`)), `line ${line}`);
  }
});

test("markup, code of every kind and comments in usage.md are prose, not placeholders", () => {
  const root = withExampleComponent();
  const usage = "design-system/components/ExampleComponent/usage.md";
  const body = [
    "# ExampleComponent usage", "", "## Use", "",
    "<!-- internal note -->", "<!--", "<Nombre>", "-->", "",
    "<details open>", "<input disabled />", "<summary>More</summary>", "<br>", '<img src="a.png" alt="x">', "</details>", "",
    "- <ExampleComponent />", "<ExampleComponent variant=\"primary\" onClick={go} />", "",
    "~~~tsx", "<Nombre />", "~~~", "", "````md", "```", "<Nombre>", "```", "````", "",
    "Use ``<Nombre>`` or `<Nombre />` inline.", "", "    <Nombre />", "    <Cuándo usarlo.>", "",
  ].join("\n") + correspondences;
  write(root, usage, body);
  assert.deepEqual(verify(root).errors, []);
  for (const placeholder of ["<Cuándo usarlo.>", "<Cuando usarlo.>", "<Una frase.>", "<Button primary />"]) {
    write(root, usage, `${body}\n${placeholder}\n`);
    assert.ok(verify(root).errors.some((item) => item.includes("usage.md:") && item.includes("template placeholder")), placeholder);
  }
  write(root, usage, "# <Nombre> usage\n\n<!-- ok -->\n");
  assert.ok(verify(root).errors.some((item) => item.includes("usage.md:1 still holds a template placeholder")));
});

test("usage requires a real populated correspondence section or None with a reason", () => {
  const root = withExampleComponent();
  const usage = "design-system/components/ExampleComponent/usage.md";
  const header = "## Figma to code correspondences";
  for (const body of ["# ExampleComponent\n", `\`\`\`md\n${header}\nNone: No variants.\n\`\`\``,
    `<!-- ${header}\nNone: No variants. -->`, `    ${header}\n    None: No variants.`,
    `${header}\n`, `${header}\n<!-- hidden -->\n## Other\nNone: Not in the section.`,
    `${header}\nNone`, `${header}\nOnly explanatory prose.`,
    ...["None con el motivo real", "None - No variants.", "None. No variants.", "None x", "None:",
      "None: .", "None: <motivo real>", "None: <razón>.", "None: TODO", "None: pendiente",
      "None: por rellenar", "None: con el motivo real", "None: motivo real", "None: razón real"].map((line) => `${header}\n${line}`),
    `${header}\n| A | B |\n| --- | --- |`,
    `${header}\n| A | B |\n| --- | --- |\n| | |`,
    `${header}\nNone: No variants.\n${header}\nNone: Duplicate.`,
    ...["`<motivo real>`", "`TODO`", "`pendiente`", "``", "`  `", "`motivo real`"].map((reason) => `${header}\nNone: ${reason}`),
    `${header}\n| Figma | Code |\n\n| --- | --- |\n\n| a | b |`,
    `${header}\n| Figma | Code |\n| --- | --- |\n\n| a | b |`]) {
    write(root, usage, body);
    assert.ok(verify(root).errors.some((item) => item.includes("correspondences")), body);
  }
  for (const body of [correspondences,
    `${header}\n| Figma | Code |\n| --- | --- |\n| \`Size=Large\` | \`size="lg"\` |`,
    `${header}\nNone: \`no public variant API\``, `${header}\nNone: This component has no variant-to-code correspondences.`,
    `${header}\nNone: No public variant API.\n## Other\nOther guidance.`, `${header}\nNone: x`]) {
    write(root, usage, body);
    assert.deepEqual(verify(root).errors, [], body);
  }
});

test("whether styles were captured is recorded, so an empty list is not ambiguous", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  const message = "figmaCoverage.styles needs status";
  const errorsFor = (styles) => {
    const changed = structuredClone(metadata);
    changed.figmaCoverage.styles = styles;
    write(root, relative, changed);
    return verify(root).errors;
  };
  assert.deepEqual(errorsFor({ status: "captured", source: "get_design_context" }), []);
  assert.deepEqual(errorsFor({ status: "unavailable", source: "get_design_context", reason: "returns no style IDs" }), []);
  for (const bad of [undefined, { status: "unavailable", source: "x" }, { status: "captured", source: "x", reason: "y" },
    { status: "captured" }, { status: "none", source: "x" }]) {
    assert.ok(errorsFor(bad).some((item) => item.includes(message)), JSON.stringify(bad));
  }
  const changed = structuredClone(metadata);
  changed.figmaCoverage.styles = { status: "unavailable", source: "x", reason: "y" };
  changed.styles = [{ ref: "a", type: "TEXT", name: "UI/Button", id: "S:1", fileKey: "FILE", nodes: [{ node: "FILE:1:3" }] }];
  write(root, relative, changed);
  assert.ok(verify(root).errors.some((item) => item.includes("styles must be empty")));
});

test("style ranges can document mixed text without claiming a scalar property", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.styles = [
    { ref: "label-first", type: "TEXT", name: "UI/Label", id: "S:1", fileKey: "FILE",
      nodes: [{ node: "FILE:1:7", start: 0, end: 5, rangesSource: "getStyledTextSegments" }] },
    { ref: "label-second", type: "TEXT", name: "UI/Emphasis", id: "S:2", fileKey: "FILE",
      nodes: [{ node: "FILE:1:7", start: 5, end: 7, rangesSource: "getStyledTextSegments" }] },
  ];
  write(root, relative, metadata);
  assert.deepEqual(verify(root).errors, []);
  delete metadata.styles[0].nodes[0].rangesSource;
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("a text range needs start < end and rangesSource")));
});

test("a CSS class prefix cannot impersonate the recorded part", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]", cssProperty: "background-color", cssSelector: ".rootish", variableId: "foreground-id" }];
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("CSS selector must include the part class")));
});

test("every exported variable needs a unique base CSS declaration", () => {
  const root = withExampleComponent();
  write(root, "src/styles/tokens.css", ":root { --wrong: #000000; }");
  assert.ok(verify(root).errors.some((item) => item.includes("missing base declaration --ds-foreground-id")));
  write(root, "src/styles/tokens.css", ":root { --ds-foreground-id: #000000; --ds-foreground-id: #FFFFFF; }");
  assert.ok(verify(root).errors.some((item) => item.includes("duplicate base declaration --ds-foreground-id")));
  write(root, "src/styles/tokens.css", ":root { --ds-foreground-id: #000000; } @media (prefers-color-scheme: dark) { :root { --ds-foreground-id: #FFFFFF; } }");
  assert.ok(verify(root).errors.some((item) => item.includes("differs from the generated output")), "a hand-written stylesheet is not accepted even when its declarations look right");
  regenerate(root);
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
});

test("invalid token CSS is reported once", () => {
  const root = withExampleComponent();
  write(root, "src/styles/tokens.css", ":root { --ds-foreground-id: #000000");
  const errors = verify(root).errors.filter((message) => message.includes("invalid CSS"));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /src\/styles\/tokens\.css/);
});

test("base CSS values and local alias targets match the measured token JSON", () => {
  const root = withExampleComponent();
  const relative = "design-system/tokens/Colors.json";
  const collectionData = read(root, relative);
  collectionData.variables.selected = token("selected", "COLOR", { Default: {
    targetVariableId: "foreground-id", source: "local", value: "#000000",
  } });
  write(root, relative, collectionData);
  write(root, "src/styles/tokens.css", ":root { --ds-foreground-id: #FFFFFF; --ds-selected: var(--wrong); }");
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("base color differs")));
  assert.ok(errors.some((item) => item.includes("must alias --ds-foreground-id")));
});

test("a forced mode must belong to the bound variable collection", () => {
  const root = withExampleComponent();
  const tokenPath = "design-system/tokens/Colors.json";
  const collectionData = read(root, tokenPath);
  collectionData.id = "COL";
  write(root, tokenPath, collectionData);
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]", cssProperty: "background-color", cssSelector: ".root", variableId: "foreground-id", modeOverride: { collectionId: "OTHER", modeName: "Default" } }];
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("modeOverride does not match")));
  metadata.bindings[0].modeOverride = { collectionId: "COL", modeName: "Default" };
  write(root, relative, metadata);
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
});

test("an imported component requires collection tokens and tokens.css", () => {
  const root = withExampleComponent();
  rmSync(path.join(root, "design-system/tokens/Colors.json"));
  assert.equal(verify(root).errors.filter((item) => item.includes("an imported component requires at least one")).length, 1);
  assert.ok(verify(root).errors.some((item) => item.includes("at least one variable in a collection JSON or an external variable snapshot")));
  writeCollection(root, "Colors.json", collection("Colors", "COL", ["Default"], {
    foreground: token("foreground-id", "COLOR", { Default: "#000000" }),
  }));
  rmSync(path.join(root, "src/styles/tokens.css"));
  assert.ok(verify(root).errors.some((item) => item.includes("token stylesheet: missing src/styles/tokens.css")));
});

test("an imported component cannot have an empty token inventory or stylesheet", () => {
  const root = withExampleComponent();
  writeCollection(root, "Colors.json", collection("Colors", "COL", ["Default"], {}));
  assert.equal(verify(root).errors.filter((item) => item.includes("an imported component requires at least one")).length, 1);
  assert.ok(verify(root).errors.some((item) => item.includes("at least one variable in a collection JSON or an external variable snapshot")));
  writeCollection(root, "Colors.json", collection("Colors", "COL", ["Default"], {
    foreground: token("foreground-id", "COLOR", { Default: "#000000" }),
  }));
  write(root, "src/styles/tokens.css", "  \n");
  assert.ok(verify(root).errors.some((item) => item.includes("tokens.css is empty")));
});

test("variant coverage, blocking gaps and inventory drift fail", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.figmaCoverage.variants = [];
  metadata.unresolved = [{ field: "variants.Size", reason: "missing context", source: "get_metadata FILE:1:2", blocking: true }];
  write(root, relative, metadata);
  write(root, "design-system/inventory.json", { components: [], screens: [] });
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("figmaCoverage.variants differs")));
  assert.ok(errors.some((item) => item.includes("blocking unresolved gap")));
  assert.ok(errors.some((item) => item.includes("inventory.json: component inventory differs")));
});

test("duplicate refs and missing code fail", () => {
  const root = withExampleComponent();
  const relative = "design-system/relationships/figma-code-map.json";
  const map = read(root, relative);
  map["FILE:1:2"].figma.variants["Size=Small"].refs = ["FILE:1:2"];
  map["FILE:1:2"].code.path = "src/components/ExampleComponent/Missing.tsx";
  write(root, relative, map);
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("duplicate ref")));
  assert.ok(errors.some((item) => item.includes("Missing.tsx")));
});

test("local aliases resolve by variable id even when names repeat across collections", () => {
  const root = fixture();
  writeCollection(root, "One.json", collection("One", "COL-ONE", ["Default"], {
    base: token("one", "COLOR", { Default: "#FFFFFF" }),
    selected: token("selected", "COLOR", { Default: { targetVariableId: "one", source: "local", value: "#FFFFFF" } }),
  }));
  writeCollection(root, "Two.json", collection("Two", "COL-TWO", ["Default"], {
    base: token("two", "COLOR", { Default: "#000000" }),
  }));
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  const one = read(root, "design-system/tokens/One.json");
  one.variables.selected.valuesByMode.Default.alias = "wrong";
  write(root, "design-system/tokens/One.json", one);
  assert.ok(verify(root).errors.some((item) => item.includes("local alias name differs from target base")));
});

test("unnamed local aliases and malformed mode values cannot bypass validation", () => {
  const root = fixture();
  writeCollection(root, "Color.json", collection("Color", "COL-COLOR", ["Default"], {
    missing: token("one", "COLOR", { Default: { targetVariableId: "VariableID:999", source: "local", value: "#0000FF" } }),
    malformed: token("two", "COLOR", { Default: { foo: 1 } }),
    nullValue: token("three", "COLOR", { Default: null }),
    arrayValue: token("four", "COLOR", { Default: [] }),
    emptyString: token("five", "STRING", { Default: "" }),
  }));
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("local alias target VariableID:999 not found")));
  assert.ok(errors.some((item) => item.includes("malformed mode Default: alias source, targetVariableId and resolved value are required")));
  assert.ok(errors.some((item) => item.includes("nullValue mode Default: invalid direct value")));
  assert.ok(errors.some((item) => item.includes("arrayValue mode Default: invalid direct value")));
  assert.ok(!errors.some((item) => item.includes("emptyString")));
});

test("external alias warns without failing, but a broken local alias fails", () => {
  const root = fixture();
  writeCollection(root, "Color.json", collection("Color", "COL-COLOR", ["Default"], {
    external: token("local-1", "COLOR", { Default: { targetVariableId: "remote-1", source: "external", value: "#0000FF" } }),
  }));
  const initial = verify(root);
  assert.deepEqual(initial.errors, []);
  const { warnings } = initial;
  assert.ok(warnings.some((item) => item.includes("external alias remote-1 uses a resolved snapshot")));
  writeCollection(root, "Broken.json", collection("Broken", "COL-BROKEN", ["Default"], {
    broken: token("local-2", "COLOR", { Default: { alias: "missing", targetVariableId: "missing-id", source: "local", value: "#000000" } }),
  }));
  assert.ok(verify(root).errors.some((item) => item.includes("local alias target missing-id not found")));
});

test("external classification cannot hide a local alias", () => {
  const root = fixture();
  writeCollection(root, "Color.json", collection("Color", "COL-COLOR", ["Default"], {
    base: token("local-1", "COLOR", { Default: "#FFFFFF" }),
    disguised: token("local-2", "COLOR", { Default: { alias: "base", targetVariableId: "local-1", source: "external", value: "#FFFFFF" } }),
  }));
  assert.ok(verify(root).errors.some((item) => item.includes("marked external but target local-1 is local")));
});

test("boolean resolved aliases are valid", () => {
  const root = fixture();
  writeCollection(root, "Flags.json", collection("Flags", "COL-FLAGS", ["Default"], {
    enabled: token("enabled-id", "BOOLEAN", { Default: true }),
    active: token("active-id", "BOOLEAN", { Default: { alias: "enabled", targetVariableId: "enabled-id", source: "local", value: true } }),
  }));
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
});

test("mode values must match collection modes exactly", () => {
  const root = fixture();
  writeCollection(root, "Color.json", collection("Color", "COL-COLOR", ["Light", "Dark"], {
    missing: token("one", "COLOR", { Light: "#FFFFFF" }),
    extra: token("two", "COLOR", { Light: "#FFFFFF", Dark: "#000000", Other: "#FF0000" }),
    complete: token("three", "COLOR", { Dark: "#000000", Light: "#FFFFFF" }),
  }));
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("missing: valuesByMode keys differ from collection modes")));
  assert.ok(errors.some((item) => item.includes("extra: valuesByMode keys differ from collection modes")));
  assert.ok(!errors.some((item) => item.includes("complete")));
  writeCollection(root, "EmptyModes.json", collection("EmptyModes", "COL-EMPTY", [], {}));
  assert.ok(verify(root).errors.some((item) => item.includes("EmptyModes.json: modes must be a nonempty list")));
});

test("the declared default mode, not array order, determines :root, and strings are written with double quotes", () => {
  const root = withExampleComponent();
  writeCollection(root, "Colors.json", { collection: "Colors", id: "COL", modes: ["Dark", "Light"], defaultMode: "Light", variables: {
    foreground: token("foreground-id", "COLOR", { Dark: "#FFFFFF", Light: "#000000" }),
    font: token("font-id", "STRING", { Dark: "Inter", Light: "Inter" }),
  } });
  regenerate(root);
  assertOnlyPendingModes(root);
  assert.match(readFileSync(path.join(root, "src/styles/tokens.css"), "utf8"), /--ds-foreground-id: #000000;\n {2}--ds-font-id: "Inter";/);
  const data = read(root, "design-system/tokens/Colors.json");
  data.defaultMode = "Missing";
  write(root, "design-system/tokens/Colors.json", data);
  assert.ok(verify(root).errors.some((item) => item.includes("defaultMode must name a collection mode")));
});

test("direct and resolved values follow variable types", () => {
  const root = fixture();
  writeCollection(root, "Values.json", collection("Values", "COL-VALUES", ["Default"], {
    rgba: token("one", "COLOR", { Default: { r: 1, g: 0, b: 0, a: 0.5 } }),
    emptyColor: token("two", "COLOR", { Default: "" }),
    alphaColor: token("three", "COLOR", { Default: "#FF000080" }),
    floatAsText: token("four", "FLOAT", { Default: "12" }),
    emptyText: token("five", "STRING", { Default: "" }),
    boolean: token("six", "BOOLEAN", { Default: false }),
    badAlias: token("seven", "COLOR", { Default: { targetVariableId: "remote", source: "external", value: "#f00" } }),
    emptyTextAlias: token("eight", "STRING", { Default: { targetVariableId: "remote-text", source: "external", value: "" } }),
  }));
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("rgba mode Default: convert Figma RGB(A)")));
  assert.ok(errors.some((item) => item.includes("emptyColor mode Default: invalid direct value")));
  assert.ok(errors.some((item) => item.includes("floatAsText mode Default: invalid direct value")));
  assert.ok(errors.some((item) => item.includes("badAlias mode Default: alias resolved value for COLOR")));
  assert.ok(!errors.some((item) => item.includes("alphaColor") || item.includes("emptyText") || item.includes("boolean")));
});

test("local aliases must resolve to a variable of the same type", () => {
  const root = fixture();
  writeCollection(root, "Mixed.json", collection("Mixed", "COL-MIXED", ["Default"], {
    count: token("count-id", "FLOAT", { Default: 3 }),
    color: token("color-id", "COLOR", { Default: { targetVariableId: "count-id", source: "local", value: "#000000" } }),
  }));
  assert.ok(verify(root).errors.some((item) => item.includes("local alias target count-id has type FLOAT, expected COLOR")));
});

test("mapped nested refs must resolve to the declared component", () => {
  const root = withExampleComponent();
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  state.components.ExampleComponent.nestedComponents = [{ figmaNodeId: "9:1", mainComponentRef: "FILE:1:2", status: "mapped", resolvedComponent: "ExampleComponent" }];
  write(root, relative, state);
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  state.components.ExampleComponent.nestedComponents[0].mainComponentRef = "FILE:missing";
  write(root, relative, state);
  assert.ok(verify(root).errors.some((item) => item.includes("no consistent stable ref")));
});

test("a listed screen needs a page, but is not a mapped component", () => {
  const root = withExampleComponent();
  const inventoryPath = "design-system/inventory.json";
  const inventory = read(root, inventoryPath);
  inventory.screens = [{ name: "Home", composition: { components: ["ExampleComponent"], description: "ExampleComponent on the page." } }];
  write(root, inventoryPath, inventory);
  assert.ok(verify(root).errors.some((item) => item.includes("screen Home is listed")));
  write(root, "src/pages/Home.tsx", "export const Home = () => null;\n");
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  inventory.screens[0].composition.components = ["MissingComponent"];
  write(root, inventoryPath, inventory);
  assert.ok(verify(root).errors.some((item) => item.includes("screen Home uses unincluded component MissingComponent")));
  inventory.screens[0].composition.components = ["ExampleComponent", "ExampleComponent"];
  write(root, inventoryPath, inventory);
  assert.ok(verify(root).errors.some((item) => item.includes("screen Home repeats component ExampleComponent")));
  inventory.screens[0].composition = "ExampleComponent";
  write(root, inventoryPath, inventory);
  assert.ok(verify(root).errors.some((item) => item.includes("needs name and composition")));
});

test("mixed Figma axis values require separate kinds and state owners", () => {
  const root = withExampleComponent();
  const mapPath = "design-system/relationships/figma-code-map.json";
  const map = read(root, mapPath);
  map["FILE:1:2"].figma.variants["State=Hover"] = { refs: ["FILE:1:4"], props: { State: "Hover" } };
  map["FILE:1:2"].figma.variants["State=Disabled"] = { refs: ["FILE:1:5"], props: { State: "Disabled" } };
  write(root, mapPath, map);
  const metadataPath = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, metadataPath);
  metadata.figmaCoverage.variants.push("State=Hover", "State=Disabled");
  metadata.parts.root.nodes["State=Hover"] = "FILE:1:4";
  metadata.parts.root.nodes["State=Disabled"] = "FILE:1:5";
  metadata.variants.State = ["Hover", "Disabled"];
  metadata.variantClassification.State = {
    Hover: { kind: "interaction", state: "hover" },
    Disabled: { kind: "state", state: "disabled" },
  };
  metadata.states = [{ name: "hover", control: "internal" }, { name: "disabled", control: "consumer" }];
  metadata.notBuilt = [{ item: "hover prop", reason: "browser owns hover", evidence: "FILE:1:4" }];
  write(root, metadataPath, metadata);
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  metadata.states[0].control = "shared";
  write(root, metadataPath, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("interaction state must be internal")));
});

test("missing classification value and unexplained exclusion fail", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.variants.Size = ["Imaginary"];
  metadata.variantClassification = { Size: {} };
  metadata.notBuilt = [{ item: "icon prop", reason: "content" }];
  write(root, relative, metadata);
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("metadata variants values for Size")));
  assert.ok(errors.some((item) => item.includes("variantClassification values for Size")));
  assert.ok(errors.some((item) => item.includes("notBuilt[0] needs item, reason and evidence")));
});

const setPrefix = (root, tokenPrefix) => {
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  state.tokenPrefix = tokenPrefix;
  write(root, relative, state);
};
const messages = (root) => verify(root).errors;

test("a design system with published names and no tokenPrefix fails with the shared message", () => {
  const cases = {
    "imported component and tokens": withExampleComponent(),
    "a registered collection": (() => {
      const root = fixture();
      writeCollection(root, "Colors.json", collection("Colors", "COL", ["Default"], { a: token("a-id", "COLOR", { Default: "#000000" }) }));
      return root;
    })(),
    "a declaration in tokens.css": (() => {
      const root = fixture();
      write(root, "src/styles/tokens.css", ":root { --x: 1; }");
      return root;
    })(),
    "a numeric custom property": (() => {
      const root = fixture();
      write(root, "src/styles/tokens.css", ":root { --1x: 1; }");
      return root;
    })(),
    "a Unicode custom property": (() => {
      const root = fixture();
      write(root, "src/styles/tokens.css", ":root { --é: 1; }");
      return root;
    })(),
    "a declaration outside :root": (() => {
      const root = fixture();
      write(root, "src/styles/tokens.css", "@media (min-width: 1px) { .a { --x: 1; } }");
      return root;
    })(),
    "a component folder": (() => {
      const root = fixture();
      write(root, "design-system/components/Button/usage.md", "# Button\n");
      return root;
    })(),
  };
  for (const [label, root] of Object.entries(cases)) {
    setPrefix(root, null);
    assert.ok(messages(root).some((item) => item.includes(MISSING_PREFIX_MESSAGE)), label);
  }
});

test("preflight and verifier reject the same incomplete project with the same prefix diagnosis", () => {
  const preflight = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/create-ds-from-figma/scripts/preflight-token-files.mjs");
  for (const [label, relative, content] of [
    ["nested CSS declaration", "src/styles/tokens.css", "@media (min-width: 1px) { .a { --x: 1; } }"],
    ["unfinished component folder", "design-system/components/Button/usage.md", "# Button\n"],
  ]) {
    const root = fixture();
    write(root, relative, content);
    const result = spawnSync(process.execPath, [preflight, root], { input: '{"collections":[]}', encoding: "utf8" });
    assert.equal(result.status, 1, label);
    assert.ok(result.stderr.includes(MISSING_PREFIX_MESSAGE), label);
    assert.ok(verify(root).errors.some((message) => message.includes(MISSING_PREFIX_MESSAGE)), label);
  }
});

test("the blank kit passes without a prefix, and an invalid prefix always fails", () => {
  assert.deepEqual(verify(fixture()), { errors: [], warnings: [] });
  for (const tokenPrefix of ["DS", "", "-ds", "ds-", 7]) {
    const root = fixture();
    setPrefix(root, tokenPrefix);
    assert.ok(messages(root).some((item) => item.includes("is not a valid prefix")), String(tokenPrefix));
  }
});

test("every local cssName must start with the fixed prefix, while external snapshots are exempt", () => {
  const root = withExampleComponent();
  assert.deepEqual(verify(root).errors, []);
  setPrefix(root, "sds");
  const errors = messages(root);
  assert.ok(errors.some((item) => item.includes("must start with --sds- (tokenPrefix sds)")));
  const external = withExampleComponent();
  const metadataPath = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(external, metadataPath);
  metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]", cssSelector: ".root", cssProperty: "color", variableId: "VariableID:external" }];
  metadata.externalVariables = [{ id: "VariableID:external", cssName: "--lib-surface", type: "COLOR", value: "#112233", source: "FILE:1:3" }];
  write(external, metadataPath, metadata);
  regenerate(external);
  assert.deepEqual(verify(external).errors, []);
});

test("a variable renamed in Figma keeps its published cssName", () => {
  const root = withExampleComponent();
  const file = "design-system/tokens/Colors.json";
  const data = read(root, file);
  data.variables = { "Renamed foreground": data.variables.foreground };
  write(root, file, data);
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  state.variables.COL = { "Renamed foreground": { id: "foreground-id", type: "COLOR" } };
  write(root, relative, state);
  assert.deepEqual(verify(root).errors, []);
});

const withModes = (scope, css) => {
  const root = withExampleComponent();
  writeCollection(root, "Colors.json", collection("Colors", "COL", ["Light", "Dark"], {
    foreground: token("foreground-id", "COLOR", { Light: "#000000", Dark: "#FFFFFF" }),
  }));
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  state.collections.COL.modeScopes = { Dark: scope };
  write(root, relative, state);
  if (css === undefined) regenerate(root);
  else write(root, "src/styles/tokens.css", css);
  return root;
};
const darkScope = { kind: "selector", value: '[data-theme="dark"]' };
const darkCss = ':root { --ds-foreground-id: #000000; }\n[data-theme="dark"] { --ds-foreground-id: #FFFFFF; }\n';

test("a collection mode with a decided scope is verified against tokens.css", () => {
  assert.deepEqual(verify(withModes(darkScope)), { errors: [], warnings: [] });
  const wrong = verify(withModes(darkScope, darkCss.replace("#FFFFFF", "#EEEEEE")));
  assert.ok(wrong.errors.some((item) => item.includes("token stylesheet:") && item.includes("is #EEEEEE, expected #FFFFFF")));
  const missingBlock = verify(withModes(darkScope, ":root { --ds-foreground-id: #000000; }\n"));
  assert.ok(missingBlock.errors.some((item) => item.includes('no CSS block for mode "Dark"')));
});

test("a mode scope that is pending warns, and a missing or orphan entry fails", () => {
  const pending = verify(withModes(null));
  assert.deepEqual(pending.errors, []);
  assert.ok(pending.warnings.some((item) => item.includes('mode "Dark" has no CSS scope yet')));
  const root = withModes(darkScope, darkCss);
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  delete state.collections.COL.modeScopes.Dark;
  write(root, relative, state);
  assert.ok(verify(root).errors.some((item) => item.includes('modeScopes needs an entry (or null) for mode "Dark"')));
  state.collections.COL.modeScopes = { Dark: darkScope, Light: darkScope };
  write(root, relative, state);
  assert.ok(verify(root).errors.some((item) => item.includes('"Light", which is not a non-default mode')));
});

const px = { kind: "unit", unit: "px" };
const evidence = { type: "bindings", evidence: [{ node: "FILE:1:3", figmaProperty: "paddingLeft", mode: "Default" }] };
const withFloat = (variables, css) => {
  const root = withExampleComponent();
  writeCollection(root, "Space.json", collection("Space", "SP", ["Default"], variables));
  if (css === undefined) regenerate(root);
  else write(root, "src/styles/tokens.css", `:root { --ds-foreground-id: #000000; ${css} }\n`);
  return root;
};
const decide = (root, entries) => {
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  state.collections.SP.serialization = entries;
  write(root, relative, state);
};
const bindSpace = (root, variableId) => {
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "paddingLeft",
    cssSelector: ".root", cssProperty: "padding-left", variableId }];
  write(root, relative, metadata);
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root { padding-left: var(--ds-gap-id); }\n");
};

test("a FLOAT variable with a decision must be written exactly as decided", () => {
  const root = withFloat({ gap: token("gap-id", "FLOAT", { Default: 4 }) });
  decide(root, { "gap-id": { css: px, source: evidence } });
  regenerate(root);
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  write(root, "src/styles/tokens.css", ":root { --ds-foreground-id: #000000; --ds-gap-id: 4; }\n");
  assert.ok(verify(root).errors.some((item) => item.includes("--ds-gap-id must be 4px to match its serialization decision")));
  write(root, "src/styles/tokens.css", ":root { --ds-foreground-id: #000000; }\n");
  assert.ok(verify(root).errors.some((item) => item.includes("missing base declaration --ds-gap-id")));
});

test("a FLOAT variable without a decision is not written, and writing it fails", () => {
  const pending = withFloat({ gap: token("gap-id", "FLOAT", { Default: 4 }) });
  const result = verify(pending);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((item) => item.includes("have no serialization decision and are not written to tokens.css (NOT VERIFIED): gap")));
  const raw = withFloat({ gap: token("gap-id", "FLOAT", { Default: 4 }) }, "--ds-gap-id: 4;");
  assert.ok(verify(raw).errors.some((item) => item.includes("--ds-gap-id is declared without a serialization decision")));
});

test("a binding cannot consume a pending FLOAT variable until it is decided", () => {
  const root = withFloat({ gap: token("gap-id", "FLOAT", { Default: 4 }) });
  bindSpace(root, "gap-id");
  assert.ok(verify(root).errors.some((item) => item.includes("--ds-gap-id has no serialization decision, so it cannot be consumed yet")));
  decide(root, { "gap-id": { css: px, source: evidence } });
  regenerate(root);
  assert.deepEqual(verify(root).errors, []);
});

test("a local FLOAT alias inherits its target and is written as var() once the target is decided", () => {
  const variables = {
    base: token("base-id", "FLOAT", { Default: 4 }),
    pad: token("pad-id", "FLOAT", { Default: { source: "local", targetVariableId: "base-id", value: 4 } }),
  };
  const root = withFloat(variables);
  assert.deepEqual(verify(root).errors, [], "both are pending, so neither is written");
  decide(root, { "base-id": { css: px, source: evidence } });
  regenerate(root);
  assert.match(readFileSync(path.join(root, "src/styles/tokens.css"), "utf8"), /--ds-base-id: 4px;\n {2}--ds-pad-id: var\(--ds-base-id\);/);
  assert.deepEqual(verify(root).errors, []);
  write(root, "src/styles/tokens.css", ":root { --ds-foreground-id: #000000; --ds-base-id: 4px; --ds-pad-id: 4px; }\n");
  assert.ok(verify(root).errors.some((item) => item.includes("--ds-pad-id must be var(--ds-base-id)")));
  decide(root, { "base-id": { css: px, source: evidence }, "pad-id": { css: px, source: evidence } });
  assert.ok(verify(root).errors.some((item) => item.includes("inherits the serialization of its targets")));
});

test("local alias cycles in the token JSON are reported", () => {
  const root = withExampleComponent();
  const loop = (target) => ({ source: "local", targetVariableId: target, value: "#000000" });
  writeCollection(root, "Loop.json", collection("Loop", "LP", ["Default"], {
    a: token("a-id", "COLOR", { Default: loop("b-id") }),
    b: token("b-id", "COLOR", { Default: loop("a-id") }),
  }));
  assert.ok(verify(root).errors.some((item) => item.includes("local alias cycle --ds-a-id -> --ds-b-id -> --ds-a-id")));
});

test("a mixed FLOAT alias must point to a decided target with the same serialization", () => {
  const root = withExampleComponent();
  writeCollection(root, "Space.json", collection("Space", "SP", ["Light", "Dark"], {
    a: token("a-id", "FLOAT", { Light: 1, Dark: 2 }),
    b: token("b-id", "FLOAT", { Light: 2, Dark: { source: "local", targetVariableId: "a-id", value: 1 } }),
  }));
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  state.collections.SP.modeScopes = { Dark: { kind: "selector", value: '[data-theme="dark"]' } };
  state.collections.SP.serialization = { "b-id": { css: px, source: evidence } };
  write(root, relative, state);
  assert.ok(verify(root).errors.some((item) => item.includes('--ds-b-id: mode "Dark" aliases --ds-a-id, which has no serialization decision')));
  state.collections.SP.serialization = { "a-id": { css: { kind: "unitless" }, source: evidence }, "b-id": { css: px, source: evidence } };
  write(root, relative, state);
  assert.ok(verify(root).errors.some((item) => item.includes("different serialization")));
  state.collections.SP.serialization = { "a-id": { css: px, source: evidence }, "b-id": { css: px, source: evidence } };
  write(root, relative, state);
  regenerate(root);
  assert.deepEqual(verify(root).errors, []);
});

test("a decided FLOAT value in a scoped mode is verified and a pending one is not", () => {
  const root = withExampleComponent();
  writeCollection(root, "Space.json", collection("Space", "SP", ["Compact", "Roomy"], { gap: token("gap-id", "FLOAT", { Compact: 4, Roomy: 8 }) }));
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  state.collections.SP.modeScopes = { Roomy: { kind: "selector", value: '[data-density="roomy"]' } };
  state.collections.SP.serialization = { "gap-id": { css: px, source: evidence } };
  write(root, relative, state);
  const css = (value) => `:root { --ds-foreground-id: #000000; --ds-gap-id: 4px; }\n[data-density="roomy"] { --ds-gap-id: ${value}; }\n`;
  regenerate(root);
  assert.deepEqual(verify(root).errors, []);
  write(root, "src/styles/tokens.css", css("8"));
  assert.ok(verify(root).errors.some((item) => item.includes('--ds-gap-id in mode "Roomy" is 8, expected 8px')));
  state.collections.SP.serialization = {};
  write(root, relative, state);
  regenerate(root);
  assert.doesNotMatch(readFileSync(path.join(root, "src/styles/tokens.css"), "utf8"), /--ds-gap-id/);
  assert.deepEqual(verify(root).errors, []);
});

test("observed Figma scopes are optional evidence and must be a list of names", () => {
  const root = withExampleComponent();
  const file = "design-system/tokens/Colors.json";
  const data = read(root, file);
  data.variables.foreground.scopes = ["ALL_SCOPES"];
  write(root, file, data);
  assert.deepEqual(verify(root).errors, []);
  data.variables.foreground.scopes = "ALL_SCOPES";
  write(root, file, data);
  assert.ok(verify(root).errors.some((item) => item.includes("scopes, when present, must be the list of scope names Figma returned")));
});

test("a binding whose variable type cannot drive its CSS property is reported", () => {
  const root = withExampleComponent();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  const bind = (cssProperty) => {
    metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]", cssSelector: ".root", cssProperty, variableId: "foreground-id" }];
    write(root, relative, metadata);
    return verify(root).errors;
  };
  assert.ok(bind("padding-left").some((item) => item.includes("a COLOR variable cannot drive padding-left, which takes a number or length (variable foreground-id)")));
  assert.deepEqual(bind("background-color"), []);
  assert.deepEqual(bind("border"), []);
});

test("a FLOAT variable bound to a color property is reported even when it has a decision", () => {
  const root = withFloat({ gap: token("gap-id", "FLOAT", { Default: 4 }) });
  decide(root, { "gap-id": { css: px, source: evidence } });
  regenerate(root);
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]", cssSelector: ".root", cssProperty: "background-color", variableId: "gap-id" }];
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("a FLOAT variable cannot drive background-color, which takes a color")));
});

test("a static data-ds-part marker that the metadata does not declare is a warning, not a failure", () => {
  const root = withExampleComponent();
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  const tsx = "src/components/ExampleComponent/ExampleComponent.tsx";
  const source = readFileSync(path.join(root, tsx), "utf8");
  write(root, tsx, source.replace('<span data-ds-part="root" />', '<span data-ds-part="root"><i data-ds-part="icon" /></span>'));
  const result = verify(root);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((item) => item.includes('static data-ds-part="icon" that metadata.parts does not declare')));
});
