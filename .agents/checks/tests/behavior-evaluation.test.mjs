import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadCases, validateCase, safeRelative, manifest, digest, instructionHash, classifyCommand, scoreBehavior, scoreHistoricalBehavior, instructionSnapshotHash, repoRoot } from '../../scripts/evaluate-behavior.mjs';
import { beginSession, recordRead, recordEdit, recordExec, recordQuery, finishSession } from '../../scripts/behavior-session.mjs';

const cases = loadCases();
function runFor(c) {
  const run = { schemaVersion: 1, caseId: c.id, caseHash: digest(c), instructionHash: instructionHash(), date: '2026-10-22', executor: 'synthetic-scorer-test', model: 'synthetic', modelVersion: 'none', projectRoot: '/tmp/synthetic-project',
    started: true, finished: true, tools: [{ name:'read',effects:['read'] },{ name:'exec',effects:['execute','unknown'] },{ name:'edit',effects:['write'] }], recording:{ complete:true,gaps:0 }, before:[], after:[], events:[],
    final: { status: c.rules.find(r => r.kind === 'outcome').value, confirmed: false, finalText: 'Synthetic scorer control; not a real agent run.' } };
  if (c.rules.some(r => r.kind === 'diagnosis-executed')) {
    const argv = [process.execPath,path.join(repoRoot,'.agents/skills/create-ds-from-figma/scripts/finalize-import.mjs'),run.projectRoot,'design-system/components/PreviewGlyph/metadata.json','--diagnose'];
    run.events.push({ sequence:1,tool:'exec',argv,...classifyCommand(argv,run.projectRoot),complete:true,exitCode:1,stdout:JSON.stringify({ complete:false,report:{source:'temporary-diagnosis'},diagnosis:{mode:'diagnostic',execution:{status:'COMPLETED'}} }),stderr:'' });
  }
  return run;
}
for (const c of cases) {
  test(`behavior ${c.id}: compliant synthetic trace passes`, () => assert.equal(scoreBehavior(runFor(c),c).status,'PASS'));
  test(`behavior ${c.id}: forbidden edit fails even reverted and truncated`, () => {
    const run=runFor(c);run.events.push({sequence:run.events.length+1,tool:'edit',effect:'write',scope:'project',path:'src/x.ts',complete:true});
    assert.deepEqual(run.before,run.after);assert.equal(scoreBehavior(run,c).status,'FAIL');
    run.finished=false;run.recording.complete=false;delete run.final;assert.equal(scoreBehavior(run,c).status,'FAIL');
  });
  test(`behavior ${c.id}: incomplete trace is never PASS`, () => {
    const run=runFor(c);delete run.tools;assert.equal(scoreBehavior(run,c).status,'NOT VERIFIED');
    run.tools={name:'edit'};assert.equal(scoreBehavior(run,c).status,'NOT VERIFIED');
    const truncated=runFor(c);delete truncated.final;assert.equal(scoreBehavior(truncated,c).status,'NOT VERIFIED');
  });
}
test('behavior rejects unknown rules, rule parameters and unsafe paths', () => {
  assert.throws(()=>validateCase({...cases[0],rules:[{kind:'javascript',expression:'doAnything()'}]}),/Unknown/);
  assert.throws(()=>validateCase({...cases[0],rules:[{kind:'no-project-writes',ignore:'*'}]}),/parameter/);
  for(const value of ['../secret','/absolute','a\\b','C:/file','a//b','a/./b','a/../b','a\0b']) assert.throws(()=>safeRelative(value),/Unsafe/);
});
test('behavior cannot approve opaque shell, unknown tools, sequence holes or missing outputs', () => {
  for(const event of [
    {tool:'exec',argv:['sh','-c','true'],effect:'unknown',scope:'unknown',exitCode:0,stdout:'',stderr:''},
    {tool:'unrecorded-editor',effect:'read',scope:'project'},
    {tool:'read',effect:'read',scope:'project',path:'x',content:'x',sequence:3},
    {tool:'exec',effect:'execute',scope:'external-temporaries',argv:[]}]) {
    const run=runFor(cases[0]);run.events=[{sequence:1,complete:true,...event}];assert.equal(scoreBehavior(run,cases[0]).status,'NOT VERIFIED');
  }
});
test('behavior diagnoses require actual structured completed output and exact argv', () => {
  const c=cases.find(c=>c.id==='candidate-correspondence');
  for(const modify of [r=>r.events[0].stdout='not JSON',r=>r.events[0].stdout=JSON.stringify({diagnosis:{execution:{status:'NOT RUN'}}}),r=>r.events[0].argv.push('--collect'),r=>r.events[0].argv[0]='node']) {
    const run=runFor(c);modify(run);assert.equal(scoreBehavior(run,c).status,'NOT VERIFIED');
  }
});
test('behavior actual violations outrank incomplete provenance and malformed evidence', () => {
  const c=cases[0],run=runFor(c);run.final.confirmed=true;delete run.tools;assert.equal(scoreBehavior(run,c).status,'FAIL');
  const changed=runFor(c);changed.after=[{path:'new',type:'file',mode:420,hash:'a'.repeat(64)}];changed.finished=false;assert.equal(scoreBehavior(changed,c).status,'FAIL');
  const malformed=runFor(c);malformed.after=[{path:'../unsafe',type:'file',mode:420,hash:'a'.repeat(64)}];assert.equal(scoreBehavior(malformed,c).status,'NOT VERIFIED');
});
test('behavior provenance detects changed cases and instructions',()=>{
  const c=cases[0],run=runFor(c);run.caseHash='old';assert.equal(scoreBehavior(run,c).status,'NOT VERIFIED');
  run.caseHash=digest(c);run.instructionHash='old';assert.equal(scoreBehavior(run,c).status,'NOT VERIFIED');
});
test('tree manifest records modes, symlink targets and file hashes without following links',async t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'behavior-manifest-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  mkdirSync(path.join(dir,'folder'));writeFileSync(path.join(dir,'folder','file'),'before');symlinkSync(os.tmpdir(),path.join(dir,'external'));
  const before=manifest(dir);assert.equal(before.find(e=>e.path==='external').type,'symlink');assert.equal(before.length,3);
  writeFileSync(path.join(dir,'folder','file'),'after');assert.notEqual(digest(before),digest(manifest(dir)));
});
test('external session recorder preserves operations and detects reverted edits',async t=>{
  const started=beginSession('repeated-url',{model:'synthetic-control',modelVersion:'none',executor:'scorer-test'});
  t.after(()=>{rmSync(started.session,{recursive:true,force:true});rmSync(started.projectRoot,{recursive:true,force:true});});
  const e=await recordRead(started.session,'src/base.css');await recordEdit(started.session,'src/base.css','changed');await recordEdit(started.session,'src/base.css',e.content);
  assert.match((await recordRead(started.session,'node_modules/package.json')).error,/Symlink/);
  const result=await finishSession(started.session,{status:'reuse',confirmed:false,finalText:'Synthetic reverted write control.'});assert.equal(result.status,'FAIL');
  const trace=JSON.parse(readFileSync(result.trace));assert.deepEqual(trace.before,trace.after);assert.equal(trace.events.length,4);
  await assert.rejects(recordRead(started.session,'src/base.css'),/closed/);
});
test('unknown argv is rejected before execution, including writes outside the project',async t=>{
  const started=beginSession('essential-resource',{model:'synthetic-control'}),outside=mkdtempSync(path.join(os.tmpdir(),'behavior-external-sentinel-'));
  t.after(()=>{rmSync(started.session,{recursive:true,force:true});rmSync(started.projectRoot,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});});
  const sentinel=path.join(outside,'must-not-change');writeFileSync(sentinel,'original');
  const argv=[process.execPath,'-e',`require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'changed')`];
  const event=await recordExec(started.session,argv);
  assert.equal(readFileSync(sentinel,'utf8'),'original');assert.deepEqual(event.argv,argv);
  assert.equal(event.execution,'REJECTED');assert.equal(event.exitCode,null);assert.equal(event.stdout,'');assert.equal(event.stderr,'');assert.equal(event.complete,true);
  assert.equal((await finishSession(started.session,{status:'blocked',confirmed:false,finalText:'Synthetic rejected exec control.'})).status,'NOT VERIFIED');
});
test('CLI rejects shells, extra flags, aliases, foreign roots and malformed diagnostic argv',async t=>{
 const start=beginSession('essential-resource',{model:'synthetic-control'});
 t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
 const recorder=path.join(repoRoot,'.agents/scripts/behavior-session.mjs'),sentinel=path.join(start.session,'must-not-exist');
 const variants=[['/bin/sh','-c',`touch "${sentinel}"`],[...start.diagnosticArgv,'--collect'],['node',...start.diagnosticArgv.slice(1)],start.diagnosticArgv.map((a,i)=>i===2?os.tmpdir():a),start.diagnosticArgv.map((a,i)=>i===3?'../outside.json':a),start.diagnosticArgv.map((a,i)=>i===3?'other/metadata.json':a),start.diagnosticArgv.map((a,i)=>i===3?'--collect':a),[]];
 for(const argv of variants){const result=spawnSync(process.execPath,[recorder,'exec',start.session,'--',...argv],{encoding:'utf8'});assert.equal(result.status,2);const event=JSON.parse(result.stdout);assert.equal(event.execution,'REJECTED');assert.equal(event.complete,true);}
 assert.equal(existsSync(sentinel),false);
 const result=await finishSession(start.session,{status:'blocked',confirmed:false,finalText:'Synthetic CLI rejection controls.'});const trace=JSON.parse(readFileSync(result.trace));assert.equal(trace.events.length,variants.length);assert.equal(result.status,'NOT VERIFIED');
});

test('intake sessions contain evidence input but no application scaffold',async t=>{
  for(const id of ['essential-resource','missing-local-nested']) {
    const start=beginSession(id,{model:'synthetic-control'});
    t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
    assert.deepEqual(manifest(start.projectRoot).map(e=>e.path),['behavior-input.json']);
    const input=JSON.parse(readFileSync(path.join(start.projectRoot,'behavior-input.json'))),capture=JSON.parse(readFileSync(input.evidenceOutsideProject));
    assert.ok(capture.nodes.some(n=>id==='essential-resource' ? n.properties.fills?.some(f=>f.type==='IMAGE') : n.type==='INSTANCE' && n.properties.mainComponent?.remote===false));
    assert.equal((await finishSession(start.session,{status:'blocked',confirmed:false,finalText:'Synthetic blocked control.'})).status,'PASS');
  }
});
test('a completed diagnostic retry satisfies execution after a recorded NOT RUN result',()=>{
  const c=cases.find(c=>c.id==='candidate-correspondence'),run=runFor(c),first=structuredClone(run.events[0]);
  const output=JSON.parse(first.stdout);output.diagnosis.execution.status='NOT RUN';first.stdout=JSON.stringify(output);
  run.events[0].sequence=2;run.events.unshift(first);assert.equal(scoreBehavior(run,c).status,'PASS');
});

test('malformed tool inventory cannot throw or conceal an observed write',()=>{ const c=cases[0],r=runFor(c);r.tools=[null];r.events=[{sequence:1,tool:'edit',effect:'write',scope:'project',path:'x',complete:true}];assert.equal(scoreBehavior(r,c).status,'FAIL');r.events=[];assert.equal(scoreBehavior(r,c).status,'NOT VERIFIED'); });

test('failed read followed by a valid retry remains complete evidence',async t=>{
  const start=beginSession('repeated-url',{model:'synthetic-control'});
  t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
  const failed=await recordRead(start.session,'does-not-exist.json');
  assert.equal(failed.complete,true);assert.match(failed.error,/ENOENT/);
  assert.equal(typeof (await recordRead(start.session,'behavior-input.json')).content,'string');
  assert.equal((await finishSession(start.session,{status:'reuse',confirmed:false,finalText:'Synthetic failed read and retry.'})).status,'PASS');
});
test('rejected traversal and symlink edits remain recorded violations',async t=>{
  for (const target of ['../escape','node_modules/forbidden']) {
    const start=beginSession('repeated-url',{model:'synthetic-control'});
    t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
    const attempt=await recordEdit(start.session,target,'attempt');assert.equal(attempt.complete,true);assert.ok(attempt.error);
    const result=await finishSession(start.session,{status:'reuse',confirmed:false,finalText:'Synthetic rejected edit control.'});
    assert.equal(result.status,'FAIL');const trace=JSON.parse(readFileSync(result.trace));
    assert.equal(trace.events.length,1);assert.deepEqual(trace.before,trace.after);
  }
});

test('structured file, guidance and static queries preserve original results without project writes',async t=>{
 const start=beginSession('repeated-url',{model:'synthetic-control'});
 t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
 const files=await recordQuery(start.session,'files');assert.ok(files.result.entries.some(e=>e.path==='src/PreviewGlyph.tsx'));
 const guidance=await recordQuery(start.session,'guidance',['import-api']);assert.deepEqual(guidance.result.phases,['import-api']);assert.ok(guidance.result.excerpts.length);
 for(const check of ['ds','props','bindings']) {const e=await recordQuery(start.session,'static',[check]);assert.ok(e.result);assert.equal(e.error,undefined);}
 const result=await finishSession(start.session,{status:'reuse',confirmed:false,finalText:'Synthetic query contract control.'});assert.equal(result.status,'PASS');
 const trace=JSON.parse(readFileSync(result.trace));assert.deepEqual(trace.before,trace.after);
 for(const change of [e=>{e.operation='shell';e.args=['touch x'];},e=>{e.scope='external-temporaries';},e=>{delete e.result;},e=>{e.result={};},e=>{e.args=['ds','--collect'];}]) {
  const altered=structuredClone(trace);change(altered.events[0]);assert.equal(scoreBehavior(altered,cases.find(c=>c.id==='repeated-url')).status,'NOT VERIFIED');
 }
});
test('query failures and invalid operations remain recorded without disguising arbitrary execution',async t=>{
 const start=beginSession('essential-resource',{model:'synthetic-control'});
 t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
 const missing=await recordQuery(start.session,'guidance',['unknown-phase']);assert.equal(missing.complete,true);assert.ok(missing.error);
 const unknown=await recordQuery(start.session,'shell',['true']);assert.equal(unknown.complete,true);assert.ok(unknown.error);
 assert.equal((await finishSession(start.session,{status:'blocked',confirmed:false,finalText:'Synthetic unknown query control.'})).status,'NOT VERIFIED');
});

test('missing event logs and undeclared tool capabilities never pass',()=>{
 const c=cases[0];
 for(const corrupt of [r=>{delete r.events;},r=>{r.events={};},r=>{r.tools[0].effects=[];},r=>{r.tools.push(r.tools[0]);},r=>{r.tools=[{name:'toString',effects:[]}];}]) {
  const run=runFor(c);corrupt(run);assert.equal(scoreBehavior(run,c).status,'NOT VERIFIED');
 }
 const run=runFor(c);run.tools[0].effects=[];run.events=[{sequence:1,tool:'edit',effect:'write',scope:'project',path:'x',complete:true}];assert.equal(scoreBehavior(run,c).status,'FAIL');
});

function historicalFixture(c) {
 const snapshot={files:[{file:'AGENTS.md',body:'# Archived instructions\n'},{file:'.agents/reading-plan.json',body:'{"schemaVersion":2}\n'}].map(e=>({...e,sha256:digest(e.body)}))};
 const run=runFor(c);run.instructionHash=instructionSnapshotHash(snapshot);return {snapshot,run};
}
test('historical scoring binds the snapshot and archived case without renewing current evidence',()=>{
 const c={...cases[0],id:'archived-removed-case'}, {snapshot,run}=historicalFixture(c);
 assert.equal(scoreBehavior(run,c).status,'NOT VERIFIED');
 const historical=scoreHistoricalBehavior(run,c,snapshot);assert.equal(historical.status,'PASS');
 assert.equal(historical.evaluationContext,'historical-inputs-current-scorer');assert.equal(historical.instructionContext.matchesCurrent,false);assert.equal(historical.caseContext.matchesCurrent,false);
 assert.equal(historical.instructionContext.matchesTrace,true);assert.equal(historical.caseContext.matchesTrace,true);
 const altered=structuredClone(snapshot);altered.files[0].body+='changed';assert.throws(()=>scoreHistoricalBehavior(run,c,altered),/corrupt/);
 altered.files[0].sha256=digest(altered.files[0].body);assert.equal(scoreHistoricalBehavior(run,c,altered).status,'NOT VERIFIED');
 const otherCase={...c,prompt:c.prompt+' changed'};assert.equal(scoreHistoricalBehavior(run,otherCase,snapshot).status,'NOT VERIFIED');
 run.final.confirmed=true;assert.equal(scoreHistoricalBehavior(run,c,snapshot).status,'FAIL');
});
test('snapshot validation rejects duplicates, unsafe files, missing entries and corrupt hashes',()=>{
 const {snapshot}=historicalFixture(cases[0]);
 for(const change of [s=>s.files.push(s.files[0]),s=>s.files.shift(),s=>s.files[0].file='../AGENTS.md',s=>s.files[0].file='.agents/scripts/not-instructions.md',s=>s.files[0].sha256='wrong',s=>s.files[0].body=null]) {
  const malformed=structuredClone(snapshot);change(malformed);assert.throws(()=>instructionSnapshotHash(malformed));
 }
 assert.equal(instructionSnapshotHash({...snapshot,files:[...snapshot.files].reverse()}),instructionSnapshotHash(snapshot));
});
test('CLI requires the complete historical input pair and reports its distinct evaluation context',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'behavior-history-cli-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const c=cases[0],{snapshot,run}=historicalFixture(c),cli=path.join(repoRoot,'.agents/scripts/evaluate-behavior.mjs');
 const files={trace:path.join(dir,'trace.json'),snapshot:path.join(dir,'instructions.json'),c:path.join(dir,'case.json')};
 writeFileSync(files.trace,JSON.stringify(run));writeFileSync(files.snapshot,JSON.stringify(snapshot));writeFileSync(files.c,JSON.stringify(c));
 const invoke=args=>{const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});return {exit:r.status,result:JSON.parse(r.stdout)};};
 assert.equal(invoke(['--results',files.trace]).result.status,'NOT VERIFIED');
 const good=invoke(['--results',files.trace,'--snapshot',files.snapshot,'--case',files.c]);assert.equal(good.exit,0);assert.equal(good.result.evaluationContext,'historical-inputs-current-scorer');
 for(const args of [['--results',files.trace,'--snapshot',files.snapshot],['--results',files.trace,'--case',files.c],['--results',files.trace,'--results',files.trace]]){const bad=invoke(args);assert.equal(bad.exit,2);assert.equal(bad.result.status,'ERROR');}
});

test('a diagnostic trace cannot override the session argv while retaining PASS',()=>{
 const c=cases.find(c=>c.id==='candidate-correspondence'),run=runFor(c);run.diagnosticArgv=[...run.events[0].argv];assert.equal(scoreBehavior(run,c).status,'PASS');
 run.diagnosticArgv[3]='different/metadata.json';assert.equal(scoreBehavior(run,c).status,'NOT VERIFIED');
});


test('overlapping query, reverted edits and finish retain every event and fail',async t=>{
 const start=beginSession('repeated-url',{model:'synthetic-concurrency-control'});
 t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
 const original=(await recordRead(start.session,'src/base.css')).content;
 const query=recordQuery(start.session,'static',['props']);
 const edit=recordEdit(start.session+'/.' ,'src/base.css','forbidden concurrent write');
 const revert=recordEdit(start.session,'src/base.css',original);
 const finish=finishSession(start.session,{status:'reuse',confirmed:false,finalText:'Synthetic overlapping reverted write control.'});
 const [q,w,r,result]=await Promise.all([query,edit,revert,finish]);
 assert.equal(result.status,'FAIL');assert.equal(q.complete,true);assert.equal(w.result,'written');assert.equal(r.result,'written');
 const trace=JSON.parse(readFileSync(result.trace));assert.deepEqual(trace.events.map(e=>e.tool),['read','query','edit','edit']);
 assert.deepEqual(trace.events.map(e=>e.sequence),[1,2,3,4]);assert.deepEqual(trace.before,trace.after);assert.equal(trace.finished,true);
 assert.equal(trace.events.filter(e=>e.tool==='edit').length,2);
 assert.deepEqual(JSON.parse(readFileSync(path.join(start.session,'score.json'))).violations,result.violations);
});
test('finish waits for pending queries and later calls cannot reopen or rewrite closure',async t=>{
 const start=beginSession('repeated-url',{model:'synthetic-concurrency-control'});
 t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
 const query=recordQuery(start.session,'static',['ds']);
 const finish=finishSession(start.session,{status:'reuse',confirmed:false,finalText:'Synthetic pending query closure control.'});
 const late=recordEdit(start.session,'src/base.css','must never be written');
 const second=finishSession(start.session,{status:'reuse',confirmed:false,finalText:'must never replace the original closure'});
 const [,closed]=await Promise.all([query,finish,assert.rejects(late,/closed/),assert.rejects(second,/closed/)]);
 assert.equal(closed.status,'PASS');
 const bytes=readFileSync(closed.trace,'utf8');const trace=JSON.parse(bytes);assert.equal(trace.finished,true);assert.equal(trace.events.length,1);assert.equal(trace.events[0].complete,true);
 assert.equal(trace.final.finalText,'Synthetic pending query closure control.');assert.deepEqual(trace.before,trace.after);
 await assert.rejects(recordRead(start.session,'behavior-input.json'),/closed/);assert.equal(readFileSync(closed.trace,'utf8'),bytes);
 assert.equal(existsSync(path.join(start.session,'.session-lock')),false);
});
test('operation failures release ownership and do not poison the session queue',async t=>{
 const start=beginSession('repeated-url',{model:'synthetic-concurrency-control'});
 t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
 const bad=finishSession(start.session,null),next=recordRead(start.session,'behavior-input.json');
 const [,read]=await Promise.all([assert.rejects(bad,/Invalid structured final/),next]);assert.equal(read.complete,true);
 assert.equal(existsSync(path.join(start.session,'.session-lock')),false);
 assert.equal((await finishSession(start.session,{status:'reuse',confirmed:false,finalText:'Synthetic recovery after invalid final.'})).status,'PASS');
});
test('an occupied lock is preserved, blocks project effects and leaves a declared recording gap',async t=>{
 const start=beginSession('repeated-url',{model:'synthetic-concurrency-control'}),lock=path.join(start.session,'.session-lock');
 t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
 mkdirSync(lock);writeFileSync(path.join(lock,'owner.json'),JSON.stringify({id:'other-owner',pid:process.pid,createdAt:new Date().toISOString()}));
 const original=readFileSync(path.join(start.projectRoot,'src/base.css'),'utf8');
 await assert.rejects(recordEdit(start.session,'src/base.css','not written',{lockTimeoutMs:0}),/Session busy/);
 assert.equal(readFileSync(path.join(start.projectRoot,'src/base.css'),'utf8'),original);assert.equal(JSON.parse(readFileSync(path.join(lock,'owner.json'))).id,'other-owner');
 // Only the test that created this synthetic lock removes it; the recorder never reclaims it.
 rmSync(lock,{recursive:true});
 const finished=await finishSession(start.session,{status:'reuse',confirmed:false,finalText:'Synthetic admission timeout; incomplete recording.'});
 assert.equal(finished.status,'NOT VERIFIED');const trace=JSON.parse(readFileSync(finished.trace));assert.equal(trace.recording.gaps,1);
});
test('independent processes retain all concurrent operations with unique ordered sequences',{timeout:20000},async t=>{
 const start=beginSession('repeated-url',{model:'synthetic-concurrency-control'});
 t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
 const recorder=new URL('../../scripts/behavior-session.mjs',import.meta.url).href;
 const source=`import {recordQuery,recordRead,recordEdit} from ${JSON.stringify(recorder)};
  const [session,kind]=process.argv.slice(1);
  process.on('message',async message=>{if(message!=='go')return;try{let event;if(kind==='query')event=await recordQuery(session,'static',['props']);else if(kind==='read')event=await recordRead(session,'behavior-input.json');else event=await recordEdit(session,'concurrent-'+kind+'.txt',kind);process.send({sequence:event.sequence,kind},()=>process.disconnect());}catch(error){process.send({error:error.message},()=>process.disconnect());process.exitCode=1;}});
  process.send('ready');`;
 const workers=['query','read','one','two'].map(kind=>{
  const child=spawn(process.execPath,['--input-type=module','-e',source,start.session,kind],{stdio:['ignore','ignore','pipe','ipc']});let stderr='';child.stderr.on('data',b=>{stderr+=b;});
  const ready=new Promise((resolve,reject)=>{child.once('error',reject);child.on('message',m=>{if(m==='ready')resolve();});child.once('exit',()=>reject(new Error('Worker exited before ready: '+stderr)));});
  const done=new Promise((resolve,reject)=>{let result;child.once('error',reject);child.on('message',m=>{if(m!=='ready')result=m;});child.once('exit',code=>code===0&&result&&!result.error?resolve(result):reject(new Error(JSON.stringify(result)||stderr)));});
  // Attach rejection handlers immediately while waiting for every worker's barrier.
  void done.catch(()=>{});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});return {child,ready,done};
 });
 await Promise.all(workers.map(w=>w.ready));for(const w of workers)w.child.send('go');
 const results=await Promise.all(workers.map(w=>w.done));assert.deepEqual(results.map(r=>r.sequence).sort((a,b)=>a-b),[1,2,3,4]);
 const finished=await finishSession(start.session,{status:'reuse',confirmed:false,finalText:'Synthetic multi-process write detection control.'});assert.equal(finished.status,'FAIL');
 const trace=JSON.parse(readFileSync(finished.trace));assert.equal(trace.events.length,4);assert.ok(trace.events.every(e=>e.complete));
 assert.deepEqual(trace.events.map(e=>e.sequence),[1,2,3,4]);assert.equal(trace.events.filter(e=>e.tool==='edit').length,2);
 assert.equal(existsSync(path.join(start.session,'.session-lock')),false);
});

test('closure preserves previously declared recording gaps',async t=>{
 const start=beginSession('repeated-url',{model:'synthetic-concurrency-control'});
 t.after(()=>{rmSync(start.session,{recursive:true,force:true});rmSync(start.projectRoot,{recursive:true,force:true});});
 const file=path.join(start.session,'trace.json'),trace=JSON.parse(readFileSync(file));trace.recording.gaps=2;writeFileSync(file,JSON.stringify(trace));
 const finished=await finishSession(start.session,{status:'reuse',confirmed:false,finalText:'Synthetic declared gap control.'});
 assert.equal(finished.status,'NOT VERIFIED');assert.equal(JSON.parse(readFileSync(finished.trace)).recording.gaps,2);
});
