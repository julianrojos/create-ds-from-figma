import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planInventoryTokens, saveInventoryTokens, tokenInventoryComparison } from '../../../checks/lib/inventory-tokens.mjs';
import { readInventory } from '../../../checks/lib/variable-inventory.mjs';
import { readFileSync } from 'node:fs';

export function generateTokenJson(args) {
  const [command, root, ...flags] = args;
  const allowed = new Set(['--inventory', '--token-prefix', '--alias-modes']);
  const options = new Map();
  for (let i = 0; i < flags.length; i += 2) {
    if (!allowed.has(flags[i]) || !flags[i + 1] || flags[i + 1].startsWith('--') || options.has(flags[i])) throw new Error('Invalid or repeated inventory option');
    options.set(flags[i], flags[i + 1]);
  }
  if (!['plan', 'save', 'check'].includes(command) || !root || !options.has('--inventory') || (command === 'check' && (options.has('--token-prefix') || options.has('--alias-modes')))) throw new Error('Use plan|save|check ROOT --inventory PATH [--token-prefix PREFIX] [--alias-modes PATH]; check uses recorded decisions');
  if (command === 'check') return tokenInventoryComparison(root, readInventory(options.get('--inventory')));
  const plan = planInventoryTokens(root, options.get('--inventory'), { tokenPrefix: options.get('--token-prefix'),
    aliasModes: options.has('--alias-modes') ? JSON.parse(readFileSync(options.get('--alias-modes'), 'utf8')) : undefined });
  return command === 'save' ? saveInventoryTokens(root, plan) : plan;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = generateTokenJson(process.argv.slice(2)); console.log(JSON.stringify(result, null, 2)); if (result.status === 'FAIL') process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
