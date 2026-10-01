import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { verify } from "../../../checks/verify-ds.mjs";

const template = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../plantillas");
const active = new Set();
const write = (root, relative, value) => {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value, null, 2));
};
const fixture = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "verify-ds-"));
  active.add(root);
  cpSync(path.join(template, "design-system/AGENTS.md"), path.join(root, "design-system/AGENTS.md"));
  cpSync(path.join(template, "design-system/system/composition-rules.md"), path.join(root, "design-system/system/composition-rules.md"));
  cpSync(path.join(template, "design-system/relationships/figma-code-map.json"), path.join(root, "design-system/relationships/figma-code-map.json"));
  cpSync(path.join(template, "design-system/relationships/figma-state.json"), path.join(root, "design-system/relationships/figma-state.json"));
  return root;
};
const read = (root, relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const collection = (modes, variables) => ({ modes, defaultMode: modes[0], variables });
const token = (id, type, valuesByMode) => ({ id, cssName: `--${id}`, type, valuesByMode });
const withExampleComponent = () => {
  const root = fixture();
  const metadataPath = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(template, "componentes/metadata.json");
  metadata.name = "ExampleComponent";
  metadata.figma = { fileKey: "FILE", nodeId: "1:2", url: "https://www.figma.com/design/FILE?node-id=1-2", componentSet: "ExampleComponent" };
  metadata.code = { path: "src/components/ExampleComponent/ExampleComponent.tsx", component: "ExampleComponent" };
  metadata.variants = { Size: ["Small"] };
  metadata.variantClassification = { Size: { Small: { kind: "prop", codeProp: "size" } } };
  metadata.figmaCoverage.variants = ["Size=Small"];
  metadata.parts = { root: { selector: ".root", nodes: { "Size=Small": "FILE:1:3" } } };
  write(root, metadataPath, metadata);
  write(root, "design-system/components/ExampleComponent/usage.md", "# ExampleComponent\n");
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps { size?: 'Small' }\nexport const ExampleComponent = (props: ExampleComponentProps) => <span data-ds-part=\"root\" />;\n");
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root {}\n");
  write(root, "design-system/tokens/Colors.json", collection(["Default"], {
    foreground: token("foreground-id", "COLOR", { Default: "#000000" }),
  }));
  write(root, "src/styles/tokens.css", ":root { --foreground-id: #000000; }\n");
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
  state.components.ExampleComponent = { figmaNodeId: "1:2", nestedComponents: [] };
  write(root, "design-system/relationships/figma-state.json", state);
  write(root, "design-system/AGENTS.md", readFileSync(path.join(root, "design-system/AGENTS.md"), "utf8").replace("Incluidos: —", "Incluidos: ExampleComponent"));
  write(root, "design-system/system/composition-rules.md", "# Composition rules\n\n## Incluidos\n\n- **ExampleComponent** — example component.\n");
  return root;
};

test.after(() => {
  for (const root of active) rmSync(root, { recursive: true, force: true });
});

test("empty kit is valid", () => {
  assert.deepEqual(verify(fixture()), { errors: [], warnings: [] });
});

test("generated agent instructions install dependencies before all Node checks", () => {
  const instructions = readFileSync(path.join(template, "design-system/AGENTS.md"), "utf8");
  assert.ok(instructions.indexOf("Install project dependencies") < instructions.indexOf("node .agents/design-system-resources/checks/verify-ds.mjs"));
  assert.ok(instructions.includes("postcss-selector-parser"));
  assert.ok(instructions.includes("`verify-ds.mjs` and `verify-props.mjs` require TypeScript"));
  for (const check of ["verify-ds", "verify-props", "verify-bindings"]) {
    assert.ok(instructions.includes(`node .agents/design-system-resources/checks/${check}.mjs`));
  }
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
  write(root, "src/styles/tokens.css", ":root { --foreground-id: #000000; --external-surface: #112233; }");
  const valid = verify(root);
  assert.deepEqual(valid.errors, []);
  assert.ok(valid.warnings.some((item) => item.includes("resolved snapshot")));
  metadata.externalVariables[0].source = "FILE:1:9";
  write(root, metadataPath, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("source must identify a node with this external binding")));
  metadata.externalVariables[0].source = "FILE:1:3";
  metadata.externalVariables[0].value = "#445566";
  write(root, metadataPath, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("base color differs from resolved snapshot")));
  metadata.externalVariables = [];
  write(root, metadataPath, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("variableId VariableID:external is missing")));
});

test("an external-only component does not require a fictitious local collection", () => {
  const root = withExampleComponent();
  rmSync(path.join(root, "design-system/tokens/Colors.json"));
  const metadataPath = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, metadataPath);
  metadata.bindings = [{ part: "root", variant: "Size=Small", node: "FILE:1:3", figmaProperty: "fills[0]",
    cssProperty: "background-color", cssSelector: ".root", variableId: "VariableID:external" }];
  metadata.externalVariables = [{ id: "VariableID:external", cssName: "--external-surface", type: "COLOR",
    value: "#112233", source: "FILE:1:3" }];
  write(root, metadataPath, metadata);
  write(root, "src/styles/tokens.css", ":root { --external-surface: #112233; }");
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
  metadata.measuredLiterals = [{ part: "root", variant: "Size=Small", source: "FILE:1:3", figmaProperty: "fills[0]", cssProperty: "background-color", cssSelector: ".root", value: "#000000" }];
  write(root, relative, metadata);
  assert.ok(verify(root).errors.some((item) => item.includes("duplicate or conflicting property observation")));
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
  assert.ok(verify(root).errors.some((item) => item.includes("missing base declaration --foreground-id")));
  write(root, "src/styles/tokens.css", ":root { --foreground-id: #000000; --foreground-id: #FFFFFF; }");
  assert.ok(verify(root).errors.some((item) => item.includes("duplicate base declaration --foreground-id")));
  write(root, "src/styles/tokens.css", ":root { --foreground-id: #000000; } @media (prefers-color-scheme: dark) { :root { --foreground-id: #FFFFFF; } }");
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
});

test("base CSS values and local alias targets match the measured token JSON", () => {
  const root = withExampleComponent();
  const relative = "design-system/tokens/Colors.json";
  const collectionData = read(root, relative);
  collectionData.variables.selected = token("selected", "COLOR", { Default: {
    targetVariableId: "foreground-id", source: "local", value: "#000000",
  } });
  write(root, relative, collectionData);
  write(root, "src/styles/tokens.css", ":root { --foreground-id: #FFFFFF; --selected: var(--wrong); }");
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("base color differs")));
  assert.ok(errors.some((item) => item.includes("must alias --foreground-id")));
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
  assert.ok(verify(root).errors.some((item) => item.includes("requires at least one collection JSON")));
  write(root, "design-system/tokens/Colors.json", collection(["Default"], {
    foreground: token("foreground-id", "COLOR", { Default: "#000000" }),
  }));
  rmSync(path.join(root, "src/styles/tokens.css"));
  assert.ok(verify(root).errors.some((item) => item.includes("token stylesheet: missing src/styles/tokens.css")));
});

test("an imported component cannot have an empty token inventory or stylesheet", () => {
  const root = withExampleComponent();
  write(root, "design-system/tokens/Colors.json", collection(["Default"], {}));
  assert.ok(verify(root).errors.some((item) => item.includes("requires at least one variable")));
  write(root, "design-system/tokens/Colors.json", collection(["Default"], {
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
  write(root, "design-system/AGENTS.md", readFileSync(path.join(root, "design-system/AGENTS.md"), "utf8").replace("Incluidos: ExampleComponent", "Incluidos: —"));
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("figmaCoverage.variants differs")));
  assert.ok(errors.some((item) => item.includes("blocking unresolved gap")));
  assert.ok(errors.some((item) => item.includes("design-system/AGENTS.md inventory differs")));
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
  write(root, "design-system/tokens/One.json", collection(["Default"], {
    base: token("one", "COLOR", { Default: "#FFFFFF" }),
    selected: token("selected", "COLOR", { Default: { targetVariableId: "one", source: "local", value: "#FFFFFF" } }),
  }));
  write(root, "design-system/tokens/Two.json", collection(["Default"], {
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
  write(root, "design-system/tokens/Color.json", collection(["Default"], {
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
  write(root, "design-system/tokens/Color.json", collection(["Default"], {
    external: token("local-1", "COLOR", { Default: { targetVariableId: "remote-1", source: "external", value: "#0000FF" } }),
  }));
  const initial = verify(root);
  assert.deepEqual(initial.errors, []);
  const { warnings } = initial;
  assert.ok(warnings.some((item) => item.includes("external alias remote-1 uses a resolved snapshot")));
  write(root, "design-system/tokens/Broken.json", collection(["Default"], {
    broken: token("local-2", "COLOR", { Default: { alias: "missing", targetVariableId: "missing-id", source: "local", value: "#000000" } }),
  }));
  assert.ok(verify(root).errors.some((item) => item.includes("local alias target missing-id not found")));
});

test("external classification cannot hide a local alias", () => {
  const root = fixture();
  write(root, "design-system/tokens/Color.json", collection(["Default"], {
    base: token("local-1", "COLOR", { Default: "#FFFFFF" }),
    disguised: token("local-2", "COLOR", { Default: { alias: "base", targetVariableId: "local-1", source: "external", value: "#FFFFFF" } }),
  }));
  assert.ok(verify(root).errors.some((item) => item.includes("marked external but target local-1 is local")));
});

test("boolean resolved aliases are valid", () => {
  const root = fixture();
  write(root, "design-system/tokens/Flags.json", collection(["Default"], {
    enabled: token("enabled-id", "BOOLEAN", { Default: true }),
    active: token("active-id", "BOOLEAN", { Default: { alias: "enabled", targetVariableId: "enabled-id", source: "local", value: true } }),
  }));
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
});

test("mode values must match collection modes exactly", () => {
  const root = fixture();
  write(root, "design-system/tokens/Color.json", collection(["Light", "Dark"], {
    missing: token("one", "COLOR", { Light: "#FFFFFF" }),
    extra: token("two", "COLOR", { Light: "#FFFFFF", Dark: "#000000", Other: "#FF0000" }),
    complete: token("three", "COLOR", { Dark: "#000000", Light: "#FFFFFF" }),
  }));
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("missing: valuesByMode keys differ from collection modes")));
  assert.ok(errors.some((item) => item.includes("extra: valuesByMode keys differ from collection modes")));
  assert.ok(!errors.some((item) => item.includes("complete")));
  write(root, "design-system/tokens/EmptyModes.json", collection([], {}));
  assert.ok(verify(root).errors.some((item) => item.includes("EmptyModes.json: modes must be a nonempty list")));
});

test("the declared default mode, not array order, determines :root and strings accept single quotes", () => {
  const root = withExampleComponent();
  write(root, "design-system/tokens/Colors.json", { modes: ["Dark", "Light"], defaultMode: "Light", variables: {
    foreground: token("foreground-id", "COLOR", { Dark: "#FFFFFF", Light: "#000000" }),
    font: token("font-id", "STRING", { Dark: "Inter", Light: "Inter" }),
  } });
  write(root, "src/styles/tokens.css", ":root { --foreground-id: #000000; --font-id: 'Inter'; }");
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  const data = read(root, "design-system/tokens/Colors.json");
  data.defaultMode = "Missing";
  write(root, "design-system/tokens/Colors.json", data);
  assert.ok(verify(root).errors.some((item) => item.includes("defaultMode must name a collection mode")));
});

test("direct and resolved values follow variable types", () => {
  const root = fixture();
  write(root, "design-system/tokens/Values.json", collection(["Default"], {
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
  write(root, "design-system/tokens/Mixed.json", collection(["Default"], {
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
  write(root, "design-system/AGENTS.md", readFileSync(path.join(root, "design-system/AGENTS.md"), "utf8").replace("Incluidos: ExampleComponent", "Incluidos: ExampleComponent, Home"));
  write(root, "design-system/system/composition-rules.md", "# Composition rules\n\n## Incluidos\n\n- **ExampleComponent** — example component.\n- **Home** (pantalla) — page.\n");
  assert.ok(verify(root).errors.some((item) => item.includes("screen Home is listed")));
  write(root, "src/pages/Home.tsx", "export const Home = () => null;\n");
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
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
