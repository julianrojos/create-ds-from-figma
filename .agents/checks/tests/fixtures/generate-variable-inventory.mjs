import { writeFileSync } from 'node:fs';
import { captureInventory } from '../../../skills/create-ds-from-figma/scripts/lib/capture-inventory.mjs';
import { sealInventory } from '../../lib/variable-inventory.mjs';
import { inventoryMock } from './variable-inventory.mjs';

// Entirely synthetic input; never connect to Figma to regenerate this fixture.
const raw = await captureInventory(inventoryMock(), { fileKey: 'FILE' });
const envelope = sealInventory(raw, '2020-01-01T00:00:00.000Z');
writeFileSync(new URL('./variable-inventory-sealed.json', import.meta.url), JSON.stringify(envelope, null, 2) + '\n');
console.log(`Synthetic inventory: ${envelope.hash}`);
