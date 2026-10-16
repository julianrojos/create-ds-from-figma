import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { exports as resolveExports } from 'resolve.exports';
import { projectFile } from './render-plan.mjs';

export function cssImportProblem(specifier) {
  return specifier.includes('?') ? 'Import queries are not credited as ordinary stylesheets (NOT VERIFIED)' : null;
}

const conditionNames = new Set(['default', 'import', 'require', 'node', 'browser', 'module', 'style', 'development', 'production', 'types', 'worker']);
function checkExportShape(value) {
  if (value === null || typeof value === 'string') return;
  if (Array.isArray(value)) { value.forEach(checkExportShape); return; }
  if (!value || typeof value !== 'object') throw new Error('Unsupported exports shape');
  const keys = Object.keys(value), paths = keys.filter(key => key.startsWith('.'));
  if (paths.length && paths.length !== keys.length) throw new Error('Mixed subpaths and conditions in exports');
  for (const key of keys) {
    if (!paths.length && !conditionNames.has(key)) throw new Error(`Unknown export condition ${key}; project conditions need review`);
    checkExportShape(value[key]);
  }
}

function conditionProfiles(cssImport) {
  let profiles = [['import']];
  // No bundler config is executed: optional browser/module/style conditions must not change the destination.
  for (const name of ['browser', 'module', ...(cssImport ? ['style'] : [])]) profiles = profiles.flatMap(profile => [profile, [...profile, name]]);
  return profiles.flatMap(profile => [profile, [...profile, 'development'], [...profile, 'production']]);
}

function packageLocation(root, importer, name) {
  const own = path.join(root, 'package.json');
  if (existsSync(own)) {
    const file = projectFile(root, 'package.json'), data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.name === name && Object.hasOwn(data, 'exports')) return { directory: root, data };
  }
  for (let directory = path.dirname(importer); ; directory = path.dirname(directory)) {
    const relative = path.relative(root, path.join(directory, 'node_modules', name, 'package.json')).split(path.sep).join('/');
    if (existsSync(path.join(root, relative))) {
      const file = projectFile(root, relative);
      return { directory: path.dirname(file), data: JSON.parse(readFileSync(file, 'utf8')) };
    }
    if (directory === root) break;
  }
  throw new Error(`Installed CSS package ${name} was not found inside the project`);
}

// Resolve metadata only. Never use Node's require conditions or fall back around an exports exclusion.
export function resolveCssPackage(root, importer, specifier, { cssImport = false } = {}) {
  const problem = cssImportProblem(specifier);
  if (problem) throw new Error(problem);
  const pieces = specifier.split('/'), scoped = specifier.startsWith('@');
  const name = pieces.slice(0, scoped ? 2 : 1).join('/'), subpath = pieces.slice(scoped ? 2 : 1).join('/');
  if (!/^(?:@[a-z\d_.-]+\/)?[a-z\d_.-]+$/i.test(name) || pieces.some(piece => !piece || piece === '.' || piece === '..' || /[\\%:#?]/.test(piece))) throw new Error('Unsupported CSS package specifier');
  root = realpathSync(root);
  const from = projectFile(root, importer), { directory, data } = packageLocation(root, from, name);
  if (data.browser !== undefined) throw new Error('Package browser remapping requires project resolver review');
  let candidates;
  if (Object.hasOwn(data, 'exports')) {
    checkExportShape(data.exports);
    candidates = conditionProfiles(cssImport).map(conditions => {
      const paths = resolveExports({ ...data, name }, subpath ? `./${subpath}` : '.', { unsafe: true, conditions });
      const unique = [...new Set(paths || [])];
      if (unique.length !== 1) throw new Error('Exports must resolve to one CSS target, not ambiguous alternatives');
      return unique[0];
    });
  } else if (subpath) candidates = [`./${subpath}`];
  else candidates = [data.style, data.main].filter(value => value !== undefined).map(value => typeof value === 'string' && !value.startsWith('.') && !path.isAbsolute(value) ? `./${value}` : value);
  if (!candidates.length || new Set(candidates).size !== 1) throw new Error('CSS export destination depends on unresolved conditions or entry fields');
  const target = candidates[0];
  if (typeof target !== 'string' || !target.startsWith('./') || !target.endsWith('.css') || /[\\%?#]/.test(target) || target.slice(2).split('/').some(part => !part || ['.', '..', 'node_modules'].includes(part))) throw new Error('Expected one explicit package-relative CSS target');
  return projectFile(root, path.relative(root, path.resolve(directory, target)).split(path.sep).join('/'));
}
