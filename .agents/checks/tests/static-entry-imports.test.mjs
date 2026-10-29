import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleEntries, emittedImports } from '../lib/static-entry-imports.mjs';

test('HTML entry discovery uses real attributes and excludes inert or non-HTML script elements',()=> {
  for (const html of [
    '<script data-type="module" data-src="/src/main.ts"></script>',
    '<script type="module" data-src="/src/main.ts"></script>',
    '<script data-type="module" src="/src/main.ts"></script>',
    '<!-- <script type="module" src="/src/main.ts"></script> -->',
    '<template><script type="module" src="/src/main.ts"></script></template>',
    '<script>const text = "<script type=module src=/src/main.ts>";</script>',
    '<svg><script type="module" src="/src/main.ts"></script></svg>',
    '<base href="/other/"><script type="module" src="src/main.ts"></script>',
    '<script type="module" src="src/../../outside.ts"></script>',
    '<script type="module" src="src/&#46;&#46;/&#46;&#46;/outside.ts"></script>',
    '<script type="module" src="src/ignored.ts?/../main.ts"></script>',
    '<script type="module" src="https:/../src/main.ts"></script>',
  ]) assert.deepEqual(moduleEntries(html),[]);
  assert.deepEqual(moduleEntries('<SCRIPT TYPE=module SRC=/src/main.ts data-title="a > b"></SCRIPT>'),['src/main.ts']);
  assert.deepEqual(moduleEntries('<script src="./src/ma&#105;n.ts" type="module"></script>'),['src/main.ts']);
  assert.deepEqual(moduleEntries('<script src="src/../src/main.ts" type="module"></script>'),['src/main.ts']);
});
test('imports dependent on TS type erasure cannot establish runtime loading',()=> {
  assert.deepEqual(emittedImports('import type { Foo } from "./types";','main.ts'),[]);
  assert.deepEqual(emittedImports('import { type Foo } from "./types";','main.ts'),[]);
  assert.deepEqual(emittedImports('import { Foo } from "./types"; const value: Foo = {};','main.ts'),[]);
  assert.deepEqual(emittedImports('import "./tokens.css";','main.ts'),['./tokens.css']);
  assert.deepEqual(emittedImports('import "./tokens.css"; const app = <div/>;','main.tsx'),['./tokens.css']);
  assert.deepEqual(emittedImports('import { Foo } from "./types"; void Foo;','main.ts'),['./types']);
  assert.deepEqual(emittedImports('import { type Foo, value } from "./types"; void value;','main.ts'),['./types']);
});
test('URL dot segments preserve browser semantics rather than filesystem normalization',()=> {
  const entry=src=>moduleEntries(`<script type="module" src="${src}"></script>`);
  assert.deepEqual(entry('src/a//../main.ts'),['src/a/main.ts']);
  assert.deepEqual(entry('src//main.ts'),[]);
  assert.deepEqual(entry('src/a/../main.ts'),['src/main.ts']);
  assert.deepEqual(entry('src/../../outside.ts'),[]);
});
