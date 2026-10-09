import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, existsSync, realpathSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sealCapture, classificationProposals } from '../../../checks/lib/figma-evidence.mjs';
import { bridgeCode } from './lib/capture-bridge.mjs';

import { captureCode, assembleChunks } from './lib/capture-code.mjs';
export { captureCode, assembleChunks };

export function persistCapture(root, capture) {
  const snapshot = sealCapture(capture);
  const { fileKey, rootNodeId } = capture.source;
  if (!/^[A-Za-z0-9_-]+$/.test(fileKey) || !/^\d+:\d+$/.test(rootNodeId)) throw new Error('Invalid snapshot identity');
  const relative = `design-system/figma/snapshots/${fileKey}/${rootNodeId.replace(':', '-')}/${snapshot.hash}.json`;
  const base = realpathSync(root);
  const destination = path.join(base, relative);
  // Refuse symlinks before mkdir: an existing intermediate directory may escape the checkout.
  let current = base;
  for (const segment of relative.split('/').slice(0, -1)) {
    current = path.join(current, segment);
    if (existsSync(current) && !realpathSync(current).startsWith(base + path.sep)) throw new Error('Snapshot directory escapes project root');
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    if (!realpathSync(destination).startsWith(base + path.sep)) throw new Error('Snapshot file escapes project root');
    const existing = JSON.parse(readFileSync(destination, 'utf8'));
    if (existing.hash !== snapshot.hash || canonicalJson(existing.capture) !== canonicalJson(capture)) throw new Error('Existing snapshot differs; never overwrite');
  } else writeFileSync(destination, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
  return { snapshot: relative, hash: snapshot.hash, captureIssues: capture.coverage.issues.length };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'bridge') {
    captureCode(args[0], args[1]);
    process.stdout.write(bridgeCode(fileURLToPath(import.meta.url), args[0], args[1]) + '\n');
  } else if (command === 'session') console.log(mkdtempSync(path.join(os.tmpdir(), 'figma-capture-')));
  else if (command === 'capture') {
    const flags = args.slice(3);
    if (args.length < 3 || flags.some(flag => !['--approve-connection', '--keep-failed'].includes(flag))) throw new Error('Use capture FILE_KEY NODE_ID CONFIG --approve-connection [--keep-failed]');
    if (!flags.includes('--approve-connection')) throw new Error('Review and authorize CONFIG, then pass --approve-connection');
    const { captureFromMcp } = await import('./lib/capture-mcp.mjs');
    const config = JSON.parse(readFileSync(args[2], 'utf8'));
    console.log(JSON.stringify(await captureFromMcp(config, args[0], args[1], { approvedConnection: true, keepFailed: flags.includes('--keep-failed') }), null, 2));
  }
  else if (command === 'validate-session') {
    const chunks = readdirSync(args[0]).filter(f => /^\d+\.json$/.test(f)).map(f => JSON.parse(readFileSync(path.join(args[0], f), 'utf8')));
    const snapshot = sealCapture(assembleChunks(chunks));
    console.log(JSON.stringify({ hash: snapshot.hash, nodes: snapshot.capture.nodes.length, issues: snapshot.capture.coverage.issues.length }));
  } else if (command === 'code') process.stdout.write(captureCode(args[0], args[1], Number(args[2] || 0)) + '\n');
  else if (command === 'stage') {
    const chunk = JSON.parse(readFileSync(0, 'utf8'));
    if (chunk.transportVersion !== 1 || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0 || typeof chunk.payload !== 'string') throw new Error('Invalid transport chunk');
    mkdirSync(args[0], { recursive: true });
    writeFileSync(path.join(args[0], chunk.offset + '.json'), JSON.stringify(chunk) + '\n', { flag: 'wx' });
    console.log(`Staged offset ${chunk.offset}`);
  }
  else if (command === 'save') {
    const directory = args[1] === '--chunks-dir' ? args[2] : null;
    const input = directory ? { chunks: readdirSync(directory).filter(f => /^\d+\.json$/.test(f)).map(f => JSON.parse(readFileSync(path.join(directory, f), 'utf8'))) } : JSON.parse(readFileSync(0, 'utf8'));
    console.log(JSON.stringify(persistCapture(args[0] || '.', assembleChunks(input.chunks)), null, 2));
  } else if (command === 'propose') {
    const snapshot = JSON.parse(readFileSync(args[0], 'utf8'));
    const sealed = sealCapture(snapshot.capture);
    if (snapshot.hash !== sealed.hash) throw new Error('Snapshot hash mismatch');
    console.log(JSON.stringify(classificationProposals(snapshot.capture), null, 2));
  } else if (command === 'compare') {
    const snapshots = args.slice(0, 2).map(file => JSON.parse(readFileSync(file, 'utf8')));
    if (snapshots.length !== 2) throw new Error('Two snapshot files required');
    for (const s of snapshots) if (s.hash !== sealCapture(s.capture).hash) throw new Error('Snapshot hash mismatch');
    const [before, after] = snapshots.map(s => s.capture);
    if (before.source.fileKey !== after.source.fileKey || before.source.rootNodeId !== after.source.rootNodeId) throw new Error('Cannot compare different component identities');
    const sections = ['nodes', 'observations', 'variants', 'collections', 'variables', 'styles', 'coverage'];
    console.log(JSON.stringify({ sameCapture: snapshots[0].hash === snapshots[1].hash, changedSections: sections.filter(k => canonicalJson(before[k]) !== canonicalJson(after[k])),
      note: 'Divergence between captures, not proof of a Figma revision or an import error.' }, null, 2));
  } else throw new Error('Use capture FILE_KEY NODE_ID CONFIG --approve-connection [--keep-failed], bridge/code FILE_KEY NODE_ID [OFFSET], session, stage DIRECTORY, validate-session DIRECTORY, save ROOT, propose SNAPSHOT, or compare BEFORE AFTER');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(`Figma capture: ${error.message}`); process.exitCode = 1; }
}
