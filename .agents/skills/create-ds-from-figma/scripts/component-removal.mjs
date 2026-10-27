import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRemoval, archiveRemoval, restoreRemoval, recoverRemoval, purgeRemovalArchive } from '../../../checks/lib/component-removal.mjs';

export async function removalCommand(args) {
  const [command, root, subject, ...options] = args;
  if (command === 'plan') {
    const configuration = { keepPaths: [], retirePaths: [], retireSerializationIds: [] };
    for (let index = 0; index < options.length; index += 2) {
      const value = options[index + 1];
      if (!value) throw new Error('Each plan option requires a value');
      if (options[index] === '--demo') {
        if (configuration.demoReplacement) throw new Error('One demo proposal per plan');
        const proposal = JSON.parse(readFileSync(value, 'utf8'));
        configuration.demoReplacement = proposal;
      } else if (options[index] === '--keep') configuration.keepPaths.push(value);
      else if (options[index] === '--retire') configuration.retirePaths.push(value);
      else if (options[index] === '--retire-serialization') configuration.retireSerializationIds.push(value);
      else throw new Error(`Unknown plan option: ${options[index]}`);
    }
    return planRemoval(root, subject, configuration);
  }
  if (command === 'archive') {
    if (options.length !== 2 || options[1] !== '--approve-removal') throw new Error('Use archive ROOT PLAN_FILE ARCHIVE_PARENT --approve-removal');
    const planFile = realpathSync(subject), active = realpathSync(root);
    if (planFile.startsWith(active + path.sep)) throw new Error('Keep the reviewed plan outside the active project');
    return archiveRemoval(root, JSON.parse(readFileSync(planFile, 'utf8')), { archiveRoot: options[0], approved: true });
  }
  if (command === 'restore') {
    if (options.length !== 1 || options[0] !== '--approve-restore') throw new Error('Use restore ROOT ARCHIVE --approve-restore');
    return restoreRemoval(root, subject, { approved: true });
  }
  if (command === 'recover') {
    if (options.length !== 2 || !options.includes('--approve-recover') || !options.includes('--confirm-operation-stopped')) throw new Error('Use recover ROOT ARCHIVE --approve-recover --confirm-operation-stopped');
    return recoverRemoval(root, subject, { approved: true, operationStopped: true });
  }
  if (command === 'purge') {
    if (options.length !== 2 || !options.includes('--approve-purge') || !options.includes('--confirm-backup-not-needed')) throw new Error('Use purge ROOT ARCHIVE --approve-purge --confirm-backup-not-needed');
    return purgeRemovalArchive(root, subject, { approved: true, backupNotNeeded: true });
  }
  throw new Error('Use component-removal.mjs plan | archive | restore | recover | purge');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await removalCommand(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.conflicts?.length || result.delivery === 'PENDING_VERIFICATION' || result.status === 'RESTORED' && result.validation?.status !== 'PASS' ? 1 : 0;
  } catch (error) { console.error(JSON.stringify({ error: error.message, code: error.code, details: error.details, archive: error.archive ?? null })); process.exitCode = 1; }
}
