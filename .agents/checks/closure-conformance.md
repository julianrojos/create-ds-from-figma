# Component and token closure

`npm run verify:closure -- ROOT` prints the current read-only diagnostic. It does
not fail for findings during development; invalid input still exits 2. Add
`--check` to require PASS (exit 1 for FAIL or NOT_RUN). Import delivery through
`npm run verify:imports` and UI profiles of `npm run verify:all` enforce it.
These commands continue independent checks to report all findings; pending required
checks never produce a successful closure. No files are repaired or classified.

The JSON includes coverage counts for registered components, component and ficha
directories, auxiliaries, CSS token references and uninspected symbolic paths.
An empty project's coverage is NOT APPLICABLE even when consistency is PASS;
that result does not validate an implementation. Unsupported paths make coverage
PARTIAL. Other populated projects are ASSESSED for consistency only. The import
gate also exposes these counts near the start as projectCoverage. Kit regression
results on populated synthetic fixtures are separate from a check of the user's
current empty project; neither is a visual approval or a real agent evaluation.

Every direct component directory in `src/components/`, every ficha directory,
inventory entry and Figma map entry must agree. A registered component requires
metadata, usage and a mapped implementation, each a regular file inside the project
(a directory or an unsafe path does not count). Implementations mapped
outside the conventional directory are also checked. Root barrel files are not
component directories. Completely empty directories and OS metadata are ignored:
they contain no implementation and are not tracked by Git. Missing records or
implementations are FAIL.

Private auxiliary directories can be explicitly listed in the optional project
file `design-system/component-classification.json`, using the optional
[template](../skills/create-ds-from-figma/plantillas/design-system/component-classification.json)
as described in the [implementation procedure](../skills/create-ds-from-figma/references/import-implementation.md):

```json
{
  "schemaVersion": 1,
  "auxiliaries": [
    { "directory": "src/components/Internal", "reason": "Private helper shared by public components" }
  ]
}
```

Reasons must be nonempty. Duplicates, nonexistent directories and conflicts with
public records fail. This file is versioned project data, not proof of permission.
The report lists all current classifications and reasons. With `--since REV`, the
diagnostic and import gate also report added, removed and modified auxiliary
classifications against the explicitly resolved Git commit. UI profiles forward
that option. Invalid revisions fail; without a revision, changes are NOT_RUN with
an explicit explanation, independently of the required closure result. Public
record additions/removals are covered by consistency checks, not that auxiliary diff.

Token checks parse CSS declarations in `src/` and literal `var()` expressions in
JS/TS component strings and templates under `src/components/`. Comments do not
count. Every referenced `--ds-*` must have a static CSS declaration, even with a
fallback; nested fallback references are also checked. No declaration is FAIL.
Literal JS/TS custom property assignments, setProperty calls and CSS @property
registrations with initial-value are recognized as possible definitions, with
NOT_RUN scope rather than a claim that they are absent. Dynamically constructed
names remain unsupported. Definitions in the same unconditional rule establish local availability. Global
unconditional `:root` definitions in non-module CSS can establish availability
when loaded through literal relative imports from a module script in index.html.
A CSS `@import` counts only where browsers honor it: before any rule, after at most
comments, `@charset`, body-less `@layer` statements or other imports. A misplaced
import never establishes availability, so its definitions stay NOT_RUN.
Entry discovery uses HTML parsing: data-* attributes, comments, templates and
script text do not create executable entries. A base URL makes local entry
resolution unproved. Entry paths use URL dot-segment resolution, not filesystem
normalization; remaining doubled separators or encodings leave mapping unproved.
JS/TS imports are credited only if preserved in TypeScript
output with both supported verbatimModuleSyntax settings. Type-only and unused
imports whose loading depends on compiler settings remain unproved, even if a
particular bundler configuration might retain them. No project configuration or
code is executed to decide that proof.
CSS import conditions, aliases, dynamic imports, arbitrary selectors, inheritance
and conditional modes are not guessed. Existing definitions without a scope proof
are NOT_RUN and block required closure. Runtime definitions, external stylesheets,
Shadow DOM and CSS-in-JS are outside the supported proof; they need a future
explicit verification mechanism. PASS means static availability only, not valid
values, absence of cycles, correct cascade, fidelity or rendered behavior.

Symbolic links, including dangling links and loops, are recorded as FAIL findings
with their paths and are never followed. Independent checks continue and retain
their findings. The development CLI still returns its structured report (exit 0
for consultation, 1 under --check); malformed arguments/configuration or other
infrastructure failures remain exit 2. The import gate always checks delivery
and rejects the redundant --check option.

`verify-ds` starts its CLI output with a grouped summary of stale confirmations;
the import gate places the same summary near the beginning of its JSON. Counts
are warning records, not deduplicated cases. File causes are shown when supplied
by the original currency check; other reasons remain preserved. Summaries do not
renew evidence or authorize edits. The static command can still pass; its summary
directs the reader to verify:imports for the delivery decision.
