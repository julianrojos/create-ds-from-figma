# <Nombre> usage

## Use

<Cuándo usarlo.>

## Figma to code correspondences

`confirmed` means verified only for the documented configuration and revision, not a permanent PASS. Recheck after relevant Figma or code changes. `candidate` means not yet confirmed by rendered comparison.

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
