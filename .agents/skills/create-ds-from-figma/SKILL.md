---
name: create-ds-from-figma
description: >-
  Import or explicitly update one Figma component in this Design System repo.
  USE WHEN: the user says "crea un DS" or "create a design system", pastes a
  Figma URL by itself, or asks to import, add or update one component, component
  set, variant or instance, including a repeated URL. Inspect the node type first.
  DO NOT USE WHEN: the task is building a screen from a Figma frame or editing
  existing UI without a Figma component import or update request.
---

# Crear DS desde un componente Figma

El usuario trabaja en **este repo**, dice **crea un DS** y pega **un componente** de Figma (el file tiene variables).

Eso basta. No pidas el esqueleto en un paso aparte.

No cites primitives ni pantallas que aún no existan en el DS generado. `design-system/inventory.json` empieza vacío y **se rellena al incluir cada pieza**.

## Kit vacío

Las plantillas van **en blanco**. No incluyen colecciones, tokens, primitives ni pantallas de ningún file de ejemplo.

- `design-system/inventory.json` → listas `components` y `screens` vacías
- `composition-rules.md` → reglas generales, sin inventario de piezas
- `figma-code-map.json` → solo `_schema`, sin entradas
- `figma-state.json` → `_schema` + colecciones, variables y components vacíos
- **no** hay `design-system/tokens/` en el kit; esa carpeta nace en el primer volcado MCP

No copies un DS ya relleno “para que se vea”. El usuario parte de este repo sin componentes importados y el agente escribe tokens y el primer componente desde Figma.

## Dos modos

**Primera vez** (falta `design-system/relationships/figma-code-map.json` o `src/styles/tokens.css`, aunque haya un directorio `design-system/` vacío o instrucciones propias del repo): analiza Figma antes de escribir; si el diagnóstico permite importar, monta el **árbol entero**, vuelca **todas** las variables del file (todas las colecciones) y rellena **el componente de la URL**. Si el scaffold quedó a medias (existe uno de esos dos archivos pero no el otro), completa solo lo que falte sin sobrescribir lo existente.

**Siguiente componente** (existen `design-system/relationships/figma-code-map.json` y `src/styles/tokens.css`, incluso si solo se preparó el scaffold): analiza Figma antes de escribir. Si el componente es nuevo, añade ficha, código, mapa e inventario sin recrear Vite ni copiar recursos auxiliares del agente (`checks/`, `rules/`, otras `skills/`, `workflows/` o `prop-vocabulary.json`). Si ya existe, solo la transición comprobada de un anidado `external` a `mapped` habilita una actualización localizada; otros cambios se comunican y requieren una petición explícita de actualización. Si Figma trae colecciones o variables nuevas durante una importación o actualización autorizada, **mézclalas**; no borres las que ya hay.

## Cómo hablar

En español, después del preanálisis y antes de tocar disco, comunica el diagnóstico:

```text
**Modo:** primera vez | siguiente componente
**Diagnóstico:** nodo y file de origen; variantes, propiedades y estados; colecciones/variables del file y tokens usados; anidados mapped/missing/external
**Medido en Figma:** hechos con fileKey, nodeId o variable ID y herramienta consultada
**Inferido:** interpretación y evidencia en que se apoya; no presentarla como medición
**No determinado:** campo, fuente intentada, motivo y si bloquea la importación
**No aplica:** campo, motivo comprobado y fuente
**Cobertura:** ejes y claves de todas las variantes del set inspeccionadas; qué nodos o fuentes no se cubrieron
**API propuesta:** para cada valor de cada eje, prop | state | interaction | content; para cada estado, consumer | shared | internal; nombres de props y si ya vienen de HTML o de una librería
**No construido:** qué diferencias de Figma no se convierten en API o componente y por qué
**Decisión:** importar | reutilizar | actualizar dependencia | actualizar componente solicitado | solicitar actualización | pedir ref o autorización | DS_GAP | pedir URL de origen
**Qué voy a hacer ahora:** ...
**Qué no voy a hacer:** ni otros primitives que no estén en esta URL, ni una pantalla, ni Tailwind, ni copiar un DS ya relleno, ni resumir tokens a 3 archivos
```

Luego haz el trabajo. Al cerrar: archivos tocados + “para el siguiente, pega otra URL de componente”.

Si dice **paso a paso**: un bloque y espera **sigue**.
Si dice **crea un DS** (o pega la URL en vacío): ejecuta el modo que toque, narrando cada bloque.

## Recursos y plantillas

Este repo es la instalación canónica. Copia al DS generado solo las plantillas indicadas abajo; usa el resto de recursos de agente directamente desde el repo. Las tres referencias de esta skill (`references/tokens.md`, `references/component-metadata.md` y `references/relationships.md`) son instrucciones, no material que se copie:

| Recurso                                        | Uso                                                |
| ---------------------------------------------- | -------------------------------------------------- |
| `.agents/checks/`                              | checks automáticos y manuales                      |
| `.agents/skills/find-component/SKILL.md`       | resolución de nodos Figma a componentes existentes |
| `.agents/skills/map-figma-to-code/SKILL.md`    | mapeo de componentes DS a código y props           |
| `.agents/skills/validate-ds/SKILL.md`          | validación visual y de bindings computados         |
| `.agents/skills/create-ds-from-figma/SKILL.md` | documento canónico de esta skill                   |
| `.agents/workflows/build-from-figma.md`        | workflow de construcción desde Figma               |
| `.agents/rules/design-system.md`               | reglas persistentes para `src/` y `design-system/` |
| `.agents/prop-vocabulary.json`                 | vocabulario canónico de props                      |

`plantillas/` vive junto a este documento en `.agents/skills/create-ds-from-figma/plantillas/` y contiene dos clases de material: `plantillas/design-system/`, que se copia tal cual a `design-system/`, y `plantillas/componentes/`, cuyas fichas se adaptan al crear `design-system/components/<Nombre>/`. Si no está, para y pide abrir este repo completo; no uses una instalación global parcial.

Copia **sin editar** todo `plantillas/design-system/` a `design-system/`.

No copies al DS generado los recursos auxiliares del agente: `.agents/checks/`, `.agents/rules/`, las demás carpetas de `.agents/skills/`, `.agents/workflows/` ni `.agents/prop-vocabulary.json`. No generes `.ai/`.

No copies un repo de Design System **ya relleno** (código y fichas de componentes hechos).
Al trabajar en `src/` o `design-system/`, aplica `.agents/rules/design-system.md`. Registra las piezas implementadas solo en `design-system/inventory.json`.

## Árbol generado

Estos son los archivos que pertenecen al DS/app generado:

```text
design-system/inventory.json
design-system/system/composition-rules.md
design-system/system/accessibility.md
design-system/relationships/figma-code-map.json
design-system/relationships/figma-state.json
design-system/tokens/<Coleccion>.json   ← no está en plantillas; nace al volcar Figma
design-system/components/<Nombre>/metadata.json
design-system/components/<Nombre>/usage.md
src/styles/tokens.css
src/components/<Nombre>/<Nombre>.tsx
src/components/<Nombre>/<Nombre>.module.css
src/components/<Nombre>/index.ts
src/App.tsx
src/main.tsx
package.json   (Vite + React + TS, TypeScript, PostCSS y postcss-selector-parser en devDependencies, scripts dev/build/preview)
```

`design-system/tokens/<Coleccion>.json` = **un archivo por colección de variables de Figma**, con el mismo nombre de la colección (caracteres inseguros para fichero → `-`). No uses `colors.json` / `spacing.json` / `typography.json` como resumen fijo.

`src/pages/` **no** se crea hasta que pidan una pantalla.

## Preanálisis antes de escribir

No crees el árbol, tokens, fichas, código ni registros durante este preanálisis. Reutiliza sus resultados al implementar; no repitas llamadas a Figma salvo que falte información o los datos hayan cambiado.

1. Lee el nodo de la URL con `get_metadata` para identificar tipo y estructura. Si es una variante, localiza su component set y analiza **todas** las variantes; conserva la variante enlazada como referencia. Si es una instancia, resuelve su `mainComponent`. Si es un frame o pantalla, detente. Si la instancia raíz es `remote`, pide la URL del componente en su file de origen; no asumas que las variables del file enlazado le pertenecen.
2. En el file donde vive el componente, lee **todas** las colecciones y variables locales, con modos, modo por defecto y aliases, sin escribir aún. Lee `references/tokens.md` completo durante este inventario para comprobar tipos, modos y aliases. Si no hay variables locales, comprueba si el componente tiene bindings directos a variables externas con ID y valor resuelto; no inventes una colección local. `get_variable_defs` del nodo no sirve como inventario.
3. Lee el contexto estructurado del componente o set (`get_design_context` o `use_figma`, según el detalle necesario). Inventaria variantes y props, propiedades expuestas, estados representados, bindings y variables realmente usadas. Lee `references/component-metadata.md` completo durante este análisis para clasificar cada valor de variante y preparar los datos de `metadata.json` solo con lo observado; la ficha se escribe después del diagnóstico. Separa lo medido de lo inferido, indica la fuente de cada hecho y declara lo no medido y lo no cubierto. No inventes estados, props ni tokens. Si falta información, intenta obtenerla con la otra herramienta o comunica la limitación. Una laguna que impida decidir la API o implementar fielmente bloquea la importación: informa `DS_GAP` y no registres una ficha incompleta. Esta lectura del nodo **no sustituye** el inventario de variables del file.
4. Recorre todas las variantes, resuelve cada instancia hija según «Componentes anidados» y lee `references/relationships.md` completo para registrar sus refs. Consulta `find-component` para el nodo raíz si el mapa existe. En la primera vez, el mapa está vacío: las instancias locales son `missing`. Prepara el diagnóstico completo antes de decidir.

Evalúa esta tabla **de arriba abajo**; aplica la primera fila que corresponda:

| Resultado del diagnóstico                                                                                                                                    | Decisión antes de escribir                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Frame o pantalla                                                                                                                                             | `DS_GAP`; no escribir                                                                                                                           |
| Instancia raíz `remote`                                                                                                                                      | Pedir URL del componente en su file de origen; no escribir                                                                                      |
| Sin variables locales ni bindings externos con ID y valor resuelto                                                                                           | `DS_GAP`; no escribir                                                                                                                           |
| Valor de variable (directo o alias) sin resolver, o alias sin ID de destino                                                                                  | `DS_GAP`; no escribir tokens ni registrar el componente                                                                                         |
| Binding directo a variable externa sin ID o valor resuelto                                                                                                   | `DS_GAP`; no inventar variable local ni registrar el componente                                                                                 |
| Laguna que impide decidir la API o implementar fielmente                                                                                                     | `DS_GAP`; no registrar el componente                                                                                                            |
| Algún anidado local `missing`                                                                                                                                | Mostrar nombres y refs; `DS_GAP`; no escribir                                                                                                   |
| Componente ya importado y actualización pedida expresamente (general o sustitución de una dependencia concreta)                                              | Seguir «Actualización solicitada» con el alcance pedido                                                                                         |
| Componente ya importado: un anidado pasa de `external` a `mapped`, pero su identidad no es verificable (sin identificador común o con datos contradictorios) | No escribir; pedir un ref adicional o autorización explícita para sustituir esa dependencia. Comunicar también las demás diferencias observadas |
| Componente ya importado: un anidado registrado como `external` ahora resuelve a `mapped`, con identidad verificada como igual y sin otras diferencias        | Actualizar solo esa dependencia y su import en el código, con la cautela indicada abajo                                                         |
| Componente ya importado: otros cambios observados                                                                                                            | Mostrar diferencias; solicitar una petición explícita de actualización; no escribir                                                             |
| Componente ya importado: ninguna transición de dependencia ni otros cambios observados                                                                       | Reutilizar; no reescribir                                                                                                                       |
| Anidado `external` sin otros bloqueos                                                                                                                        | Continuar y avisar de la librería externa                                                                                                       |
| Componente nuevo sin bloqueos                                                                                                                                | Importar                                                                                                                                        |

«Otros cambios observados» significa diferencias comprobables entre el análisis actual y los datos ya guardados: `metadata.json` (variantes, `variantClassification`, `figmaCoverage`, estados, tokens, `parts`, `bindings`, `externalVariables`, `measuredLiterals`, `unresolved`, `notApplicable` y `notBuilt`), la entrada correspondiente de `figma-code-map.json` (refs y props) y los `nestedComponents` de `figma-state.json` (instancias añadidas o quitadas, o un cambio verificado en la identidad de su componente principal). Compara las conclusiones de cobertura, lagunas y exclusiones con la evidencia actual: una decisión distinta requiere revisión explícita, pero no demuestra por sí sola que Figma haya cambiado. Esa identidad se compara por tipo de identificador: `mainComponentKey`, o `mainComponentNodeId` junto con el `fileKey` de ese componente (el propio `fileKey` del DS para un anidado local; `mainComponentFileKey` cuando la herramienta lo devuelve para uno remoto). Solo se verifica como igual si hay al menos un identificador compartido y todos los compartidos coinciden; como distinta, si hay identificadores compartidos y todos difieren. Un cambio verificado de identidad cuenta como otro cambio observado aunque el nuevo estado sea `mapped`. Sin identificadores compartidos, o si unos coinciden y otros difieren, la identidad no es verificable: no asumas igualdad ni cambio; pide confirmación. La actualización automática solo aplica cuando la identidad se verifica igual y no hay ninguna otra diferencia observada. No deduzcas cambios visuales o de código que esos datos no permiten comparar.

Repara antes el árbol o los tokens del file de origen si quedaron incompletos (ver «Dos modos»), sin sobrescribir lo existente, solo al importar, actualizar automáticamente una dependencia, continuar con un anidado `external`, reutilizar o realizar una actualización general solicitada. Una sustitución autorizada solo para una dependencia no permite reparar el scaffold. En cualquier fila cuya decisión sea no escribir —incluidas `DS_GAP`, pedir la URL de origen, identidad no verificable y «otros cambios observados»—, no repares el scaffold, salvo la excepción explícita de abajo.

Si el único bloqueo son anidados `missing` y el usuario pide expresamente preparar solo el proyecto, crea el scaffold y los tokens después de comunicar el diagnóstico, pero no registres el componente bloqueado como importado. En este caso, `App.tsx` debe ser una app válida que renderice un `main` vacío, sin componente ficticio. No guardes `pendingImports`: el reintento consiste en volver a pegar la URL y repetir el preanálisis.

Si la identidad del componente principal de un anidado no es verificable, no cambies código ni estado. Pide un ref adicional o autorización explícita para sustituir esa dependencia concreta. Con un ref nuevo, repite el preanálisis y vuelve a aplicar la tabla. Si el usuario autoriza la sustitución sin poder verificar la identidad, sigue «Actualización solicitada» con alcance limitado a esa dependencia; su autorización no convierte la identidad en verificada ni habilita la actualización automática. Si no aporta ref ni autoriza el cambio, conserva el estado actual.

Para un padre ya importado, localiza cada anidado guardado por su `figmaNodeId` y compara la identidad de su componente principal por tipo de identificador (`mainComponentKey`, o `mainComponentNodeId` con el `fileKey` que le corresponda). Hay tres resultados: identidad verificada como igual si todos los identificadores compartidos coinciden; verificada como distinta si todos difieren; no verificable si no hay ninguno compartido o los compartidos se contradicen. Solo el segundo caso cuenta como «otro cambio observado»; en el tercero, pide un ref o autorización antes de decidir. Aplica la actualización automática solo con identidad verificada igual, cuando además el estado pasó de `external` a `mapped` y no hay ninguna otra diferencia observada: edita únicamente la composición de ese anidado y su estado, conservando el resto del código y las ediciones del usuario. Si no puedes aislar el cambio sin pisar código existente, muestra la modificación propuesta y pide confirmación antes de escribir. `git diff` ayuda a revisar cambios sin confirmar, pero no revela ediciones manuales ya confirmadas. No infieras otros cambios de Figma a partir de una supuesta versión o huella que este kit no guarda.

### Actualización solicitada

Cuando el usuario pida expresamente actualizar un componente importado, usa el preanálisis actual y lee su ficha, código, mapa y estado existentes. Identifica por archivo los cambios necesarios y comunícalos antes de editar. Conserva las ediciones del usuario. Indica siempre el cambio propuesto por archivo. Si un cambio sobrescribiría código existente que no puedes preservar, presenta la modificación concreta y pide confirmación antes de tocar esa parte; la petición de actualización ya autoriza el resto del trabajo. Usa `git diff` para revisar cambios sin confirmar, sin asumir que detecta ediciones ya confirmadas.

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

Si no hay variables locales en el file, deja el inventario local vacío. Solo continúa si hay bindings externos directos con ID y valor resuelto verificables en `externalVariables`; en otro caso, `DS_GAP`. No inventes hex ni colecciones locales.

Antes de persistir los tokens, aplica el formato de `references/tokens.md` leído durante el preanálisis. Antes de escribir `figma-state.json` o `figma-code-map.json`, aplica `references/relationships.md`. No inventes valores ni refs; conserva los ya importados.

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
6. Solo tras importar con éxito, registra los anidados `mapped` o `external` en `figma-state.json`, dentro de la entrada del componente, con el esquema de `nestedComponents` de `references/relationships.md`. No añadas anidados a `design-system/inventory.json` sin carpeta real en `design-system/components/`.

Al volver a pedir un componente ya importado, reanaliza sus anidados con el mapa actual y aplica la tabla del preanálisis. Si uno pasa de `external` a `mapped`, cambia `nestedComponents` y el import/uso del componente local en el padre solo cuando se verifiquen las condiciones para la actualización automática o el usuario autorice expresamente esa sustitución; nunca cambies solo el JSON. Para otros cambios observados, informa y espera una petición explícita de actualización; no reescribas el componente por iniciativa propia.

## Inventario (obligatorio al incluir)

Tras cada primitive o pantalla que **sí** hayas implementado, añade una entrada a `design-system/inventory.json` sin borrar las anteriores:

- Primitive: `components` recibe `"<Nombre>"` solo si existe `design-system/components/<Nombre>/` y su código. La descripción de uso vive únicamente en `design-system/components/<Nombre>/usage.md`.
- Pantalla: `screens` recibe `{ "name": "<Nombre>", "composition": { "components": ["<PrimitiveIncluido>"], "description": "<disposición de esos componentes>" } }` solo si existe en `src/pages/`. El array contiene nombres únicos de los primitives usados; todos deben estar presentes en `components`.

No registres nombres previstos ni anidados externos.

## Primera vez (orden)

1. **Preanálisis y diagnóstico** — identifica el nodo, lee variables del file de origen, analiza el set y sus anidados. Aplica la tabla de decisiones y comunica el resultado antes de escribir.
2. **Árbol** — si se puede importar, monta Vite React TS (CSS modules, sin Tailwind) y copia sin editar todo `plantillas/design-system/` a `design-system/`. No copies los recursos auxiliares del agente (`checks/`, `rules/`, otras `skills/`, `workflows/` o `prop-vocabulary.json`) ni generes `.ai/`.
3. **Tokens** — persiste el inventario **file-level** ya leído: una JSON por colección + `src/styles/tokens.css`.
4. **Ficha** — `metadata.json` + `usage.md` con variantes, estados y tokens observados (plantilla `plantillas/componentes/`).
5. **Código** — `src/components/<Nombre>/` con tokens y reutilizando anidados `mapped`. Declara `interface <Nombre>Props extends ... { ... }` o `type <Nombre>Props = Omit<...> & { ... }` (también vale un literal sin herencia) en su TSX y úsalo en el componente; hereda props nativas en vez de redefinirlas cuando corresponda.
6. **Mapa** — entradas en `figma-code-map.json` con `refs` y en `figma-state.json` con `nestedComponents` `mapped` o `external`.
7. **App** — `App.tsx` renderiza **solo** ese componente (para `npm run dev`).
8. **Inventario** — añade solo ese componente a `design-system/inventory.json`.
9. **Checks** — `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y `node .agents/checks/verify-bindings.mjs` (tras instalar las dependencias de `package.json`), más `.agents/skills/validate-ds/SKILL.md` sobre ese componente. Informa PASS, FAIL o NOT RUN con motivo para cada check; no llames conforme a lo no evaluado.

## Siguiente componente

1. Preanálisis y diagnóstico completos antes de escribir, también si el componente ya existe. Si hay `missing`, para sin tocar el proyecto.
2. `find-component` — si no existe, continúa con la importación. Si existe, compara el análisis actual con `metadata.json`, la entrada del mapa y `nestedComponents`, y aplica la fila que corresponda de la tabla: solo la transición `external` → `mapped` con identidad verificada igual y sin otras diferencias se actualiza sola; si la identidad no es verificable, pide un ref o autorización; otros cambios esperan una petición explícita; sin diferencias, reutiliza. No supongas cambios que esos datos no permitan comparar ni reescribas por repetir la URL.
3. Si el componente es nuevo o el usuario pidió expresamente una actualización general, mezcla las colecciones y variables leídas del file en los JSON existentes; no borres variables.
4. Para un componente nuevo, crea ficha + código + mapa. Para uno existente, sigue «Actualización solicitada» si el usuario pidió una actualización general o autorizó una sustitución concreta; en otro caso, actualiza automáticamente solo una transición `external` → `mapped` con identidad verificada igual, sin otras diferencias y que puedas editar sin pisar cambios del usuario. Si no puedes aislarla, muestra el cambio propuesto y pide confirmación. No guardes `missing` ni estados `blocked`.
5. Si `App.tsx` está vacío porque solo se preparó el scaffold, renderiza ahí el primer componente que se importe. En los demás casos, no lo sustituyas salvo que pidan ver el nuevo; no borres componentes viejos.
6. Inventario: añade solo nombres nuevos; no quites los anteriores.
7. Checks de **este** componente, también tras una actualización localizada; ejecuta `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y `node .agents/checks/verify-bindings.mjs` e informa los checks no realizados con su motivo.

## Cuando pidan una pantalla

1. Una sola página en `src/pages/`. `App.tsx` la renderiza.
2. Solo primitives **ya incluidos**. Si `find-component` devuelve `not found` para un elemento de pantalla, reporta `DS_GAP`; no inventes.
3. Inventario: nombre de pantalla + `composition.components` y `composition.description`.
4. Checks de esa página.

## Prohibido

- Rellenar plantillas o el DS generado con un DS de ejemplo
- Copiar recursos auxiliares del agente (`checks/`, `rules/`, otras `skills/`, `workflows/` o `prop-vocabulary.json`) al DS generado, generar `.ai/` o mantener runtimes AI duplicados
- Generar todos los componentes del file de golpe
- Citar en reglas o inventario componentes que aún no están en el DS generado
- Una pantalla en la primera vez (si la URL es una pantalla: `DS_GAP`, sin escribir)
- Hex/spacing inventados
- Resumir variables a `colors.json` / `spacing.json` / `typography.json`
- Inventario de tokens solo con las variables del componente
- Tailwind, Storybook, CI, `docs/`, `.github/`
- Más de dos archivos por carpeta en `design-system/components/<Nombre>/`
