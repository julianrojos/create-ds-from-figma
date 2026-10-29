import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizedRule, checkResourceBytes, digest, loadResourcePolicy, localFile, resourceValueHash, validateResourcePolicy, verifyResourceSource } from '../../../checks/lib/resource-policy.mjs';

function readResolutionJson(file, label) {
  let bytes;
  try { bytes = readFileSync(file, 'utf8'); }
  catch (error) { throw new Error(`Unreadable ${label} ${JSON.stringify(file)} (${error.code || 'read failed'})`, { cause: error }); }
  try { return JSON.parse(bytes); }
  catch (error) { throw new Error(`Invalid JSON in ${label} ${JSON.stringify(file)}`, { cause: error }); }
}
export function readResolutionReceipt(file) {
  const receipt = readResolutionJson(file, 'resolution receipt');
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && !!value.trim();
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const request = receipt?.request, p = receipt?.provenance;
  if (!object(receipt) || receipt.schemaVersion !== 1 || !object(request) || !['font', 'image'].includes(request.kind) || !text(request.identity) || !text(request.fileKey) || !hash(receipt.sha256) || typeof receipt.file !== 'string' || !new RegExp(`^${receipt.sha256}\\.(?:png|jpg|svg|woff2|ttf)$`).test(receipt.file) || !object(p) || p.schemaVersion !== 1 || !hash(p.policyHash) || !text(p.ruleId) || !object(p.origin) || !['local', 'https', 'figma'].includes(p.origin.kind)) throw new Error(`Invalid resolution receipt structure in ${JSON.stringify(file)}`);
  try {
    validateResourcePolicy({ schemaVersion: 1, maxBytes: 33554432, rules: [{ id: p.ruleId, kind: request.kind, identity: request.identity,
      origin: p.origin, format: path.extname(receipt.file).slice(1), sha256: receipt.sha256, license: p.license, version: p.version }] });
    if (p.origin.kind === 'figma' && p.origin.fileKey !== request.fileKey) throw new Error('Receipt file identity differs from its origin');
  } catch (error) { throw new Error(`Invalid resolution receipt structure in ${JSON.stringify(file)}`, { cause: error }); }
  return receipt;
}
export function readResolutionReceipts(file) {
  const paths = readResolutionJson(file, 'resolution receipt list');
  if (!Array.isArray(paths) || paths.some(value => typeof value !== 'string' || !value.trim())) throw new Error(`Invalid resolution receipt list ${JSON.stringify(file)}: expected non-empty receipt paths`);
  return paths.map(receiptPath => ({ path: receiptPath, receipt: readResolutionReceipt(receiptPath) }));
}

export async function resolveResource(root, request, directory, { fetcher = fetch } = {}) {
  if (typeof request.fileKey !== 'string' || !request.fileKey.trim()) throw new Error('Observed fileKey required');
  const state = loadResourcePolicy(root), rule = authorizedRule(state, request);
  const base = realpathSync(root), output = realpathSync(directory);
  if (output === base || output.startsWith(base + path.sep)) throw new Error('Preanalysis output must be outside the project');
  let bytes;
  const readBounded = file => { if (statSync(file).size > state.policy.maxBytes) throw new Error('Resource exceeds size limit'); return readFileSync(file); };
  const cached = rule.sha256 && `${rule.sha256}.${rule.format}`;
  const sameOriginReceipt = cached && readdirSync(output).filter(name => /^[a-f0-9]{64}-[a-f0-9]{64}\.json$/.test(name)).some(name => {
    try { const r = JSON.parse(readFileSync(localFile(output, name), 'utf8')); return r.sha256 === rule.sha256 && r.request?.kind === request.kind && r.request?.identity === request.identity && resourceValueHash(r.provenance?.origin) === resourceValueHash(rule.origin); }
    catch { return false; }
  });
  if (cached && sameOriginReceipt && existsSync(path.join(output, cached))) bytes = readBounded(localFile(output, cached));
  else if (rule.origin.kind === 'local') bytes = readBounded(localFile(root, rule.origin.path));
  else if (rule.origin.kind === 'figma') {
    if (typeof request.input !== 'string') throw new Error('DS_GAP: stage original Figma image bytes using an authorized tool; never transcribe or re-encode');
    const input = realpathSync(request.input);
    if (input === base || input.startsWith(base + path.sep)) throw new Error('Figma staging must be temporary, outside the project');
    bytes = readBounded(input);
  } else {
    const response = await fetcher(rule.origin.url, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    if (!response.ok || response.status >= 300 || response.redirected || response.url && new URL(response.url).href !== new URL(rule.origin.url).href) throw new Error('Resource download failed or redirected');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > state.policy.maxBytes) { await response.body.cancel?.().catch(() => {}); throw new Error('Resource exceeds size limit'); }
      chunks.push(Buffer.from(chunk));
    }
    bytes = Buffer.concat(chunks);
  }
  checkResourceBytes(bytes, rule, state.policy.maxBytes);
  const sha256 = digest(bytes), file = `${sha256}.${rule.format}`;
  const provenance = { schemaVersion: 1, policyHash: state.hash, ruleId: rule.id, origin: rule.origin,
    ...(rule.license ? { license: rule.license } : {}), ...(rule.version ? { version: rule.version } : {}) };
  const receipt = { schemaVersion: 1, request: { kind: request.kind, identity: request.identity, ...(request.fileKey ? { fileKey: request.fileKey } : {}) }, file, sha256, provenance };
  const target = path.join(output, file);
  if (existsSync(target)) { if (digest(readFileSync(localFile(output, file))) !== sha256) throw new Error('Existing staged bytes differ'); }
  else writeFileSync(target, bytes, { flag: 'wx' });
  const receiptFile = path.join(output, `${sha256}-${digest(JSON.stringify(receipt))}.json`);
  if (existsSync(receiptFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(localFile(output, path.basename(receiptFile)), 'utf8')); }
    catch { throw new Error('Existing resolution receipt is unreadable or corrupt; use a new temporary directory'); }
    if (resourceValueHash(existing) !== resourceValueHash(receipt)) throw new Error('Existing resolution receipt differs; use a new temporary directory');
  } else writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  inspectResolution(root, receiptFile, receipt.request);
  return { status: 'RESOLVED', receipt: receiptFile, ...receipt, scope: 'Authorization and byte checks only; no rendered loading or fidelity claim.' };
}
export function inspectResolution(root, receiptPath, request) {
  const receipt = readResolutionReceipt(receiptPath);
  if (receipt.schemaVersion !== 1 || receipt.request.kind !== request.kind || receipt.request.identity !== request.identity || receipt.request.fileKey !== request.fileKey) throw new Error('Resolution identity mismatch');
  const directory = path.dirname(realpathSync(receiptPath));
  const state = loadResourcePolicy(root), rule = authorizedRule(state, request), p = receipt.provenance;
  if (!p || p.schemaVersion !== 1 || p.policyHash !== state.hash || p.ruleId !== rule.id || resourceValueHash(p.origin) !== resourceValueHash(rule.origin) || p.license !== rule.license || p.version !== rule.version) throw new Error('Resolution authorization is stale; resolve again (staged bytes may be reused)');
  const file = localFile(directory, receipt.file);
  if (statSync(file).size > state.policy.maxBytes) throw new Error('Resource exceeds size limit');
  const bytes = readFileSync(file);
  if (digest(bytes) !== receipt.sha256 || receipt.file !== `${receipt.sha256}.${rule.format}`) throw new Error('Resolution bytes changed');
  checkResourceBytes(bytes, rule, state.policy.maxBytes);
  return { receipt, bytes };
}
export function publishResource(root, receiptPath) {
  const requested = readResolutionReceipt(receiptPath);
  const { receipt, bytes } = inspectResolution(root, receiptPath, requested.request);
  let parent = realpathSync(root);
  for (const segment of ['src', 'assets', 'resources']) {
    const next = path.join(parent, segment);
    if (!existsSync(next)) mkdirSync(next);
    if (realpathSync(next) !== next) throw new Error('Asset directory must not be a symlink');
    parent = next;
  }
  const relative = `src/assets/resources/${receipt.file}`, target = path.join(root, relative);
  if (existsSync(target)) { if (digest(readFileSync(localFile(root, relative))) !== receipt.sha256) throw new Error('Existing published resource differs'); }
  else writeFileSync(target, bytes, { flag: 'wx' });
  const source = { kind: 'file', path: relative, sha256: receipt.sha256, provenance: receipt.provenance };
  verifyResourceSource(root, source, receipt.request);
  return source;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, root, input, directory, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('Unexpected arguments');
    let result;
    if (command === 'resolve' && directory) result = await resolveResource(root, JSON.parse(readFileSync(input, 'utf8')), directory);
    else if (command === 'publish' && root && input && !directory) result = publishResource(root, input);
    else throw new Error('Usage: resolve-resources.mjs resolve ROOT REQUEST_JSON TEMP_DIRECTORY | publish ROOT RECEIPT');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
