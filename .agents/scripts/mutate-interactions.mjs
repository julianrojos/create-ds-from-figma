import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMutations } from './lib/mutation-runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const state = '.agents/checks/lib/native-state.mjs';
const actions = '.agents/skills/create-ds-from-figma/scripts/lib/browser-actions.mjs';
runMutations({ root, name: 'interactions',
  scope: 'Targeted state readings, bounded actions, component ownership and empty-directory diagnostics; not exhaustive interaction coverage or visual fidelity.',
  tests: ['.agents/checks/tests/native-state.test.mjs', '.agents/checks/tests/browser-actions.test.mjs', '.agents/checks/tests/preflight.test.mjs'],
  mutants: [
    [state, 'pseudo-trusts-requested-value', "const measured = element.matches(':' + check.property);", 'const measured = check.value;'],
    [state, 'pseudo-confuses-visible-focus-with-focus', "element.matches(':' + check.property)", "element.matches(':focus')"],
    [state, 'pseudo-missing-target-is-false', "matches.length || check.kind === 'pseudo' ?", 'matches.length ?'],
    ['.agents/checks/lib/browser-actions.mjs', 'actions-unbounded', 'actions.length > 32', 'false'],
    [actions, 'keyboard-action-is-skipped', 'await page.keyboard.press(action.key);', 'void action.key;'],
    [actions, 'pointer-can-target-delegated-control', "e.closest('[data-ds-part=\"root\"]') === root", 'true'],
    [actions, 'pointer-accepts-ambiguous-target', 'elements.length !== 1', 'elements.length < 1'],
    [actions, 'host-deadline-is-not-enforced', 'Promise.race([timeout, (async () => {', 'Promise.race([timeout.catch(() => new Promise(() => {})), (async () => {'],
    [actions, 'collection-promise-is-awaited', 'void window.__dsVerification.collect().catch(() => {});', 'return window.__dsVerification.collect();'],
    [actions, 'timed-out-case-page-is-not-closed', 'void page.close().catch(() => {});', 'void 0;'],
    ['.agents/skills/create-ds-from-figma/scripts/preflight-token-files.mjs', 'empty-directory-loses-specific-diagnostic', 'if (emptyDirectories.length)', 'if (false)'],
    ['.agents/skills/create-ds-from-figma/scripts/preflight-token-files.mjs', 'finder-metadata-loses-specific-diagnostic', 'if (metadataOnlyDirectories.length)', 'if (false)'],
    ['.agents/skills/create-ds-from-figma/scripts/preflight-token-files.mjs', 'finder-metadata-ignores-real-content', 'item.entries.length === 1 &&', 'item.entries.length >= 1 &&'],
    ['.agents/skills/create-ds-from-figma/scripts/preflight-token-files.mjs', 'finder-metadata-trusts-name-without-file-type', 'item.entries[0].isFile() &&', ''],
  ],
});
