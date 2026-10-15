# <Nombre> usage

## Use

<Cuándo usarlo.>

## Figma to code correspondences

`confirmed` means verified only for the documented configuration and revision, not a permanent PASS. Recheck after relevant Figma or code changes. `candidate` means not yet confirmed by rendered comparison.

Report static conformance separately from visual coverage. Reports v4 retain derived renderChecks and specific checkReviews for noncomparable requirements and provisional TEXT geometry PASS checks (geometry:PART). The 1px text threshold is not a calibrated fidelity guarantee. A general judgment cannot replace these reviews or override a numerical FAIL or missing essential font.

Original browser measurements/receipts also require a matching measurementVersion; changed producer rules make them stale, while mismatched/missing versions invalidate the record. renderChecks includes comparatorVersion: changes of rules make a confirmation stale, while reason/scope wording does not. A partial position PASS does not confirm vector shape. Behavior results are recorded separately, but every case linked by baseline must have current published measurements and all checks PASS before confirmed. Missing, failed or noncomparable behavior cannot be rescued by a general review. Unexecuted/noncomparable obligations leave candidate/NOT VERIFIED; they do not demonstrate a visual defect.

```json
{
  "schemaVersion": 1,
  "correspondences": []
}
```

<Añade una entrada por caso fidelity de metadata.verification con caseId y status. confirmed exige evidence con ruta y SHA-256 de un informe renderizado persistido. Sin correspondencia establecida, registra el motivo en verification.unestablished.>

## Do not

Before declaring the import complete, run verification-plan.mjs close with hashed published artifacts for every fidelity/behavior case. Measured candidates are not confirmed; closure is read-only and complete=true requires all current confirmations. Keep missing, stale or failed obligations explicit. A viewport diagnostic or a static PASS is not fidelity evidence.

Account for every source node, including containers: nodeCoverage exceptions must satisfy their rule conditions; unresolved never counts as verified coverage. Original CSS syntax results must match the current component declarations. Application diagnostics (including App.tsx) are separate, and substituted/dynamic CSS values still require independent review.

- recreate this component with ad-hoc styles when it exists;
- hardcode colors, spacing or typography;
- create new visual variants without adding them to the Design System.
