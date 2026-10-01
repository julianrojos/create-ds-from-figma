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
- Nunca hacer commit si no hay orden previo del usuario.
- Trabajar siempre en la rama activa del repositorio principal.
- El usuario es quien decide cuándo crear ramas y commits. No hacerlo de forma autónoma.

## Skill create-ds-from-figma

- Para trabajos sobre el Design System generado, incluyendo ediciones en `src/`, seguir también `design-system/AGENTS.md` cuando exista.
- `.agents/design-system-resources/skills/create-ds-from-figma/SKILL.md` es el documento canónico de la skill y no debe tener frontmatter de autodetección.
- `.agents/skills/create-ds-from-figma/SKILL.md` es solo un wrapper mínimo para autodetección; no mantener otra implementación ahí.
- Si se cambia el formato de relaciones Figma, actualizar juntas las plantillas `figma-state.json`, `figma-code-map.json`, los recursos auxiliares de `.agents/design-system-resources/skills/` y los checks de `.agents/design-system-resources/checks/`.
