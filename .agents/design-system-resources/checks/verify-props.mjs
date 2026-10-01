import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;

export function verifyProps(root, typescript) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const readJson = (relative) => {
    try {
      return JSON.parse(readFileSync(path.join(root, relative), "utf8"));
    } catch (error) {
      fail(`${relative}: ${error.message}`);
      return null;
    }
  };
  const map = readJson("design-system/relationships/figma-code-map.json");
  const vocabulary = readJson(".agents/design-system-resources/prop-vocabulary.json");
  if (!isObject(map) || !isObject(vocabulary)) return { errors };
  if (!isObject(vocabulary.terms)) {
    fail("prop-vocabulary.json: terms must be an object");
    return { errors };
  }

  const concepts = new Map();
  const avoided = new Map();
  for (const [term, definition] of Object.entries(vocabulary.terms)) {
    if (!isText(term) || !isObject(definition) || !isText(definition.concept) || !isText(definition.meaning) ||
        !["authored", "platform", "library"].includes(definition.origin) || !Array.isArray(definition.avoid) ||
        !definition.avoid.every(isText)) {
      fail(`vocabulary ${term}: concept, meaning, origin and avoid are required`);
      continue;
    }
    if (concepts.has(definition.concept)) fail(`vocabulary: ${term} and ${concepts.get(definition.concept)} share concept ${definition.concept}`);
    concepts.set(definition.concept, term);
    for (const alias of definition.avoid) {
      if (alias === term || avoided.has(alias)) fail(`vocabulary: duplicate or self-avoided alias ${alias}`);
      avoided.set(alias, term);
    }
  }
  for (const [alias, term] of avoided) {
    if (alias in vocabulary.terms) fail(`vocabulary: ${alias} is both a term and an avoided alias of ${term}`);
  }

  const entries = Object.entries(map).filter(([key]) => !key.startsWith("_"));
  if (entries.length && !typescript) {
    fail("TypeScript is required to inspect TSX props; install project dependencies before running this check");
    return { errors };
  }
  const ts = typescript;
  for (const [key, entry] of entries) {
    const name = entry?.name;
    const sourcePath = entry?.code?.path;
    if (!isText(name) || !isText(sourcePath) || path.isAbsolute(sourcePath) || sourcePath.split(/[\\/]/).includes("..")) {
      fail(`map ${key}: invalid component name or code path`);
      continue;
    }
    const fullPath = path.join(root, sourcePath);
    if (!existsSync(fullPath)) {
      fail(`${name}: missing ${sourcePath}`);
      continue;
    }
    let options = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      skipLibCheck: true,
    };
    let programFiles = [fullPath];
    const configPath = ["tsconfig.app.json", "tsconfig.json"]
      .map((file) => path.join(root, file)).find(existsSync);
    if (configPath) {
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      if (config.error) {
        fail(`${name}: ${ts.flattenDiagnosticMessageText(config.error.messageText, " ")}`);
        continue;
      }
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), undefined, configPath);
      if (parsed.errors.length) {
        for (const diagnostic of parsed.errors) fail(`${name}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
        continue;
      }
      options = parsed.options;
      programFiles = [...new Set([...parsed.fileNames, fullPath])];
    }
    const program = ts.createProgram(programFiles, options);
    const source = program.getSourceFile(fullPath);
    if (!source) {
      fail(`${name}: TypeScript could not load ${sourcePath}`);
      continue;
    }
    if (source.parseDiagnostics.length) {
      fail(`${name}: TSX has syntax errors`);
      continue;
    }
    const semanticErrors = program.getSemanticDiagnostics(source);
    if (semanticErrors.length) {
      for (const diagnostic of semanticErrors) {
        fail(`${name}: TSX type error: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
      }
      continue;
    }
    const propsName = `${name}Props`;
    const declarations = source.statements.filter((statement) =>
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name.text === propsName);
    if (declarations.length !== 1) {
      fail(`${name}: expected one local ${propsName} interface or type alias`);
      continue;
    }
    const declaration = declarations[0];
    const checker = program.getTypeChecker();
    const propsType = checker.getTypeAtLocation(declaration);
    const hasUnion = (type) => (type.flags & ts.TypeFlags.Union) !== 0 ||
      ((type.flags & ts.TypeFlags.Intersection) !== 0 && type.types.some(hasUnion));
    if (hasUnion(propsType)) {
      fail(`${name}: ${propsName} cannot be a union because branch-only props cannot be checked`);
      continue;
    }
    if (checker.getIndexInfosOfType(propsType).length > 0) {
      fail(`${name}: ${propsName} cannot have an index signature because arbitrary props cannot be checked`);
      continue;
    }
    const properties = checker.getPropertiesOfType(propsType);
    if (ts.isTypeAliasDeclaration(declaration) && properties.length === 0) {
      fail(`${name}: ${propsName} must expose named props to verify declared props`);
      continue;
    }
    const exposedProps = new Set(properties.map((property) => property.name));
    for (const property of properties) {
      const declarations = property.getDeclarations() || (property.valueDeclaration ? [property.valueDeclaration] : []);
      if (declarations.length === 0) {
        fail(`${name}: cannot determine origin of prop ${property.name}; make its inherited type declaration available to TypeScript or declare the prop explicitly in ${propsName}, then rerun verify-props`);
        continue;
      }
      if (!declarations.some((item) => !item.getSourceFile().fileName.split(/[\\/]/).includes("node_modules"))) continue;
      const prop = property.name;
      if (avoided.has(prop)) fail(`${name}: ${prop} is an avoided alias; use ${avoided.get(prop)}`);
      else if (!(prop in vocabulary.terms)) fail(`${name}: ${prop} is not in prop-vocabulary.json`);
    }
    const components = source.statements.flatMap((statement) => {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return [statement];
      if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.filter((item) => ts.isIdentifier(item.name) && item.name.text === name);
      }
      return [];
    });
    const referencesProps = (type, seen = new Set()) => {
      if (seen.has(type)) return false;
      seen.add(type);
      if (type === propsType || (propsType.symbol && type.symbol === propsType.symbol)) return true;
      const parts = [...(type.types || []), ...(type.aliasTypeArguments || [])];
      if (type.objectFlags & ts.ObjectFlags.Reference) parts.push(...checker.getTypeArguments(type));
      return parts.some((part) => referencesProps(part, seen));
    };
    const acceptsProps = components.some((component) =>
      checker.getSignaturesOfType(checker.getTypeAtLocation(component), ts.SignatureKind.Call)
        .some((signature) => {
          const parameter = signature.getParameters()[0];
          if (!parameter) return false;
          const parameterType = checker.getTypeOfSymbolAtLocation(parameter, component);
          return !(parameterType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
            referencesProps(parameterType) &&
            checker.isTypeAssignableTo(propsType, parameterType) && checker.isTypeAssignableTo(parameterType, propsType);
        }));
    if (!acceptsProps) fail(`${name}: component must accept ${propsName} as its first parameter`);
    const metadata = readJson(entry.designSystem?.metadata || "");
    if (!isObject(metadata?.variantClassification)) continue;
    for (const [axis, values] of Object.entries(metadata.variantClassification)) {
      if (!isObject(values)) continue;
      for (const [value, classification] of Object.entries(values)) {
        if (classification?.kind === "prop" && !exposedProps.has(classification.codeProp)) {
          fail(`${name}: ${axis}=${value} maps to ${classification.codeProp}, absent from ${propsName}`);
        } else if (classification?.kind === "prop" && !(classification.codeProp in vocabulary.terms)) {
          fail(`${name}: ${axis}=${value} maps to ${classification.codeProp}, absent from prop-vocabulary.json`);
        }
      }
    }
  }
  return { errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || ".");
  let ts;
  try {
    ts = createRequire(path.join(root, "package.json"))("typescript");
  } catch {
    ts = null;
  }
  const { errors } = verifyProps(root, ts);
  for (const error of errors) console.error(`FAIL ${error}`);
  console.log(`${errors.length ? "FAIL" : "PASS"}: ${errors.length} error(s)`);
  if (errors.length) process.exitCode = 1;
}
