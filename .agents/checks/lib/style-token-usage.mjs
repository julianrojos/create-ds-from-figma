import ts from 'typescript';
import valueParser from 'postcss-value-parser';

export function tokenReferences(value, prefix) {
  const names = new Set();
  valueParser(value).walk(node => {
    if (node.type === 'function' && node.value.toLowerCase() === 'var') {
      const name = node.nodes.find(n => n.type === 'word')?.value;
      if (name?.startsWith(prefix)) names.add(name);
    }
  });
  return [...names];
}

// Only literal values reachable from JSX style attributes, including local const objects.
export function inlineTokenUsage(file, source, prefix) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const references = [], consumedReferences = [], aliases = [], definitions = [], uncovered = [], uncertainReferences = [], warnings = [], unknownLocations = new Map();
  // Bind names lexically without loading dependencies, libraries or evaluating source code.
  const checker = ts.createProgram([file], { noLib: true, noResolve: true, allowJs: true }, {
    getSourceFile: name => name === file ? tree : undefined,
    getDefaultLibFileName: () => '', writeFile: () => {}, getCurrentDirectory: () => '',
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    fileExists: name => name === file, readFile: name => name === file ? source : undefined,
  }).getTypeChecker();
  let scope;
  const locate = node => {
    const position = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    return { line: position.line + 1, column: position.character + 1 };
  };
  const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
  const unresolved = node => { const position = locate(node); unknownLocations.set(`${position.line}:${position.column}`, position); };
  const unwrap = node => {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
    return node;
  };
  const value = (node, property) => {
    node = unwrap(node);
    const numeric = ts.isNumericLiteral(node) || ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator) && ts.isNumericLiteral(node.operand);
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) || numeric) {
      if (property.startsWith('--') && (numeric || node.text !== '') && !scope.uncertain.has(property)) { definitions.push(property); scope.defined.add(property); }
      if (!numeric) for (const cssName of tokenReferences(node.text, prefix)) { const reference = { cssName, file, ...locate(node), property, kind: 'inline' }; references.push(reference); scope.references.push(reference); }
    } else if (![ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) {
      unresolved(node);
      if (property.startsWith('--')) scope.uncertain.add(property);
    }
  };
  const unknownObject = node => {
    unresolved(node);
    scope.unknownSpread = true;
    scope.afterUnknown.clear();
    // An unknown spread may replace any earlier property, but not later explicit assignments.
    for (const property of scope.values.keys()) scope.uncertain.add(property);
  };
  const object = (node, trail = new Set()) => {
    if (!node) return;
    node = unwrap(node);
    if (ts.isIdentifier(node)) {
      const declarations = checker.getSymbolAtLocation(node)?.declarations || [];
      const declaration = declarations.length === 1 ? declarations[0] : undefined;
      if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name) ||
          !(declaration.parent.flags & ts.NodeFlags.Const) || !ts.isVariableStatement(declaration.parent.parent) ||
          !declaration.initializer || trail.has(declaration)) return unknownObject(node);
      return object(declaration.initializer, new Set([...trail, declaration]));
    }
    if (!ts.isObjectLiteralExpression(node)) return unknownObject(node);
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) object(property.expression, trail);
      else if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        scope.values.set(property.name.text, property.initializer);
        scope.uncertain.delete(property.name.text);
        scope.afterUnknown.add(property.name.text);
      } else unknownObject(property);
    }
  };
  walk(tree, node => {
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'style' && node.initializer && ts.isJsxExpression(node.initializer)) {
      // A custom property is inherited only through the element tree, which is not modelled: a definition covers references in its own style object.
      scope = { defined: new Set(), references: [], values: new Map(), uncertain: new Set(), unknownSpread: false, afterUnknown: new Set() };
      object(node.initializer.expression);
      for (const [property, node] of scope.values) value(node, property);
      for (const reference of scope.references) {
        if (scope.defined.has(reference.cssName)) continue;
        if (scope.uncertain.has(reference.cssName) || scope.unknownSpread && !scope.afterUnknown.has(reference.cssName)) uncertainReferences.push(reference);
        else uncovered.push(reference);
      }
      // Declarations are graph edges, not consumption roots. Resolve within this style object first.
      const localAliases = new Map();
      for (const reference of scope.references) if (reference.property.startsWith('--')) {
        const targets = localAliases.get(reference.property) || [];
        targets.push(reference); localAliases.set(reference.property, targets);
      }
      const followLocal = (reference, trail = []) => {
        if (!scope.values.has(reference.cssName)) return [reference];
        if (trail.includes(reference.cssName)) { unresolved(scope.values.get(reference.cssName)); return []; }
        const targets = (localAliases.get(reference.cssName) || []).flatMap(target => followLocal({
          ...reference, cssName: target.cssName, aliasChain: [...(reference.aliasChain || []), reference.cssName],
        }, [...trail, reference.cssName]));
        // Only a proven local definition shadows the global token; a cleared or dynamic one may still resolve to it.
        return scope.defined.has(reference.cssName) ? targets : [reference, ...targets];
      };
      for (const reference of scope.references) if (!reference.property.startsWith('--')) consumedReferences.push(...followLocal(reference));
      for (const [name, targets] of localAliases) aliases.push({ name, file, targets: targets.flatMap(reference => followLocal(reference, [name])) });
    }
  });
  if (tree.parseDiagnostics.length) warnings.push(`${file}: token consumption analysis is partial because the source has syntax errors`);
  if (uncertainReferences.length) warnings.push(`${file}: inline definitions have dynamic values or may be supplied or overwritten by an unknown spread; neither presence nor absence is verified for ${[...new Set(uncertainReferences.map(reference => reference.cssName))].sort().join(', ')}`);
  const locations = [...unknownLocations.values()].sort((a, b) => a.line - b.line || a.column - b.column);
  if (locations.length) {
    const preview = locations.slice(0, 6).map(p => `${p.line}:${p.column}`).join(', ');
    warnings.push(`${file}: token consumption is unknown at ${locations.length} dynamic or ambiguous inline style location(s): ${preview}${locations.length > 6 ? '; remaining locations in consumption.unknownStyles' : ''}`);
  }
  return { references, consumedReferences, aliases, definitions, uncovered, uncertainReferences, warnings, unknownLocations: locations };
}
