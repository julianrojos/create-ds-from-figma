# create-ds-from-figma

Kit **vacío** para que los alumnos arranquen un Design System desde 0.

No trae tokens, componentes ni pantallas. El agente analiza la URL de Figma antes de escribir y crea el DS cuando el componente puede importarse.

## Instalar

1. Descomprime este zip.
2. Copia la carpeta `create-ds-from-figma` (entera: `SKILL.md` + `plantillas/`) a:

```text
~/.agents/skills/create-ds-from-figma/
```

Tiene que quedar así:

```text
~/.agents/skills/create-ds-from-figma/SKILL.md
~/.agents/skills/create-ds-from-figma/README.md
~/.agents/skills/create-ds-from-figma/plantillas/
```

3. Reinicia el IDE o recarga skills si hace falta.

## Usar

Proyecto sin `design-system/relationships/figma-code-map.json` o sin `src/styles/tokens.css` (aunque exista un directorio `design-system/` vacío) → chat:

```text
Crea un DS

<URL de UN componente de Figma>
```

El file de origen debe tener **variables**. La URL puede apuntar a un componente, un component set, una variante o una instancia cuyo componente principal se pueda resolver; un frame o pantalla no se importa por este flujo.

Antes de crear archivos, el agente identifica el componente y sus variantes, lee **todas** las colecciones del file de origen y resuelve los componentes anidados. Si falta uno local, informa `DS_GAP` y espera su URL sin escribir archivos. Solo prepara el scaffold y los tokens pese a ese bloqueo si el usuario lo pide expresamente; el componente bloqueado nunca figura como importado. Si el análisis permite continuar, vuelca un JSON por colección e implementa **solo** el componente pedido.

Si se prepara solo el scaffold, `App.tsx` queda válida y vacía hasta importar el primer componente.

Siguiente primitive: otra URL. Pantalla: cuando ya haya primitives.

## Qué incluye

| Pieza         | Para qué                                                                        |
| ------------- | ------------------------------------------------------------------------------- |
| `SKILL.md`    | Instrucciones del agente                                                        |
| `plantillas/` | Árbol fijo vacío (`.ai/`, `AGENTS.md`, system, relationships, fichas-plantilla) |

No incluye un DS relleno, ni `tokens/*.json`, ni app de ejemplo.

## No negociable

- Kit y repo de alumno empiezan vacíos
- Sin Tailwind, Storybook ni CI
- Cada primitive: solo `metadata.json` + `usage.md`
- Si Figma no mapea: `DS_GAP`, no inventar
- No citar en `composition-rules` ni `AGENTS.md` un componente que no exista aún
- No resumir tokens a color/spacing/type
