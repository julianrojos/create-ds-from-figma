# create-ds-from-figma

Kit **vacío** para que los alumnos arranquen un Design System desde 0.

No trae tokens, componentes ni pantallas. Eso lo escribe el agente en el primer `Crea un DS` + URL de Figma.

## Instalar

1. Descomprime este zip.
2. Copia la carpeta `create-ds-from-figma` (entera: `SKILL.md` + `plantillas/`) a:

```text
~/.cursor/skills/create-ds-from-figma/
```

Tiene que quedar así:

```text
~/.cursor/skills/create-ds-from-figma/SKILL.md
~/.cursor/skills/create-ds-from-figma/README.md
~/.cursor/skills/create-ds-from-figma/plantillas/
```

3. Reinicia Cursor o recarga skills si hace falta.

## Usar

Carpeta de proyecto **vacía** (sin `design-system/`, sin componentes) → chat:

```text
Crea un DS

<URL de UN componente de Figma>
```

El file de Figma debe tener **variables**. El nodo debe ser un **componente**, no una pantalla.

En el primer contacto MCP el agente vuelca **todas** las colecciones del file (un JSON por colección). Luego implementa **solo** el componente de la URL.

Siguiente primitive: otra URL. Pantalla: cuando ya haya primitives.

## Qué incluye

| Pieza | Para qué |
|---|---|
| `SKILL.md` | Instrucciones del agente |
| `plantillas/` | Árbol fijo vacío (`.ai/`, `AGENTS.md`, system, relationships, fichas-plantilla) |

No incluye un DS relleno, ni `tokens/*.json`, ni app de ejemplo.

## No negociable

- Kit y repo de alumno empiezan vacíos
- Sin Tailwind, Storybook ni CI
- Cada primitive: solo `metadata.json` + `usage.md`
- Si Figma no mapea: `DS_GAP`, no inventar
- No citar en `composition-rules` ni `AGENTS.md` un componente que no exista aún
- No resumir tokens a color/spacing/type
