import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { compositionPlan, compareCompositionInk, COMPOSITION_VERSION, COMPOSITION_SCALE } from '../../../../checks/lib/composition-diagnostics.mjs';
import { sha256 } from '../../../../checks/lib/render-plan.mjs';

const MAX_PIXELS = 512 * 1024, MAX_RUN_PIXELS = 8 * 1024 * 1024;
const scope = 'Experimental flat-sibling composition model, not overall Figma fidelity, actual layer attribution or confirmation. The snapshot does not capture source masks or every blend operation. Equal colors and unexplained paint remain indeterminate. No published measurement or gate is changed.';

class NotComparable extends Error {}
const messageOf = error => error?.message || String(error);

async function evaluateCondition(page, operation, argument) {
  const result = await page.evaluate(operation, argument);
  if (result?.notComparable) throw new NotComparable(result.notComparable);
  return result;
}

// Runs only in the disposable diagnostic page. References and original styles stay in the page, never in the JSON result.
function inspectPage({ key, parts }) {
  const roots = [...document.querySelectorAll('#component [data-ds-part="root"]')];
  if (roots.length !== 1) return { notComparable: 'Composition requires one component root' };
  const root = roots[0];
  const elements = [...document.body.querySelectorAll('*')];
  if (elements.length > 1000 || elements.some(e => e.shadowRoot || ['IFRAME', 'CANVAS', 'VIDEO'].includes(e.tagName)) || document.getAnimations().some(a => a.playState === 'running')) return { notComparable: 'Unsupported dynamic document or DOM budget' };
  const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const signature = () => JSON.stringify(elements.map(e => ({ rect: rect(e), html: e.innerHTML, attributes: [...e.attributes].filter(a => !(e === document.body && a.name === 'style')).map(a => [a.name, a.value]),
    css: [...getComputedStyle(e)].filter(k => k !== 'visibility' && !(e === document.body && k.startsWith('background'))).map(k => [k, getComputedStyle(e).getPropertyValue(k)]) })));
  const selected = [];
  for (const part of parts) {
    const found = [root, ...root.querySelectorAll('[data-ds-part]')].filter(e => e.getAttribute('data-ds-part') === part);
    if (found.length !== 1) return { notComparable: `Part ${part} is not an unambiguous element` };
    const e = found[0];
    if (e.childElementCount || e.textContent.trim() || !['SPAN', 'DIV', 'I', 'B'].includes(e.tagName)) return { notComparable: `Part ${part} is not a text-free leaf; descendants must not be attributed to their parent` };
    for (const pseudo of ['::before', '::after']) if (!['none', 'normal'].includes(getComputedStyle(e, pseudo).content)) return { notComparable: `Part ${part} has generated content` };
    for (let n = e; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.opacity !== '1' || s.mixBlendMode !== 'normal' || s.filter !== 'none' || !['none', ''].includes(s.backdropFilter) || s.visibility !== 'visible' || s.transform.startsWith('matrix3d') || s.contentVisibility === 'hidden' || n === e && s.boxShadow !== 'none') return { notComparable: `Part ${part} has opacity, blending, filters, hidden content, leaf shadows or 3D transforms` };
      if (n !== e && (s.maskImage !== 'none' || s.clipPath !== 'none' || ['hidden', 'clip', 'scroll', 'auto'].includes(s.overflowX) || ['hidden', 'clip', 'scroll', 'auto'].includes(s.overflowY))) return { notComparable: `Part ${part} has a clipping or masked ancestor` };
    }
    selected.push(e);
  }
  if (selected.some(e => e.parentElement !== selected[0].parentElement)) return { notComparable: 'Mapped source siblings are not DOM siblings' };
  const bounds = selected.map(rect);
  if (bounds.some(r => r.width <= 0 || r.height <= 0)) return { notComparable: 'Part has no layout box' };
  const x = Math.floor(Math.min(...bounds.map(r => r.x))) - 1, y = Math.floor(Math.min(...bounds.map(r => r.y))) - 1;
  const right = Math.ceil(Math.max(...bounds.map(r => r.x + r.width))) + 1, bottom = Math.ceil(Math.max(...bounds.map(r => r.y + r.height))) + 1;
  if (x < 0 || y < 0 || right > innerWidth || bottom > innerHeight || devicePixelRatio !== 4) return { notComparable: 'The complete sample must fit the exact viewport at scale 4' };
  const excluded = [...root.querySelectorAll('*')].filter(e => !selected.includes(e) && !selected.some(s => e.contains(s)) && (e.hasAttribute('data-ds-part') || !e.childElementCount)).map(rect);
  const style = document.createElement('style');
  const originalBody = document.body.getAttribute('style');
  const before = signature();
  window[key] = { elements, selected, style, signature, before, originalBody };
  return { clip: { x, y, width: right - x, height: bottom - y }, excluded };
}

function setIsolation({ key, part, background }) {
  const state = window[key];
  if (!state) throw new Error('Composition session is missing');
  document.body.style.setProperty('background', background, 'important');
  state.style.textContent = 'body *{visibility:hidden!important}' + `#component [data-ds-part=${JSON.stringify(part)}]{visibility:visible!important}`;
  if (!state.style.isConnected) document.head.append(state.style);
  const target = state.selected.find(e => e.getAttribute('data-ds-part') === part);
  if (!target || state.elements.some(e => getComputedStyle(e).visibility !== (e === target ? 'visible' : 'hidden'))) return { notComparable: 'Isolation visibility was overridden by application styles' };
}

function restorePage(key) {
  const state = window[key];
  if (!state) return;
  state.style.remove();
  if (state.originalBody === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', state.originalBody);
}

function verifyStable(key) {
  const state = window[key];
  if (!state) throw new Error('Composition session is missing');
  if (state.elements.some(e => !e.isConnected) || state.signature() !== state.before) return { notComparable: 'Isolation changed geometry, content or computed styles' };
}

export function prepareComposition(capture, metadata, configuration) {
  const plan = compositionPlan(capture, metadata, configuration);
  const result = { schemaVersion: 1, version: COMPOSITION_VERSION, status: 'NOT VERIFIED', caseId: configuration.id,
    figmaRef: configuration.figmaRef, snapshotHash: metadata.evidence?.hash ?? null, scale: COMPOSITION_SCALE, checks: [...plan.checks], groups: [], artifacts: [], scope };
  return { plan, result };
}

export async function diagnoseComposition(page, capture, metadata, configuration, { directory } = {}) {
  const { plan, result } = prepareComposition(capture, metadata, configuration);
  if (!plan.groups.length) return result;
  const originalBody = await page.evaluate(() => document.body.getAttribute('style'));
  let sampledPixels = 0;
  for (const [index, group] of plan.groups.entries()) {
    const key = `ds-composition-${randomUUID()}`;
    const folder = path.join(directory, `composition-${configuration.id}-${index}`);
    let prepared, checks, sampledGroup, failure;
    const record = (name, bytes) => {
      mkdirSync(folder, { recursive: true });
      const file = path.join(folder, name);
      writeFileSync(file, bytes, { flag: 'wx' });
      result.artifacts.push({ path: file, sha256: sha256(bytes), bytes: bytes.length });
      return bytes;
    };
    try {
      prepared = await evaluateCondition(page, inspectPage, { key, parts: group.parts.map(p => p.part) });
      const pixels = prepared.clip.width * prepared.clip.height * COMPOSITION_SCALE ** 2, shots = 2 * group.parts.length + 2;
      if (pixels > MAX_PIXELS || sampledPixels + pixels * shots > MAX_RUN_PIXELS) throw new NotComparable('Composition screenshot budget exceeded');
      sampledPixels += pixels * shots;
      const composite = record('composed.png', await page.screenshot({ clip: prepared.clip, scale: 'device' }));
      const layers = [];
      for (const [i, item] of group.parts.entries()) {
        const buffers = [];
        for (const [j, background] of ['rgb(255, 0, 255)', 'rgb(0, 255, 0)'].entries()) {
          await evaluateCondition(page, setIsolation, { key, part: item.part, background });
          await evaluateCondition(page, verifyStable, key);
          buffers.push(record(`part-${i}-${j}.png`, await page.screenshot({ clip: prepared.clip, scale: 'device' })));
          await evaluateCondition(page, verifyStable, key);
        }
        layers.push({ part: item.part, first: buffers[0], second: buffers[1] });
      }
      await page.evaluate(restorePage, key);
      await evaluateCondition(page, verifyStable, key);
      const restored = record('restored.png', await page.screenshot({ clip: prepared.clip, scale: 'device' }));
      if (!composite.equals(restored)) throw new NotComparable('Composed pixels changed after restoring isolation');
      const excluded = prepared.excluded.map(r => ({ x: (r.x - prepared.clip.x) * COMPOSITION_SCALE, y: (r.y - prepared.clip.y) * COMPOSITION_SCALE, width: r.width * COMPOSITION_SCALE, height: r.height * COMPOSITION_SCALE }));
      checks = compareCompositionInk(layers, composite, { excluded });
      sampledGroup = { ...group, clip: prepared.clip, geometryAndStylesUnchanged: true, composedPixelsRestored: true };
    } catch (error) {
      failure = error instanceof Error ? error : new Error(messageOf(error));
    } finally {
      const cleanupErrors = [];
      for (const cleanup of [
        () => page.evaluate(restorePage, key),
        () => page.evaluate(key => { delete window[key]; }, key),
        () => page.evaluate(original => { if (original === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', original); }, originalBody),
      ]) {
        try { await cleanup(); } catch (error) { cleanupErrors.push(messageOf(error)); }
      }
      if (cleanupErrors.length) failure = new Error(`${failure ? `${messageOf(failure)}; ` : ''}Restoration failed: ${cleanupErrors.join('; ')}`);
    }
    if (failure) result.checks.push(...group.parts.map(p => ({ id: `composition:${p.part}`, part: p.part,
      status: failure instanceof NotComparable ? 'NOT COMPARABLE' : 'NOT RUN', reason: messageOf(failure) })));
    else { result.checks.push(...checks); result.groups.push(sampledGroup); }
  }
  return result;
}
