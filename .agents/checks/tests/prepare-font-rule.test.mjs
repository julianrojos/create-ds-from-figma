import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { componentCapture } from './fixtures/component-capture.mjs';
import { sealCapture } from '../lib/figma-evidence.mjs';
import { renderRequirements, sha256 } from '../lib/render-plan.mjs';
import { prepareFontRule } from '../../skills/create-ds-from-figma/scripts/prepare-font-rule.mjs';

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'font-rule-proposal-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const capture = componentCapture({ seeds: [
    { id: '1:2', parentId: null, type: 'COMPONENT', name: 'Example', children: ['1:3'], properties: {} },
    { id: '1:3', parentId: '1:2', type: 'TEXT', name: 'Initial', children: [], properties: { characters: '', segments: [], fontName: { family: 'Example', style: 'Regular', variationSettings: { wght: 400 } } } },
  ] });
  const snapshot = path.join(directory, 'snapshot.json'); writeFileSync(snapshot, JSON.stringify(sealCapture(capture)));
  const font = path.join(directory, 'original.woff2'); writeFileSync(font, Buffer.from('wOF2synthetic-test-bytes'));
  return { directory, snapshot, fontId: renderRequirements(capture).fonts[0].id,
    source: { path: font, origin: { kind: 'https', url: 'https://example.org/fonts/1.0/original.woff2' }, format: 'woff2', version: '1.0', license: 'OFL-1.1' } };
}
test('font proposal derives identity including axes and hashes existing bytes without any writes', t => {
  const f = fixture(t), before = readdirSync(f.directory), result = prepareFontRule(f.snapshot, f.fontId, f.source);
  assert.equal(result.status, 'PROPOSED'); assert.equal(result.rule.identity, f.fontId);
  assert.deepEqual(result.font.variationSettings, { wght: 400 });
  assert.equal(result.rule.sha256, sha256(readFileSync(f.source.path)));
  assert.deepEqual(result.rule.origin, f.source.origin);
  assert.equal(result.originVerification.status, 'NOT VERIFIED');
  assert.match(result.originVerification.reason, /not contacted/);
  assert.deepEqual(readdirSync(f.directory), before);
});
test('local origins compare bytes with an explicit root, accepting equivalent copies at different paths', t => {
  const f = fixture(t), root = path.join(f.directory, 'project'); mkdirSync(root);
  const localPath = path.join(root, 'font.woff2'); writeFileSync(localPath, readFileSync(f.source.path));
  const source = { ...f.source, origin: { kind: 'local', path: 'font.woff2' } };
  const unverified = prepareFontRule(f.snapshot, f.fontId, source);
  assert.equal(unverified.originVerification.status, 'NOT VERIFIED'); assert.match(unverified.originVerification.reason, /No ROOT/);
  const verified = prepareFontRule(f.snapshot, f.fontId, source, { root });
  assert.equal(verified.originVerification.status, 'MATCHES_SOURCE_BYTES');
  assert.equal(verified.originVerification.sha256, verified.rule.sha256);
  writeFileSync(localPath, 'wOF2different-copy');
  assert.throws(() => prepareFontRule(f.snapshot, f.fontId, source, { root }), /Local origin "font.woff2" differs from source.path bytes/);
  symlinkSync(f.source.path, path.join(root, 'outside.woff2'));
  assert.throws(() => prepareFontRule(f.snapshot, f.fontId, { ...source, origin: { kind: 'local', path: 'outside.woff2' } }, { root }), /escapes project/);
  assert.throws(() => prepareFontRule(f.snapshot, f.fontId, { ...source, path: root }), /regular file/);
});
test('CLI can verify local origin bytes without writing or activating a policy', t => {
  const f = fixture(t), source = { ...f.source, origin: { kind: 'local', path: 'original.woff2' } }, spec = path.join(f.directory, 'local-source.json');
  writeFileSync(spec, JSON.stringify(source));
  const args = ['.agents/skills/create-ds-from-figma/scripts/prepare-font-rule.mjs', f.snapshot, f.fontId, spec];
  const verified = spawnSync(process.execPath, [...args, '--root', f.directory], { encoding: 'utf8' });
  assert.equal(verified.status, 0, verified.stderr); assert.equal(JSON.parse(verified.stdout).originVerification.status, 'MATCHES_SOURCE_BYTES');
  const unverified = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(unverified.status, 0, unverified.stderr); assert.equal(JSON.parse(unverified.stdout).originVerification.status, 'NOT VERIFIED');
  assert.equal(spawnSync(process.execPath, [...args, '--root']).status, 1);
  assert.ok(!readdirSync(f.directory).includes('resource-policy.json'));
});
test('unknown IDs, corrupt snapshots and missing source declarations are rejected', t => {
  const f = fixture(t);
  assert.throws(() => prepareFontRule(f.snapshot, 'font-invented', f.source), /not observed/);
  assert.throws(() => prepareFontRule(f.snapshot, f.fontId, { ...f.source, license: '' }), /license/);
  assert.throws(() => prepareFontRule(f.snapshot, f.fontId, { ...f.source, origin: { kind: 'https', url: 'http://example.org/font' } }), /HTTPS/);
  const corrupted = JSON.parse(readFileSync(f.snapshot)); corrupted.hash = '0'.repeat(64); writeFileSync(f.snapshot, JSON.stringify(corrupted));
  assert.throws(() => prepareFontRule(f.snapshot, f.fontId, f.source), /hash mismatch/);
});
test('CLI outputs a proposal and portable template has no resource grants', t => {
  const f = fixture(t), spec = path.join(f.directory, 'source.json'); writeFileSync(spec, JSON.stringify(f.source));
  const result = spawnSync(process.execPath, ['.agents/skills/create-ds-from-figma/scripts/prepare-font-rule.mjs', f.snapshot, f.fontId, spec], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).rule.identity, f.fontId);
  assert.deepEqual(JSON.parse(readFileSync('resource-policy.example.json')).rules, []);
  assert.ok(!readdirSync(f.directory).includes('resource-policy.json'));
});
