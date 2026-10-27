import selectorParser from 'postcss-selector-parser';

const variable = /^var\(\s*(--[A-Za-z_][\w-]*)\s*\)$/;
const states = new Set([':hover', ':checked', ':disabled', ':focus', ':focus-visible']);

export function bindingSyntaxProblem(css) {
  let escaped = false;
  css.walk(node => {
    const syntax = [];
    if (node.type === 'atrule') syntax.push(node.name, node.params);
    if (node.type === 'decl') syntax.push(node.prop, node.value, node.raws.important || '');
    if (node.type === 'rule') syntax.push(node.selector);
    if (syntax.some(value => value.includes('\\'))) escaped = true;
  });
  return escaped ? 'Escaped CSS syntax not evaluated; written identity requires rendered review' : null;
}

function selectorProfile(selector) {
  let profile;
  try {
    selectorParser(root => {
      if (root.nodes.length !== 1) return;
      const compounds = [{ facts: new Map(), classes: new Set() }], edges = [];
      let specificity = 0, valid = true;
      function fact(node, negative = false) {
        if (node.type === 'class' || node.type === 'pseudo' && states.has(node.value) && !node.nodes?.length) {
          const key = node.type === 'class' ? `.${node.value}` : node.value;
          const compound = compounds.at(-1);
          if (compound.facts.has(key) && compound.facts.get(key) === negative) valid = false;
          compound.facts.set(key, !negative);
          if (node.type === 'class' && !negative) compound.classes.add(node.value);
          specificity++;
        } else if (!negative && node.type === 'pseudo' && node.value === ':not' &&
            node.nodes?.length === 1 && node.first.nodes.length === 1) {
          fact(node.first.first, true);
        } else valid = false;
      }
      for (const node of root.first.nodes) {
        if (node.type === 'combinator') {
          const edge = node.value.trim() || ' ';
          if (![' ', '>', '+'].includes(edge) || !compounds.at(-1).facts.size) valid = false;
          edges.push(edge);
          compounds.push({ facts: new Map(), classes: new Set() });
        } else fact(node);
      }
      if (valid && compounds.at(-1).facts.size) profile = { compounds, edges, specificity };
    }).processSync(selector);
  } catch { /* Unsupported selectors cannot establish a written binding. */ }
  return profile;
}

function compoundMatch(candidate, context) {
  let unknown = false;
  for (const [key, value] of candidate.facts) {
    if (!context.facts.has(key)) unknown = true;
    else if (context.facts.get(key) !== value) return false;
  }
  return unknown ? null : true;
}

// A recorded selector supplies positive/negative facts, not a closed-world DOM.
function matches(candidate, context) {
  const ancestors = context.compounds.map(() => []);
  for (let i = 1; i < ancestors.length; i++) {
    ancestors[i] = context.edges[i - 1] === '+' ? [...ancestors[i - 1]] : [...ancestors[i - 1], i - 1];
  }
  function visit(c, t) {
    const own = compoundMatch(candidate.compounds[c], context.compounds[t]);
    if (own === false || c === 0) return own;
    const edge = candidate.edges[c - 1];
    let previous;
    if (edge === ' ') {
      previous = ancestors[t];
    } else {
      // Only a known immediate edge proves adjacency or direct parenthood.
      if (t === 0 || context.edges[t - 1] !== edge) return null;
      previous = [t - 1];
    }
    const results = previous.map(index => visit(c - 1, index));
    if (results.includes(true) && own === true) return true;
    if (edge !== ' ' && results.every(result => result === false)) return false;
    return null;
  }
  return visit(candidate.compounds.length - 1, context.compounds.length - 1);
}

const rank = (a, b) => Number(Boolean(a.decl.important)) - Number(Boolean(b.decl.important)) ||
  a.profile.specificity - b.profile.specificity || a.order - b.order;

export function bindingCascade(css, contextSelector, property, partSelector, tokenNames, mayAffect) {
  const syntaxProblem = bindingSyntaxProblem(css);
  if (syntaxProblem) return { reason: syntaxProblem };
  if ([contextSelector, property, partSelector].some(value => typeof value === 'string' && value.includes('\\'))) {
    return { reason: 'Escaped binding context not evaluated' };
  }
  const context = selectorProfile(contextSelector);
  const part = /^\.([A-Za-z_][\w-]*)$/.exec(partSelector || '')?.[1];
  if (!context || !part || !context.compounds.at(-1).classes.has(part)) {
    return { reason: 'binding context or final part selector not supported' };
  }
  const declarations = [], registrations = new Set();
  let hasImports = false;
  css.walkAtRules(rule => {
    if (rule.name.toLowerCase() === 'property') registrations.add(rule.params.trim());
    if (rule.name.toLowerCase() === 'import') hasImports = true;
  });
  if (hasImports) return { reason: 'CSS @import dependencies not evaluated; binding cascade not established' };
  css.walkDecls(decl => {
    const rule = decl.parent;
    const profile = rule.type === 'rule' ? selectorProfile(rule.selector) : undefined;
    const supported = profile && rule.parent.type === 'root' && rule.nodes.every(n => n.type === 'decl' || n.type === 'comment');
    const property = decl.prop.startsWith('--') ? decl.prop : decl.prop.toLowerCase();
    declarations.push({ decl, property, profile: supported ? profile : undefined, order: declarations.length, match: supported ? matches(profile, context) : null });
  });
  function winner(name) {
    const relevant = declarations.filter(d => name.startsWith('--') ? d.property === name : mayAffect(d.property, name));
    const certain = relevant.filter(d => d.match === true).sort(rank);
    const best = certain.at(-1);
    if (!best || relevant.some(d => d.match === null && (!d.profile || rank(d, best) >= 0))) {
      return { reason: `cascade or inheritance of ${name} not established in binding context` };
    }
    if (best.property !== name) return { reason: `shorthand affecting ${name} not evaluated` };
    return { value: best.decl.value.trim(), declaration: { selector: best.decl.parent.selector, property: best.decl.prop } };
  }
  const source = winner(property);
  if (source.reason) return source;
  const trace = [source.declaration];
  let value = source.value;
  const visited = new Set(), chain = [];
  while (variable.test(value)) {
    const name = variable.exec(value)[1];
    if (visited.has(name)) return { reason: 'cyclic local binding variable chain' };
    visited.add(name);
    chain.push(name);
    if (registrations.has(name)) return { reason: 'registered custom property semantics not evaluated' };
    const local = declarations.some(d => d.decl.prop === name);
    if (tokenNames.has(name)) {
      if (local) return { reason: 'component CSS redefines bound custom property; effective value not evaluated' };
      return { token: name, chain, value: source.value, declarations: trace };
    }
    const resolved = winner(name);
    if (resolved.reason) return resolved;
    trace.push(resolved.declaration);
    value = resolved.value;
  }
  return { reason: 'local binding chain does not resolve to a direct project token' };
}
