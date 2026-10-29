import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { svgProblem } from './svg-safety.mjs';

export const POLICY = 'resource-policy.json';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
export const resourceValueHash = value => digest(JSON.stringify(canonical(value)));
const text = v => typeof v === 'string' && !!v.trim();
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const keys = (v, allowed) => { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !allowed.includes(k))) throw new Error('Invalid resource policy fields'); };
export function localFile(root, relative) {
  if (!text(relative) || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => ['..', '.', ''].includes(p))) throw new Error('Unsafe resource path');
  const base = realpathSync(root), file = realpathSync(path.join(base, relative));
  if (!file.startsWith(base + path.sep) || !statSync(file).isFile()) throw new Error('Resource escapes project');
  return file;
}
export function loadResourcePolicy(root) {
  try { lstatSync(path.join(root, POLICY)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const policy = JSON.parse(readFileSync(localFile(root, POLICY), 'utf8'));
  validateResourcePolicy(policy);
  return { policy, hash: digest(JSON.stringify(canonical(policy))) };
}
export function validateResourcePolicy(policy) {
  keys(policy, ['schemaVersion', 'maxBytes', 'rules']);
  if (policy.schemaVersion !== 1 || !Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 1 || policy.maxBytes > 33554432 || !Array.isArray(policy.rules)) throw new Error('Invalid resource policy');
  const ids = new Set();
  for (const rule of policy.rules) {
    keys(rule, ['id', 'kind', 'identity', 'origin', 'format', 'license', 'version', 'sha256']);
    if (!text(rule.id) || ids.has(rule.id) || !text(rule.identity) || !['font', 'image'].includes(rule.kind)) throw new Error('Invalid or duplicate resource rule');
    ids.add(rule.id);
    if (!(rule.kind === 'font' ? ['woff2', 'ttf'] : ['png', 'jpg', 'svg']).includes(rule.format)) throw new Error('Unsupported resource format');
    keys(rule.origin, ['kind', 'url', 'path', 'fileKey', 'imageHash']);
    const origin = rule.origin;
    if (origin.kind === 'https') {
      if (rule.identity === '*') throw new Error('Wildcard only permitted for Figma file images');
      keys(origin, ['kind', 'url']);
      const url = new URL(origin.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Exact HTTPS origin required');
    } else if (origin.kind === 'local') {
      if (rule.identity === '*') throw new Error('Wildcard only permitted for Figma file images');
      keys(origin, ['kind', 'path']);
      if (!text(origin.path) || path.isAbsolute(origin.path) || origin.path.split('/').some(p => ['..', '.', ''].includes(p)) || origin.path.includes('\\')) throw new Error('Invalid local origin');
    } else if (origin.kind === 'figma') {
      keys(origin, ['kind', 'fileKey', 'imageHash']);
      if (rule.kind !== 'image' || !text(origin.fileKey) || (rule.identity === '*' ? origin.imageHash !== undefined : !/^[a-f0-9]{40}$/.test(origin.imageHash) || origin.imageHash !== rule.identity)) throw new Error('Exact Figma file and observed image identity required');
    } else throw new Error('Unsupported resource origin');
    if (origin.kind !== 'figma' && !hash(rule.sha256)) throw new Error('Expected SHA-256 required');
    if (rule.sha256 !== undefined && !hash(rule.sha256)) throw new Error('Invalid expected SHA-256');
    if (rule.kind === 'font' && (!text(rule.license) || !text(rule.version))) throw new Error('Font license and version required');
  }
  return policy;
}
export function authorizedRule(state, request) {
  const matches = state?.policy.rules.filter(r => r.kind === request.kind && (r.identity === request.identity || r.identity === '*' && r.origin.kind === 'figma') && (r.origin.kind !== 'figma' || r.origin.fileKey === request.fileKey)) || [];
  if (matches.length !== 1) throw new Error('DS_GAP: exactly one authorized resource rule required');
  const rule = matches[0];
  if (rule.origin.kind === 'figma' && !/^[a-f0-9]{40}$/.test(request.identity)) throw new Error('Observed Figma image hash required');
  return rule.identity === '*' ? { ...rule, identity: request.identity, origin: { ...rule.origin, imageHash: request.identity } } : rule;
}
export function checkResourceBytes(bytes, rule, maxBytes) {
  if (!bytes.length || bytes.length > maxBytes) throw new Error('Resource exceeds size limit or is empty');
  const signature = { png: '89504e470d0a1a0a', jpg: 'ffd8ff', woff2: '774f4632', ttf: '00010000' }[rule.format];
  if (signature && !bytes.toString('hex').startsWith(signature)) throw new Error('Resource format does not match bytes');
  if (rule.format === 'svg') {
    if (bytes.length > 512 * 1024) throw new Error('SVG exceeds size limit');
    const problem = svgProblem(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (problem) throw new Error(`Unsafe SVG: ${problem}`);
  }
  if (rule.sha256 && digest(bytes) !== rule.sha256) throw new Error('Resource expected hash mismatch');
  if (rule.origin.kind === 'figma' && createHash('sha1').update(bytes).digest('hex') !== rule.origin.imageHash) throw new Error('Figma image identity mismatch');
}
export function verifyResourceSource(root, source, request) {
  const state = loadResourcePolicy(root), p = source.provenance;
  if (!state && !p) return; // Existing explicit registration contract remains valid without a policy.
  if (!state) throw new Error('Resource policy missing for recorded provenance');
  const rule = authorizedRule(state, request);
  if (!p || p.schemaVersion !== 1 || p.ruleId !== rule.id || p.policyHash !== state.hash || JSON.stringify(canonical(p.origin)) !== JSON.stringify(canonical(rule.origin)) || p.license !== rule.license || p.version !== rule.version) throw new Error('Resource provenance missing or stale; re-evaluate authorization');
  const bytes = readFileSync(localFile(root, source.path));
  if (digest(bytes) !== source.sha256) throw new Error('Resource bytes changed');
  checkResourceBytes(bytes, rule, state.policy.maxBytes);
}
