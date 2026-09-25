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

**Primera vez** (falta `design-system/relationships/figma-code-map.json` o `src/styles/tokens.css`, aunque haya un directorio `design-system/` vacío o un `AGENTS.md` propio): analiza Figma antes de escribir; si el diagnóstico permite importar, monta el **árbol entero**, vuelca **todas** las variables del file (todas las colecciones) y rellena **el componente de la URL**. Si el scaffold quedó a medias (existe uno de esos dos archivos pero no el otro), completa solo lo que falte sin sobrescribir lo existente.

**Siguiente componente** (existen `design-system/relationships/figma-code-map.json` y `src/styles/tokens.css`, incluso si solo se preparó el scaffold): analiza Figma antes de escribir. Si el componente es nuevo, añade ficha, código, mapa e inventario sin recrear Vite ni `.ai/`. Si ya existe, solo la transición comprobada de un anidado `external` a `mapped` habilita una actualización localizada; otros cambios se comunican y requieren una petición explícita de actualización. Si Figma trae colecciones o variables nuevas durante una importación o actualización autorizada, **mézclalas**; no borres las que ya hay.

## Cómo hablar

En español, después del preanálisis y antes de tocar disco, comunica el diagnóstico:

```text
**Modo:** primera vez | siguiente componente
**Diagnóstico:** nodo y file de origen; variantes, propiedades y estados; colecciones/variables del file y tokens usados; anidados mapped/missing/external
**Decisión:** importar | reutilizar | actualizar dependencia | actualizar componente solicitado | solicitar actualización | pedir ref o autorización | DS_GAP | pedir URL de origen
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
Si el repo ya tiene `AGENTS.md`, conserva sus instrucciones y añade solo las reglas e inventario del DS que falten; no lo sobrescribas con la plantilla. Mantén `Incluidos: …` como **última línea**.

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

## Preanálisis antes de escribir

No crees el árbol, tokens, fichas, código ni registros durante este preanálisis. Reutiliza sus resultados al implementar; no repitas llamadas a Figma salvo que falte información o los datos hayan cambiado.

1. Lee el nodo de la URL con `get_metadata` para identificar tipo y estructura. Si es una variante, localiza su component set y analiza **todas** las variantes; conserva la variante enlazada como referencia. Si es una instancia, resuelve su `mainComponent`. Si es un frame o pantalla, detente. Si la instancia raíz es `remote`, pide la URL del componente en su file de origen; no asumas que las variables del file enlazado le pertenecen.
2. En el file donde vive el componente, lee **todas** las colecciones y variables locales, con modos y aliases, sin escribir aún. Comprueba que haya variables. `get_variable_defs` del nodo no sirve como inventario.
3. Lee el contexto estructurado del componente o set (`get_design_context` o `use_figma`, según el detalle necesario). Inventaria variantes y props, propiedades expuestas, estados representados, bindings y variables realmente usadas. Prepara los datos de `metadata.json` solo con lo observado; la ficha se escribe después del diagnóstico. No inventes estados, props ni tokens. Si falta información, intenta obtenerla con la otra herramienta o comunica la limitación. Esta lectura del nodo **no sustituye** el inventario de variables del file.
4. Recorre todas las variantes, resuelve cada instancia hija según «Componentes anidados» y consulta `find-component` para el nodo raíz si el mapa existe. En la primera vez, el mapa está vacío: las instancias locales son `missing`. Prepara el diagnóstico completo antes de decidir.

Evalúa esta tabla **de arriba abajo**; aplica la primera fila que corresponda:

| Resultado del diagnóstico | Decisión antes de escribir |
| --- | --- |
| Frame o pantalla | `DS_GAP`; no escribir |
| Instancia raíz `remote` | Pedir URL del componente en su file de origen; no escribir |
| File de origen sin variables | `DS_GAP`; no escribir |
| Algún anidado local `missing` | Mostrar nombres y refs; `DS_GAP`; no escribir |
| Componente ya importado y actualización pedida expresamente (general o sustitución de una dependencia concreta) | Seguir «Actualización solicitada» con el alcance pedido |
| Componente ya importado: un anidado pasa de `external` a `mapped`, pero su identidad no es verificable (sin identificador común o con datos contradictorios) | No escribir; pedir un ref adicional o autorización explícita para sustituir esa dependencia. Comunicar también las demás diferencias observadas |
| Componente ya importado: un anidado registrado como `external` ahora resuelve a `mapped`, con identidad verificada como igual y sin otras diferencias | Actualizar solo esa dependencia y su import en el código, con la cautela indicada abajo |
| Componente ya importado: otros cambios observados | Mostrar diferencias; solicitar una petición explícita de actualización; no escribir |
| Componente ya importado: ninguna transición de dependencia ni otros cambios observados | Reutilizar; no reescribir |
| Anidado `external` sin otros bloqueos | Continuar y avisar de la librería externa |
| Componente nuevo sin bloqueos | Importar |

«Otros cambios observados» significa diferencias comprobables entre el análisis actual y los datos ya guardados: `metadata.json` (variantes, estados, tokens), la entrada correspondiente de `figma-code-map.json` (refs y props) y los `nestedComponents` de `figma-state.json` (instancias añadidas o quitadas, o un cambio verificado en la identidad de su componente principal). Esa identidad se compara por tipo de identificador: `mainComponentKey`, o `mainComponentNodeId` junto con el `fileKey` de ese componente (el propio `fileKey` del DS para un anidado local; `mainComponentFileKey` cuando la herramienta lo devuelve para uno remoto). Solo se verifica como igual si hay al menos un identificador compartido y todos los compartidos coinciden; como distinta, si hay identificadores compartidos y todos difieren. Un cambio verificado de identidad cuenta como otro cambio observado aunque el nuevo estado sea `mapped`. Sin identificadores compartidos, o si unos coinciden y otros difieren, la identidad no es verificable: no asumas igualdad ni cambio; pide confirmación. La actualización automática solo aplica cuando la identidad se verifica igual y no hay ninguna otra diferencia observada. No deduzcas cambios visuales o de código que esos datos no permiten comparar.

Repara antes el árbol o los tokens del file de origen si quedaron incompletos (ver «Dos modos»), sin sobrescribir lo existente, solo al importar, actualizar automáticamente una dependencia, continuar con un anidado `external`, reutilizar o realizar una actualización general solicitada. Una sustitución autorizada solo para una dependencia no permite reparar el scaffold. En cualquier fila cuya decisión sea no escribir —incluidas `DS_GAP`, pedir la URL de origen, identidad no verificable y «otros cambios observados»—, no repares el scaffold, salvo la excepción explícita de abajo.

Si el único bloqueo son anidados `missing` y el usuario pide expresamente preparar solo el proyecto, crea el scaffold y los tokens después de comunicar el diagnóstico, pero no registres el componente bloqueado como importado. En este caso, `App.tsx` debe ser una app válida que renderice un `main` vacío, sin componente ficticio. No guardes `pendingImports`: el reintento consiste en volver a pegar la URL y repetir el preanálisis.

Si la identidad del componente principal de un anidado no es verificable, no cambies código ni estado. Pide un ref adicional o autorización explícita para sustituir esa dependencia concreta. Con un ref nuevo, repite el preanálisis y vuelve a aplicar la tabla. Si el usuario autoriza la sustitución sin poder verificar la identidad, sigue «Actualización solicitada» con alcance limitado a esa dependencia; su autorización no convierte la identidad en verificada ni habilita la actualización automática. Si no aporta ref ni autoriza el cambio, conserva el estado actual.

Para un padre ya importado, localiza cada anidado guardado por su `figmaNodeId` y compara la identidad de su componente principal por tipo de identificador (`mainComponentKey`, o `mainComponentNodeId` con el `fileKey` que le corresponda). Hay tres resultados: identidad verificada como igual si todos los identificadores compartidos coinciden; verificada como distinta si todos difieren; no verificable si no hay ninguno compartido o los compartidos se contradicen. Solo el segundo caso cuenta como «otro cambio observado»; en el tercero, pide un ref o autorización antes de decidir. Aplica la actualización automática solo con identidad verificada igual, cuando además el estado pasó de `external` a `mapped` y no hay ninguna otra diferencia observada: edita únicamente la composición de ese anidado y su estado, conservando el resto del código y las ediciones del alumno. Si no puedes aislar el cambio sin pisar código existente, muestra la modificación propuesta y pide confirmación antes de escribir. `git diff` ayuda a revisar cambios sin confirmar, pero no revela ediciones manuales ya confirmadas. No infieras otros cambios de Figma a partir de una supuesta versión o huella que este kit no guarda.

### Actualización solicitada

Cuando el usuario pida expresamente actualizar un componente importado, usa el preanálisis actual y lee su ficha, código, mapa y estado existentes. Identifica por archivo los cambios necesarios y comunícalos antes de editar. Conserva las ediciones del alumno. Indica siempre el cambio propuesto por archivo. Si un cambio sobrescribiría código existente que no puedes preservar, presenta la modificación concreta y pide confirmación antes de tocar esa parte; la petición de actualización ya autoriza el resto del trabajo. Usa `git diff` para revisar cambios sin confirmar, sin asumir que detecta ediciones ya confirmadas.

Para una actualización general, compara el contexto de diseño actual (`get_design_context` o `use_figma`) y los tokens con el código y el CSS existentes, además de con ficha, mapa y `nestedComponents`; modifica lo solicitado y cualquier diferencia visual o de layout que esa comparación evidencie. Después, mezcla tokens y refs nuevos sin borrar los anteriores, actualiza ficha, código y dependencias de forma coherente, y ejecuta los checks del componente.

Si el usuario solo autoriza sustituir una dependencia de identidad no verificable, cambia únicamente su composición en el código y su entrada en `nestedComponents` (`status`, `resolvedComponent` y los refs e identificadores del nuevo principal que Figma haya devuelto); no actualices tokens, ficha, mapa ni otras dependencias. Comunica las demás diferencias observadas sin aplicarlas y ejecuta los checks del componente.

## Tokens (inventario file-level)

El inventario de tokens es siempre a **nivel de file**, no del nodo del componente. En el preanálisis se lee sin escribir; tras superar el diagnóstico se persiste.

1. Lista **todas** las colecciones locales: `figma.variables.getLocalVariableCollectionsAsync()`.
2. Lista **todas** las variables locales: `figma.variables.getLocalVariablesAsync()`.
3. Escribe un JSON por colección + un único `src/styles/tokens.css` con **todas** las variables.

**Prohibido como inventario de tokens:**

- `get_variable_defs` del nodo del componente (solo trae las ligadas a ese nodo)
- quedarse con las variables que usa el primitive de la URL
- fusionar colecciones distintas en tres buckets (color / spacing / type)

`get_design_context` puede usarse en el preanálisis, pero nunca como fuente del inventario de tokens: ese inventario procede de todas las variables del file de origen.

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

`figma-state.json`: rellena `collections` (id, name, modes, varCount), las variables agrupadas por colección y, por cada componente **importado con código disponible**, su entrada en `components`. No registres componentes bloqueados en `components` ni en un inventario de páginas. El kit no usa `phase` ni `pages` para representar intentos de importación.

`figma-code-map.json`: una entrada por componente o component set, en el nivel raíz junto a `_schema` (que se ignora al leer). Por defecto, usa `<FILE_KEY>:<COMPONENT_OR_SET_NODE_ID>` como clave de entrada; para remotos sin file/node fiable, usa `componentKey:<COMPONENT_KEY>`. El ref de esa clave debe estar también en `figma.refs`. Guarda refs estables del componente/set en `figma.refs` y refs estables de cada variante en `figma.variants[*].refs`. Los refs tienen forma `<FILE_KEY>:<NODE_ID>`, con el `fileKey` del file donde vive el nodo (el del DS para un nodo local; el de la librería para un componente remoto, si la herramienta lo devuelve), o `componentKey:<COMPONENT_KEY>` cuando Figma devuelva una key. Un componente se resuelve con una sola regla: busca cualquiera de sus refs estables en `figma.refs` o en los `refs` de alguna variante. Si coincide con una variante, esa es la `matched variant` y sus `props` son los que usa el código. No uses el id único de la instancia colocada como mapeo estable.

Al importar o actualizar un componente, añade a `figma.refs` y `figma.variants[*].refs` todos los refs que devuelva Figma para el set/componente y sus variantes: refs `<FILE_KEY>:<NODE_ID>` y `componentKey:<KEY>` cuando existan. Mezcla refs nuevos con los existentes; no borres refs previos. Un ref solo puede pertenecer a una entrada del mapa; si aparece en dos entradas, para y reporta el conflicto.

## Componentes anidados

Durante el preanálisis, detecta las instancias de todas las variantes antes de escribir ningún archivo. Reutiliza ese análisis al implementar.

1. Recorre el árbol del nodo del componente y lista cada instancia (`INSTANCE`). `get_metadata` basta para saber que existen (`<instance>`). Para el `mainComponent` (su id, si es `remote`, su `componentKey` si existe y, cuando sea `remote`, el `fileKey` de su propio file si la herramienta lo devuelve), props y variants usa `get_design_context` o `use_figma`; si una herramienta no devuelve un ref estable, intenta la otra antes de clasificar. Vectores, formas e imágenes que no son instancias no son anidados: se quedan dentro del componente y no se registran.
2. Ejecuta `find-component` sobre **cada** instancia. La clasificación la hace `find-component`, no este paso:
   - `mapped`: ya está en `figma-code-map.json`, sea local o de otra librería;
   - `missing`: instancia de un componente **local** (mismo file que el DS) sin mapeo;
   - `external`: instancia de un componente de **otra librería** (`remote`) sin mapeo.
3. Si hay cualquier `missing`, para antes de escribir con `DS_GAP` y di explícitamente: `Primero importa <Nombre>, luego vuelve a este componente.` No implementes componentes anidados de forma implícita ni guardes el padre en `figma-state.json`.
4. Un `external` **no bloquea**: se trata como parte del componente actual. Avísalo en el resumen final: `<Nombre> viene de otra librería y se ha tratado como parte de este componente; si es parte del DS, importa su URL y vuelve a este componente.`
5. Si tras intentarlo con `get_design_context` y `use_figma` no puedes obtener un ref estable (`<FILE_KEY>:<MAIN_COMPONENT_NODE_ID>` para un anidado local, `<MAIN_COMPONENT_FILE_KEY>:<MAIN_COMPONENT_NODE_ID>` para uno remoto si la herramienta devuelve ambos valores, o `componentKey:<COMPONENT_KEY>`), usa nombre y variants solo como pista de baja confianza, sin devolver `mapped` y sin escribir mapeos nuevos. Si tampoco puedes saber si el `mainComponent` es local o `remote`, no adivines: pregunta al usuario.
6. Solo tras importar con éxito, registra los anidados `mapped` o `external` en `figma-state.json`, dentro de la entrada del componente:

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
          "mainComponentFileKey": "<MAIN_COMPONENT_FILE_KEY>",
          "mainComponentKey": "<COMPONENT_KEY>",
          "figmaName": "<Nombre en Figma>",
          "status": "mapped | external",
          "resolvedComponent": "<NombreLocal>"
        }
      ]
    }
  }
}
```

`mainComponentRef` aparece cuando tengas un ref estable. `mainComponentNodeId` y `mainComponentKey` aparecen solo cuando la herramienta los devuelve. `mainComponentFileKey` aparece solo para un anidado `remote` cuando la herramienta devuelve el `fileKey` de su propio file; sin él, un `mainComponentNodeId` remoto no es una identidad verificable. `resolvedComponent` solo aparece cuando `status` es `mapped`. No añadas anidados al inventario de `AGENTS.md` ni a `composition-rules.md` si no tienen carpeta real en `design-system/components/`.

Al volver a pedir un componente ya importado, reanaliza sus anidados con el mapa actual y aplica la tabla del preanálisis. Si uno pasa de `external` a `mapped`, cambia `nestedComponents` y el import/uso del componente local en el padre solo cuando se verifiquen las condiciones para la actualización automática o el usuario autorice expresamente esa sustitución; nunca cambies solo el JSON. Para otros cambios observados, informa y espera una petición explícita de actualización; no reescribas el componente por iniciativa propia.

## Inventario (obligatorio al incluir)

Tras cada primitive o pantalla que **sí** hayas implementado:

1. Última línea de `AGENTS.md`: lista **solo** los nombres que existen en `design-system/components/` y `src/pages/`. Cero nombres previstos.
2. En `design-system/system/composition-rules.md`, sección `## Incluidos`: **añade** una viñeta (no borres las anteriores).
   - Primitive: `- **<Nombre>** — <una frase de uso>.`
   - Pantalla: `- **<Nombre>** (pantalla) — se compone como <A → B>` usando **solo** primitives ya incluidos.

No escribas en esas listas un componente que no tenga carpeta en el DS.

## Primera vez (orden)

1. **Preanálisis y diagnóstico** — identifica el nodo, lee variables del file de origen, analiza el set y sus anidados. Aplica la tabla de decisiones y comunica el resultado antes de escribir.
2. **Árbol** — si se puede importar, monta Vite React TS (CSS modules, sin Tailwind) y copia `plantillas/`.
3. **Tokens** — persiste el inventario **file-level** ya leído: una JSON por colección + `src/styles/tokens.css`.
4. **Ficha** — `metadata.json` + `usage.md` con variantes, estados y tokens observados (plantilla `plantillas/componentes/`).
5. **Código** — `src/components/<Nombre>/` con tokens y reutilizando anidados `mapped`.
6. **Mapa** — entradas en `figma-code-map.json` con `refs` y en `figma-state.json` con `nestedComponents` `mapped` o `external`.
7. **App** — `App.tsx` renderiza **solo** ese componente (para `npm run dev`).
8. **Inventario** — `AGENTS.md` + `## Incluidos` (solo ese componente).
9. **Checks** — `.ai/skills/validate-ds/SKILL.md` sobre ese componente.

Copia también esta skill a `.ai/skills/create-ds-from-figma/SKILL.md`.

## Siguiente componente

1. Preanálisis y diagnóstico completos antes de escribir, también si el componente ya existe. Si hay `missing`, para sin tocar el proyecto.
2. `find-component` — si no existe, continúa con la importación. Si existe, compara el análisis actual con `metadata.json`, la entrada del mapa y `nestedComponents`, y aplica la fila que corresponda de la tabla: solo la transición `external` → `mapped` con identidad verificada igual y sin otras diferencias se actualiza sola; si la identidad no es verificable, pide un ref o autorización; otros cambios esperan una petición explícita; sin diferencias, reutiliza. No supongas cambios que esos datos no permitan comparar ni reescribas por repetir la URL.
3. Si el componente es nuevo o el usuario pidió expresamente una actualización general, mezcla las colecciones y variables leídas del file en los JSON existentes; no borres variables.
4. Para un componente nuevo, crea ficha + código + mapa. Para uno existente, sigue «Actualización solicitada» si el usuario pidió una actualización general o autorizó una sustitución concreta; en otro caso, actualiza automáticamente solo una transición `external` → `mapped` con identidad verificada igual, sin otras diferencias y que puedas editar sin pisar cambios del alumno. Si no puedes aislarla, muestra el cambio propuesto y pide confirmación. No guardes `missing` ni estados `blocked`.
5. Si `App.tsx` está vacío porque solo se preparó el scaffold, renderiza ahí el primer componente que se importe. En los demás casos, no lo sustituyas salvo que pidan ver el nuevo; no borres componentes viejos.
6. Inventario: añade solo nombres nuevos; no quites los anteriores.
7. Checks de **este** componente, también tras una actualización localizada.

## Cuando pidan una pantalla

1. Una sola página en `src/pages/`. `App.tsx` la renderiza.
2. Solo primitives **ya incluidos**. Si `find-component` devuelve `not found` para un elemento de pantalla, reporta `DS_GAP`; no inventes.
3. Inventario: nombre de pantalla + receta `se compone como …`.
4. Checks de esa página.

## Prohibido

- Rellenar plantillas o el repo del alumno con un DS de ejemplo
- Generar todos los componentes del file de golpe
- Citar en reglas o inventario componentes que aún no están en el repo
- Una pantalla en la primera vez (si la URL es una pantalla: `DS_GAP`, sin escribir)
- Hex/spacing inventados
- Resumir variables a `colors.json` / `spacing.json` / `typography.json`
- Inventario de tokens solo con las variables del componente
- Tailwind, Storybook, CI, `docs/`, `.github/`
- Más de dos archivos por carpeta en `design-system/components/<Nombre>/`
