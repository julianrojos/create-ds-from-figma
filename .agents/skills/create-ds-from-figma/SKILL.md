---
name: create-ds-from-figma
description: From an empty folder, create the AI-ready Design System tree and the first Figma component; later fills more components into the same tree. Use when the user says crea un DS, create a design system, pastes a Figma component URL, or adds another primitive to an existing DS pilot.
---

# Crear DS desde un componente Figma

El usuario abre una **carpeta vacía**, dice **crea un DS** y pega **un componente** de Figma (el file tiene variables).

Eso basta. No pidas el esqueleto en un paso aparte.

No cites primitives ni pantallas que aún no existan en este repo. El inventario (última línea de `AGENTS.md` y `## Incluidos` en `composition-rules.md`) empieza vacío y **se rellena al incluir cada pieza**.

## Kit vacío (alumnos)

Las plantillas van **en blanco**. No incluyen colecciones, tokens, primitives ni pantallas de ningún file de ejemplo.

- `AGENTS.md` → `Incluidos: —`
- `composition-rules.md` → `## Incluidos` vacío
- `figma-code-map.json` → solo `_schema`, sin entradas
- `figma-state.json` → `_schema` + colecciones, variables y components vacíos
- **no** hay `design-system/tokens/` en el kit; esa carpeta nace en el primer volcado MCP

No copies un DS ya relleno “para que se vea”. El alumno abre una carpeta vacía y el agente escribe tokens y el primer componente desde Figma.

## Dos modos

**Primera vez** (no hay `AGENTS.md` ni `design-system/`): monta el **árbol entero**, vuelca **todas** las variables del file (todas las colecciones) y rellena **el componente de la URL**.

**Siguiente componente** (el árbol ya existe): no recrees Vite, `.ai/` ni tokens. Solo añade ficha, código, mapa e inventario. Si Figma trae colecciones o variables nuevas, **mézclalas**; no borres las que ya hay.

## Cómo hablar

En español, antes de tocar disco:

```text
**Modo:** primera vez | siguiente componente
**Qué voy a hacer ahora:** ...
**Qué no voy a hacer:** ni otros primitives que no estén en esta URL, ni una pantalla, ni Tailwind, ni copiar un DS ya relleno, ni resumir tokens a 3 archivos
```

Luego haz el trabajo. Al cerrar: archivos tocados + “para el siguiente, pega otra URL de componente”.

Si dice **paso a paso**: un bloque y espera **sigue**.
Si dice **crea un DS** (o pega la URL en vacío): ejecuta el modo que toque, narrando cada bloque.

## Kit (árbol fijo)

`plantillas/` es **hermana de este SKILL.md**. Búscala en este orden:

1. `<carpeta-de-este-SKILL.md>/plantillas/`
2. `~/.agents/skills/create-ds-from-figma/plantillas/`

Si no está: para y pide descomprimir el zip de la skill en `~/.agents/skills/create-ds-from-figma/`.

Copia **sin editar** desde ese `plantillas/`:

| Origen                        | Destino                                     |
| ----------------------------- | ------------------------------------------- |
| `ai/`                         | `.ai/`                                      |
| `AGENTS.md`                   | `AGENTS.md`                                 |
| `system/accessibility.md`     | `design-system/system/accessibility.md`     |
| `system/composition-rules.md` | `design-system/system/composition-rules.md` |
| `relationships/*.json`        | `design-system/relationships/`              |

No copies un repo de Design System **ya relleno** (código y fichas de componentes hechos).

## Árbol (ni una carpeta más)

```text
AGENTS.md
.ai/workflows/build-from-figma.md
.ai/skills/find-component/SKILL.md
.ai/skills/map-figma-to-code/SKILL.md
.ai/skills/validate-ds/SKILL.md
.ai/skills/create-ds-from-figma/SKILL.md
.ai/checks/token-usage.md
.ai/checks/component-reuse.md
.ai/checks/accessibility.md
design-system/tokens/<Coleccion>.json   ← no está en plantillas; nace al volcar Figma
design-system/components/<Nombre>/metadata.json
design-system/components/<Nombre>/usage.md
design-system/relationships/figma-code-map.json
design-system/relationships/figma-state.json
design-system/system/composition-rules.md
design-system/system/accessibility.md
src/styles/tokens.css
src/components/<Nombre>/<Nombre>.tsx
src/components/<Nombre>/<Nombre>.module.css
src/components/<Nombre>/index.ts
src/App.tsx
src/main.tsx
package.json   (Vite + React + TS, scripts dev/build/preview)
```

`design-system/tokens/<Coleccion>.json` = **un archivo por colección de variables de Figma**, con el mismo nombre de la colección (caracteres inseguros para fichero → `-`). No uses `colors.json` / `spacing.json` / `typography.json` como resumen fijo.

`src/pages/` **no** se crea hasta que pidan una pantalla.

## Tokens (primer contacto MCP)

El **primer** contacto con Figma para tokens es a **nivel de file**, no del nodo del componente.

1. Lista **todas** las colecciones locales: `figma.variables.getLocalVariableCollectionsAsync()`.
2. Lista **todas** las variables locales: `figma.variables.getLocalVariablesAsync()`.
3. Escribe un JSON por colección + un único `src/styles/tokens.css` con **todas** las variables.

**Prohibido como inventario de tokens:**

- `get_variable_defs` del nodo del componente (solo trae las ligadas a ese nodo)
- quedarse con las variables que usa el primitive de la URL
- fusionar colecciones distintas en tres buckets (color / spacing / type)

`get_design_context` del componente va **después** del volcado de tokens, para implementar el primitive.

Si no hay variables en el file: `DS_GAP` y para. No inventes hex.

### Forma de cada `design-system/tokens/<Coleccion>.json`

```json
{
  "collection": "<nombre en Figma>",
  "id": "<VariableCollectionId:...>",
  "modes": ["<mode>", "..."],
  "variables": {
    "<nombre en Figma>": {
      "id": "VariableID:...",
      "type": "COLOR | FLOAT | STRING | BOOLEAN",
      "valuesByMode": {
        "<mode>": "#HEX | <número> | { \"alias\": \"<nombre>\", \"value\": "<resuelto>" }"
      }
    }
  }
}
```

Mismos nombres que en Figma. Alias: guarda `alias` + valor resuelto. FLOAT de spacing/radius/tipo: añade unidad `px` en CSS cuando el valor sea longitud.

`src/styles/tokens.css`: una custom property por variable de **todas** las colecciones (aliases → `var(--…)`, no hex duplicado si ya existe el primitvo).

`figma-state.json`: rellena `collections` (id, name, modes, varCount), las variables agrupadas por colección y, por cada componente implementado, su entrada en `components`.

`figma-code-map.json`: una entrada por componente o component set, en el nivel raíz junto a `_schema` (que se ignora al leer). Por defecto, usa `<FILE_KEY>:<COMPONENT_OR_SET_NODE_ID>` como clave de entrada; para remotos sin file/node fiable, usa `componentKey:<COMPONENT_KEY>`. El ref de esa clave debe estar también en `figma.refs`. Guarda refs estables del componente/set en `figma.refs` y refs estables de cada variante en `figma.variants[*].refs`. Los refs tienen forma `<FILE_KEY>:<NODE_ID>` para nodos locales del file, o `componentKey:<COMPONENT_KEY>` cuando Figma devuelva una key. Un componente se resuelve con una sola regla: busca cualquiera de sus refs estables en `figma.refs` o en los `refs` de alguna variante. Si coincide con una variante, esa es la `matched variant` y sus `props` son los que usa el código. No uses el id único de la instancia colocada como mapeo estable.

Al importar o actualizar un componente, añade a `figma.refs` y `figma.variants[*].refs` todos los refs que devuelva Figma para el set/componente y sus variantes: refs `<FILE_KEY>:<NODE_ID>` y `componentKey:<KEY>` cuando existan. Mezcla refs nuevos con los existentes; no borres refs previos. Un ref solo puede pertenecer a una entrada del mapa; si aparece en dos entradas, para y reporta el conflicto.

## Componentes anidados

Tras volcar o actualizar tokens, lee el contexto estructurado del componente y detecta instancias anidadas antes de escribir ficha o código.

1. Recorre el árbol del nodo del componente y lista cada instancia (`INSTANCE`). `get_metadata` basta para saber que existen (`<instance>`). Para el `mainComponent` (su id, si es `remote` y su `componentKey` si existe), props y variants usa `get_design_context` o `use_figma`; si una herramienta no devuelve un ref estable, intenta la otra antes de clasificar. Vectores, formas e imágenes que no son instancias no son anidados: se quedan dentro del componente y no se registran.
2. Ejecuta `find-component` sobre **cada** instancia. La clasificación la hace `find-component`, no este paso:
   - `mapped`: ya está en `figma-code-map.json`, sea local o de otra librería;
   - `missing`: instancia de un componente **local** (mismo file que el DS) sin mapeo;
   - `external`: instancia de un componente de **otra librería** (`remote`) sin mapeo.
3. Si hay cualquier `missing`, para con `DS_GAP` y di explícitamente: `Primero importa <Nombre>, luego vuelve a este componente.` No implementes componentes anidados de forma implícita.
4. Un `external` **no bloquea**: se trata como parte del componente actual. Avísalo en el resumen final: `<Nombre> viene de otra librería y se ha tratado como parte de este componente; si es parte del DS, importa su URL y vuelve a este componente.`
5. Si tras intentarlo con `get_design_context` y `use_figma` no puedes obtener un ref estable (`<FILE_KEY>:<MAIN_COMPONENT_NODE_ID>` o `componentKey:<COMPONENT_KEY>`), usa nombre y variants solo como pista de baja confianza, sin devolver `mapped` y sin escribir mapeos nuevos. Si tampoco puedes saber si el `mainComponent` es local o `remote`, no adivines: pregunta al usuario.
6. Registra el resultado en `figma-state.json`, dentro de la entrada del componente:

```json
{
  "components": {
    "<Nombre>": {
      "figmaNodeId": "<NODE_ID>",
      "nestedComponents": [
        {
          "figmaNodeId": "<CHILD_NODE_ID>",
          "mainComponentRef": "<FILE_KEY>:<MAIN_COMPONENT_NODE_ID> | componentKey:<COMPONENT_KEY>",
          "mainComponentNodeId": "<MAIN_COMPONENT_NODE_ID>",
          "mainComponentKey": "<COMPONENT_KEY>",
          "figmaName": "<Nombre en Figma>",
          "status": "mapped | missing | external",
          "resolvedComponent": "<NombreLocal>"
        }
      ]
    }
  }
}
```

`mainComponentRef` aparece cuando tengas un ref estable. `mainComponentNodeId` y `mainComponentKey` aparecen solo cuando la herramienta los devuelve. `resolvedComponent` solo aparece cuando `status` es `mapped`. No añadas anidados al inventario de `AGENTS.md` ni a `composition-rules.md` si no tienen carpeta real en `design-system/components/`.

## Inventario (obligatorio al incluir)

Tras cada primitive o pantalla que **sí** hayas implementado:

1. Última línea de `AGENTS.md`: lista **solo** los nombres que existen en `design-system/components/` y `src/pages/`. Cero nombres previstos.
2. En `design-system/system/composition-rules.md`, sección `## Incluidos`: **añade** una viñeta (no borres las anteriores).
   - Primitive: `- **<Nombre>** — <una frase de uso>.`
   - Pantalla: `- **<Nombre>** (pantalla) — se compone como <A → B>` usando **solo** primitives ya incluidos.

No escribas en esas listas un componente que no tenga carpeta en el DS.

## Primera vez (orden)

1. **Mirar Figma** — ¿es un primitive (component/component set)? Si es una pantalla: crea igual el árbol + **tokens de todo el file**, **no** implementes la pantalla ni inventes primitives internos. `DS_GAP` y para.
2. **Árbol** — Vite React TS (CSS modules, sin Tailwind) + copia `plantillas/`.
3. **Tokens** — volcado **file-level** (sección Tokens). Una JSON por colección + `src/styles/tokens.css`.
4. **Anidados** — lee contexto estructurado, detecta `nestedComponents`, resuelve cada instancia y para con `DS_GAP` si una instancia local no está mapeada (`missing`).
5. **Ficha** — `metadata.json` + `usage.md` (plantilla `plantillas/componentes/`).
6. **Código** — `src/components/<Nombre>/` con tokens y reutilizando anidados `mapped`.
7. **Mapa** — entradas en `figma-code-map.json` con `refs` y en `figma-state.json` con `nestedComponents`.
8. **App** — `App.tsx` renderiza **solo** ese componente (para `npm run dev`).
9. **Inventario** — `AGENTS.md` + `## Incluidos` (solo ese componente).
10. **Checks** — `.ai/skills/validate-ds/SKILL.md` sobre ese componente.

Copia también esta skill a `.ai/skills/create-ds-from-figma/SKILL.md`.

## Siguiente componente

1. Mirar Figma (un primitive).
2. `find-component` — si existe, para.
3. Tokens: vuelve a leer **todas** las colecciones del file; merge en los JSON existentes; si aparece una colección nueva, crea su JSON; no borres variables.
4. Anidados: lee contexto estructurado, detecta `nestedComponents`, resuelve cada instancia y para con `DS_GAP` si una instancia local no está mapeada (`missing`).
5. Ficha + código + mapa con `refs` y `nestedComponents`.
6. No sustituyas `App.tsx` salvo que aún muestre el primer componente y pidan ver el nuevo; no borres componentes viejos.
7. Inventario: añade este nombre; no quites los anteriores.
8. Checks de **este** componente.

## Cuando pidan una pantalla

1. Una sola página en `src/pages/`. `App.tsx` la renderiza.
2. Solo primitives **ya incluidos**. Lo que no mapee: `DS_GAP`, no inventes.
3. Inventario: nombre de pantalla + receta `se compone como …`.
4. Checks de esa página.

## Prohibido

- Rellenar plantillas o el repo del alumno con un DS de ejemplo
- Generar todos los componentes del file de golpe
- Citar en reglas o inventario componentes que aún no están en el repo
- Una pantalla en la primera vez (si la URL es una pantalla: árbol + tokens de **todo el file**, `DS_GAP`, para)
- Hex/spacing inventados
- Resumir variables a `colors.json` / `spacing.json` / `typography.json`
- Inventario de tokens solo con las variables del componente
- Tailwind, Storybook, CI, `docs/`, `.github/`
- Más de dos archivos por carpeta en `design-system/components/<Nombre>/`
