# <Nombre> usage

## Use

<Cuándo usarlo.>

## Figma to code correspondences

`confirmed` means verified only for the documented configuration and revision, not a permanent PASS. Recheck after relevant Figma or code changes. `candidate` means not yet confirmed by rendered comparison.

Report static conformance separately from visual coverage. Reports v4 retain derived renderChecks and specific checkReviews for noncomparable requirements; a general judgment cannot override a numerical FAIL or missing essential font.

Original browser measurements/receipts also require a matching measurementVersion; changed producer rules make them stale, while mismatched/missing versions invalidate the record. renderChecks includes comparatorVersion: changes of rules make a confirmation stale, while reason/scope wording does not. A partial position PASS does not confirm vector shape. Behavior results are recorded separately, but every case linked by baseline must have current published measurements and all checks PASS before confirmed. Missing, failed or noncomparable behavior cannot be rescued by a general review. Unexecuted/noncomparable obligations leave candidate/NOT VERIFIED; they do not demonstrate a visual defect.

```json
{
  "schemaVersion": 1,
  "correspondences": []
}
```

<Añade una entrada por caso fidelity de metadata.verification con caseId y status. confirmed exige evidence con ruta y SHA-256 de un informe renderizado persistido. Sin correspondencia establecida, registra el motivo en verification.unestablished.>

## Do not

- recreate this component with ad-hoc styles when it exists;
- hardcode colors, spacing or typography;
- create new visual variants without adding them to the Design System.
