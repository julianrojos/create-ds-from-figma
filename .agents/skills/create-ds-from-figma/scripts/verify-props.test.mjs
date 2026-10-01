import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { verifyProps } from "../../../checks/verify-props.mjs";

const template = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../plantillas");
const roots = new Set();
const write = (root, relative, value) => {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value, null, 2));
};
const read = (root, relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const fixture = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "verify-props-"));
  roots.add(root);
  const vocabulary = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../prop-vocabulary.json"), "utf8"));
  vocabulary.terms.size = { concept: "component-size", meaning: "ExampleComponent dimensions", origin: "authored", avoid: ["scale"] };
  write(root, ".agents/prop-vocabulary.json", vocabulary);
  write(root, "design-system/relationships/figma-code-map.json", {
    ExampleComponent: {
      name: "ExampleComponent",
      code: { path: "src/components/ExampleComponent/ExampleComponent.tsx" },
      designSystem: { metadata: "design-system/components/ExampleComponent/metadata.json" },
    },
  });
  write(root, "design-system/components/ExampleComponent/metadata.json", {
    variantClassification: { Size: { Small: { kind: "prop", codeProp: "size" } } },
  });
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps { size?: 'Small' }\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  return root;
};

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("local TSX props match vocabulary and classification", () => {
  assert.deepEqual(verifyProps(fixture(), ts), { errors: [] });
});

test("named and destructured component parameters accept their Props type", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps { size?: 'Small' }\nexport function ExampleComponent(props: ExampleComponentProps) { return null; }\n");
  assert.deepEqual(verifyProps(root, ts), { errors: [] });
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps { size?: 'Small' }\nexport const ExampleComponent = ({ size }: ExampleComponentProps) => null;\n");
  assert.deepEqual(verifyProps(root, ts), { errors: [] });
});

test("a reference to Props inside the body does not count as a component parameter", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps { size?: 'Small' }\nexport const ExampleComponent = () => { const unused = {} as ExampleComponentProps; return null; };\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("must accept ExampleComponentProps as its first parameter")));
});

test("structural compatibility with optional props does not replace the Props type", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps { size?: 'Small' }\nexport const ExampleComponent = (props: {}) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("must accept ExampleComponentProps as its first parameter")));
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps { size?: 'Small' }\ntype Component<P> = (props: P) => null;\nexport const ExampleComponent: Component<ExampleComponentProps> = () => null;\n");
  assert.deepEqual(verifyProps(root, ts), { errors: [] });
});

test("semantic type errors fail even when the TSX parses", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps extends MissingProps { size?: 'Small' }\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("Cannot find name 'MissingProps'")));
});

test("semantic validation respects the generated project's tsconfig aliases", () => {
  const root = fixture();
  write(root, "tsconfig.app.json", {
    compilerOptions: { target: "ES2020", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", baseUrl: ".", paths: { "@/*": ["src/*"] } },
    include: ["src"],
  });
  write(root, "src/types/size.ts", "export type Size = 'Small';\n");
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "import type { Size } from '@/types/size';\nexport interface ExampleComponentProps { size?: Size }\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.deepEqual(verifyProps(root, ts), { errors: [] });
});

test("unregistered and avoided props fail", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export type ExampleComponentProps = { size?: 'Small'; tone?: string; isDisabled?: boolean };\nexport function ExampleComponent(props: ExampleComponentProps) { return null; }\n");
  const { errors } = verifyProps(root, ts);
  assert.ok(errors.some((item) => item.includes("tone is not in prop-vocabulary.json")));
  assert.ok(errors.some((item) => item.includes("isDisabled is an avoided alias")));
});

test("classification must name a declared code prop", () => {
  const root = fixture();
  const relative = "design-system/components/ExampleComponent/metadata.json";
  const metadata = read(root, relative);
  metadata.variantClassification.Size.Small.codeProp = "scale";
  write(root, relative, metadata);
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("maps to scale, absent")));
});

test("a classified prop can be inherited from a resolved type", () => {
  const root = fixture();
  const vocabularyPath = ".agents/prop-vocabulary.json";
  const vocabulary = read(root, vocabularyPath);
  vocabulary.terms.size.origin = "platform";
  write(root, vocabularyPath, vocabulary);
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps extends Pick<HTMLInputElement, 'size'> {}\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.deepEqual(verifyProps(root, ts), { errors: [] });
});

test("an intersection with native props checks its authored members", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export type ExampleComponentProps = Omit<Pick<HTMLElement, 'id' | 'title'>, 'title'> & { size?: 'Small' };\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.deepEqual(verifyProps(root, ts), { errors: [] });
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export type ExampleComponentProps = Pick<HTMLElement, 'id'> & { size?: 'Small'; scale?: string };\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("scale is an avoided alias")));
});

test("locally inherited props require vocabulary entries", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "interface LocalProps { secret?: string }\nexport interface ExampleComponentProps extends LocalProps { size?: 'Small' }\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("secret is not in prop-vocabulary.json")));
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "type LocalProps = { secret?: string }\nexport type ExampleComponentProps = Omit<LocalProps, 'unused'> & { size?: 'Small' };\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("secret is not in prop-vocabulary.json")));
});

test("a local declaration wins over an inherited platform declaration", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "type LocalProps = { id?: string }\nexport type ExampleComponentProps = Pick<HTMLElement, 'id'> & LocalProps & { size?: 'Small' };\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("id is not in prop-vocabulary.json")));
});

test("index signatures cannot bypass the prop vocabulary", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export interface ExampleComponentProps { [key: string]: unknown; size?: 'Small' }\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("cannot have an index signature")));
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "interface OpenProps { [key: string]: unknown }\nexport interface ExampleComponentProps extends OpenProps { size?: 'Small' }\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("cannot have an index signature")));
});

test("unions cannot hide props that occur in only one branch", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export type ExampleComponentProps = { size?: 'Small' } | { size?: 'Small'; secret?: string };\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("cannot be a union")));
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "type LocalUnion = { secret?: string } | { tone?: string };\nexport type ExampleComponentProps = LocalUnion & { size?: 'Small' };\nexport const ExampleComponent = (props: ExampleComponentProps) => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("cannot be a union")));
});

test("an unused or uninspectable Props type fails", () => {
  const root = fixture();
  write(root, "src/components/ExampleComponent/ExampleComponent.tsx", "export type ExampleComponentProps = Record<string, unknown>;\nexport const ExampleComponent = () => null;\n");
  assert.ok(verifyProps(root, ts).errors.some((item) => item.includes("cannot have an index signature")));
});

test("missing TypeScript is explicit for a populated DS", () => {
  assert.ok(verifyProps(fixture()).errors.some((item) => item.includes("TypeScript is required")));
});
