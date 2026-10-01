# AGENTS.md

Operational instructions for AI agents in this repository.

## Canonical Source

- `AGENTS.md` and `.agents/` are the tool-neutral source of truth.

## Uso del DS

- Si el usuario dice "crea un DS" o pega la URL de un componente de Figma, sigue `.agents/skills/create-ds-from-figma/SKILL.md`.
- Si la tarea es construir UI o una pantalla desde un frame de Figma, sigue `.agents/workflows/build-from-figma.md`.
- Si lees, editas o generas archivos en `src/` o `design-system/`, aplica `.agents/rules/design-system.md`.
- Si dos skills solapan, usa la más específica; si hacen falta ambas por fases distintas, aplícalas explícitamente.

## Precedence

Applies when instructions conflict (high → low):

1. **System prompt** — platform/IDE injected instructions.
2. **AGENTS.md** — project-level defaults (this file).

## Restricciones de entorno

- NUNCA crear worktrees ni ramas auxiliares (`isolation: "worktree"` prohibido).
- Nunca hacer commit ni stage si no hay orden previo del usuario.
- Trabajar siempre en la rama activa del repositorio principal.
- El usuario es quien decide cuándo crear ramas, stages y commits. No hacerlo de forma autónoma.

## Skill create-ds-from-figma

- `.agents/skills/create-ds-from-figma/SKILL.md` es la skill canónica y detectable; no crear copias sincronizadas.
- Si se cambia el formato de relaciones Figma, actualizar juntas las plantillas `figma-state.json`, `figma-code-map.json`, las skills auxiliares `find-component`, `map-figma-to-code` y `validate-ds`, y los checks de `.agents/checks/`.
