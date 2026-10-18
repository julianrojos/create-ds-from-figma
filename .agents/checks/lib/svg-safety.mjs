import { createRequire } from 'node:module';

const { SaxesParser } = createRequire(import.meta.url)('saxes');
const SVG = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink', XML = 'http://www.w3.org/XML/1998/namespace', XMLNS = 'http://www.w3.org/2000/xmlns/';
// Elements that run code, load documents, animate references, embed another namespace or carry a stylesheet. Figma's exporter emits none.
const FORBIDDEN = new Set(['script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'a', 'animate', 'animatemotion', 'animatetransform', 'set', 'discard', 'handler', 'listener', 'cursor', 'view']);
// CSS values are constrained by grammar rather than scanned for bad words: escapes, comments and unknown functions cannot hide anything
// in a value that has none of them. Everything below is what Figma's exporter writes.
const FUNCTIONS = new Set(['url', 'rgb', 'rgba', 'hsl', 'hsla', 'matrix', 'translate', 'rotate', 'scale', 'skewx', 'skewy']);
const STYLE_PROPERTIES = new Set(['mix-blend-mode', 'mask-type', 'isolation', 'opacity', 'fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'paint-order', 'display', 'visibility']);
const FORBIDDEN_CHARACTERS = /\\|\/\*|@/;
const LOCAL_FRAGMENT = /^#[A-Za-z_][\w.:-]*$/;
const INLINE_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]*$/;
const MAX_ELEMENTS = 5000, MAX_DEPTH = 64;

const allowedReference = value => { const v = value.trim(); return LOCAL_FRAGMENT.test(v) || INLINE_IMAGE.test(v); };
function valueProblem(value) {
  if (FORBIDDEN_CHARACTERS.test(value)) return 'a backslash, comment or at-rule, which CSS would interpret';
  for (const match of value.matchAll(/([A-Za-z_-][\w-]*)\s*\(/g)) if (!FUNCTIONS.has(match[1].toLowerCase())) return `the function ${match[1]}()`;
  for (const match of value.matchAll(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    const reference = match[1] ?? match[2] ?? match[3] ?? '';
    if (!allowedReference(reference)) return `an external or unsupported reference ${JSON.stringify(reference.slice(0, 60))}`;
  }
  return null;
}
function styleProblem(value) {
  for (const declaration of value.split(';')) {
    if (!declaration.trim()) continue;
    const colon = declaration.indexOf(':'), property = colon < 0 ? '' : declaration.slice(0, colon).trim().toLowerCase();
    if (!STYLE_PROPERTIES.has(property)) return `the property ${JSON.stringify(property.slice(0, 40))}`;
  }
  return null;
}

// Strict XML structure first, so nothing is judged from a document a browser would not read the same way; then every attribute value
// after entity decoding. It does not sanitize a hostile SVG for inline use: it rejects what Figma's exporter never emits, so a stored
// export that passes is inert as an <img> or file and has no active or external content in what is checked here.
export function svgProblem(svg) {
  let problem = null, depth = 0, elements = 0, root = null;
  const reject = message => { problem ||= message; };
  const parser = new SaxesParser({ xmlns: true, position: false });
  parser.on('error', error => reject(`not well-formed XML (${String(error.message).split('\n')[0]})`));
  parser.on('doctype', () => reject('a DOCTYPE or entity declaration'));
  parser.on('processinginstruction', () => reject('a processing instruction'));
  parser.on('cdata', () => reject('a CDATA section'));
  parser.on('opentag', tag => {
    depth++; elements++;
    if (elements > MAX_ELEMENTS || depth > MAX_DEPTH) return reject('too many or too deeply nested elements');
    if (!root) { root = tag; if (tag.local !== 'svg' || tag.uri !== SVG) return reject('a root element that is not an SVG svg'); }
    if (tag.uri !== SVG) return reject(`element ${tag.name} outside the SVG namespace`);
    if (FORBIDDEN.has(tag.local.toLowerCase())) return reject(`forbidden element <${tag.local}>`);
    for (const attribute of Object.values(tag.attributes)) {
      const name = attribute.local.toLowerCase(), value = attribute.value;
      if (attribute.uri === XMLNS) { if (![SVG, XLINK].includes(value)) reject(`namespace declaration ${JSON.stringify(value.slice(0, 40))}`); continue; }
      // xml:base would redirect every relative or fragment reference to another document.
      if (attribute.uri === XML) { if (!['space', 'lang'].includes(name)) reject(`attribute ${attribute.name}`); continue; }
      if (attribute.uri === XLINK) { if (name !== 'href') { reject(`attribute ${attribute.name}`); continue; } }
      else if (attribute.uri) { reject(`attribute ${attribute.name} in a foreign namespace`); continue; }
      if (name.startsWith('on')) { reject(`event handler attribute ${attribute.name}`); continue; }
      if (['href', 'src'].includes(name)) { if (!allowedReference(value)) reject(`${attribute.name} that is neither a local fragment nor an inline raster image`); continue; }
      const css = valueProblem(value) ?? (name === 'style' ? styleProblem(value) : null);
      if (css) reject(`${attribute.name} with ${css}`);
    }
  });
  parser.on('closetag', () => { depth--; });
  try { parser.write(svg).close(); } catch (error) { reject(`not well-formed XML (${String(error.message).split('\n')[0]})`); }
  if (!problem && !root) problem = 'no root element';
  return problem;
}
