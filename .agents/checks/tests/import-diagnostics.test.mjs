import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createPreviewProject } from './fixtures/preview-project.mjs';
import { captureHash, loadSnapshot } from '../lib/figma-evidence.mjs';
import { createEvidenceSession } from '../lib/evidence-session.mjs';
import { importDiagnostics } from '../lib/import-diagnostics.mjs';
import { inlineTokenUsage } from '../lib/style-token-usage.mjs';
import { verifyTokenStyles } from '../lib/token-styles.mjs';
import { verifyImports } from '../verify-imports.mjs';
import { finalizeImport } from '../../skills/create-ds-from-figma/scripts/finalize-import.mjs';

function fixture(t) {
  const f = createPreviewProject(); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const read = file => JSON.parse(readFileSync(path.join(f.root, file), 'utf8'));
  const write = (file, data) => writeFileSync(path.join(f.root, file), typeof data === 'string' ? data : JSON.stringify(data));
  const metadata = read(f.metadataPath), snapshotPath = metadata.evidence.snapshot;
  return { ...f, read, write, metadata, snapshotPath };
}

test('external FLOAT consumers request a project serialization and clear the action only with a valid decision', t => {
  const f = fixture(t), id = 'external-radius';
  f.metadata.externalVariables = [{ id, type: 'FLOAT', value: 6, cssName: '--lib-radius', source: 'FILE:1:3' }];
  f.metadata.bindings = [{ variableId: id, node: 'FILE:1:3', figmaProperty: 'cornerRadius' }];
  f.write(f.metadataPath, f.metadata);
  assert.deepEqual(importDiagnostics(f.root).nextActions.find(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION').resources, [id]);
  const statePath = 'design-system/relationships/figma-state.json', state = f.read(statePath);
  state.externalSerialization = { [id]: { css: { kind: 'unit', unit: 'px' }, source: { type: 'user' } } };
  f.write(statePath, state);
  assert.ok(!importDiagnostics(f.root).nextActions.some(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION'));
});

test('snapshot failures distinguish empty, incompatible, corrupt and unreadable, also with a cache', t => {
  const f = fixture(t), initial = f.read(f.snapshotPath), evidenceSession = createEvidenceSession(f.root);
  for (const options of [{}, { evidenceSession }]) {
    for (const [kind, change] of [
      ['EMPTY', s => { s.capture.nodes = []; s.capture.observations = []; }],
      ['INCOMPATIBLE', s => { s.capture.source.collector = 'unsupported'; }],
      ['CORRUPT', s => { s.capture.observations.pop(); }],
    ]) {
      const snapshot = structuredClone(initial); change(snapshot); snapshot.hash = captureHash(snapshot.capture); f.write(f.snapshotPath, snapshot);
      assert.throws(() => loadSnapshot(f.root, f.snapshotPath, options), e => e.captureDiagnostic?.kind === kind);
      assert.equal(importDiagnostics(f.root).nextActions[0].code, kind === 'CORRUPT' ? 'RESTORE_OR_INSPECT_CAPTURE' : 'OBTAIN_VALID_CAPTURE');
    }
    for (const value of ['not JSON', null, { ...initial, hash: '0'.repeat(64) }]) {
      f.write(f.snapshotPath, value);
      assert.throws(() => loadSnapshot(f.root, f.snapshotPath, options), e => e.captureDiagnostic?.kind === 'CORRUPT');
    }
    f.write(f.snapshotPath, { ...initial, schemaVersion: 99 });
    assert.throws(() => loadSnapshot(f.root, f.snapshotPath, options), e => e.captureDiagnostic?.kind === 'INCOMPATIBLE');
    rmSync(path.join(f.root, f.snapshotPath));
    assert.throws(() => loadSnapshot(f.root, f.snapshotPath, options), e => e.captureDiagnostic?.kind === 'UNREADABLE' && e.code === 'ENOENT');
    f.write(f.snapshotPath, initial); assert.equal(loadSnapshot(f.root, f.snapshotPath, options).hash, initial.hash);
  }
  assert.throws(() => loadSnapshot(f.root, '../outside.json'), /Invalid snapshot path/);
});

test('FLOAT diagnostics follow bindings, CSS, inline values and aliases without counting unused declarations', t => {
  const f = fixture(t), statePath = 'design-system/relationships/figma-state.json', state = f.read(statePath), tokenPath = 'design-system/tokens/Colors.json', tokens = f.read(tokenPath);
  const float = (id, valuesByMode = { Default: 4 }) => ({ id, type: 'FLOAT', cssName: `--ds-${id}`, valuesByMode });
  Object.assign(tokens.variables, { direct: float('direct'), alias: float('alias', { Default: { source: 'local', targetVariableId: 'direct' } }), spare: float('spare'), bound: float('bound') });
  f.write(tokenPath, tokens);
  const code = `import './PreviewGlyph.module.css'; const supplied = { padding: 'var(--ds-alias)' }; export function PreviewGlyph(){ return <span style={supplied}/> }`;
  f.write(f.metadata.code.path, code);
  f.write('src/PreviewGlyph.module.css', ':root { --unused: var(--ds-spare); --local: var(--ds-direct); } .root { margin: var(--local); }');
  f.metadata.bindings = [{ variableId: 'bound' }]; f.write(f.metadataPath, f.metadata);
  const result = importDiagnostics(f.root), component = result.components[0], pending = component.serialization.pending;
  assert.ok(pending.find(v => v.id === 'direct').references.some(r => r.kind === 'css'));
  assert.ok(pending.find(v => v.id === 'direct').references.some(r => r.kind === 'inline'));
  assert.ok(pending.find(v => v.id === 'bound').references.some(r => r.kind === 'binding'));
  assert.deepEqual(pending.find(v => v.id === 'spare').references, []);
  const action = result.nextActions.find(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION');
  assert.deepEqual(new Set(action.resources), new Set(['direct', 'alias', 'bound']));
  assert.equal(action.component, 'PreviewGlyph'); assert.equal(action.command, null);
  assert.ok(verifyTokenStyles(f.root, f.metadata).errors.some(e => e.includes('--ds-alias')));
  state.collections.COL.serialization = Object.fromEntries(['direct', 'bound', 'spare'].map(id => [id, { css: { kind: 'unitless' }, source: { type: 'user' } }]));
  f.write(statePath, state);
  assert.ok(!importDiagnostics(f.root).nextActions.some(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION'));
});

test('inline alias declarations need a consumer, preserve scoped chains and retain external consumer uncertainty', t => {
  const f = fixture(t), tokenPath = 'design-system/tokens/Colors.json', tokens = f.read(tokenPath);
  for (const id of ['used', 'spare']) tokens.variables[id] = { id, type: 'FLOAT', cssName: `--ds-${id}`, valuesByMode: { Default: 4 } };
  f.write(tokenPath, tokens);
  const run = code => {
    f.write(f.metadata.code.path, code);
    return importDiagnostics(f.root);
  };
  const unused = run(`export const A=()=> <span style={{'--local':'var(--ds-spare)'}}/>`);
  assert.deepEqual(unused.components[0].serialization.pending.find(v => v.id === 'spare').references, []);
  assert.ok(!unused.nextActions.some(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION'));
  assert.ok(verifyTokenStyles(f.root, f.metadata).errors.some(e => e.includes('--ds-spare')), 'definition validation remains independent of consumption');
  const used = run(`export const A=()=> <><span style={{'--local':'var(--ds-used)','--bridge':'var(--local)',padding:'var(--bridge)',margin:'var(--bridge)'}}/><span style={{'--local':'var(--ds-spare)'}}/></>`);
  const action = used.nextActions.find(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION');
  assert.deepEqual(action?.resources, ['used'], 'another object with an equal alias name does not contaminate local resolution');
  assert.deepEqual(new Set(action.variables[0].references.map(r => r.property)), new Set(['padding', 'margin']));
  assert.ok(action.variables[0].references.every(r => r.aliasChain.join(',') === '--bridge,--local'));
  const overwritten = run(`export const A=()=> <span style={{...{'--local':'var(--ds-spare)'},'--local':'var(--ds-used)',padding:'var(--local)'}}/>`);
  assert.deepEqual(overwritten.nextActions.find(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION')?.resources, ['used']);
  const diamond = run(`export const A=()=> <span style={{'--a':'var(--ds-used)','--b':'var(--ds-used)',padding:'calc(var(--a) + var(--b))'}}/>`);
  const diamondAction = diamond.nextActions.find(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION');
  assert.deepEqual(diamondAction?.resources, ['used']);
  assert.equal(diamondAction.variables[0].references.length, 1, 'one consumer is not duplicated by two alias paths');
  const inherited = run(`export const A=()=> <div style={{'--local':'var(--ds-used)'}}><span style={{padding:'var(--local)'}}/></div>`);
  assert.deepEqual(inherited.nextActions.find(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION')?.resources, ['used']);
  assert.equal(inherited.components[0].serialization.consumption.status, 'PARTIAL', 'cross-element inheritance is not proven');
  f.write('src/PreviewGlyph.module.css', '.root {padding:var(--local)}');
  const external = run(`import './PreviewGlyph.module.css'; export const A=()=> <span style={{'--local':'var(--ds-used)'}}/>`);
  assert.deepEqual(external.nextActions.find(a => a.code === 'RESOLVE_FLOAT_SERIALIZATION')?.resources, ['used']);
  assert.equal(external.components[0].serialization.consumption.status, 'PARTIAL');
  assert.ok(external.warnings.some(w => w.includes('element matching and inheritance')));
  const cycle = inlineTokenUsage('view.tsx', `const A=()=> <span style={{'--a':'var(--b)','--b':'var(--a)',padding:'var(--a)'}}/>`, '--');
  assert.deepEqual(cycle.consumedReferences, []); assert.ok(cycle.warnings.length, 'cycles remain partial, never infinite traversal');
});

test('dynamic, ambiguous and unreadable style inputs remain unknown, never no-consumption claims', t => {
  const sample = inlineTokenUsage('view.tsx', `const style = getStyle(); export const View = () => <span style={style}/>`, '--ds-');
  assert.equal(sample.references.length, 0); assert.ok(sample.warnings.some(w => w.includes('unknown')));
  for (const code of [
    `function other(){const style={padding:'var(--ds-x)'}} export const View=()=> <span style={style}/>`,
    `const style={padding:'var(--ds-x)'}; export const View=(style)=> <span style={style}/>`,
  ]) {
    const result = inlineTokenUsage('view.tsx', code, '--ds-');
    assert.deepEqual(result.references, []); assert.ok(result.warnings.length);
  }
  const f = fixture(t);
  f.write('design-system/tokens/Colors.json', 'broken');
  const result = importDiagnostics(f.root);
  assert.equal(result.components[0].serialization.consumption.status, 'UNKNOWN');
  assert.ok(result.nextActions.some(a => a.code === 'REVIEW_TOKEN_CONSUMPTION'));
  f.write(f.metadataPath, null);
  const unreadable = importDiagnostics(f.root);
  assert.deepEqual(unreadable.components, []); assert.ok(unreadable.warnings.some(w => w.includes('unknown')));
});

test('literal inline definitions do not produce missing-token errors and dynamic imports stay partial', t => {
  const f = fixture(t);
  f.write(f.metadata.code.path, `export function PreviewGlyph(){return <span style={{'--ds-local':'4px',padding:'var(--ds-local)'}}/>}`);
  assert.deepEqual(verifyTokenStyles(f.root, f.metadata).errors, []);
  f.write(f.metadata.code.path, `import('./unknown.css'); export function PreviewGlyph(){return <span style={readStyle()}/>}`);
  const result = verifyTokenStyles(f.root, f.metadata);
  assert.equal(result.consumption.status, 'PARTIAL'); assert.ok(result.warnings.length);
});

test('inline custom properties are scoped to their own style object and accept numeric values', t => {
  const f = fixture(t), run = code => { f.write(f.metadata.code.path, code); return verifyTokenStyles(f.root, f.metadata); };
  assert.deepEqual(run(`export const A = () => <span style={{'--ds-opacity':0.5,'--ds-offset':-2,opacity:'var(--ds-opacity)',margin:'var(--ds-offset)'}}/>`).errors, []);
  const siblings = run(`export const B = () => <><div style={{'--ds-sibling':'red'}}/><span style={{color:'var(--ds-sibling)'}}/></>`);
  assert.deepEqual(siblings.errors, [], 'inheritance between elements is unverified, not a proven absence');
  assert.ok(siblings.warnings.some(w => w.includes('--ds-sibling') && w.includes('another style object')));
  assert.equal(siblings.consumption.status, 'PARTIAL');
  assert.ok(run(`export const C = () => <span style={{color:'var(--ds-absent)'}}/>`).errors.some(e => e.includes('--ds-absent')), 'a token defined nowhere is still an error');
  assert.ok(run(`export const D = () => <span style={{'--ds-flag':true,color:'var(--ds-flag)'}}/>`).errors.some(e => e.includes('--ds-flag')), 'booleans are not rendered by React and define nothing');
});

test('inline definitions and references respect final assignments and clearing values after spreads', t => {
  const f = fixture(t), run = style => {
    f.write(f.metadata.code.path, `const base = {'--ds-local': '4px', padding: 'var(--ds-overwritten)'}; export const A = () => <span style={${style}}/>`);
    return verifyTokenStyles(f.root, f.metadata);
  };
  for (const clear of ['null', 'false', 'true', '""']) {
    const result = run(`{...base, '--ds-local': ${clear}, padding: 'var(--ds-local)'}`);
    assert.ok(result.errors.some(e => e.includes('--ds-local')), `${clear} must not define a custom property`);
    assert.ok(!result.errors.some(e => e.includes('--ds-overwritten')), 'overwritten references are not consumed');
  }
  assert.ok(run(`{'--ds-local': '', padding: 'var(--ds-local)'}`).errors.some(e => e.includes('--ds-local')));
  assert.deepEqual(run(`{'--ds-local': null, ...base, padding: 'var(--ds-local)'}`).errors, [], 'later spreads may restore a definition');
  assert.deepEqual(run(`{...base, '--ds-local': 0, padding: 'var(--ds-local)'}`).errors, [], 'zero remains a valid definition');
  assert.ok(run(`{...base, ...{'--ds-local': null}, padding: 'var(--ds-local)'}`).errors.some(e => e.includes('--ds-local')));
  const dynamic = run(`{...base, ...readStyle(), padding: 'var(--ds-local)'}`);
  assert.equal(dynamic.consumption.status, 'PARTIAL');
  assert.deepEqual(dynamic.errors, [], 'unknown spreads do not prove that a definition is absent');
  assert.ok(dynamic.warnings.some(w => w.includes('neither presence nor absence') && w.includes('--ds-local')));
  assert.equal(dynamic.consumption.uncertainInlineReferences.length, 1);
  assert.equal(dynamic.consumption.uncertainInlineReferences[0].cssName, '--ds-local');
  const trailing = run(`{'--ds-local': '4px', padding: 'var(--ds-local)', ...readStyle()}`);
  assert.deepEqual(trailing.errors, []);
  assert.equal(trailing.consumption.status, 'PARTIAL');
  assert.equal(trailing.consumption.uncertainInlineReferences.length, 1);
  for (const clear of ['null', 'false', 'true', '""']) {
    const cleared = run(`{...base, ...readStyle(), '--ds-local': ${clear}, padding: 'var(--ds-local)'}`);
    assert.ok(cleared.errors.some(e => e.includes('--ds-local')), 'an explicit later clearing remains an absence');
    assert.deepEqual(cleared.consumption.uncertainInlineReferences, []);
  }
  const restored = run(`{...readStyle(), ...base, padding: 'var(--ds-local)'}`);
  assert.deepEqual(restored.errors, [], 'explicit later definitions survive unknown earlier spreads');
  assert.equal(restored.consumption.status, 'PARTIAL');
  assert.deepEqual(restored.consumption.uncertainInlineReferences, [], 'later known assignments settle the uncertainty');
});

test('dynamic custom values remain uncertain while transparent syntax wrappers preserve literal definitions', t => {
  const f = fixture(t), run = value => {
    f.write(f.metadata.code.path, `export const A = ({size = 4}) => <span style={{'--ds-local': ${value}, padding: 'var(--ds-local)'}}/>`);
    return verifyTokenStyles(f.root, f.metadata);
  };
  for (const value of ['size', 'readSize()', 'size > 0 ? size : null', '(size as number)', 'size!']) {
    const result = run(value);
    assert.deepEqual(result.errors, [], value);
    assert.equal(result.consumption.status, 'PARTIAL', value);
    assert.equal(result.consumption.uncertainInlineReferences[0]?.cssName, '--ds-local');
    assert.ok(result.warnings.some(w => w.includes('neither presence nor absence')));
    assert.deepEqual(inlineTokenUsage('view.tsx', `const A=()=> <span style={{'--ds-local': ${value}, padding: 'var(--ds-local)'}}/>`, '--').definitions, []);
  }
  for (const value of ["('4px' as string)", "(('4px' satisfies string))", '(0 as number)', '(-2 as number)', "('4px'!)"]) {
    const result = run(value);
    assert.deepEqual(result.errors, [], value);
    assert.deepEqual(result.warnings, [], value);
    assert.equal(result.consumption.status, 'STATIC_REFERENCES');
  }
  for (const value of ['(null as null)', '(false as boolean)', '(true satisfies boolean)', '("" as string)']) {
    const result = run(value);
    assert.ok(result.errors.some(e => e.includes('--ds-local')), value);
    assert.deepEqual(result.consumption.uncertainInlineReferences, []);
  }
  f.metadata.tokens = ['--ds-local'];
  assert.ok(run('size').errors.some(e => e.includes('--ds-local')), 'uncertain inline values do not bypass independent metadata obligations');
});

test('inline custom properties that are not proven definitions still consume the global token', () => {
  const consumed = style => inlineTokenUsage('view.tsx', `export const A = ({size, rest}) => <span style={${style}}/>`, '--').consumedReferences.map(r => r.cssName).sort();
  for (const cleared of ['null', 'false', 'true', "''", 'size']) assert.deepEqual(consumed(`{'--ds-x': ${cleared}, padding: 'var(--ds-x)'}`), ['--ds-x'], cleared);
  assert.deepEqual(consumed(`{'--ds-x': '4px', padding: 'var(--ds-x)'}`), [], 'a proven literal definition shadows the global token');
  assert.deepEqual(consumed(`{'--ds-x': 0, padding: 'var(--ds-x)'}`), []);
  assert.deepEqual(consumed(`{'--ds-x': 'var(--ds-size-1)', padding: 'var(--ds-x)'}`), ['--ds-size-1']);
  assert.deepEqual(consumed(`{'--ds-x': 'var(--ds-size-1)', padding: 'var(--ds-x)', ...rest}`), ['--ds-size-1', '--ds-x'], 'an unknown spread keeps both possibilities');
});

test('inline constant lookup respects lexical shadowing, destructuring and unrelated scopes', t => {
  const outer = `const style = {padding: 'var(--ds-ghost)'};`;
  for (const body of [
    `function A({style}) {return <span style={style}/>}`,
    `const A = ({style}) => <span style={style}/>`,
    `function A({appearance: style}) {return <span style={style}/>}`,
    `function A({nested: {style}}) {return <span style={style}/>}`,
    `function A({...style}) {return <span style={style}/>}`,
    `function A([style]) {return <span style={style}/>}`,
    `function A(props) {const {style} = props; return <span style={style}/>}`,
    `function A(props) {const [style] = props; return <span style={style}/>}`,
    `function A(props) {try {} catch (style) {return <span style={style}/>}}`,
  ]) {
    const result = inlineTokenUsage('view.tsx', outer + body, '--');
    assert.deepEqual(result.references, [], body);
    assert.ok(result.warnings.length, body);
  }
  const result = inlineTokenUsage('view.tsx', outer + `function other(style) {} function A(){const style={padding:'var(--ds-inner)'}; return <span style={style}/>} function B(){return <span style={style}/>}`, '--');
  assert.deepEqual(result.references.map(r => r.cssName), ['--ds-inner', '--ds-ghost']);
  assert.deepEqual(result.warnings, [], 'unrelated bindings do not poison lexical resolution');
});

test('unknown spreads may supply missing custom properties but later explicit clearing remains authoritative', t => {
  const f = fixture(t), run = style => {
    f.write(f.metadata.code.path, `export const A = ({style}) => <span style={${style}}/>`);
    return verifyTokenStyles(f.root, f.metadata);
  };
  for (const style of [
    `{...style, padding:'var(--ds-local)'}`,
    `{padding:'var(--ds-local)', ...style}`,
    `{'--ds-local':null, ...style, padding:'var(--ds-local)'}`,
    `{...style, '--ds-local':null, ...readStyle(), padding:'var(--ds-local)'}`,
  ]) {
    const result = run(style);
    assert.deepEqual(result.errors, [], style);
    assert.equal(result.consumption.status, 'PARTIAL');
    assert.equal(result.consumption.uncertainInlineReferences[0]?.cssName, '--ds-local');
  }
  for (const clear of ['null', 'false', 'true', '""']) {
    const result = run(`{...style, ...{'--ds-local':${clear}}, padding:'var(--ds-local)'}`);
    assert.ok(result.errors.some(e => e.includes('--ds-local')), clear);
    assert.deepEqual(result.consumption.uncertainInlineReferences, []);
  }
  const restored = run(`{...style, '--ds-local':4, padding:'var(--ds-local)'}`);
  assert.deepEqual(restored.errors, []);
  assert.deepEqual(restored.consumption.uncertainInlineReferences, []);
  f.metadata.tokens = ['--ds-local'];
  assert.ok(run(`{...style, padding:'var(--ds-local)'}`).errors.some(e => e.includes('--ds-local')), 'metadata obligations remain independent');
});

test('gate and finalization expose capture recovery even when component preflight fails; no writes or collection', async t => {
  const f = fixture(t), snapshot = f.read(f.snapshotPath);
  snapshot.capture.nodes = []; snapshot.capture.observations = []; snapshot.hash = captureHash(snapshot.capture); f.write(f.snapshotPath, snapshot);
  const before = readFileSync(path.join(f.root, f.snapshotPath));
  const gate = await verifyImports(f.root);
  assert.equal(gate.status, 'FAIL'); assert.equal(gate.application.status, 'NOT APPLICABLE');
  assert.ok(gate.nextActions.some(a => a.code === 'OBTAIN_VALID_CAPTURE'));
  const finalized = await finalizeImport(f.root, f.metadataPath, { diagnose: true });
  assert.equal(finalized.status, 'FAIL'); assert.equal(finalized.diagnosis, undefined);
  assert.ok(finalized.nextActions.some(a => a.code === 'OBTAIN_VALID_CAPTURE'));
  assert.deepEqual(readFileSync(path.join(f.root, f.snapshotPath)), before);
});

test('alias paths and modes deduplicate identical references without merging distinct source locations or bindings', t => {
  const f = fixture(t), tokenPath = 'design-system/tokens/Colors.json', tokens = f.read(tokenPath);
  tokens.variables.direct = { id: 'direct', type: 'FLOAT', cssName: '--ds-direct', valuesByMode: { Default: 4, Other: 4 } };
  tokens.variables.alias = { id: 'alias', type: 'FLOAT', cssName: '--ds-alias', valuesByMode: Object.fromEntries(['Default', 'Other'].map(mode => [mode, { source: 'local', targetVariableId: 'direct' }])) };
  f.write(tokenPath, tokens);
  f.metadata.bindings = [{ variableId: 'direct', node: 'FILE:one' }, { variableId: 'direct', node: 'FILE:two' }];
  f.write(f.metadata.code.path, `import './PreviewGlyph.module.css'; export const PreviewGlyph = () => <><span style={{padding:'var(--ds-alias)'}}/><span style={{padding:'var(--ds-alias)'}}/></>`);
  f.write('src/PreviewGlyph.module.css', ':root{--ds-alias:var(--ds-direct)} .one{padding:var(--ds-alias)} .two{padding:var(--ds-alias)}');
  const references = verifyTokenStyles(f.root, f.metadata).pendingFloats.find(v => v.id === 'direct').references;
  assert.equal(references.length, new Set(references.map(r => JSON.stringify(r))).size);
  assert.equal(references.filter(r => r.kind === 'css').length, 2);
  assert.equal(references.filter(r => r.kind === 'inline').length, 2);
  assert.deepEqual(new Set(references.filter(r => r.kind === 'binding').map(r => r.node)), new Set(['FILE:one', 'FILE:two']));
  for (const kind of ['css', 'inline']) assert.equal(new Set(references.filter(r => r.kind === kind).map(r => `${r.file}:${r.line}:${r.column}`)).size, 2);
});

test('dynamic inline warnings are grouped per file with all distinct positions retained and partial status', async t => {
  const f = fixture(t);
  const code = `export function PreviewGlyph({size, rest}){return <><span style={{width:size,height:size,...rest.style}}/><span style={rest.style}/></>}`;
  const inline = inlineTokenUsage('view.tsx', code, '--');
  assert.equal(inline.warnings.length, 1); assert.equal(inline.unknownLocations.length, 4);
  assert.equal(new Set(inline.unknownLocations.map(p => `${p.line}:${p.column}`)).size, 4);
  f.write(f.metadata.code.path, code);
  const tokens = verifyTokenStyles(f.root, f.metadata);
  assert.equal(tokens.consumption.status, 'PARTIAL');
  assert.deepEqual(tokens.consumption.unknownStyles, [{ file: f.metadata.code.path, locations: inline.unknownLocations }]);
  assert.equal(tokens.warnings.filter(w => w.includes('dynamic or ambiguous')).length, 1);
  const gate = await verifyImports(f.root);
  assert.equal(gate.warnings.filter(w => w.includes('dynamic or ambiguous inline style')).length, 1, 'the gate does not repeat the warning from static checks and recovery guidance');
  const many = inlineTokenUsage('many.tsx', `export const View=()=> <span style={{${Array.from({length: 9}, (_, i) => `p${i}:read()`).join(',')}}}/>`, '--');
  assert.equal(many.warnings.length, 1); assert.equal(many.unknownLocations.length, 9);
  assert.match(many.warnings[0], /remaining locations in consumption.unknownStyles/);
});
