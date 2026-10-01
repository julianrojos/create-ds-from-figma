# AGENTS.md

Operational instructions for AI agents in this repository.

## Canonical Source

- `AGENTS.md` and `.agents/` are the tool-neutral source of truth.

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

- Para trabajos sobre el Design System generado, incluyendo ediciones en `src/`, seguir también `design-system/AGENTS.md` cuando exista.
- `.agents/skills/create-ds-from-figma/SKILL.md` es la skill canónica y detectable; no crear copias sincronizadas.
- Si se cambia el formato de relaciones Figma, actualizar juntas las plantillas `figma-state.json`, `figma-code-map.json`, las skills auxiliares `find-component`, `map-figma-to-code` y `validate-ds`, y los checks de `.agents/checks/`.
