import assert from 'node:assert/strict';
import { test } from 'node:test';
import postcss from 'postcss';
import { bindingCascade, bindingSyntaxProblem } from '../lib/binding-cascade.mjs';
import { compactCss, compactCases, compactTokens, escapedCssCases } from './fixtures/compact-control.mjs';

const tokens = new Set(Object.values(compactTokens));
const analyze = (css, selector = compactCases[0].selector) => bindingCascade(postcss.parse(css), selector,
  'background-color', '.disc', tokens, (a, b) => a === b || a === 'background' || a === 'all');

test('escaped imports, token names and property names never establish written identity', () => {
  for (const c of escapedCssCases) {
    const result = analyze(c.css);
    assert.equal(result.token, undefined, c.id);
    assert.match(result.reason, /Escaped CSS syntax not evaluated/, c.id);
  }
});

test('escaped selectors, values and contexts remain unverified while comments are harmless', () => {
  for (const css of [
    String.raw`.d\69sc{background-color:var(--example-surface)}`,
    String.raw`.disc{--local:var(--\65xample-surface);background-color:var(--local)}`,
    String.raw`.disc{--local:var(--example-surface) !important; background-color:var(--local)}
      .disc{--local:var(--example-hover) !im\70ortant}`,
  ]) assert.match(analyze(css).reason, /Escaped CSS syntax not evaluated/, css);
  assert.match(analyze(compactCss, String.raw`.d\69sc`).reason, /Escaped binding context/);
  const comments = String.raw`/* @im\70ort "ignored.css"; --\65xample-surface:red */` + compactCss;
  assert.equal(bindingSyntaxProblem(postcss.parse(comments)), null);
  assert.equal(analyze(comments).token, compactTokens.idle);
});

test('compact native-state rules resolve local chains under explicit selector facts', () => {
  for (const c of compactCases) {
    const result = analyze(compactCss, c.selector);
    assert.equal(result.token, c.expected, JSON.stringify({ c, result }));
    assert.ok(result.chain.includes('--control-paint'));
  }
});

test('source order is checked against the declared combination, not a universal state priority', () => {
  const c = compactCases.find(c => c.id === 'selected-hover');
  const changed = compactCss + '\n.input:hover + .disc { --control-paint: var(--example-hover); }';
  assert.equal(analyze(changed, c.selector).token, compactTokens.hover);
  assert.notEqual(analyze(changed, c.selector).token, c.expected);
});

test('importance and specificity take precedence over source order; repeated classes count', () => {
  const c = compactCases.find(c => c.id === 'selected-hover');
  for (const [before, after] of [
    ['.input:hover + .disc { --control-paint: var(--example-hover) !important; }', ''],
    ['.input.input:hover + .disc { --control-paint: var(--example-hover); }', ''],
  ]) {
    assert.equal(analyze(before + compactCss + after, c.selector).token, compactTokens.hover);
  }
});

test('unknown states/classes are not assumed false and unsupported rules never prove a binding', () => {
  for (const [css, context] of [
    [compactCss, '.input + .disc'],
    [compactCss, '.disc'],
    [compactCss, '.input:is(:hover, :checked) + .disc'],
    [compactCss, '.input:hover(invalid) + .disc'],
    [compactCss + ' @media (min-width:1px){.disc{background-color:red}}', compactCases[0].selector],
    [compactCss + ' @layer test {.disc{--control-paint:var(--example-hover)}}', compactCases[0].selector],
    [compactCss + ' .disc{background:red}', compactCases[0].selector],
    [compactCss + ' .disc{&:hover{--control-paint:var(--example-hover)}}', compactCases[0].selector],
    [compactCss + ' .other{--control-paint:var(--example-hover) !important}', compactCases[0].selector],
  ]) assert.ok(analyze(css, context).reason, JSON.stringify({ css, context }));
});

test('resolved declarations retain their selector/property trace and ignore unrelated property channels', () => {
  const result = analyze(compactCss + ' .disc{padding:3px}');
  assert.equal(result.token, compactTokens.idle);
  assert.deepEqual(result.declarations, [
    { selector: '.disc', property: 'background-color' },
    { selector: '.disc', property: '--control-paint' },
    { selector: '.disc', property: '--control-idle' },
  ]);
});

test('unexamined imports prevent a binding proof regardless of location, case or condition', () => {
  for (const statement of [
    '@import "./theme.css";',
    '@IMPORT url("./theme.css");',
    '@import "./theme.css" print;',
    '@import "./theme.css" layer(theme) supports(display:grid);',
    '@import url("https://example.invalid/theme.css");',
    '@import url("data:text/css,.disc%7B--control-paint%3Avar(--example-hover)%20!important%7D");',
  ]) {
    const result = analyze(statement + compactCss);
    assert.equal(result.token, undefined, statement);
    assert.match(result.reason, /@import dependencies not evaluated/, statement);
  }
  assert.equal(analyze('/* @import "not-a-rule.css"; */' + compactCss).token, compactTokens.idle);
});

test('inherited, cyclic, registered, fallback and shadowed token chains remain unverified', () => {
  for (const css of [
    '.root{--local:var(--example-surface)} .disc{background-color:var(--local)}',
    '.disc{--a:var(--b);--b:var(--a);background-color:var(--a)}',
    '.disc{background-color:var(--missing)}',
    '.disc{--a:var(--example-surface, red);background-color:var(--a)}',
    '.disc{--a:inherit;background-color:var(--a)}',
    '.disc{background-color:var(--example-surface)} .root{--example-surface:red}',
    '@property --a{syntax:"<color>";inherits:false;initial-value:red}.disc{--a:var(--example-surface);background-color:var(--a)}',
    '@PROPERTY --a{syntax:"<color>";inherits:false;initial-value:red}.disc{--a:var(--example-surface);background-color:var(--a)}',
  ]) assert.ok(analyze(css).reason, css);
});

test('CSS property names are case-insensitive but custom property names remain case-sensitive', () => {
  assert.ok(analyze(compactCss + ' .disc{BACKGROUND:red !important}').reason);
  assert.equal(analyze(compactCss.replace('background-color:', 'BACKGROUND-COLOR:')).token, compactTokens.idle);
  assert.ok(analyze('.disc{--Local:var(--example-surface);background-color:var(--local)}').reason);
});

test('a supplied ancestor is not confused with the target and sibling facts are not inherited', () => {
  const css = '.disc{background-color:var(--example-surface)} .root{background-color:var(--example-hover)}';
  // A root class could also be on the target: its absence is unknown, not disjoint.
  assert.ok(analyze(css).reason);
  assert.ok(analyze(compactCss, '.root.magic .input:hover .disc').reason);
  assert.ok(analyze(compactCss, '.disc:checked').reason);
});

test('positive and negative focus facts are supported without equating focus-visible with focus', () => {
  const css = '.disc{background-color:var(--example-surface)} .input:focus-visible+.disc{background-color:var(--example-hover)}';
  assert.equal(analyze(css, '.input:focus-visible+.disc').token, compactTokens.hover);
  assert.ok(analyze(css, '.input:focus+.disc').reason);
  assert.equal(analyze(css, '.input:not(:focus-visible)+.disc').token, compactTokens.idle);
});

test('an adjacent sibling never supplies an ancestor but preserves known common ancestors', () => {
  const base = '.disc{background-color:var(--example-surface)}';
  const descendant = base + '.input:hover .disc{background-color:var(--example-hover)}';
  assert.ok(analyze(descendant, '.input:hover + .disc').reason);
  assert.equal(analyze(descendant, '.input:hover .disc').token, compactTokens.hover);
  const commonAncestor = base + '.root.magic .disc{background-color:var(--example-magic)}';
  assert.equal(analyze(commonAncestor, '.root.magic > .input + .disc').token, compactTokens.magic);
});

test('child and adjacent-sibling combinators require the same immediate relationship', () => {
  const base = '.disc{background-color:var(--example-surface)}';
  for (const [ruleEdge, contextEdge] of [['>', '+'], ['+', '>'], ['+', ' '], ['>', ' ']]) {
    const css = base + `.input:hover ${ruleEdge} .disc{background-color:var(--example-hover)}`;
    const context = `.input:hover ${contextEdge} .disc`;
    assert.ok(analyze(css, context).reason, `${ruleEdge} against ${contextEdge}`);
    assert.equal(analyze(css, `.input:hover ${ruleEdge} .disc`).token, compactTokens.hover);
  }
});

test('class and native-state negations exclude only explicitly contradictory facts', () => {
  const base = '.disc{background-color:var(--example-surface)}';
  const modifier = base + '.disc:not(.magic){background-color:var(--example-hover)}';
  assert.equal(analyze(modifier, '.disc.magic').token, compactTokens.idle);
  assert.equal(analyze(modifier, '.disc:not(.magic)').token, compactTokens.hover);
  assert.ok(analyze(modifier, '.disc').reason);
  const state = base + '.input:not(:checked)+.disc{background-color:var(--example-hover)}';
  assert.equal(analyze(state, '.input:checked+.disc').token, compactTokens.idle);
  assert.equal(analyze(state, '.input:not(:checked)+.disc').token, compactTokens.hover);
  assert.ok(analyze(state, '.input+.disc').reason);
});

test('negated classes contribute specificity and contradictory contexts cannot prove a binding', () => {
  const css = '.disc:not(.magic){background-color:var(--example-hover)} .disc{background-color:var(--example-surface)}';
  assert.equal(analyze(css, '.disc:not(.magic)').token, compactTokens.hover);
  for (const context of ['.disc.magic:not(.magic)', '.disc:checked:not(:checked)']) {
    assert.ok(analyze(css, context).reason, context);
  }
});

test('a missing modifier on the nearest root does not rule out another matching ancestor', () => {
  const css = '.disc{background-color:var(--example-surface)} .magic .disc{background-color:var(--example-magic)}';
  assert.ok(analyze(css, '.root:not(.magic) > .input + .disc').reason);
  assert.equal(analyze(css, '.root.magic > .input + .disc').token, compactTokens.magic);
});

test('conditional rules and keyframes keep relevant bindings unverified without declaring a CSS defect', () => {
  const base = '.disc{background-color:var(--example-surface)}';
  for (const rule of [
    '@media (hover:hover){.input:hover+.disc{background-color:var(--example-hover)}}',
    '@layer theme{.disc{background-color:var(--example-hover)}}',
    '@keyframes flash{to{background-color:var(--example-hover)}}',
  ]) {
    const result = analyze(base + rule, '.input:hover+.disc');
    assert.equal(result.token, undefined, rule);
    assert.match(result.reason, /not established/, rule);
  }
});
