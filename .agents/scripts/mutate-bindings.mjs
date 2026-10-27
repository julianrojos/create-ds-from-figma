import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMutations } from './lib/mutation-runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cascade = '.agents/checks/lib/binding-cascade.mjs';
runMutations({ root, name: 'bindings',
  scope: 'Bounded written-token resolution, native selector facts and local cascade; not full CSS semantics or visible paint.',
  tests: ['.agents/checks/tests/binding-cascade.test.mjs', '.agents/checks/tests/verify-bindings.test.mjs'],
  mutants: [
    ['.agents/checks/verify-bindings.mjs', 'wrong-resolved-token-passes', 'const matches = resolved.token === expected;', 'const matches = true;'],
    [cascade, 'source-order-reversed', 'a.order - b.order', 'b.order - a.order'],
    [cascade, 'importance-ignored', 'Number(Boolean(a.decl.important)) - Number(Boolean(b.decl.important))', '0'],
    [cascade, 'specificity-ignored', 'a.profile.specificity - b.profile.specificity', '0'],
    [cascade, 'unknown-facts-are-true', 'return unknown ? null : true;', 'return true;'],
    [cascade, 'registrations-ignored', 'if (registrations.has(name))', 'if (false)'],
    [cascade, 'unexamined-imports-trusted', 'if (hasImports) return', 'if (false) return'],
    [cascade, 'uncertain-cascade-trusted', 'relevant.some(d => d.match === null &&', 'relevant.some(d => false &&'],
    [cascade, 'project-token-shadowing-trusted', "if (local) return { reason:", "if (false) return { reason:"],
    [cascade, 'sibling-becomes-ancestor', "context.edges[i - 1] === '+' ? [...ancestors[i - 1]] : [...ancestors[i - 1], i - 1]", '[...ancestors[i - 1], i - 1]'],
    [cascade, 'sibling-loses-common-ancestors', "context.edges[i - 1] === '+' ? [...ancestors[i - 1]]", "context.edges[i - 1] === '+' ? []"],
    [cascade, 'immediate-combinators-confused', "if (t === 0 || context.edges[t - 1] !== edge)", 'if (t === 0)'],
    [cascade, 'negation-is-positive', 'fact(node.first.first, true);', 'fact(node.first.first, false);'],
    [cascade, 'contradictory-context-trusted', 'if (compound.facts.has(key) && compound.facts.get(key) === negative) valid = false;', 'if (false) valid = false;'],
    [cascade, 'negation-specificity-ignored', 'specificity++;', 'if (!negative) specificity++;'],
    [cascade, 'descendant-ancestors-ignored', 'previous = ancestors[t];', 'previous = [];'],
    [cascade, 'escaped-at-rule-params-ignored', 'syntax.push(node.name, node.params);', 'syntax.push(node.name);'],
    [cascade, 'escaped-properties-ignored', "syntax.push(node.prop, node.value, node.raws.important || '');", "syntax.push(node.value, node.raws.important || '');"],
    [cascade, 'escaped-values-ignored', "syntax.push(node.prop, node.value, node.raws.important || '');", "syntax.push(node.prop, node.raws.important || '');"],
    ['.agents/checks/verify-bindings.mjs', 'direct-report-trusts-escaped-css', 'if (syntaxProblem) {', 'if (false) {'],
  ],
});
