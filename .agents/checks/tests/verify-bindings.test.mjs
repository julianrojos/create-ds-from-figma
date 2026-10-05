import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { report } from "../verify-bindings.mjs";

const roots = [];
const write = (root, relative, data) => {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
};
const fixture = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "binding-report-"));
  roots.push(root);
  write(root, "design-system/tokens/Color.json", { variables: {
    surface: { id: "VariableID:1:1", cssName: "--example-surface" },
    text: { id: "VariableID:1:2", cssName: "--example-text" },
  } });
  write(root, "src/styles/tokens.css", ":root { --example-surface: #222222; --example-text: #ffffff; }");
  const firstVariant = "Content=Text, Size=Large";
  const secondVariant = "State=Default";
  write(root, "design-system/relationships/figma-code-map.json", {
    ExampleComponent: { name: "ExampleComponent", designSystem: { metadata: "design-system/components/ExampleComponent/metadata.json" }, code: { style: "src/components/ExampleComponent/ExampleComponent.module.css" } },
    SecondExampleComponent: { name: "SecondExampleComponent", designSystem: { metadata: "design-system/components/SecondExampleComponent/metadata.json" }, code: { style: "src/components/SecondExampleComponent/SecondExampleComponent.module.css" } },
  });
  write(root, "design-system/components/ExampleComponent/metadata.json", { parts: {
    root: { selector: ".root" }, label: { selector: ".label" },
  }, bindings: [
    { part: "root", variant: firstVariant, node: "EXAMPLE_FILE:1:1", figmaProperty: "fills[0]", cssSelector: ".root", cssProperty: "background-color", variableId: "VariableID:1:1" },
    { part: "label", variant: firstVariant, node: "EXAMPLE_FILE:1:2", figmaProperty: "fills[0]", cssSelector: ".label", cssProperty: "color", variableId: "VariableID:1:2" },
  ], measuredLiterals: [] });
  write(root, "design-system/components/SecondExampleComponent/metadata.json", { parts: {
    root: { selector: ".root" },
  }, bindings: [
    { part: "root", variant: secondVariant, node: "EXAMPLE_FILE:2:1", figmaProperty: "fills[0]", cssSelector: ".root", cssProperty: "background-color", variableId: "VariableID:1:1" },
    { part: "root", variant: "State=Hover", node: "EXAMPLE_FILE:2:2", figmaProperty: "fills[0]", cssSelector: ".root:hover", cssProperty: "background-color", variableId: "VariableID:1:1" },
  ], measuredLiterals: [] });
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root { background-color: var(--example-surface); }\n.label { color: var(--example-text); }");
  write(root, "src/components/SecondExampleComponent/SecondExampleComponent.module.css", ".root { background-color: var(--example-text); }\n.root:hover { background-color: var(--example-surface); }");
  return root;
};

test.after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

test("exact direct bindings pass, wrong token fails, hover stays not evaluated", () => {
  const results = report(fixture());
  assert.deepEqual(results.map(({ component, status }) => `${component}:${status}`),
    ["ExampleComponent:PASS", "ExampleComponent:PASS", "SecondExampleComponent:FAIL", "SecondExampleComponent:NOT_RUN"]);
  assert.equal(results[2].expected, "var(--example-surface)");
});

test("measured literals are exact and unrecorded literals are findings", () => {
  const root = fixture();
  write(root, "design-system/components/ExampleComponent/metadata.json", { parts: {
    content: { selector: ".content" },
  }, bindings: [], measuredLiterals: [
    { part: "content", variant: "Content=Media, Size=Large", source: "EXAMPLE_FILE:1:3",
      figmaProperty: "width", cssSelector: ".content", cssProperty: "width", value: "40px" },
  ] });
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".content { width: 42px; border-radius: 4px; }");
  const results = report(root, "ExampleComponent");
  assert.equal(results[0].status, "FAIL");
  assert.equal(results[0].expected, "40px");
  assert.ok(results.some((item) => item.type === "unrecorded-literal" && item.property === "border-radius"));
});

test("class combinations are checked, but a possible cascade override stays not evaluated", () => {
  const root = fixture();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
  metadata.bindings[0].cssSelector = ".root.size-small";
  metadata.bindings[1].cssSelector = ".label.size-small";
  write(root, relative, metadata);
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root.size-small { background-color: var(--example-surface); }\n.label.size-small { color: var(--example-text); }\n.label.size-small.selected { color: var(--example-surface); }");
  assert.deepEqual(report(root, "ExampleComponent").map((item) => item.status), ["PASS", "NOT_RUN", "NOT_RUN"]);
});

test("same-file declarations that may affect a binding prevent a false PASS", () => {
  for (const selector of [".theme .root", ".card > .root", ".primary.root", ".root:hover"]) {
    const root = fixture();
    write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
      `.root { background-color: var(--example-surface); }\n.label { color: var(--example-text); }\n${selector} { background-color: var(--example-text); }`);
    const results = report(root, "ExampleComponent");
    assert.equal(results[0].status, "NOT_RUN", selector);
    assert.match(results[0].reason, /cascade override/);
  }
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
    ".root { background-color: var(--example-surface); }\n.rootish { background-color: var(--example-text); }\n.label { color: var(--example-text); }");
  assert.equal(report(root, "ExampleComponent")[0].status, "NOT_RUN");
});

test("other selectors in the component stylesheet cannot prove cascade isolation", () => {
  for (const selector of ['.wrapper[data-name=".root"]', ".wrapper:not(.root)", "*", "div"]) {
    const root = fixture();
    write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
      `.root { background-color: var(--example-surface); } .label { color: var(--example-text); } ${selector} { background-color: red; }`);
    assert.equal(report(root, "ExampleComponent")[0].status, "NOT_RUN", selector);
  }
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
    ".root { background-color: var(--example-surface); } .label { color: var(--example-text); } :is(.root, .other) { background-color: red; }");
  assert.equal(report(root, "ExampleComponent")[0].status, "NOT_RUN");
});

test("local token shadowing and global important rules cannot yield a binding PASS", () => {
  for (const css of [
    ".root { --example-surface: red; background-color: var(--example-surface); }",
    ".root { background-color: var(--example-surface); } .theme { --example-surface: red; }",
    ".root { background-color: var(--example-surface); } * { background-color: red !important; }",
  ]) {
    const root = fixture();
    write(root, "src/components/ExampleComponent/ExampleComponent.module.css", `${css} .label { color: var(--example-text); }`);
    const binding = report(root, "ExampleComponent")[0];
    assert.equal(binding.status, "NOT_RUN", css);
    assert.equal(binding.writtenStatus, "PASS", css);
  }
});

test("the recorded part class, not the first selector class, identifies overrides", () => {
  const root = fixture();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
  metadata.bindings[0].cssSelector = ".primary.root";
  write(root, relative, metadata);
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
    ".primary.root { background-color: var(--example-surface); }\n" +
    ".root.selected { background-color: var(--example-text); }\n" +
    ".label { color: var(--example-text); }");
  const result = report(root, "ExampleComponent")[0];
  assert.equal(result.status, "NOT_RUN");
  assert.match(result.reason, /cascade override/);
});

test("a selector without its recorded part class is not evaluated", () => {
  const root = fixture();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
  metadata.bindings[0].cssSelector = ".primary";
  write(root, relative, metadata);
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
    ".primary { background-color: var(--example-surface); }\n.label { color: var(--example-text); }");
  assert.equal(report(root, "ExampleComponent")[0].status, "NOT_RUN");
});

test("a wrong direct binding remains FAIL despite a possible override", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
    ".root { background-color: var(--example-text); }\n.theme .root { background-color: var(--example-surface); }\n.label { color: var(--example-text); }");
  assert.equal(report(root, "ExampleComponent")[0].status, "FAIL");
});

test("related shorthands never leave a misleading direct binding PASS", () => {
  for (const css of [
    ".root { background-color: var(--example-surface); background: red; }",
    ".root { background: red; background-color: var(--example-surface); }",
    ".root { background-color: var(--example-surface); } .theme .root { background: red; }",
    ".root { background-color: var(--example-surface); } @media (min-width: 30rem) { .root { background: red; } }",
  ]) {
    const root = fixture();
    write(root, "src/components/ExampleComponent/ExampleComponent.module.css", `${css}\n.label { color: var(--example-text); }`);
    const binding = report(root, "ExampleComponent")[0];
    assert.equal(binding.status, "NOT_RUN", css);
    assert.match(binding.reason, /cascade override|conditional CSS rule/);
  }
});

test("nested CSS inside a direct rule is not evaluated, while comments are harmless", () => {
  for (const nested of [
    "@media (min-width: 30rem) { background-color: red; }",
    "@supports (display: grid) { background-color: red; }",
    "&.large { background-color: red; }",
  ]) {
    const root = fixture();
    write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
      `.root { background-color: var(--example-surface); ${nested} } .label { color: var(--example-text); }`);
    const result = report(root, "ExampleComponent")[0];
    assert.equal(result.status, "NOT_RUN", nested);
    assert.match(result.reason, /nested CSS/);
  }
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
    ".root { /* measured binding */ background-color: var(--example-surface); } .label { color: var(--example-text); }");
  assert.equal(report(root, "ExampleComponent")[0].status, "PASS");
});

test("physical and logical radius corners may override one another", () => {
  for (const [property, otherProperty] of [
    ["border-top-left-radius", "border-start-start-radius"],
    ["border-start-start-radius", "border-top-left-radius"],
  ]) {
    const root = fixture();
    const relative = "design-system/components/ExampleComponent/metadata.json";
    const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
    metadata.bindings = [{ ...metadata.bindings[0], cssProperty: property }];
    write(root, relative, metadata);
    write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
      `.root { ${property}: var(--example-surface); } .root.selected { ${otherProperty}: 2px; }`);
    assert.equal(report(root, "ExampleComponent")[0].status, "NOT_RUN", `${property} / ${otherProperty}`);
  }
});

test("border, font and spacing shorthands flag their related longhands", () => {
  for (const [property, shorthand, value] of [
    ["border-top-color", "border", "1px solid red"],
    ["border-top-color", "border-top", "1px solid red"],
    ["border-top-color", "border-color", "red"],
    ["border-inline-start-color", "border-color", "red"],
    ["border-block-end-width", "border-width", "2px"],
    ["border-inline-start-color", "border-inline", "1px solid red"],
    ["border-top-left-radius", "border-radius", "2px"],
    ["padding-left", "padding", "2px"],
    ["padding-left", "padding-inline", "2px"],
    ["row-gap", "gap", "2px"],
    ["font-family", "font", "16px Arial"],
    ["line-height", "font", "16px Arial"],
  ]) {
    const root = fixture();
    const relative = "design-system/components/ExampleComponent/metadata.json";
    const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
    metadata.bindings = [{ ...metadata.bindings[0], cssProperty: property }];
    write(root, relative, metadata);
    write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
      `.root { ${property}: var(--example-surface); ${shorthand}: ${value}; }`);
    assert.equal(report(root, "ExampleComponent")[0].status, "NOT_RUN", `${property} / ${shorthand}`);
  }
});

test("longhands and logical properties can override recorded shorthands", () => {
  for (const [property, laterProperty] of [
    ["padding", "padding-top"],
    ["border-radius", "border-top-left-radius"],
    ["margin", "margin-block-end"],
    ["padding-inline", "padding-inline-start"],
    ["margin-block", "margin-block-end"],
    ["padding-inline", "padding-left"],
    ["padding-inline", "padding-top"],
    ["margin-block", "margin-left"],
    ["border-color", "border-inline-start-color"],
    ["border-width", "border-block-end-width"],
    ["border-top-color", "border-inline-start-color"],
    ["border-inline-color", "border-inline-start-color"],
    ["border-inline-start", "border-inline-start-color"],
  ]) {
    const root = fixture();
    const relative = "design-system/components/ExampleComponent/metadata.json";
    const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
    metadata.bindings = [{ ...metadata.bindings[0], cssProperty: property }];
    write(root, relative, metadata);
    write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
      `.root { ${property}: var(--example-surface); } .root.selected { ${laterProperty}: 2px; }`);
    const result = report(root, "ExampleComponent")[0];
    assert.equal(result.status, "NOT_RUN", `${property} / ${laterProperty}`);
  }
});

test("independent border channels and sides retain a direct PASS", () => {
  for (const [property, otherProperty] of [
    ["border-top-color", "border-bottom-color"],
    ["border-color", "border-inline-start-width"],
    ["border-inline-start-color", "border-inline-end-color"],
    ["border-inline-start-color", "border-block-start-color"],
  ]) {
    const root = fixture();
    const relative = "design-system/components/ExampleComponent/metadata.json";
    const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
    metadata.bindings = [{ ...metadata.bindings[0], cssProperty: property }];
    write(root, relative, metadata);
    write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
      `.root { ${property}: var(--example-surface); } .root.selected { ${otherProperty}: 2px; }`);
    assert.equal(report(root, "ExampleComponent")[0].status, "PASS", `${property} / ${otherProperty}`);
  }
});

test("forced modes and computed values are not falsely reported as passes", () => {
  const root = fixture();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
  metadata.bindings[0].modeOverride = { collectionId: "Color", modeName: "Dark" };
  write(root, relative, metadata);
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root { background-color: calc(1px + 2px); }\n.label { color: var(--example-text); }");
  const results = report(root, "ExampleComponent");
  assert.deepEqual(results.map((item) => item.status), ["NOT_RUN", "PASS"]);
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root { background-color: var(--example-surface); }\n.label { color: var(--example-text); }");
  const forced = report(root, "ExampleComponent")[0];
  assert.equal(forced.status, "NOT_RUN");
  assert.equal(forced.writtenStatus, "PASS");
  delete metadata.bindings[0].modeOverride;
  write(root, relative, metadata);
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root { background-color: calc(1px + 2px); }\n.label { color: var(--example-text); }");
  assert.equal(report(root, "ExampleComponent")[0].status, "NOT_RUN");
});

test("unrecorded RGB values are findings, not unsupported functions", () => {
  const root = fixture();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
  metadata.bindings = [];
  write(root, relative, metadata);
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root { background-color: rgb(1, 2, 3); }\n.label { color: var(--example-text); }");
  assert.ok(report(root, "ExampleComponent").some((item) => item.type === "unrecorded-literal" && item.status === "FAIL"));
});

test("no recorded observations is explicitly not evaluated", () => {
  const root = fixture();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  write(root, relative, { bindings: [], measuredLiterals: [] });
  const result = report(root, "ExampleComponent");
  assert.ok(result.some((item) => item.type === "coverage" && item.status === "NOT_RUN"));
});

test("direct external variable snapshots resolve to the declared CSS name", () => {
  const root = fixture();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
  metadata.bindings[0].variableId = "VariableID:external";
  metadata.externalVariables = [{ id: "VariableID:external", cssName: "--external-surface", type: "COLOR",
    value: "#222222", source: "EXAMPLE_FILE:1:1" }];
  write(root, relative, metadata);
  write(root, "src/styles/tokens.css", ":root { --example-surface: #222222; --example-text: #ffffff; --external-surface: #222222; }");
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root { background-color: var(--external-surface); }\n.label { color: var(--example-text); }");
  assert.deepEqual(report(root, "ExampleComponent").map((item) => item.status), ["PASS", "PASS"]);
});

test("external-only binding reports without a local token directory", () => {
  const root = fixture();
  rmSync(path.join(root, "design-system/tokens"), { recursive: true });
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = JSON.parse(readFileSync(path.join(root, relative), "utf8"));
  metadata.bindings = [metadata.bindings[0]];
  metadata.bindings[0].variableId = "VariableID:external";
  metadata.externalVariables = [{ id: "VariableID:external", cssName: "--external-surface", type: "COLOR",
    value: "#222222", source: "EXAMPLE_FILE:1:1" }];
  write(root, relative, metadata);
  write(root, "src/styles/tokens.css", ":root { --external-surface: #222222; }");
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css", ".root { background-color: var(--external-surface); }");
  assert.deepEqual(report(root, "ExampleComponent").map((item) => item.status), ["PASS"]);
});

test("uncovered vars, shorthands and conditional declarations are visible", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
    ".root { background-color: var(--example-surface); border: 1px solid #ccc; opacity: 0.5; }\n" +
    ".label { color: var(--example-text); font-weight: var(--example-weight); }\n" +
    ".extra { color: var(--example-text); background: #fff; }\n" +
    "@media (min-width: 30rem) { .root { box-shadow: 0 1px 2px #000; color: #fff; } }");
  const results = report(root, "ExampleComponent");
  assert.ok(results.some((item) => item.type === "uncovered-binding" && item.property === "color" && item.status === "NOT_RUN"));
  for (const property of ["border", "opacity", "font-weight", "background", "box-shadow"]) {
    assert.ok(results.some((item) => item.property === property && item.status === "NOT_RUN"), property);
  }
  assert.ok(results.some((item) => item.property === "color" && item.actual === "#fff" && item.status === "NOT_RUN"));
});

test("every unobserved CSS declaration is reported, including font family and unknown properties", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
    ".root { background-color: var(--example-surface); font-family: 'Inter'; border-top-width: 1px; " +
    "inset: 0; top: 2px; left: 3px; transform: translateX(1px); display: flex; --local-offset: 4px; }\n" +
    ".label { color: var(--example-text); }");
  const results = report(root, "ExampleComponent");
  assert.ok(results.some((item) => item.property === "font-family" && item.status === "FAIL"));
  for (const property of ["border-top-width", "inset", "top", "left", "transform", "display", "--local-offset"]) {
    assert.ok(results.some((item) => item.property === property && item.status === "NOT_RUN"), property);
  }
  assert.equal(results.filter((item) => item.status === "PASS").length, 2);
});

test("nested and at-rule declarations are reported once each", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.module.css",
    ".root { background-color: var(--example-surface); .child { top: 1px; } }\n" +
    ".label { color: var(--example-text); }\n" +
    "@property --offset { syntax: '<length>'; inherits: false; initial-value: 0px; }");
  const results = report(root, "ExampleComponent");
  for (const property of ["top", "syntax", "inherits", "initial-value"]) {
    assert.equal(results.filter((item) => item.property === property && item.status === "NOT_RUN").length, 1, property);
  }
});
