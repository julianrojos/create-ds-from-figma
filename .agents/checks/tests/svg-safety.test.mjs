import assert from 'node:assert/strict';
import { test } from 'node:test';
import { svgProblem } from '../lib/svg-safety.mjs';
import { sealVectorExport } from '../lib/vector-export.mjs';

const NS = 'xmlns="http://www.w3.org/2000/svg"', XL = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const wrap = (body, attributes = '') => `<svg ${NS} ${XL} width="12" height="12" viewBox="0 0 12 12" fill="none" ${attributes}>\n${body}\n</svg>\n`;

test('documents shaped like Figma exports are accepted, including local and inline references', () => {
  for (const svg of [
    wrap('<path d="M5.5 0L11 5.5L5.5 11L0 5.5L5.5 0Z" fill="white"/>'),
    wrap('<path d="M0 0.7L5.6 6.3L11.3 0.7L10.6 -0.000005L5.6 4.9L0.7 -0.000005L0 0.7Z" fill-rule="evenodd" clip-rule="evenodd" fill="#D9D9D9"/>'),
    wrap('<g clip-path="url(#clip0)"><rect width="8" height="8" fill="url(#paint0)" style="mix-blend-mode:multiply"/></g><defs><clipPath id="clip0"><rect width="8" height="8"/></clipPath><linearGradient id="paint0"><stop stop-color="#fff"/></linearGradient></defs>'),
    wrap('<use xlink:href="#a"/><image id="a" xlink:href="data:image/png;base64,iVBORw0KGgo=\nAAAA" width="2" height="2"/>'),
    wrap('<g style="mix-blend-mode:multiply;isolation:isolate" transform="translate(1 2) rotate(45) matrix(1 0 0 1 0 0)" filter="url(#f)" mask="url( &quot;#m&quot; )"><rect fill="rgb(1, 2, 3)" stroke="hsla(0, 0%, 0%, 0.5)"/></g>'),
    wrap('<path d="M0 0" fill="URL(#g)" stroke="url(\'#g\')"/>'),
    wrap('<!-- a comment is inert --><path d="M0 0" xml:space="preserve"/>'),
    `<?xml version="1.0" encoding="UTF-8"?>\n${wrap('<path d="M0 0"/>')}`,
  ]) assert.equal(svgProblem(svg), null, svg);
});

test('malformed or incomplete documents are rejected, not sealed', () => {
  for (const svg of ['', '<svg>', `<svg ${NS}>`, `<svg ${NS}><g><path d="M0 0"></svg>`, `<svg ${NS}></g></svg>`, `<svg ${NS}/><svg ${NS}/>`, `<svg ${NS}><path d="M0 0" d="M1 1"/></svg>`,
    `<svg ${NS}><path d=M0/></svg>`, `<svg ${NS}>&nbsp;</svg>`, `text<svg ${NS}/>`, `<svg ${NS}/>trailing`, 'not xml at all',
    `<svg xmlns="http://example.com/other"><path/></svg>`, `<svg><path/></svg>`, `<g ${NS}/>`]) assert.ok(svgProblem(svg), JSON.stringify(svg));
});

test('external, script and entity-hidden references are rejected after decoding', () => {
  const cases = {
    'external href': wrap('<image href="https://evil.example/x.png" width="1" height="1"/>'),
    'external xlink': wrap('<use xlink:href="https://evil.example/s.svg#a"/>'),
    'protocol-relative': wrap('<image href="//evil.example/x.png"/>'), 'relative file': wrap('<image href="../secret.png"/>'),
    'file scheme': wrap('<image href="file:///etc/passwd"/>'), 'svg data image': wrap('<image href="data:image/svg+xml;base64,PHN2Zy8+"/>'), 'html data': wrap('<image href="data:text/html;base64,AAAA"/>'),
    'javascript entity decimal': wrap('<image href="javascript&#58;alert(1)"/>'), 'javascript entity hex': wrap('<image href="&#x6A;avascript:alert(1)"/>'),
    'javascript url': wrap('<path fill="url(javascript:alert(1))"/>'), 'external paint': wrap('<path fill="url(https://evil.example/g)"/>'), 'quoted external paint': wrap('<path style="fill:url(\'https://evil.example/g\')"/>'),
    'import': wrap('<style>@import url(https://evil.example/x.css);</style>'), 'import entity': wrap('<style>@im&#112;ort "x.css";</style>'), 'style url': wrap('<style>.a{background:url(https://evil.example/i.png)}</style>'),
    'expression': wrap('<path style="width:expression(alert(1))"/>'),
  };
  for (const [name, svg] of Object.entries(cases)) assert.ok(svgProblem(svg), name);
});

test('active elements, event handlers, foreign namespaces and declarations are rejected', () => {
  const cases = {
    script: wrap('<script>alert(1)</script>'), 'namespaced script': wrap('<svg:script xmlns:svg="http://www.w3.org/2000/svg">x</svg:script>'), foreignObject: wrap('<foreignObject><p xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>'),
    iframe: wrap('<iframe/>'), anchor: wrap('<a href="#x"><path/></a>'), animate: wrap('<animate attributeName="href" to="javascript:x"/>'), set: wrap('<set attributeName="fill" to="red"/>'),
    handler: wrap('<path onload="x()"/>'), 'handler without a call': wrap('<path onclick="location=1"/>'), 'handler with a template call': wrap('<path onmouseover="alert`1`"/>'), 'upper handler': wrap('<path ONCLICK="x()"/>'), 'xlink handler': wrap('<path xlink:onclick="x()"/>'),
    'xhtml element': wrap('<div xmlns="http://www.w3.org/1999/xhtml"/>'), 'foreign attribute': wrap('<path xmlns:h="http://www.w3.org/1999/xhtml" h:x="1"/>'), 'foreign namespace declaration': wrap('<path xmlns:h="http://example.com/h"/>'),
    doctype: `<!DOCTYPE svg [<!ENTITY x "y">]>${wrap('<text>&x;</text>')}`, 'external DTD': `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${wrap('<path d="M0 0"/>')}`, 'inline DTD without use': `<!DOCTYPE svg [<!ENTITY x "y">]>${wrap('<path d="M0 0"/>')}`, 'processing instruction': `<?xml-stylesheet href="x.css"?>${wrap('')}`, cdata: wrap('<style><![CDATA[.a{}]]></style>'),
  };
  for (const [name, svg] of Object.entries(cases)) assert.ok(svgProblem(svg), name);
});

test('size and depth are bounded', () => {
  assert.ok(svgProblem(wrap('<g/>'.repeat(5001))), 'too many elements');
  assert.equal(svgProblem(wrap('<g/>'.repeat(4000))), null);
  assert.ok(svgProblem(wrap('<g>'.repeat(70) + '</g>'.repeat(70))), 'too deep');
  assert.equal(svgProblem(wrap('<g>'.repeat(40) + '</g>'.repeat(40))), null);
});

test('sealing applies the structural validation and names the reason', () => {
  const base = { schemaVersion: 1, source: { fileKey: 'FILE', nodeId: '1:2', collector: 'vector-export-v1', api: 'PLUGIN', tool: 'use_figma', revision: null },
    vectors: [{ id: '1:3', name: 'V', type: 'VECTOR', visible: true, width: 8, height: 8, bounds: null, renderBounds: null, svg: wrap('<path d="M0 0"/>') }] };
  assert.equal(sealVectorExport(base).vectorExport.vectors[0].svg, base.vectors[0].svg);
  for (const svg of ['<svg>', wrap('<image href="https://evil.example/x.png"/>'), wrap('<a href="javascript&#58;x"/>')]) {
    assert.throws(() => sealVectorExport({ ...base, vectors: [{ ...base.vectors[0], svg }] }), /^Error: Vector export: 1:3 is rejected: /, svg.slice(0, 50));
  }
});

test('CSS escapes, comments and at-rules cannot hide a reference because values containing them are refused', () => {
  const cases = {
    '@import escape': wrap('<path style="x:@im\\70 ort"/>'), 'url escape decimal-ish': wrap('<path fill="u\\72l(https://evil.example/x)"/>'), 'url escape in style': wrap('<path style="fill:u\\72l(https://evil.example/x)"/>'),
    'uppercase hex escape': wrap('<path fill="\\55RL(https://evil.example/x)"/>'), 'escaped quote': wrap('<path fill="url(\\22https://evil.example/x\\22)"/>'), 'newline escape': wrap('<path fill="u\\\nrl(https://evil.example/x)"/>'),
    comment: wrap('<path fill="u/**/rl(#a)"/>'), 'comment in value': wrap('<path style="fill:/*x*/red"/>'), 'at sign': wrap('<path fill="@import"/>'), 'backslash anywhere': wrap('<path data-x="a\\b"/>'),
    'style element': wrap('<style>.a{fill:red}</style>'), 'empty style element': wrap('<style/>'),
  };
  for (const [name, svg] of Object.entries(cases)) assert.ok(svgProblem(svg), name);
});

test('only the CSS functions Figma writes are allowed, and url() only for local fragments or inline raster images', () => {
  for (const fn of ['image-set', '-webkit-image-set', 'image', 'cross-fade', 'src', 'element', 'paint', 'expression', 'calc', 'var', 'attr', 'env', 'IMAGE-SET'])
    assert.ok(svgProblem(wrap(`<path style="fill:${fn}('https://evil.example/x.png' 1x)"/>`)) && svgProblem(wrap(`<path fill="${fn}(red)"/>`)), fn);
  for (const url of ['https://evil.example/x', '//evil.example/x', 'x.png', '#', '# a', 'data:image/svg+xml;base64,AAAA', 'data:text/html;base64,AAAA', 'javascript:alert(1)', '']) {
    assert.ok(svgProblem(wrap(`<path fill="url(${url})"/>`)), `unquoted ${url}`); assert.ok(svgProblem(wrap(`<path fill="url('${url}')"/>`)), `quoted ${url}`);
  }
  assert.ok(svgProblem(wrap('<path fill="red url(#a) url(https://evil.example/x)"/>')), 'a later url is still checked');
  assert.equal(svgProblem(wrap('<path fill="url(#a)" stroke="url(&quot;#b&quot;)"/>')), null);
});

test('style attributes are limited to the properties the exporter writes', () => {
  for (const style of ['behavior:url(#x)', '-moz-binding:url(#x)', 'background:red', 'filter:blur(2px)', 'content:red', 'x', ':red', 'mix-blend-mode:multiply;behavior:red']) assert.ok(svgProblem(wrap(`<path style="${style}"/>`)), style);
  assert.equal(svgProblem(wrap('<path style="mix-blend-mode:multiply;;mask-type:alpha;"/>')), null);
});

test('xml:base and other namespaced attributes cannot redirect or smuggle references', () => {
  const ns = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
  for (const svg of [`<svg ${ns} xml:base="https://evil.example/x.svg"><use href="#x"/></svg>`, wrap('<use xml:base="https://evil.example/" xlink:href="#x"/>'), wrap('<use xml:id="a" href="#x"/>'),
    wrap('<path xlink:title="t"/>'), wrap('<path xlink:show="new" xlink:href="#a"/>'), wrap('<path xlink:type="simple"/>')]) assert.ok(svgProblem(svg), svg.slice(0, 80));
  assert.equal(svgProblem(wrap('<use xlink:href="#a"/><path xml:space="preserve" xml:lang="en"/>')), null);
});
