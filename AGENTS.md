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
- Nuna hacer commit si no hay orden previo del usuario.
- Trabajar siempre en la rama activa del repositorio principal.
- El usuario es quien decide cuándo crear ramas y commits. No hacerlo de forma autónoma.
