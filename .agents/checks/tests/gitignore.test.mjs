import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

test('gitignore ignores Finder custom icons but not the Icon component directory', () => {
  for (const file of ['src/components/Icon/Icon.tsx', 'src/components/Icon/index.ts', 'Icon']) {
    const r = spawnSync('git', ['check-ignore', '--no-index', file], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
  }
  const r = spawnSync('git', ['check-ignore', '--no-index', 'src/components/Icon\r'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
