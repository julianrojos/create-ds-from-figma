import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectionRange } from '../../scripts/read-guidance.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const hash=text=>createHash('sha256').update(text).digest('hex');
const load=file=>JSON.parse(readFileSync(path.join(root,file),'utf8'));
function destination(d) { assert.equal(typeof d.file,'string');assert.ok(!path.isAbsolute(d.file)&&!d.file.split('/').includes('..'));const text=readFileSync(path.join(root,d.file),'utf8');assert.ok(sectionRange(text,d.section).end>0); }
test('README migration accounts for every original nonblank block and resolves its destinations',()=>{
 const map=load('.agents/evals/readme-migration.json'),lines=Array(map.source.lines).fill('');let end=0;
 for(const r of map.records) {const s=r.source;assert.ok(s.startLine>end);assert.equal(hash(s.text),s.sha256);const block=s.text.split('\n');assert.equal(block.length,s.endLine-s.startLine+1);lines.splice(s.startLine-1,block.length,...block);end=s.endLine;destination(r.destination);}
 const source=lines.join('\n');assert.equal(hash(source),map.source.sha256);assert.equal(Buffer.byteLength(source),map.source.bytes);
});
test('reference consolidation preserves archived paragraphs and resolves reviewed destinations',()=>{
 const map=load('.agents/evals/reference-consolidation.json');assert.ok(map.records.length>0);
 for(const r of map.records) {assert.equal(hash(r.sourceText),r.sha256);assert.ok(r.destinations.length>0);r.destinations.forEach(destination);}
});
