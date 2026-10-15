import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { projectFile } from './render-plan.mjs';

function classes(selector) {
  let result = null;
  selectorParser(root => {
    if (root.nodes.length !== 1 || !root.first.nodes.length || root.first.nodes.some(n => n.type !== 'class')) return;
    result = { set: new Set(root.first.nodes.map(n => n.value)), specificity: root.first.nodes.length };
  }).processSync(selector);
  return result;
}

export function verifyIntrinsicCss(root, metadata, style) {
  const errors = [], warnings = [];
  const dimensions = (metadata.evidence?.textDimensions || []).filter(d => d.behavior === 'content' && d.treatment === 'translation');
  if (!dimensions.length) return { errors, warnings };
  let css;
  try { css = postcss.parse(readFileSync(projectFile(root, style), 'utf8')); }
  catch (error) { return { errors: [], warnings: [`Intrinsic CSS NOT VERIFIED: ${error.message}`] }; }
  for (const record of dimensions) {
    let target;
    try { target = classes(record.cssSelector); } catch { /* Unsupported selectors stay in the review lane. */ }
    if (!target) { warnings.push(`${record.observation}: intrinsic selector NOT VERIFIED`); continue; }
    target = target.set;
    const relevant = [];
    const pair = ['width', 'inline-size'].includes(record.cssProperty) ? ['width', 'inline-size'] : ['height', 'block-size'];
    let uncertain = false;
    for (const file of metadata.verification?.stylesheets || []) {
      try { postcss.parse(readFileSync(projectFile(root, file), 'utf8')).walkDecls(d => { if ([...pair, 'all', 'writing-mode'].includes(d.prop)) uncertain = true; }); }
      catch { uncertain = true; }
    }
    css.walkDecls(decl => {
      if (decl.prop === 'writing-mode' && decl.value.trim() !== 'horizontal-tb') uncertain = true;
      if (![...pair, 'all'].includes(decl.prop)) return;
      const rule = decl.parent;
      if (rule.type !== 'rule') return;
      let parsed;
      try { parsed = classes(rule.selector); } catch { uncertain = true; return; }
      if (!parsed) { uncertain = true; return; }
      const { set, specificity } = parsed;
      if (![...set].some(c => target.has(c))) return;
      let conditional = false;
      for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' || parent.type === 'rule') conditional = true;
      if (conditional) uncertain = true;
      else relevant.push({ decl, set, specificity });
    });
    const contexts = [...new Map([target, ...relevant.map(r => new Set([...target, ...r.set]))].map(set => [JSON.stringify([...set].sort()), set])).values()];
    const fixedWinners = new Set();
    let needsReview = uncertain || !relevant.length;
    for (const context of contexts) {
      const applicable = relevant.filter(r => [...r.set].every(c => context.has(c)));
      applicable.sort((a, b) => Number(Boolean(a.decl.important)) - Number(Boolean(b.decl.important)) || a.specificity - b.specificity || relevant.indexOf(a) - relevant.indexOf(b));
      const winner = applicable.at(-1)?.decl;
      if (!winner) continue;
      const fixed = /^(?:0|(?:\d*\.)?\d+(?:px|em|rem|pt|pc|cm|mm|in|q|vw|vh|vmin|vmax|ch|ex))$/i.test(winner.value.trim());
      const isBase = context.size === target.size && [...target].every(c => context.has(c));
      const hasSpecialization = isBase && relevant.some(r => [...r.set].some(c => !target.has(c)));
      if (fixed && !uncertain && !hasSpecialization) fixedWinners.add(winner);
      else if (fixed || !['auto', 'fit-content', 'max-content', 'min-content'].includes(winner.value.trim())) needsReview = true;
    }
    for (const winner of fixedWinners) errors.push(`${record.observation}: intrinsic sizing contract contradicts fixed CSS ${winner.prop}:${winner.value} in specialization ${winner.parent.selector}`);
    if (needsReview && !fixedWinners.size) warnings.push(`${record.observation}: intrinsic CSS NOT VERIFIED; cascade, expression or unsupported declaration requires rendered review`);
  }
  return { errors, warnings };
}
