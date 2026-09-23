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
- Trabajar siempre en la rama activa del repositorio principal.
- El usuario es quien decide cuándo crear ramas y commits. No hacerlo de forma autónoma.

## Skill create-ds-from-figma

- Mantener sincronizados `.agents/skills/create-ds-from-figma/SKILL.md` y `.agents/skills/create-ds-from-figma/plantillas/ai/skills/create-ds-from-figma/SKILL.md`.
- Si se cambia el formato de relaciones Figma, actualizar juntas las plantillas `figma-state.json`, `figma-code-map.json`, `find-component`, `map-figma-to-code` y los checks relacionados.
