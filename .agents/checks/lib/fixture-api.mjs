import ts from 'typescript';

// Static, single-file API inspection for synthetic evaluations. No module or
// project code is loaded. Unresolved, generic or dynamic shapes stay unknown.
export function fixtureApiProps(source, component) {
  const ast = ts.createSourceFile('dependency.tsx', source, ts.ScriptTarget.Latest, true);
  if (ast.parseDiagnostics.length) return null;
  const types = new Map(), values = new Map(), react = new Map(), namespaces = new Set(), exports = new Map();
  const unresolvedExports = new Set(), directExports = new Set();
  let hasStarExport = false;
  const add = (map, name, value) => map.set(name, map.has(name) ? null : value);
  for (const node of ast.statements) {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) add(types,node.name.text,node);
    if (ts.isFunctionDeclaration(node) && node.name) add(values,node.name.text,node);
    if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) add(values,declaration.name.text,declaration);
    if (node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(node) && node.name) directExports.add(node.name.text);
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) directExports.add(declaration.name.text);
    }
    if (ts.isExportDeclaration(node)) {
      if (!node.exportClause) hasStarExport = true;
      else if (ts.isNamespaceExport(node.exportClause)) unresolvedExports.add(node.exportClause.name.text);
      else if (ts.isNamedExports(node.exportClause)) for (const item of node.exportClause.elements) {
        if (node.moduleSpecifier || node.isTypeOnly || item.isTypeOnly) unresolvedExports.add(item.name.text);
        else exports.set(item.name.text,(item.propertyName || item.name).text);
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'react') {
      if (node.importClause?.name) namespaces.add(node.importClause.name.text);
      const bindings=node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) react.set(item.name.text,(item.propertyName || item.name).text);
    }
  }
  const reactName = node => ts.isIdentifier(node) ? react.get(node.text) : (ts.isPropertyAccessExpression(node) || ts.isQualifiedName(node)) && ts.isIdentifier(node.left || node.expression) && namespaces.has((node.left || node.expression).text) ? (node.right || node.name).text : null;
  const memberProps = members => {
    if (members.some(n=>!ts.isPropertySignature(n) || !n.name || (!ts.isIdentifier(n.name) && !ts.isStringLiteral(n.name)))) return null;
    return members.map(n=>n.name.text);
  };
  const combine = lists => lists.some(v=>v === null) ? null : [...new Set(lists.flat())];
  const typeProps = (node, seen=new Set()) => {
    if (!node) return null;
    if (ts.isParenthesizedTypeNode(node)) return typeProps(node.type,seen);
    if (ts.isTypeLiteralNode(node)) return memberProps(node.members);
    if (ts.isIntersectionTypeNode(node)) return combine(node.types.map(n=>typeProps(n,new Set(seen))));
    if (!ts.isTypeReferenceNode(node) || !ts.isIdentifier(node.typeName) || node.typeArguments?.length || seen.has(node.typeName.text)) return null;
    const declaration=types.get(node.typeName.text);
    if (!declaration || declaration.typeParameters?.length) return null;
    seen.add(node.typeName.text);
    if (ts.isTypeAliasDeclaration(declaration)) return typeProps(declaration.type,seen);
    const bases=(declaration.heritageClauses || []).flatMap(h=>h.types).map(base=>{
      if (!ts.isIdentifier(base.expression) || base.typeArguments?.length) return null;
      return typeProps(ts.factory.createTypeReferenceNode(base.expression.text,undefined),new Set(seen));
    });
    return combine([memberProps(declaration.members),...bases]);
  };
  const valueProps = (node, seen=new Set()) => {
    if (!node) return null;
    if (ts.isIdentifier(node)) {
      const name=node.text;
      if (seen.has(name)) return null;
      seen.add(name); return valueProps(values.get(name),seen);
    }
    if (ts.isParenthesizedExpression(node)) return valueProps(node.expression,seen);
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      if (node.typeParameters?.length || node.parameters[0]?.dotDotDotToken) return null;
      return node.parameters.length ? typeProps(node.parameters[0].type) : [];
    }
    if (ts.isVariableDeclaration(node)) {
      if (node.type) {
        const type=node.type;
        if (ts.isTypeReferenceNode(type) && ['FC','FunctionComponent'].includes(reactName(type.typeName)) && type.typeArguments?.length === 1) return typeProps(type.typeArguments[0]);
        return null;
      }
      return valueProps(node.initializer,seen);
    }
    if (ts.isCallExpression(node)) {
      const wrapper=reactName(node.expression);
      if (wrapper === 'memo' && !node.typeArguments?.length && node.arguments.length >= 1 && node.arguments.length <= 2) return valueProps(node.arguments[0],seen);
      if (wrapper === 'forwardRef' && node.arguments.length === 1) {
        if (node.typeArguments?.length === 2) return typeProps(node.typeArguments[1]);
        if (!node.typeArguments?.length) return valueProps(node.arguments[0],seen);
      }
    }
    return null;
  };
  // Export aliases identify the public entry only; identifiers inside its
  // initializer still refer to local bindings, not to other exported names.
  if (unresolvedExports.has(component) || (hasStarExport && !exports.has(component) && !directExports.has(component))) return null;
  return valueProps(ts.factory.createIdentifier(exports.get(component) || component));
}
