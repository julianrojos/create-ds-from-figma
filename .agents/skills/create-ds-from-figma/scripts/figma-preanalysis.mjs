import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInventory } from '../../../checks/lib/variable-inventory.mjs';
import { planInventoryTokens } from '../../../checks/lib/inventory-tokens.mjs';
import { nestedInventory } from '../../../checks/lib/nested-inventory.mjs';
import { snapshotResources } from '../../../checks/lib/resource-diagnostics.mjs';
import { projectFile } from '../../../checks/lib/render-plan.mjs';
import { loadResourcePolicy } from '../../../checks/lib/resource-policy.mjs';

export function preanalyze(root, inventoryPath, snapshotPath) {
  const inventory = readInventory(inventoryPath), errors = [], nextActions = [];
  try { loadResourcePolicy(root); } catch (error) { errors.push(`Resource policy: ${error.message}`); }
  let tokens, nested, resources;
  try {
    const plan = planInventoryTokens(root, inventoryPath);
    tokens = { status: 'PLANNED', preflight: plan.preflight, files: Object.keys(plan.outputs), warnings: plan.warnings };
    nextActions.push({ code: 'REVIEW_TOKEN_PLAN', permissions: ['project-read'], command: { executable: 'node', args: ['.agents/skills/create-ds-from-figma/scripts/generate-token-json.mjs', 'plan', root, '--inventory', inventoryPath] } });
  } catch (error) {
    tokens = { status: 'BLOCKED', reason: error.message }; errors.push(error.message);
    nextActions.push({ code: 'RESOLVE_TOKEN_DIAGNOSTIC', reason: error.message, permissions: ['project-read'], command: null });
  }
  if (snapshotPath) {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    if (snapshot.capture?.source?.fileKey !== inventory.inventory.source.fileKey) throw new Error('Snapshot and inventory file origins differ');
    const mapPath = 'design-system/relationships/figma-code-map.json';
    const map = existsSync(path.join(root, mapPath)) ? JSON.parse(readFileSync(projectFile(root, mapPath), 'utf8')) : {};
    nested = nestedInventory(snapshot, map); resources = snapshotResources(snapshot.capture, { root: errors.some(e => e.startsWith('Resource policy:')) ? undefined : root });
    for (const instance of nested.instances.filter(i => ['missing', 'unresolved'].includes(i.status))) {
      errors.push(`${instance.instance}: ${instance.reason}`);
      nextActions.push({ code: instance.status === 'missing' ? 'IMPORT_NESTED_COMPONENT' : 'RESOLVE_NESTED_IDENTITY', instance: instance.instance, refs: instance.refs, permissions: ['figma-read'], command: null });
    }
  }
  return { status: errors.length ? 'BLOCKED' : 'DIAGNOSED', inventory: { hash: inventory.hash, fileKey: inventory.inventory.source.fileKey }, tokens, nested, resources, errors, nextActions,
    scope: 'Read-only orchestration of existing observations. No files, tokens, resources or components are saved; a diagnosis is not an import authorization or visual verification.' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [root, ...flags] = process.argv.slice(2), options = new Map();
    for (let i = 0; i < flags.length; i += 2) {
      if (!['--inventory', '--snapshot'].includes(flags[i]) || !flags[i + 1] || flags[i + 1].startsWith('--') || options.has(flags[i])) throw new Error('Use ROOT --inventory PATH [--snapshot PATH]');
      options.set(flags[i], flags[i + 1]);
    }
    if (!root || !options.has('--inventory')) throw new Error('Use ROOT --inventory PATH [--snapshot PATH]');
    const result = preanalyze(root, options.get('--inventory'), options.get('--snapshot')); console.log(JSON.stringify(result, null, 2)); if (result.status === 'BLOCKED') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
