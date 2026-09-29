import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { verify } from "../plantillas/ai/checks/verify-ds.mjs";

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
  cpSync(path.join(template, "AGENTS.md"), path.join(root, "AGENTS.md"));
  cpSync(path.join(template, "system/composition-rules.md"), path.join(root, "design-system/system/composition-rules.md"));
  cpSync(path.join(template, "relationships/figma-code-map.json"), path.join(root, "design-system/relationships/figma-code-map.json"));
  cpSync(path.join(template, "relationships/figma-state.json"), path.join(root, "design-system/relationships/figma-state.json"));
  return root;
};
const read = (root, relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const collection = (modes, variables) => ({ modes, variables });
const token = (id, type, valuesByMode) => ({ id, type, valuesByMode });
const withAvatar = () => {
  const root = fixture();
  const metadataPath = "design-system/components/Avatar/metadata.json";
  const metadata = read(template, "componentes/metadata.json");
  metadata.name = "Avatar";
  metadata.figma = { fileKey: "FILE", nodeId: "1:2", url: "https://www.figma.com/design/FILE?node-id=1-2", componentSet: "Avatar" };
  metadata.code = { path: "src/components/Avatar/Avatar.tsx", component: "Avatar" };
  metadata.variants = { Size: ["Small"] };
  metadata.variantClassification = { Size: { Small: { kind: "prop", codeProp: "size" } } };
  metadata.figmaCoverage.variants = ["Size=Small"];
  write(root, metadataPath, metadata);
  write(root, "design-system/components/Avatar/usage.md", "# Avatar\n");
  write(root, "src/components/Avatar/Avatar.tsx", "export interface AvatarProps { size?: 'Small' }\nexport const Avatar = (props: AvatarProps) => null;\n");
  write(root, "src/components/Avatar/Avatar.module.css", ".root {}\n");
  write(root, "design-system/tokens/Colors.json", collection(["Default"], {
    foreground: token("foreground-id", "COLOR", { Default: "#000000" }),
  }));
  write(root, "src/styles/tokens.css", ":root { --foreground: #000000; }\n");
  const map = read(root, "design-system/relationships/figma-code-map.json");
  map["FILE:1:2"] = {
    name: "Avatar",
    figma: { fileKey: "FILE", nodeId: "1:2", refs: ["FILE:1:2"], variants: { "Size=Small": { refs: ["FILE:1:3"], props: { Size: "Small" } } } },
    designSystem: { metadata: metadataPath, usage: "design-system/components/Avatar/usage.md" },
    code: { component: "Avatar", path: "src/components/Avatar/Avatar.tsx", style: "src/components/Avatar/Avatar.module.css" },
  };
  write(root, "design-system/relationships/figma-code-map.json", map);
  const state = read(root, "design-system/relationships/figma-state.json");
  state.fileKey = "FILE";
  state.components.Avatar = { figmaNodeId: "1:2", nestedComponents: [] };
  write(root, "design-system/relationships/figma-state.json", state);
  write(root, "AGENTS.md", readFileSync(path.join(root, "AGENTS.md"), "utf8").replace("Incluidos: —", "Incluidos: Avatar"));
  write(root, "design-system/system/composition-rules.md", "# Composition rules\n\n## Incluidos\n\n- **Avatar** — avatar.\n");
  return root;
};

test.after(() => {
  for (const root of active) rmSync(root, { recursive: true, force: true });
});

test("empty kit is valid", () => {
  assert.deepEqual(verify(fixture()), { errors: [], warnings: [] });
});

test("an imported component is valid", () => {
  assert.deepEqual(verify(withAvatar()), { errors: [], warnings: [] });
});

test("an imported component requires collection tokens and tokens.css", () => {
  const root = withAvatar();
  rmSync(path.join(root, "design-system/tokens/Colors.json"));
  assert.ok(verify(root).errors.some((item) => item.includes("requires at least one collection JSON")));
  write(root, "design-system/tokens/Colors.json", collection(["Default"], {
    foreground: token("foreground-id", "COLOR", { Default: "#000000" }),
  }));
  rmSync(path.join(root, "src/styles/tokens.css"));
  assert.ok(verify(root).errors.some((item) => item.includes("token stylesheet: missing src/styles/tokens.css")));
});

test("an imported component cannot have an empty token inventory or stylesheet", () => {
  const root = withAvatar();
  write(root, "design-system/tokens/Colors.json", collection(["Default"], {}));
  assert.ok(verify(root).errors.some((item) => item.includes("requires at least one variable")));
  write(root, "design-system/tokens/Colors.json", collection(["Default"], {
    foreground: token("foreground-id", "COLOR", { Default: "#000000" }),
  }));
  write(root, "src/styles/tokens.css", "  \n");
  assert.ok(verify(root).errors.some((item) => item.includes("tokens.css is empty")));
});

test("variant coverage, blocking gaps and inventory drift fail", () => {
  const root = withAvatar();
  const relative = "design-system/components/Avatar/metadata.json";
  const metadata = read(root, relative);
  metadata.figmaCoverage.variants = [];
  metadata.unresolved = [{ field: "variants.Size", reason: "missing context", source: "get_metadata FILE:1:2", blocking: true }];
  write(root, relative, metadata);
  write(root, "AGENTS.md", readFileSync(path.join(root, "AGENTS.md"), "utf8").replace("Incluidos: Avatar", "Incluidos: —"));
  const { errors } = verify(root);
  assert.ok(errors.some((item) => item.includes("figmaCoverage.variants differs")));
  assert.ok(errors.some((item) => item.includes("blocking unresolved gap")));
  assert.ok(errors.some((item) => item.includes("AGENTS.md inventory differs")));
});

test("duplicate refs and missing code fail", () => {
  const root = withAvatar();
  const relative = "design-system/relationships/figma-code-map.json";
  const map = read(root, relative);
  map["FILE:1:2"].figma.variants["Size=Small"].refs = ["FILE:1:2"];
  map["FILE:1:2"].code.path = "src/components/Avatar/Missing.tsx";
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
  const root = withAvatar();
  const relative = "design-system/relationships/figma-state.json";
  const state = read(root, relative);
  state.components.Avatar.nestedComponents = [{ figmaNodeId: "9:1", mainComponentRef: "FILE:1:2", status: "mapped", resolvedComponent: "Avatar" }];
  write(root, relative, state);
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
  state.components.Avatar.nestedComponents[0].mainComponentRef = "FILE:missing";
  write(root, relative, state);
  assert.ok(verify(root).errors.some((item) => item.includes("no consistent stable ref")));
});

test("a listed screen needs a page, but is not a mapped component", () => {
  const root = withAvatar();
  write(root, "AGENTS.md", readFileSync(path.join(root, "AGENTS.md"), "utf8").replace("Incluidos: Avatar", "Incluidos: Avatar, Home"));
  write(root, "design-system/system/composition-rules.md", "# Composition rules\n\n## Incluidos\n\n- **Avatar** — avatar.\n- **Home** (pantalla) — page.\n");
  assert.ok(verify(root).errors.some((item) => item.includes("screen Home is listed")));
  write(root, "src/pages/Home.tsx", "export const Home = () => null;\n");
  assert.deepEqual(verify(root), { errors: [], warnings: [] });
});

test("mixed Figma axis values require separate kinds and state owners", () => {
  const root = withAvatar();
  const mapPath = "design-system/relationships/figma-code-map.json";
  const map = read(root, mapPath);
  map["FILE:1:2"].figma.variants["State=Hover"] = { refs: ["FILE:1:4"], props: { State: "Hover" } };
  map["FILE:1:2"].figma.variants["State=Disabled"] = { refs: ["FILE:1:5"], props: { State: "Disabled" } };
  write(root, mapPath, map);
  const metadataPath = "design-system/components/Avatar/metadata.json";
  const metadata = read(root, metadataPath);
  metadata.figmaCoverage.variants.push("State=Hover", "State=Disabled");
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
  const root = withAvatar();
  const relative = "design-system/components/Avatar/metadata.json";
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
