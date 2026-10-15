import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const prose = node => ts.isIdentifier(node) && ['reason', 'scope'].includes(node.text);

function normalized(node, ast) {
  const result = ts.transform(node, [context => {
    const placeholder = () => ts.factory.createStringLiteral('PROSE');
    const visit = n => {
      if (ts.isPropertyAssignment(n) && prose(n.name)) return ts.factory.updatePropertyAssignment(n, n.name, placeholder());
      if (ts.isVariableDeclaration(n) && prose(n.name) && n.initializer) return ts.factory.updateVariableDeclaration(n, n.name, n.exclamationToken, n.type, placeholder());
      if (ts.isBinaryExpression(n) && prose(n.left) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) return ts.factory.updateBinaryExpression(n, n.left, n.operatorToken, placeholder());
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'add' && n.arguments.length >= 3) return ts.factory.updateCallExpression(n, n.expression, n.typeArguments, n.arguments.map((arg, i) => i === 2 ? placeholder() : ts.visitNode(arg, visit)));
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Error') return ts.factory.updateNewExpression(n, n.expression, n.typeArguments, [placeholder()]);
      return ts.visitEachChild(n, visit, context);
    };
    return n => ts.visitNode(n, visit);
  }]);
  try { return ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, result.transformed[0], ast); }
  finally { result.dispose(); }
}

// Conservative named-declaration closure. Unsupported local module forms fail closed.
export function ruleFingerprint(entries, { readSource = file => readFileSync(file, 'utf8') } = {}) {
  const modules = new Map(), selected = new Map();
  const load = file => {
    if (modules.has(file)) return modules.get(file);
    const ast = ts.createSourceFile(file, readSource(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (ast.parseDiagnostics.length) throw new Error(`Invalid rule module: ${file}`);
    const declarations = new Map(), imports = new Map();
    for (const node of ast.statements) {
      if (ts.isClassDeclaration(node)) throw new Error(`Class rule bindings need an explicit boundary: ${file}`);
      if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node);
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) throw new Error(`Unsupported rule binding in ${file}`);
        declarations.set(declaration.name.text, declaration);
      }
      if (ts.isImportDeclaration(node)) {
        const specifier = node.moduleSpecifier.text, clause = node.importClause;
        if (!clause && specifier.startsWith('.')) throw new Error(`Side-effect rule import needs an explicit boundary: ${file}`);
        if (clause?.name) imports.set(clause.name.text, { specifier, name: 'default' });
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const binding of clause.namedBindings.elements) imports.set(binding.name.text, { specifier, name: (binding.propertyName || binding.name).text });
        else if (clause?.namedBindings) imports.set(clause.namedBindings.name.text, { specifier, name: '*' });
      }
    }
    const value = { ast, declarations, imports }; modules.set(file, value); return value;
  };
  const visit = (file, name) => {
    const key = `${path.relative(root, file).split(path.sep).join('/')}#${name}`;
    if (selected.has(key)) return;
    const { ast, declarations, imports } = load(file), node = declarations.get(name), imported = imports.get(name);
    if (imported) {
      selected.set(key, JSON.stringify(imported));
      if (imported.specifier.startsWith('.')) visit(fileURLToPath(new URL(imported.specifier, pathToFileURL(file))), imported.name);
      return;
    }
    if (!node) throw new Error(`Rule declaration ${name} is missing or uses an unsupported export in ${file}`);
    selected.set(key, normalized(node, ast));
    const walk = n => {
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) throw new Error(`Dynamic rule import needs an explicit boundary: ${file}`);
      if (ts.isIdentifier(n) && (declarations.has(n.text) || imports.has(n.text))) visit(file, n.text);
      ts.forEachChild(n, walk);
    };
    walk(node);
  };
  for (const { file, names } of entries) for (const name of names) visit(fileURLToPath(file), name);
  const records = [...selected].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return { hash: createHash('sha256').update(JSON.stringify(records)).digest('hex'), declarations: records.map(([key]) => key) };
}
