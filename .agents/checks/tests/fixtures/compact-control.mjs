export const compactTokens = {
  idle: '--example-surface', hover: '--example-hover', selected: '--example-selected',
  disabled: '--example-disabled', magic: '--example-magic',
};

export const escapedCssCases = [
  { id: 'escaped-import', css: String.raw`@im\70ort url("data:text/css,.disc%7B--local%3Avar(--example-hover)%20!important%7D");
    .disc{--local:var(--example-surface);background-color:var(--local)}` },
  { id: 'escaped-token', css: String.raw`.disc{--local:var(--example-surface);--\65xample-surface:var(--example-hover);background-color:var(--local)}` },
  { id: 'escaped-property', css: String.raw`.disc{--local:var(--example-surface);background-color:var(--local);back\67round-color:var(--example-hover)}` },
];

export const compactCss = `
.disc {
  --control-idle: var(--example-surface);
  --control-paint: var(--control-idle);
  background-color: var(--control-paint);
}
.root.magic > .input + .disc { --control-idle: var(--example-magic); }
.input:hover + .disc { --control-paint: var(--example-hover); }
.input:checked + .disc { --control-paint: var(--example-selected); }
.input:disabled + .disc { --control-paint: var(--example-disabled); }
`;

export const compactCases = [
  { id: 'idle', checked: false, hover: false, disabled: false },
  { id: 'hover', checked: false, hover: true, disabled: false },
  { id: 'selected', checked: true, hover: false, disabled: false },
  { id: 'selected-hover', checked: true, hover: true, disabled: false, expected: 'selected' },
  { id: 'disabled', checked: true, hover: true, disabled: true },
  { id: 'magic', checked: false, hover: false, disabled: false, magic: true },
].map(c => ({ ...c, expected: compactTokens[c.expected || c.id], selector:
  `.root${c.magic ? '.magic' : ':not(.magic)'} > .input` +
  ['checked', 'hover', 'disabled'].map(state => c[state] ? `:${state}` : `:not(:${state})`).join('') + ' + .disc' }));
