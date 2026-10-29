import { parse } from 'parse5';
import ts from 'typescript';

// Use HTML parsing rules: data-* attributes, inert templates, comments and raw
// script text must never manufacture an executable entry point.
export function moduleEntries(html) {
  const document = parse(html);
  const scripts = [];
  let hasBase = false;
  const walk = node => {
    if (node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const attrs = new Map((node.attrs || []).map(a => [a.name, a.value]));
      if (node.tagName === 'base' && attrs.has('href')) hasBase = true;
      if (node.tagName === 'script' && attrs.get('type')?.trim() === 'module' && attrs.has('src')) scripts.push(attrs.get('src').trim());
      if (node.tagName === 'template') return;
    }
    for (const child of node.childNodes || []) walk(child);
  };
  walk(document);
  // A base URL requires separate URL resolution. Do not infer a local path.
  if (hasBase) return [];
  return scripts.flatMap(src => {
    if (/[?#%\\]/.test(src) || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) return [];
    let url;
    try { url = new URL(src, 'https://project.invalid/index.html'); } catch { return []; }
    // Resolve dot segments as URLs do. Remaining empty segments or encoded
    // characters cannot be mapped unambiguously to a project filesystem path.
    if (url.origin !== 'https://project.invalid' || !url.pathname.startsWith('/src/') || /[%\\]|\/\//.test(url.pathname) || url.search || url.hash) return [];
    return [url.pathname.slice(1)];
  });
}

// Inspect TS's emitted imports, not just syntactic import declarations. In
// particular, per-specifier type imports may disappear or retain an empty
// side-effect import, depending on verbatimModuleSyntax. Credit only imports
// retained in both modes; project/bundler configuration is not executed or
// inferred. Configuration-dependent imports remain unproved. No code runs.
export function emittedImports(source, file) {
  const alternatives = [false,true].map(verbatimModuleSyntax => {
    const emitted = ts.transpileModule(source, { fileName: file, reportDiagnostics: true,
      compilerOptions: { verbatimModuleSyntax, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.Preserve, allowJs: true } });
    if (emitted.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) return [];
    const ast = ts.createSourceFile(file + '.js', emitted.outputText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (ast.parseDiagnostics.length) return [];
    return ast.statements.filter(ts.isImportDeclaration).filter(n => ts.isStringLiteral(n.moduleSpecifier)).map(n => n.moduleSpecifier.text);
  });
  return [...new Set(alternatives[0])].filter(specifier => alternatives[1].includes(specifier));
}
