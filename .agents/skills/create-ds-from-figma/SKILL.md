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
- `figma-code-map.json` → solo `_schema`, sin entradas
- `figma-state.json` → `_schema` + colecciones, variables y components vacíos
- **no** hay `design-system/tokens/` en el kit; esa carpeta nace en el primer volcado MCP

No copies un DS ya relleno “para que se vea”. El usuario parte de este repo sin componentes importados y el agente escribe tokens y el primer componente desde Figma.

## Dos modos

**Primera vez** (falta `design-system/relationships/figma-code-map.json` o `src/styles/tokens.css`, aunque haya un directorio `design-system/` vacío o instrucciones propias del repo): analiza Figma antes de escribir; si el diagnóstico permite importar, monta el **árbol entero**, vuelca **todas** las variables del file (todas las colecciones) y rellena **el componente de la URL**. Si el scaffold quedó a medias (existe uno de esos dos archivos pero no el otro), completa solo lo que falte sin sobrescribir lo existente.

**Siguiente componente** (existen `design-system/relationships/figma-code-map.json` y `src/styles/tokens.css`, incluso si solo se preparó el scaffold): analiza Figma antes de escribir. Si el componente es nuevo, añade ficha, código, mapa e inventario sin recrear Vite. Si ya existe, solo la transición comprobada de un anidado `external` a `mapped` habilita una actualización localizada; otros cambios se comunican y requieren una petición explícita de actualización. Si Figma trae colecciones o variables nuevas durante una importación o actualización autorizada, **mézclalas**; no borres las que ya hay.

La falta de `design-system/inventory.json` no cambia el modo: diagnostícala como scaffold incompleto y aplica la regla de reparación tras la tabla de decisiones. No termines una importación con el inventario ausente.

## Cómo hablar

En español, después del preanálisis y antes de tocar disco, comunica el diagnóstico:

```text
**Modo:** primera vez | siguiente componente
**Diagnóstico:** nodo y file de origen; variantes, propiedades y estados; estilos aplicados y procedencia no disponible; colecciones/variables del file y tokens usados; anidados mapped/missing/external
**Prefijo de tokens:** fijado en el estado | pedido por el usuario | `ds` (predeterminado, solo en un DS nuevo); informativo, no detiene la importación
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

Este repo es la fuente única de los recursos del agente. Los archivos que usa este flujo se dividen en dos grupos con tratamiento distinto:

- **Recursos del agente: se usan en su sitio y no se copian nunca.** Son los de la tabla siguiente y las tres referencias de esta skill (`references/tokens.md`, `references/component-metadata.md` y `references/relationships.md`), que son instrucciones.
- **Plantillas: lo único que se copia o adapta desde el repo al DS generado.** Se describen después de la tabla. El agente genera tokens, `tokens.css` y código a partir de Figma, completa los mapas inicializados desde plantillas y adapta las fichas de cada componente.

| Recurso                                        | Uso                                                |
| ---------------------------------------------- | -------------------------------------------------- |
| `.agents/checks/`                              | checks automáticos y manuales                      |
| `.agents/skills/find-component/SKILL.md`       | resolución de nodos Figma a componentes existentes |
| `.agents/skills/map-figma-to-code/SKILL.md`    | mapeo de componentes DS a código y props           |
| `.agents/skills/validate-ds/SKILL.md`          | validación visual y de bindings computados         |
| `.agents/skills/create-ds-from-figma/SKILL.md` | documento canónico de esta skill                   |
| `.agents/workflows/build-from-figma.md`        | workflow de construcción desde Figma               |
| `.agents/rules/design-system.md`               | reglas persistentes para `src/` y `design-system/` |
| `.agents/rules/design-system-composition.md`   | reglas de composición de UI                        |
| `.agents/rules/design-system-accessibility.md` | reglas de accesibilidad de UI                       |
| `.agents/prop-vocabulary.json`                 | vocabulario canónico de props                      |

`plantillas/` está en `.agents/skills/create-ds-from-figma/plantillas/`, junto a este documento. Si falta, detente e informa que este repo está incompleto. Contiene dos carpetas:

- `plantillas/design-system/`: si aún no existe el scaffold, copia **sin editar** todo su contenido (`inventory.json` y `relationships/`) a `design-system/`. Si quedó parcial, añade solo lo que falte sin sobrescribir archivos existentes; reconstruye el inventario según la regla de reparación indicada abajo.
- `plantillas/componentes/`: no se copia tal cual. Adapta sus fichas (`metadata.json` y `usage.md`) al crear `design-system/components/<Nombre>/`.

Al trabajar en `src/` o `design-system/`, aplica `.agents/rules/design-system.md`. Registra las piezas implementadas solo en `design-system/inventory.json`.

## Árbol generado

Estos son los archivos que pertenecen al DS/app generado:

```text
design-system/inventory.json
design-system/relationships/figma-code-map.json
design-system/relationships/figma-state.json
design-system/tokens/<ArchivoDeColeccion>.json ← no está en plantillas; nace al volcar Figma
design-system/components/<Nombre>/metadata.json
design-system/components/<Nombre>/usage.md
src/styles/tokens.css   ← generado; no se edita a mano
src/components/<Nombre>/<Nombre>.tsx
src/components/<Nombre>/<Nombre>.module.css
src/components/<Nombre>/index.ts
src/App.tsx
src/main.tsx
index.html
tsconfig.json
package.json       ← ya existe; se amplía, no se sustituye
package-lock.json  ← ya existe; se actualiza al instalar dependencias
```

En la primera importación, añade una app Vite React TS compatible con `index.html` y `tsconfig.json`. Integra React, React DOM, Vite y las dependencias de tipos necesarias en el `package.json` existente; conserva `private`, `type`, `scripts.test`, cualquier otro script y todas las dependencias actuales (incluidas TypeScript, PostCSS, postcss-selector-parser y `yaml`). Añade `dev`, `build` y `preview` sin reemplazar scripts existentes. Actualiza el `package-lock.json` existente al instalar dependencias y conserva `.gitignore`; no ejecutes un scaffold que sobrescriba esos archivos del repo.

`design-system/tokens/` contiene **un JSON por colección de variables de Figma**. Su nombre y los `cssName` los decide el preflight de `scripts/preflight-token-files.mjs`; el archivo se guarda en `figma-state.json.collections[<ID>].file` y el prefijo en `figma-state.json.tokenPrefix`; conserva espacios y la ruta registrada cuando Figma renombre una colección. `references/tokens.md` describe la codificación y los casos de colisión. No uses `colors.json` / `spacing.json` / `typography.json` como resumen fijo.

`src/pages/` **no** se crea hasta que pidan una pantalla.

## Preanálisis antes de escribir

No crees el árbol, tokens, fichas, código ni registros durante este preanálisis. Reutiliza sus resultados al implementar; no repitas llamadas a Figma salvo que falte información o los datos hayan cambiado.

1. Lee el nodo de la URL con `get_metadata` para identificar tipo y estructura. Si es una variante, localiza su component set y analiza **todas** las variantes; conserva la variante enlazada como referencia. Si es una instancia, resuelve su `mainComponent`. Si es un frame o pantalla, detente. Si la instancia raíz es `remote`, pide la URL del componente en su file de origen; no asumas que las variables del file enlazado le pertenecen.
2. En el file donde vive el componente, lee **todas** las colecciones y variables locales, con modos, modo por defecto y aliases, sin escribir aún. Lee `references/tokens.md` completo durante este inventario para comprobar tipos, modos y aliases. Antes de escribir, pasa todas las colecciones, con todas sus variables (`id` y nombre), como JSON por stdin a `node .agents/skills/create-ds-from-figma/scripts/preflight-token-files.mjs .` (añade `tokenPrefix` si el usuario pidió uno). Ejecútalo siempre, también con `"collections": []` cuando el file no tenga variables locales y el componente solo use variables externas: es la única forma de obtener el prefijo que debes escribir en `figma-state.json.tokenPrefix`; el script lee el estado y los JSON existentes, calcula el mapeo ID → archivo sin tocar el DS y falla ante archivos huérfanos, nombres de archivo o de custom property en conflicto, un prefijo distinto del ya fijado, tokens o componentes publicados sin `tokenPrefix` en el estado, o un JSON registrado que falta cuando su ID tampoco está en esta entrada del preflight. Lee el JSON de stdout: `tokenPrefix` es el prefijo (y su origen), `files` es el mapeo ID → archivo, `variables` es el mapeo `VariableID` → `cssName` y `diagnostics` contiene `missingRegistered` y `registeredIdsNotInInput` (listas de `{ id, file }`, vacías si no hay avisos). Usa `files` y `variables` para escribir los JSON de tokens, `tokens.css` y `state.collections`; si `tokenPrefix.source` es `default` o `input`, comunica el prefijo en el diagnóstico («Prefijo de tokens: `ds` (predeterminado)») sin esperar respuesta; no trates las otras claves como IDs. Si el preflight dice que hay tokens publicados sin `tokenPrefix`, no lo arregles pasando un prefijo: explica que el estado es inconsistente y pide una reparación explícita. Comunica `registeredIdsNotInInput` como diferencia respecto de esta entrada, conserva esos archivos y no infieras un cambio en Figma. Si `missingRegistered` tiene entradas, informa del hueco en el diagnóstico; **solo si la tabla permite reparar**, recréalas con los valores observados de Figma en los nombres ya registrados, sin sobrescribir otros archivos. Un diagnóstico no autoriza a escribir en las filas que lo prohíben ni en una sustitución limitada a una dependencia. Si el preflight falla, explica el problema y no escribas. Si no hay variables locales, comprueba si el componente tiene bindings directos a variables externas con ID y valor resuelto verificables; no inventes una colección local. `get_variable_defs` del nodo no sirve como inventario.

Un JSON registrado que falta y contenía variables no se reconstruye desde sus nombres actuales en Figma: se perderían los `cssName` ya asignados. Restaura el archivo original antes de continuar. `missingRegistered` solo puede referirse a una colección que antes tenía cero variables.
3. Lee el contexto estructurado del componente o set (`get_design_context` o `use_figma`, según el detalle necesario). Inventaria variantes y props, propiedades expuestas, estados representados, bindings y variables realmente usadas. Inspecciona los estilos de texto, efecto y relleno aplicados y, cuando existan, los rangos de texto mixto; distingue un estilo inexistente de uno que la herramienta no devuelve. Lee `references/component-metadata.md` completo durante este análisis para clasificar cada valor de variante, conservar la procedencia de los estilos y preparar los datos de `metadata.json` solo con lo observado; la ficha se escribe después del diagnóstico. Si no puedes obtener el ID del estilo pero sí los valores esenciales, continúa y registra `figmaCoverage.styles` como `unavailable` con la llamada intentada y el motivo (informa la captura de procedencia como `NOT RUN`); no supongas que el valor de una propiedad procede del estilo. Si las propiedades de segmentos mixtos esenciales no caben fielmente en una sola observación, informa `DS_GAP` antes de escribir; las no esenciales quedan en `unresolved` y `NOT VERIFIED`. Separa lo medido de lo inferido, indica la fuente de cada hecho y declara lo no medido y lo no cubierto. No inventes estados, props ni tokens. Si falta información, intenta obtenerla con la otra herramienta o comunica la limitación. Una laguna que impida decidir la API o implementar fielmente bloquea la importación: informa `DS_GAP` y no registres una ficha incompleta. Esta lectura del nodo **no sustituye** el inventario de variables del file.
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

«Otros cambios observados» significa diferencias comprobables entre el análisis actual y los datos ya guardados: `metadata.json` (variantes, `variantClassification`, `figmaCoverage`, estados, tokens, `parts`, `styles`, `bindings`, `externalVariables`, `measuredLiterals`, `unresolved`, `notApplicable` y `notBuilt`), la entrada correspondiente de `figma-code-map.json` (refs y props) y los `nestedComponents` de `figma-state.json` (instancias añadidas o quitadas, o un cambio de identidad verificado según la comparación indicada abajo). Compara las conclusiones de cobertura, lagunas y exclusiones con la evidencia actual: una decisión distinta requiere revisión explícita, pero no demuestra por sí sola que Figma haya cambiado. La ausencia de datos de estilos en una herramienta no demuestra que se haya quitado un estilo de Figma. Un cambio verificado de identidad cuenta como otro cambio observado aunque el nuevo estado sea `mapped`. No deduzcas cambios visuales o de código que esos datos no permiten comparar.

Repara antes el árbol o los tokens del file de origen si quedaron incompletos (ver «Dos modos»), sin sobrescribir lo existente, solo al importar, actualizar automáticamente una dependencia, continuar con un anidado `external`, reutilizar o realizar una actualización general solicitada. Una sustitución autorizada solo para una dependencia no permite reparar el scaffold. En cualquier fila cuya decisión sea no escribir —incluidas `DS_GAP`, pedir la URL de origen, identidad no verificable y «otros cambios observados»—, no repares el scaffold, salvo la excepción explícita de abajo.

Si falta `design-system/inventory.json` y la decisión permite reparar el scaffold, copia la plantilla vacía solo cuando no hay componentes mapeados ni páginas implementadas. Si ya hay trabajo importado, reconstruye `components` con los nombres de entradas del mapa que tengan ficha y código reales; reconstruye `screens` solo para páginas existentes cuya composición con componentes del DS puedas comprobar. Si faltan pruebas para alguna entrada, pide la información necesaria en vez de inventar o descartar piezas. No sobrescribas un inventario existente ni registres componentes bloqueados o páginas previstas.

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
3. Escribe un JSON por colección en el archivo asignado por el preflight. `src/styles/tokens.css` no se escribe a mano: genéralo después de guardar la ficha y su entrada en el mapa, porque el generador descubre las instantáneas externas mediante ese mapa. Las variables `FLOAT` sin decisión de serialización quedan pendientes y no se escriben. Para cada `FLOAT` que un `binding` del componente use, registra su decisión en `serialization` según `references/tokens.md` (con la propiedad de Figma como evidencia o con confirmación del usuario) antes de generar el CSS y escribir el componente. Usa IDs de colección como claves de `figma-state.json.collections` y `figma-state.json.variables`; cada entrada de colección guarda el nombre, modos, recuento y nombre de archivo. Para cada modo no predeterminado guarda su ámbito en `modeScopes` (`null` hasta que el usuario lo decida; nunca inventes el selector) y emite en `tokens.css` los bloques de los modos con ámbito según `references/tokens.md`. En la primera importación escribe también `figma-state.json.tokenPrefix` con `tokenPrefix.value`, aunque el componente solo use variables externas.

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

Tras importar un componente, añade su nombre a `design-system/inventory.json` sin borrar las entradas anteriores. `components` recibe `"<Nombre>"` solo si existe `design-system/components/<Nombre>/` y su código. La descripción de uso vive únicamente en `design-system/components/<Nombre>/usage.md`. No registres nombres previstos ni anidados externos.

## Primera vez (orden)

1. **Preanálisis y diagnóstico** — identifica el nodo, lee variables del file de origen, analiza el set y sus anidados. Aplica la tabla de decisiones y comunica el resultado antes de escribir.
2. **Árbol** — si se puede importar, integra Vite React TS (CSS modules, sin Tailwind) en este repo conservando su manifiesto, lockfile y `.gitignore` como se indica arriba; inicializa `design-system/` desde `plantillas/design-system/` sin sobrescribir archivos de un scaffold parcial.
3. **Tokens** — persiste el inventario **file-level** ya leído: un JSON por colección y su entrada en `figma-state.json`. No escribas `src/styles/tokens.css` a mano.
4. **Ficha** — `metadata.json` + `usage.md` con variantes, estados, estilos aplicados, valores medidos y tokens observados (plantilla `plantillas/componentes/`); conserva el valor bruto de Figma para traducciones CSS aproximadas.
5. **Código** — `src/components/<Nombre>/` con tokens y reutilizando anidados `mapped`. Declara `interface <Nombre>Props extends ... { ... }` o `type <Nombre>Props = Omit<...> & { ... }` (también vale un literal sin herencia) en su TSX y úsalo en el componente; hereda props nativas en vez de redefinirlas cuando corresponda.
6. **Mapa y CSS** — entradas en `figma-code-map.json` con `refs` y en `figma-state.json` con `nestedComponents` `mapped` o `external`. Después genera `src/styles/tokens.css` con `node .agents/skills/create-ds-from-figma/scripts/generate-tokens-css.mjs .` (falla sin escribir si las fuentes son inconsistentes); regenera siempre que cambien tokens, estado, mapa o `externalVariables`.
7. **App** — `App.tsx` renderiza **solo** ese componente (para `npm run dev`).
8. **Inventario** — añade solo ese componente a `design-system/inventory.json`.
9. **Checks** — `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y `node .agents/checks/verify-bindings.mjs` (tras instalar las dependencias de `package.json`), más `.agents/skills/validate-ds/SKILL.md` sobre ese componente. Informa PASS, FAIL o NOT RUN con motivo para cada check; no llames conforme a lo no evaluado.

## Siguiente componente

1. Preanálisis y diagnóstico completos antes de escribir, también si el componente ya existe. Si hay `missing`, para sin tocar el proyecto.
2. `find-component` — si no existe, continúa con la importación. Si existe, compara el análisis actual con `metadata.json`, la entrada del mapa y `nestedComponents`, y aplica la tabla del preanálisis y su criterio de identidad. No supongas cambios que esos datos no permitan comparar ni reescribas por repetir la URL.
3. Si el componente es nuevo o el usuario pidió expresamente una actualización general, mezcla las colecciones y variables leídas del file en los JSON existentes; no borres variables.
4. Para un componente nuevo, crea ficha + código + mapa. Para uno existente, sigue «Actualización solicitada» si el usuario pidió una actualización general o autorizó una sustitución concreta; en otro caso, aplica únicamente la actualización automática permitida por la tabla y el criterio de identidad. Si no puedes aislar el cambio sin pisar trabajo existente, muestra la modificación propuesta y pide confirmación. No guardes `missing` ni estados `blocked`. Regenera `src/styles/tokens.css` después de actualizar el mapa cuando cambien tokens, estado, mapa o fichas.
5. Si `App.tsx` está vacío porque solo se preparó el scaffold, renderiza ahí el primer componente que se importe. En los demás casos, no lo sustituyas salvo que pidan ver el nuevo; no borres componentes viejos.
6. Inventario: añade solo nombres nuevos; no quites los anteriores.
7. Checks de **este** componente, también tras una actualización localizada; ejecuta `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y `node .agents/checks/verify-bindings.mjs` e informa los checks no realizados con su motivo.

## Pantallas

Si la petición principal es implementar una pantalla desde un frame, sigue `.agents/workflows/build-from-figma.md`, no este procedimiento de importación. Si el usuario pide «crea un DS» con una URL que resulta ser un frame o pantalla, aplica la tabla del preanálisis: `DS_GAP` sin escribir; no cambies automáticamente al workflow.

## Prohibido

- Rellenar plantillas o el DS generado con un DS de ejemplo
- Copiar al DS generado recursos de `.agents/` distintos de las plantillas indicadas (`checks/`, `rules/`, `skills/`, `workflows/`, `references/` o `prop-vocabulary.json`), generar `.ai/` o mantener runtimes AI duplicados
- Generar todos los componentes del file de golpe
- Citar en reglas o inventario componentes que aún no están en el DS generado
- Una pantalla en la primera vez (si la URL es una pantalla: `DS_GAP`, sin escribir)
- Hex/spacing inventados
- Resumir variables a `colors.json` / `spacing.json` / `typography.json`
- Inventario de tokens solo con las variables del componente
- Tailwind, Storybook, CI, `docs/`, `.github/`
- Más de dos archivos por carpeta en `design-system/components/<Nombre>/`
