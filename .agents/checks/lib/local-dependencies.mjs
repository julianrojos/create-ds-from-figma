import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { projectFile } from './render-plan.mjs';
import { cssImportProblem, resolveCssPackage } from './css-import-resolution.mjs';

const systemFile = file => ['.DS_Store', 'Thumbs.db', 'desktop.ini'].includes(path.basename(file)) || path.basename(file).startsWith('._');

export function createDependencySession(root) {
  const base = realpathSync(root), results = new Map(), stats = { analyses: 0, cacheHits: 0 };
  return { stats, resolve(seeds, options = {}) {
    const normalized = [...new Set(seeds.filter(Boolean))].sort();
    const key = JSON.stringify([Boolean(options.runtimeOnly), Boolean(options.stylesheetDiscovery), normalized]);
    if (!results.has(key)) { results.set(key, localDependencies(base, normalized, options)); stats.analyses++; }
    else stats.cacheHits++;
    return structuredClone(results.get(key));
  } };
}

export function localDependencies(root, seeds, { runtimeOnly = false, stylesheetDiscovery = false } = {}) {
  const base = realpathSync(root), files = new Set(), visited = new Set(), warnings = new Set();
  const stylesheets = new Set();
  let options = { moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true, resolveJsonModule: true };
  const config = path.join(base, 'tsconfig.json');
  const configFile = file => {
    const absolute = path.resolve(file);
    if (!absolute.startsWith(base + path.sep)) { warnings.add('tsconfig inheritance outside the project is NOT VERIFIED'); return null; }
    if (!existsSync(absolute)) return null;
    if (!statSync(absolute).isFile()) return null;
    const real = realpathSync(absolute);
    if (!real.startsWith(base + path.sep)) { warnings.add('tsconfig symlink outside the project is NOT VERIFIED'); return null; }
    return absolute;
  };
  const configRead = file => {
    const allowed = configFile(file);
    if (!allowed) return undefined;
    files.add(path.relative(base, allowed).split(path.sep).join('/'));
    return readFileSync(allowed, 'utf8');
  };
  if (existsSync(config) && configFile(config)) {
    const read = ts.readConfigFile(config, configRead);
    if (read.error) throw new Error('Cannot read dependency tsconfig');
    const host = { useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames, readDirectory: () => [],
      readFile: configRead, fileExists: file => Boolean(configFile(file)) };
    const parsed = ts.parseJsonConfigFileContent(read.config, host, base);
    for (const diagnostic of parsed.errors.filter(d => ![18002, 18003].includes(d.code))) warnings.add(`tsconfig NOT VERIFIED: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    options = { ...options, ...parsed.options };
  }
  const visit = relative => {
    if (systemFile(relative)) return;
    const file = projectFile(base, relative);
    if (runtimeOnly && /\.d\.[cm]?ts$/.test(file)) return;
    files.add(relative);
    if (visited.has(file)) return;
    visited.add(file);
    // Font diagnostics handle CSS conditions themselves; generic dependency reachability is not proof of CSS loading.
    if (stylesheetDiscovery && /\.css$/.test(file)) { stylesheets.add(relative); return; }
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
    const exact = candidate => existsSync(candidate) && statSync(candidate).isFile() ? candidate : undefined;
    const probe = candidate => exact(candidate) || exts.map(ext => exact(candidate + ext)).find(Boolean)
      || ['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map(name => exact(path.join(candidate, name))).find(Boolean);
    // kind: 'module' (import/export), 'dynamic' (import()/require), 'document' (a URL string in markup),
    // 'file-url' (css url() and new URL(..., import.meta.url): relative to the containing file) or 'css-import' (@import).
    // The kinds resolve differently: a module is resolved by the bundler, a URL by the browser, a bare CSS import file-relative first.
    const local = (specifier, kind = 'module') => {
      if (/^(?:data:|https?:|node:|\/\/)/i.test(specifier)) {
        if (stylesheetDiscovery && !specifier.startsWith('node:') && ['module', 'css-import', 'dynamic'].includes(kind)) {
          const description = kind === 'dynamic' ? 'dynamic import/require' : 'import';
          warnings.add(`${relative}: external ${description} ${specifier} needs independent CSS review (NOT VERIFIED)`);
        }
        return;
      }
      if (kind === 'dynamic' && runtimeOnly) {
        // A call inside code that may never run is a dependency, not proof that its styles load.
        warnings.add(`${relative}: dynamic import/require ${specifier} is not credited as loaded; list its CSS in verification.stylesheets (NOT VERIFIED)`);
        return;
      }
      if (stylesheetDiscovery && !['module', 'css-import'].includes(kind)) return;
      if (stylesheetDiscovery && cssImportProblem(specifier)) {
        warnings.add(`${relative}: ${specifier}: ${cssImportProblem(specifier)}`);
        return;
      }
      // `#name` is a package.json "imports" alias for modules, and only a fragment reference for URLs.
      const alias = (kind === 'module' || kind === 'dynamic') && specifier.startsWith('#');
      const clean = alias ? specifier.split('?')[0] : specifier.split(/[?#]/)[0];
      if (!clean || systemFile(clean)) return;
      let target;
      if (kind === 'document') {
        // Resolve as the browser does: against the page URL, so `./x`, `x`, `/x` and `../x` all stay on the origin root.
        let pathname;
        try { pathname = decodeURIComponent(new URL(clean, 'http://localhost/__ds_verification').pathname).replace(/^\/+/, ''); }
        catch { warnings.add(`${relative}: URL ${specifier} cannot be resolved against the document`); return; }
        target = exact(path.join(base, 'public', pathname)) || exact(path.join(base, pathname));
      } else if (kind === 'file-url' || kind === 'css-import') {
        // A URL without ./ is still relative to the file; only a CSS @import may then fall back to a package or alias.
        target = clean.startsWith('/') ? exact(path.join(base, 'public', clean.slice(1))) || exact(path.join(base, clean.slice(1))) : exact(path.resolve(path.dirname(file), clean));
        if (!target && kind === 'css-import' && !clean.startsWith('/') && !clean.startsWith('.')) target = ts.resolveModuleName(clean, file, options, ts.sys).resolvedModule?.resolvedFileName;
      } else if (clean.startsWith('/')) {
        // A module import such as "/src/x.ts" is relative to the Vite root; public/ is only the fallback for asset imports.
        target = probe(path.join(base, clean.slice(1))) || probe(path.join(base, 'public', clean.slice(1)));
      } else if (clean.startsWith('.')) {
        target = probe(path.resolve(path.dirname(file), clean));
        target ||= ts.resolveModuleName(clean, file, options, ts.sys).resolvedModule?.resolvedFileName;
      } else target = ts.resolveModuleName(clean, file, options, ts.sys).resolvedModule?.resolvedFileName;
      if (stylesheetDiscovery && /\.css$/.test(clean) && !clean.startsWith('.') && !clean.startsWith('/')) {
        try { target = resolveCssPackage(base, relative, clean); }
        catch (error) { warnings.add(`${relative}: ${specifier}: ${error.message} (NOT VERIFIED)`); return; }
      }
      if (!target) {
        // Bare packages are covered by manifests, but aliases must not silently disappear.
        const pkg = clean.startsWith('@') ? clean.split('/').slice(0, 2).join('/') : clean.split('/')[0];
        const manifest = JSON.parse(readFileSync(path.join(base, 'package.json'), 'utf8'));
        if (!stylesheetDiscovery && (kind === 'module' || kind === 'css-import') && !clean.startsWith('.') && !clean.startsWith('/') && !alias && [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies].some(m => m?.[pkg])) return;
        warnings.add(`${relative}: dependency ${specifier} could not be resolved; review harness resolution or configure TypeScript paths`);
        return;
      }
      if (target.includes(`${path.sep}node_modules${path.sep}`) && !(stylesheetDiscovery && /\.css$/.test(target))) {
        if (stylesheetDiscovery) warnings.add(`${relative}: package JavaScript ${specifier} is not inspected for CSS side effects (NOT VERIFIED)`);
        return;
      }
      const resolved = realpathSync(target);
      if (!resolved.startsWith(base + path.sep)) { warnings.add(`${relative}: dependency ${specifier} resolves outside the project`); return; }
      visit(path.relative(base, target).split(path.sep).join('/'));
    };
    if (/\.[cm]?[jt]sx?$/.test(file)) {
      const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const walk = node => {
        if (ts.isCallExpression(node) && ['import.meta.glob', 'import.meta.globEager'].includes(node.expression.getText(tree))) warnings.add(`${relative}: glob imports need independent dependency review`);
        const named = node.importClause?.namedBindings || node.exportClause;
        const onlyNamedTypes = named && (ts.isNamedImports(named) || ts.isNamedExports(named)) && named.elements.length > 0 && named.elements.every(e => e.isTypeOnly) && !node.importClause?.name;
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier) && !(runtimeOnly && (node.isTypeOnly || node.importClause?.isTypeOnly || onlyNamedTypes))) local(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
          if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) local(node.arguments[0].text, 'dynamic');
          else warnings.add(`${relative}: nonliteral import/require needs independent dependency review`);
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.length === 2 && node.arguments[1].getText(tree) === 'import.meta.url') {
          if (ts.isStringLiteralLike(node.arguments[0])) local(node.arguments[0].text, 'file-url');
          else warnings.add(`${relative}: nonliteral asset URL needs independent dependency review`);
        }
        if (ts.isJsxAttribute(node) && ['src', 'poster'].includes(node.name.getText(tree)) && node.initializer && ts.isStringLiteralLike(node.initializer)) local(node.initializer.text, 'document');
        ts.forEachChild(node, walk);
      };
      walk(tree);
    } else if (/\.css$/.test(file)) {
      const css = postcss.parse(readFileSync(file, 'utf8'));
      const urls = value => valueParser(value).walk(node => {
        if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
        const children = node.nodes.filter(n => n.type !== 'space' && n.type !== 'comment');
        if (children.length === 1 && ['string', 'word'].includes(children[0].type) && !children[0].value.includes('\\')) local(children[0].value, 'file-url');
        else warnings.add(`${relative}: contextual CSS URL needs independent dependency review`);
        return false;
      });
      css.walkAtRules('import', rule => { const first = valueParser(rule.params).nodes.find(n => !['space', 'comment'].includes(n.type)); if (first?.type === 'string') local(first.value, 'css-import'); else urls(rule.params); });
      css.walkDecls(decl => urls(decl.value));
    }
  };
  for (const seed of seeds.filter(Boolean)) visit(seed);
  for (const file of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']) if (existsSync(path.join(base, file))) files.add(file);
  return { files: [...files].sort(), warnings: [...warnings].sort(), ...(stylesheetDiscovery ? { stylesheets: [...stylesheets].sort() } : {}) };
}
