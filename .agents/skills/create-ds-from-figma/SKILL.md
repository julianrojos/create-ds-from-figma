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

Durante el bucle renderizado revisa también color:PARTE:PROPIEDAD: solo contrasta mappings explícitos de una pintura sólida con un destino CSS inequívoco, resolviendo alias del snapshot en los modos del caso. Un PASS de color calculado no demuestra tinta visible, máscaras ni consumo interno delegado; conserva las revisiones exigidas. Usa report de finalize:import/verify:imports para el resumen final de cobertura exacta, decisiones declaradas y obligaciones; no inventes cifras ni aprobación humana. El report de --diagnose es temporal y no revalida confirmaciones publicadas.

En casos con checked/disabled nativos configurados por props, declara estados con activation real y verification { kind: "native", selector, property: "checked" | "disabled", value: boolean }. El selector debe identificar un único control propio y name coincide con property. --diagnose/--collect leen el estado DOM original, no lo fuerzan ni dan por válidas las props. No borres estados para permitir la recogida. Otros estados requieren harness explícito del navegador; no inventes eventos. Consulta RESOLVE_STATE_VERIFICATION y conserva FAIL/NOT RUN como bloqueos. Ver la referencia de metadata para límites y caducidad.

Toda importación usa captura v2 con absoluteBoundingBox/absoluteTransform y verification.geometryPolicy=mapped-layout-v1. No completes hechos geométricos a mano ni migres capturas v1: recaptura. Antes de confirmar, usa verification-plan.mjs compare con la medición v2 del caso y revisa los checks; el informe v4 deriva renderChecks. FAIL/NOT RUN y fuentes esenciales pendientes bloquean confirmed. Cada NOT COMPARABLE de fidelidad necesita checkReviews específico con evidencia del mismo caso, sin cambiar su resultado numérico. El informe final debe separar conformidad estática de cobertura visual: casos confirmados, pendientes, registros fallidos y no establecidos, más motivos de no comparabilidad. No presentes una importación visual como terminada solo porque verify-ds devuelve PASS.

El usuario trabaja en **este repo**, dice **crea un DS** y pega **un componente** de Figma (con variables locales o bindings externos con ID y valor resuelto).

Eso basta. No pidas el esqueleto en un paso aparte.

No cites componentes ni pantallas que aún no existan en el DS generado. `design-system/inventory.json` empieza vacío y **se rellena al incluir cada pieza**.

El diagnóstico compare admite BASELINE_BODY opcional para invariantes behavior explícitas. Para confirmed, publica todas las mediciones behavior asociadas por baseline y pásalas como behaviors: [{ caseId, artifact }] en REVIEW; report deriva sus resultados y exige todos los checks en PASS. No rescates behavior no comparable con texto libre ni confirmes variantes nuevas por probar contenido alternativo. Revisa position y geometry por separado: la forma no comparable no exime de una posición incorrecta. La versión del comparador, no la redacción de reason/scope, gobierna la caducidad de sus reglas. measurementVersion identifica por separado las reglas del productor en cuerpo/recibo; si quedó antigua, recoge de nuevo sin reescribir el original. Una obligación no comparable/no ejecutada mantiene candidate/NOT VERIFIED, no demuestra un defecto de diseño.

## Kit vacío

Las plantillas van **en blanco**. No incluyen colecciones, tokens, componentes ni pantallas de ningún file de ejemplo.

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
**Qué no voy a hacer:** ni otros componentes que no estén en esta URL, ni una pantalla, ni Tailwind, ni copiar un DS ya relleno, ni resumir tokens a 3 archivos
```

Luego haz el trabajo. Al cerrar: archivos tocados + “para el siguiente, pega otra URL de componente”.

Si dice **paso a paso**: un bloque y espera **sigue**.
Si dice **crea un DS** (o pega la URL en vacío): ejecuta el modo que toque, narrando cada bloque.

## Recursos y plantillas

Este repo es la fuente única de los recursos del agente. Los archivos que usa este flujo se dividen en dos grupos con tratamiento distinto:

- **Recursos del agente: se usan en su sitio y no se copian nunca.** Son los de la tabla siguiente y las cuatro referencias de esta skill (`references/tokens.md`, `references/component-metadata.md`, `references/relationships.md` y `references/figma-evidence.md`), que son instrucciones.
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
design-system/figma/snapshots/<fileKey>/<root-id>/<SHA256>.json
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

Si un alias entre colecciones locales tiene varios valores posibles, pregunta qué modo usar para resolver esos valores. Solo con autorización explícita usa `generate-token-json.mjs plan/save --inventory INVENTORY --alias-modes PATH` y registra la elección en `figma-state.json.aliasModes`. No fija un modo CSS, no sustituye `modeScopes` ni cambia los alias de la misma colección. Una dependencia remota ambigua sigue bloqueada.

No crees el árbol, tokens, fichas, código ni registros durante este preanálisis. Reutiliza sus resultados al implementar; no repitas llamadas a Figma salvo que falte información o los datos hayan cambiado.

1. Lee el nodo de la URL con `get_metadata` para identificar tipo y estructura. Si es una variante, localiza su component set y analiza **todas** las variantes; conserva la variante enlazada como referencia. Si es una instancia, resuelve su `mainComponent`. Si es un frame o pantalla, detente. Si la instancia raíz es `remote`, pide la URL del componente en su file de origen; no asumas que las variables del file enlazado le pertenecen.
2. En el file donde vive el componente, captura **todas** las colecciones y variables locales con `scripts/figma-inventory.mjs`, por un transporte autorizado sin transcripción; lee `references/tokens.md` completo. Valida la sesión y guarda el inventario sellado en una ruta explícita, temporal durante el diagnóstico. Ejecuta `node .agents/skills/create-ds-from-figma/scripts/preflight-token-files.mjs . --inventory INVENTORY` (también con `"collections": []` observadas) y usa su `tokenPrefix`, `files` y `variables`, nunca nombres calculados por el modelo. El inventario del componente no sustituye el del file. El preflight conserva las decisiones publicadas y falla ante conflictos o estado incompleto; sus diagnósticos `missingRegistered` y `registeredIdsNotInInput` no autorizan borrar o reparar archivos por sí solos. Un prefijo predeterminado se comunica sin esperar respuesta. La entrada por stdin sigue disponible para consumidores programáticos, no para transcribir respuestas del modelo. Si no hay variables locales, solo continúa con bindings externos directos con ID y valores verificables; `get_variable_defs` no sustituye este inventario.

Un JSON registrado que falta y contenía variables no se reconstruye desde sus nombres actuales en Figma: se perderían los `cssName` ya asignados. Restaura el archivo original antes de continuar. `missingRegistered` solo puede referirse a una colección que antes tenía cero variables.
3. Lee el contexto estructurado del componente o set (`get_design_context` o `use_figma`, según el detalle necesario). Estas consultas aportan contexto de diseño, no sustituyen la captura del colector del paso 5: los IDs `observation` de bindings y literales y los valores brutos de `figmaValue` proceden exclusivamente de ese snapshot PLUGIN. No transcribas valores de `get_design_context` ni de lecturas ad hoc para construir esa evidencia; contrasta el análisis con la captura antes de escribir la ficha. Inventaria variantes y props, propiedades expuestas, estados representados, bindings y variables realmente usadas. Inspecciona los estilos de texto, efecto y relleno aplicados y, cuando existan, los rangos de texto mixto; distingue un estilo inexistente de uno que la herramienta no devuelve. Lee `references/component-metadata.md` completo durante este análisis para clasificar cada valor de variante, conservar la procedencia de los estilos y preparar los datos de `metadata.json` solo con lo observado; la ficha se escribe después del diagnóstico. Si no puedes obtener el ID del estilo pero sí los valores esenciales, continúa y registra `figmaCoverage.styles` como `unavailable` con la llamada intentada y el motivo (informa la captura de procedencia como `NOT RUN`); no supongas que el valor de una propiedad procede del estilo. Si las propiedades de segmentos mixtos esenciales no caben fielmente en una sola observación, informa `DS_GAP` antes de escribir; las no esenciales quedan en `unresolved` y `NOT VERIFIED`. Separa lo medido de lo inferido, indica la fuente de cada hecho y declara lo no medido y lo no cubierto. No inventes estados, props ni tokens. Si falta información, intenta obtenerla con la otra herramienta o comunica la limitación. Una laguna que impida decidir la API o implementar fielmente bloquea la importación: informa `DS_GAP` y no registres una ficha incompleta. Esta lectura del nodo **no sustituye** el inventario de variables del file.
4. Recorre todas las variantes, resuelve cada instancia hija según «Componentes anidados» y lee `references/relationships.md` completo para registrar sus refs. Consulta `find-component` para el nodo raíz si el mapa existe. En la primera vez, el mapa está vacío: las instancias locales son `missing`. Prepara el diagnóstico completo antes de decidir.
5. Lee `references/figma-evidence.md` y comprueba las capacidades del transporte disponible: CLI MCP `scripts/figma-capture.mjs capture` con una conexión autorizada por stdio/HTTP, o el adaptador opcional bridge cuando exista su orquestador. Para el CLI, comprueba primero si existe una conexión directa compatible; solicita su configuración solo si falta, sin pedir secretos en el chat ni presuponer credenciales nuevas. Revisa y obtén autorización de CONFIG antes de usar --approve-connection; la opción no sustituye esa autorización. El CLI recibe y escribe respuestas directamente, sin APIs del editor ni copia del modelo; por defecto captura todo en una llamada. No deduzcas endpoint o credenciales de una conexión del editor ni prometas soporte de Claude Code sin comprobar su conexión concreta. Durante el preanálisis solo se guarda fuera del proyecto. Comprueba perfil, recorrido, modos e issues; el snapshot no sustituye el inventario file-level del paso 2. Sin transporte operativo o evidencia esencial, informa NOT RUN y DS_GAP antes de escribir. Un fallo requiere nueva sesión, no sobrescribir bloques; capture limpia la sesión fallida salvo --keep-failed.

   Para figma_execute, selecciona explícitamente tool.responseFormat=figma-execute en CONFIG y revisa la receta de la referencia. No intentes eludir truncamientos copiando datos ni sustituyendo el colector por consultas ad hoc. Un error de sobre no demuestra truncamiento: inspecciona el motivo y la respuesta temporal si se conservó. Reintenta solo con configuración autorizada y una sesión nueva; sin captura válida sigue la parada anterior. Que el MCP funcione con otro modelo no prueba la conexión del CLI ni autoriza escribir el scaffold.

6. Sobre la captura temporal, antes de escribir el proyecto, ejecuta `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs requirements SNAPSHOT`. Usa resources/nextActions para reunir en una sola pregunta los orígenes autorizados necesarios para la implementación prevista. Son candidatos observados con nodos/variantes, no carencias esenciales: casos y descriptores CSS quedan pending hasta tener plan. No inventes pesos por el nombre de estilo ni exijas todos los candidatos ocultos. Si falta un recurso esencial para la implementación prevista, informa DS_GAP antes del TSX, sin elegir paquetes o imágenes por tu cuenta. No alteres fichas históricas en una ruta de reutilización.
   Los nodos vectoriales observados aparecen como `vectors`: reprodúcelos con su exportación SVG original (`scripts/figma-vectors.mjs`, acción `EXPORT_VECTOR_SOURCES`) en lugar de reconstruirlos con CSS; una aproximación exige aprobación y revisión visual.

Tras un diagnóstico permitido, persiste la captura con `figma-capture.mjs save` antes de escribir metadata y usa snapshot/hash devueltos. Cada binding/literal enlaza observation; decisiones y notBuilt requieren razones y referencias. Explica bindings/estilos no implementados mediante dispositions o translations; delega instancias mapped según el contrato, sin ocultar overrides ni lagunas esenciales. Las razones manuales siguen NOT VERIFIED por el check. propose ayuda, no decide la API: ambigüedad que la cambia exige criterio; otra queda en unresolved. Conserva el snapshot histórico en cambios limitados que no autoricen reescribir la ficha.

Al delegar, ejecuta verify-figma-evidence y lee review.delegationDifferences: el principal necesita snapshot sellado verificable. Declara cada difference por su id derivado en disposition.differences (implemented con part/cssProperty/reason, u omitted con reason). No conviertas cobertura de bindings en prueba de implementación. Unmatched/unreadable y omitted bloquean confirmed; implemented exige revisión específica del check delegation con artefactos del mismo caso. La declaración no valida el color. Las acciones distinguen identificar correspondencias, revisar lecturas, declarar/implementar tratamientos y aportar revisión; no repitas mediciones para rescatar omisiones. Cambios en el snapshot del hijo caducan las confirmaciones afectadas del padre.

Distingue suministro y consumo: el envoltorio puede pasar un valor y el elemento interior del hijo pintar con él. No declares background-color del envoltorio como destino si pinta una máscara dentro del hijo. Describe el mecanismo real en reason (variable CSS, prop, currentColor u otro), sin imponer una API; medir lo suministrado no prueba su consumo ni el pintado. Si part/cssProperty no permiten representar fielmente el destino delegado, no inventes un destino aproximado ni una declaración implemented para pasar el check. Informa de la limitación y conserva el bloqueo de confirmación; tampoco uses omitted para describir una implementación existente que el formato no puede expresar. La verificación completa de ese recorrido queda para una fase posterior, sin nuevos campos ni comprobaciones en este paso.

Toda entrada del mapa exige evidence: no hay excepciones ni política de compatibilidad. Compara primero con su snapshot mediante `node .agents/checks/verify-figma-evidence.mjs .`, también integrado en verify-ds. Relectura y compare son opcionales: hash identifica contenido, no revisión, y no autoriza actualizar. No reconstruyas cobertura histórica sin captura.

**Parada por recursos esenciales:** DS_GAP significa detener la implementación, no continuar y avisar al final. Antes de escribir scaffold, tokens, TSX o registrar el componente, solicita en un único mensaje los orígenes autorizados que falten. Si no hay interacción disponible, devuelve BLOCKED con los recursos y acciones pendientes, sin escribir. Una petición genérica de importar no autoriza sustitutos ni una importación provisional. Los candidatos de requirements no son todos esenciales: decide su necesidad para la implementación prevista sin inventar descriptores. --diagnose solo examina código existente; no permite saltarse esta parada ni crear componentes bloqueados para medirlos.

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

«Otros cambios observados» significa diferencias comprobables entre el análisis actual y los datos ya guardados: `metadata.json` (variantes, `variantClassification`, `figmaCoverage`, estados, tokens, `parts`, `styles`, `bindings`, `externalVariables`, `measuredLiterals`, `unresolved`, `notApplicable`, `notBuilt` y `evidence`), la entrada correspondiente de `figma-code-map.json` (refs y props) y los `nestedComponents` de `figma-state.json` (instancias añadidas o quitadas, o un cambio de identidad verificado según la comparación indicada abajo). Compara también `evidence.decisions`, `evidence.translations` y `evidence.dispositions`: una diferencia solo en esas decisiones requiere revisión explícita, pero no demuestra por sí sola que Figma haya cambiado. Si cambia únicamente el enlace `snapshot` o su `hash`, compara las capturas con `figma-capture.mjs compare` para identificar diferencias reales; otro hash no prueba una revisión Figma ni autoriza actualizar. Conserva el snapshot enlazado y la evidencia histórica al reutilizar o sustituir solo una dependencia; no los reemplaces por la captura nueva. La ausencia de datos de estilos en una herramienta no demuestra que se haya quitado un estilo de Figma. Un cambio verificado de identidad cuenta como otro cambio observado aunque el nuevo estado sea `mapped`. No deduzcas cambios visuales o de código que esos datos no permiten comparar.

Repara antes el árbol o los tokens del file de origen si quedaron incompletos (ver «Dos modos»), sin sobrescribir lo existente, solo al importar, actualizar automáticamente una dependencia, continuar con un anidado `external`, reutilizar o realizar una actualización general solicitada. Una sustitución autorizada solo para una dependencia no permite reparar el scaffold. En cualquier fila cuya decisión sea no escribir —incluidas `DS_GAP`, pedir la URL de origen, identidad no verificable y «otros cambios observados»—, no repares el scaffold, salvo la excepción explícita de abajo.

Si falta `design-system/inventory.json` y la decisión permite reparar el scaffold, copia la plantilla vacía solo cuando no hay componentes mapeados ni páginas implementadas. Si ya hay trabajo importado, reconstruye `components` con los nombres de entradas del mapa que tengan ficha y código reales; reconstruye `screens` solo para páginas existentes cuya composición con componentes del DS puedas comprobar. Si faltan pruebas para alguna entrada, pide la información necesaria en vez de inventar o descartar piezas. No sobrescribas un inventario existente ni registres componentes bloqueados o páginas previstas.

Si el único bloqueo son anidados `missing` y el usuario pide expresamente preparar solo el proyecto, crea el scaffold y los tokens después de comunicar el diagnóstico, pero no registres el componente bloqueado como importado. En este caso, `App.tsx` debe ser una app válida que renderice un `main` vacío, sin componente ficticio. No guardes `pendingImports`: el reintento consiste en volver a pegar la URL y repetir el preanálisis.

Si la identidad del componente principal de un anidado no es verificable, no cambies código ni estado. Pide un ref adicional o autorización explícita para sustituir esa dependencia concreta. Con un ref nuevo, repite el preanálisis y vuelve a aplicar la tabla. Si el usuario autoriza la sustitución sin poder verificar la identidad, sigue «Actualización solicitada» con alcance limitado a esa dependencia; su autorización no convierte la identidad en verificada ni habilita la actualización automática. Si no aporta ref ni autoriza el cambio, conserva el estado actual.

Para un padre ya importado, localiza cada anidado guardado por su `figmaNodeId` y compara la identidad de su componente principal por tipo de identificador (`mainComponentKey`, o `mainComponentNodeId` con el `fileKey` que le corresponda). Hay tres resultados: identidad verificada como igual si todos los identificadores compartidos coinciden; verificada como distinta si todos difieren; no verificable si no hay ninguno compartido o los compartidos se contradicen. Solo el segundo caso cuenta como «otro cambio observado»; en el tercero, pide un ref o autorización antes de decidir. Aplica la actualización automática solo con identidad verificada igual, cuando además el estado pasó de `external` a `mapped` y no hay ninguna otra diferencia observada: edita únicamente la composición de ese anidado y su estado, conservando el resto del código y las ediciones del usuario. Si no puedes aislar el cambio sin pisar código existente, muestra la modificación propuesta y pide confirmación antes de escribir. `git diff` ayuda a revisar cambios sin confirmar, pero no revela ediciones manuales ya confirmadas. No infieras otros cambios de Figma a partir de una supuesta versión o huella que este kit no guarda.

### Actualización solicitada

Cuando el usuario pida expresamente actualizar un componente importado, usa el preanálisis actual y lee su ficha, código, mapa y estado existentes. Identifica por archivo los cambios necesarios y comunícalos antes de editar. Conserva las ediciones del usuario. Indica siempre el cambio propuesto por archivo. Si un cambio sobrescribiría código existente que no puedes preservar, presenta la modificación concreta y pide confirmación antes de tocar esa parte; la petición de actualización ya autoriza el resto del trabajo. Usa `git diff` para revisar cambios sin confirmar, sin asumir que detecta ediciones ya confirmadas.

Para una actualización general, compara el contexto de diseño actual (`get_design_context` o `use_figma`) y los tokens con el código y el CSS existentes, además de con ficha, mapa y `nestedComponents`; modifica lo solicitado y cualquier diferencia visual o de layout que esa comparación evidencie. Después, mezcla tokens y refs nuevos sin borrar los anteriores, actualiza ficha, código y dependencias de forma coherente, y ejecuta los checks del componente.

Si el usuario solo autoriza sustituir una dependencia de identidad no verificable, cambia únicamente su composición en el código y su entrada en `nestedComponents` (`status`, `resolvedComponent` y los refs e identificadores del nuevo principal que Figma haya devuelto); no actualices tokens, ficha, mapa ni otras dependencias. Comunica las demás diferencias observadas sin aplicarlas y ejecuta los checks del componente.

## Dimensiones De Texto

Tras persistir la captura y antes de escribir la ficha o el TSX, ejecuta `node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs dimensions SNAPSHOT`. Completa el array obligatorio `evidence.textDimensions` con cada requisito, su comportamiento y refs exactas, y el tratamiento enlazado a declaración, traducción, delegación o duda no bloqueante según el contrato de ficha ya leído. WIDTH_AND_HEIGHT no autoriza fijar width/height a la medida de la letra de ejemplo; HEIGHT permite ancho fijo, no alto fijo. No excluyas automáticamente texto oculto, no supongas fixed cuando el resultado sea unknown y no ocultes incertidumbre esencial en unresolved. Si no hay dimensiones TEXT capturadas, guarda el array vacío. El comando no genera CSS ni modifica snapshots: las traducciones requieren revisión del código y del comportamiento renderizado, incluyendo contenido alternativo permitido por la API; esa prueba no confirma variantes nuevas de Figma.

## Recursos Y Casos

Contabiliza cada nodo del subárbol fidelity: parte mapeada, agrupación con regla comprobable, delegación validada de internos de instancia o pendiente explícito en verification.nodeCoverage. Los contenedores también cuentan; ni nombre de capa ni visible=false autorizan exclusión automática. Aplica las condiciones de `references/component-metadata.md`. Una limitación no permite confirmar.

Tras generar App.tsx ejecuta también `verification-plan.mjs diagnose .` y abre diagnosticsUrl de la vista para comprobar sus literales mediante CSS.supports. Separa esos fallos de app de los del componente; no entregues una demo inválida aunque el componente esté medido. El cierre y los informes recalculan la identidad de las declaraciones literales del componente y exigen los resultados originales del navegador. Propiedades custom/var()/env() y expresiones dinámicas no se declaran validadas por ese diagnóstico.

Opcionalmente usa `verification-browser.mjs ROOT METADATA ABSOLUTE_PLAYWRIGHT_MODULE BROWSER_EXECUTABLE` con herramientas ya instaladas/revisadas. El adaptador de importación no instala dependencias y es independiente del perfil de pruebas real obligatorio del kit. No inventa activaciones ni genera confirmed; publica evidencia solo dentro del alcance autorizado. El modo calibrate permite explorar fuentes WOFF2 explícitas con hashes, sin cambiar tolerancias por conveniencia ni afirmar igualdad binaria con Figma.

El margen TEXT de 1 px es provisional, no una calibración universal. Cada geometry:PARTE de texto en PASS necesita además checkReviews específico con revisión renderizada y artefactos del mismo caso para permitir measured/confirmed. El juicio general no basta y ninguna revisión rescata FAIL/NOT RUN. La repetibilidad de fuentes en un navegador no prueba fidelidad contra Figma.

En diagnóstico CSS usa los estados contextualizados, no solo supported: @supports inactivo no implica error y una extensión ajena no soportada queda NOT COMPARABLE hasta revisar fallback/motor. Los números inline constantes usan unidades React; las expresiones dinámicas siguen pendientes de revisión. El cierre conserva mediciones ausentes ante fallo estático, pero no ejecuta comparaciones inseguras ni declara vigentes las ya aportadas.

El adaptador rechaza una salida ocupada antes de arrancar y conserva el cierre estructurado si falla el preflight (salida 1, sin navegador). Distingue ese fallo de un bloqueo de infraestructura (salida 2, execution con fase/motivo). No interpretes execution COMPLETED como confirmed; consulta siempre closure y el diagnóstico de app.

Una reserva abandonada no se elimina automáticamente: usa inspect-lock DIRECTORY para diagnosticar sin escribir y reintenta en una salida nueva. No deduzcas identidad del propietario ni permiso para borrar a partir del PID. Conserva la carpeta anterior y sus evidencias; también los resultados sin lock impiden reutilizar una salida no vacía.

apply es el paso de publicación de la ficha: tras planificar desde requirements, prepara código/CSS, tokens, relaciones y usage para esa propuesta; apply la valida en memoria contra el DS antes de reemplazar metadata.json. Un error deja el archivo intacto. Esto no confirma renderizado. confirmed exige informe v4 con huella semántica del caso, medida original del navegador y captura PNG Figma tipadas y retenidas, no cualquier archivo del proyecto.

Antes de declarar terminada la importación, usa el gate integrado de finalización descrito abajo. Para cerrar un componente con un manifiesto individual también puedes ejecutar `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs close . METADATA MANIFEST` según `references/component-metadata.md`: evidencias publicadas de todos los casos fidelity/behavior y confirmaciones vigentes. Solo confirmed/complete=true permite terminar; measured, pending o failed requieren informar qué falta o corregir lo demostrado. No hay excepción libre ni promoción automática. Sin navegador o recursos conserva la importación pendiente, sin inventar evidencia. Las tolerancias actuales no quedan calibradas por ejecutar el comando.

Como gate final local del repositorio ejecuta también `npm run verify:imports`. Lee las confirmaciones persistidas que referencia usage.md, sin manifiesto temporal y sin volver a medir geometría. Cruza inventario, mapa y fichas; rechaza resúmenes ausentes, casos de fidelidad vacíos, candidatos y confirmaciones caducadas. Incluye el comportamiento obligatorio y los recursos esenciales mediante la revalidación existente. Diagnostica los literales de la demo en una página en blanco del Chromium fijado del kit, independientemente de errores del componente. Prepara ese runtime con `npm run test:browser:setup` si falta; NOT RUN bloquea la entrega. No confundir este diagnóstico de sintaxis con ejecución de la demo o fidelidad visual. No declara terminado nada ni escribe confirmaciones automáticamente. No hay CI ni hooks configurados: ejecuta el comando explícitamente y comunica su resultado, sin afirmar que Git bloquea la entrega.

La demo se detecta por index.html en la raíz o entradas App/app/main/index en src (JS/TS/JSX/TSX y formas de módulo); el diagnóstico cubre los literales de src, sin exigir que el componente de demostración se llame App. Revisa application.signals y el motivo de NOT APPLICABLE si usas una estructura diferente. No incluyas el usage.md que va a escribirse entre las entradas examinadas, tampoco como input adicional de la revisión: la finalización rechaza esa dependencia circular antes de publicar informes.

La recogida de finalize:import elige un puerto libre automáticamente; añade `--collect --port 5189` o `--diagnose --port 5189` si necesitas fijarlo. El puerto explícito ocupado produce NOT RUN, sin conectarse al servidor ajeno. Consulta collection.preview o diagnosis.preview para el puerto y URL efectivos; la vista se detiene al finalizar el adaptador. El puerto no se admite en --reviews ni --check. La CLI directa de verification-preview acepta 0 (o ningún puerto) para asignación automática y mantiene abierta la vista hasta detenerla.

**Bucle obligatorio de implementación:** después del primer código/CSS permitido y tras cada corrección visual, ejecuta `npm run finalize:import -- ROOT METADATA --diagnose` antes de presentar el resultado. Examina diagnosis.diagnostics.cases, resources, warnings y nextActions: corrige defectos demostrados y vuelve a medir. No interpretes el nombre de una variante como geometría: usa su snapshot y las cajas renderizadas. Comprueba las dimensiones efectivas de cada parte, no solo el tamaño de la raíz; revisa bordes parciales y diferencias AABB. Una fuente pendiente puede afectar anchos y posiciones dependientes del texto; las diferencias numéricas no identifican por sí solas la causa. No ensanches tolerancias, cambies el snapshot ni sustituyas recursos para obtener PASS. Sin navegador, declara NOT RUN/BLOCKED y no presentes la importación como terminada.

--diagnose ejecuta el código del componente con el runtime fijado, inicia una vista temporal y conserva cuerpos originales, recibos, capturas y comparaciones solo en un directorio temporal nuevo. No publica artefactos en el DS, no modifica fichas/usage ni registra revisiones. Los recursos esenciales pendientes siguen en FAIL; comparar provisionalmente no los resuelve. La salida diagnosis mantiene mode=diagnostic, manifest.cases vacío, complete=false y no alcanza PASS de entrega, ni siquiera si todos los checks numéricos pasan. REVIEW_RENDERED_DIFFERENCES identifica casos/checks a revisar sin atribuir automáticamente la causa al CSS. Tras resolver recursos, --collect y --reviews siguen siendo los pasos de publicación y confirmación; no combines estos modos.

Ruta integrada: `npm run finalize:import -- ROOT METADATA --collect` recoge/publica con el runtime fijado y pasa el gate; nunca inventa revisiones. Si faltan fuentes o imágenes esenciales, pide su origen autorizado antes de recoger, sin deducir paquetes del nombre ni sustituir imágenes. Tras comparar los artefactos, `npm run finalize:import -- ROOT METADATA --reviews REVIEW_FILE` registra schemaVersion 1 y cases [{caseId, review}], una revisión explícita por caso fidelity con el contrato de report. Deriva/persiste informes y hashes, revalida y actualiza atómicamente solo el JSON de correspondencias, conservando la prosa, y pasa el gate completo. No combina recogida y revisión de artefactos nuevos. `--check` comprueba sin escribir. Los avisos de bordes parciales y tamaños AABB no comparables son diagnósticos para revisar, no excepciones a FAIL ni pruebas de forma.

La vista muestra viewport esperado/obtenido y acota cada intento. Para esperar desde fuera, inicia `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs wait DIRECTORY CASE 20000` antes de abrir el caso o pedir otra recogida: solo observa recibos nuevos y su timeout no depende de la página. Diagnostica visibilidad, montaje, fuentes o viewport al agotarse; un diagnóstico con viewport incorrecto no es evidencia publicable.

Tras una recogida real y con escritura autorizada, publica cuerpo y recibo con `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs publish . METADATA CASE RECEIPT`; usa el artefacto devuelto en REVIEW sin transcribir valores. El PNG requiere export node-bounds y escala explícita y decodificación íntegra; sus dimensiones reales se derivan y deben quedar a ≤1 px del tamaño capturado del nodo por la escala declarada (tolerancia, no una regla de redondeo de Figma); sin tamaño legible, la comparación queda NOT VERIFIED. publish y report exigen el CSS mapeado también fuera de src/. La caducidad incluye conservadoramente fuentes locales, tokens, relaciones y archivos de dependencias/configuración. Estas comprobaciones no autentican la captura ni generan el juicio visual PASS.

Los cambios de verification (recursos, fuentes, casos y tratamientos) también cuentan como otros cambios observados del preanálisis, junto con evidence: no se reescriben al reutilizar ni en una sustitución limitada a otra dependencia sin autorización. Cambiar un plan o informe no prueba por sí solo que Figma haya cambiado.

Genera requisitos con `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs requirements SNAPSHOT`; escribe solo las decisiones del contrato y combínalas con `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs apply . METADATA DECISIONS`. No copies hechos ni repitas fuentes por nodo. usage.md usa un único bloque JSON por caseId; confirmed exige informe renderizado durable, configuración exacta y hashes vigentes. Los recibos de medidas no habilitan confirmed.

En inspect revisa también configuration/configurationWarnings: DECLARED enlaza el archivo registrado con @font-face y descriptores coincidentes en stylesheets/imports CSS incondicionales o imports/reexports estáticos desde el componente, incluido CSS de paquetes resolubles sin ejecutar su código. No prueba selección ni carga. Imports dinámicos, condiciones CSS, cualquier import con ? (incluidos workers y @import), efectos secundarios de paquetes JS y resoluciones no soportadas siguen NOT VERIFIED. El resolvedor de exports solo acredita un destino único estable entre las condiciones no fijadas: no asumas Node require, un modo de compilación ni style universal, ni sortees una exclusión buscando el archivo. El gate conserva este diagnóstico también en warnings con prefijo de componente, sin convertirlo en confirmación ni rescatar fuentes esenciales pendientes; completa siempre la comprobación renderizada. css.weight solicita un peso concreto (cadena numérica de 1 a 1000, normal o bold), nunca un rango ni una expresión relativa; el rango solo describe la cara disponible. Respeta targets de nextActions para identificar cada ficha al agrupar acciones iguales.

Con evidence y los arrays fonts/assets/cases de la ficha en preparación, usa `node .agents/skills/create-ds-from-figma/scripts/verification-resources.mjs inspect ROOT METADATA` sin escribir. Dentro de la importación autorizada, registra el archivo que el usuario haya aprobado con `node .agents/skills/create-ds-from-figma/scripts/verification-resources.mjs register ROOT METADATA font FONT_ID SOURCE_PATH` o `node .agents/skills/create-ds-from-figma/scripts/verification-resources.mjs register ROOT METADATA image IMAGE_HASH SOURCE_PATH`. Solo escribe source existente y calcula su hash; agrupa todas las apariciones de la imagen en esa ficha. No crea CSS ni edita stylesheets. Una sustitución de ruta/hash exige --replace explícito, nunca lo añadas para sortear un conflicto sin autorización. Registrado no es configurado ni cargado: revisa @font-face/uso real y compruébalo en el navegador por separado. Respeta los nextActions compartidos del diagnóstico/gate/finalización: comandos son argv con argumentos pendientes, no shell ni prueba de autorización. No copies fuentes del runtime de tests al proyecto. El formato de metadata no cambia.

Antes del TSX, completa también `metadata.verification` según `references/component-metadata.md`: recursos autorizados con hashes, CSS global, casos de contenido Figma exacto y contenido alternativo admitido. No inventes paquetes de fuente; una carencia esencial sigue siendo DS_GAP. Tras implementar, ejecuta `node .agents/checks/verify-render-plan.mjs .` (integrado en verify-ds) y usa `node .agents/skills/create-ds-from-figma/scripts/verification-preview.mjs . design-system/components/Nombre/metadata.json 5174` sin cambiar App.tsx. Separa el recibo de medidas de la valoración visual; revisa fuentes reales, modos, estados y contenido, y detén el servidor al terminar.

## Tokens (inventario file-level)

Si el gate o finalize:import devuelven RESOLVE_FLOAT_SERIALIZATION, revisa sus variables, fichas y referencias y registra solo decisiones respaldadas por evidencia o criterio expreso del usuario. No asignes px por defecto ni uses generate-token-json save como si decidiera unidades. Consumo PARTIAL/UNKNOWN exige revisar los avisos: ausencia de referencias identificadas no significa sin uso. Ante OBTAIN_VALID_CAPTURE o RESTORE_OR_INSPECT_CAPTURE, sigue el motivo: restaura el original histórico si existe o pide transporte autorizado para una nueva captura y persistencia explícita; nunca inventes snapshots, observaciones ni hashes. El diagnóstico de la aplicación es independiente del bloqueo.

El inventario de tokens es siempre a **nivel de file**, no del nodo del componente. En el preanálisis se lee sin escribir; tras superar el diagnóstico se persiste.

1. El colector de inventario lista **todas** las colecciones locales mediante `figma.variables.getLocalVariableCollectionsAsync()`; no transcribas la respuesta.
2. El mismo colector lista **todas** las variables locales mediante `figma.variables.getLocalVariablesAsync()`, incluidos los valores no usados por el componente. Usa su sobre sellado como entrada de los scripts, no otra lectura manual.
3. Genera la propuesta con `node .agents/skills/create-ds-from-figma/scripts/generate-token-json.mjs plan . --inventory INVENTORY`. Solo si el diagnóstico permite escribir, usa `save` en lugar de `plan`: mezcla los hechos observados sin transcribir valores, conserva cssName, ámbitos, serializaciones y registros ausentes de esta captura. No inventa un modo activo para un alias entre colecciones: si sus valores dependen del modo y no hay resolución inequívoca, bloquea y pide criterio. No sobrescribas esa limitación a mano. Los ámbitos nuevos quedan null y las serializaciones FLOAT sin decidir siguen pendientes. Registra únicamente decisiones de integración explícitas en los campos existentes del estado. Después de registrar la ficha y el mapa, genera `src/styles/tokens.css` con `scripts/generate-tokens-css.mjs . --inventory INVENTORY`; nunca lo edites a mano. El argumento compara datos observados, no demuestra vigencia ni autenticidad y no borra registros conservados. Sin `--inventory` no hay una afirmación de trazabilidad.

**Prohibido como inventario de tokens:**

- `get_variable_defs` del nodo del componente (solo trae las ligadas a ese nodo)
- quedarse con las variables que usa el componente de la URL
- fusionar colecciones distintas en tres buckets (color / spacing / type)

`get_design_context` puede usarse en el preanálisis, pero nunca como fuente del inventario de tokens: ese inventario procede de todas las variables del file de origen.

Si no hay variables locales en el file, deja el inventario local vacío. Solo continúa si hay bindings externos directos con ID y valor resuelto verificables en `externalVariables`; en otro caso, `DS_GAP`. No inventes hex ni colecciones locales.

Antes de persistir los tokens, aplica el formato de `references/tokens.md` leído durante el preanálisis. Antes de escribir `figma-state.json` o `figma-code-map.json`, aplica `references/relationships.md`. No inventes valores ni refs; conserva los ya importados.

## Componentes anidados

La vista debe cargar las definiciones de los tokens usados mediante imports reales o verification.stylesheets: listar tokens.css solo en inputs no las carga. El gate rechaza definiciones ausentes, pero su presencia no confirma el modo o valor efectivo. La resolución TypeScript solo lee configuración local y extends contenidos en el proyecto; no hereda automáticamente configuración del directorio padre.

La verificación no debe bloquear la siguiente importación por confirmaciones caducadas de otros componentes: caducidad íntegra es aviso NOT VERIFIED, sin reescribir usage.md; corrupción sigue siendo error. Declara verification.inputs para archivos adicionales y sigue la clausura local de imports/CSS, sin hashear el árbol completo ni las relaciones completas. Imports/globs no resolubles requieren revisión; no inventes cobertura.

En la vista de verificación, la raíz superior delimita las partes de la instancia: los marcadores root y partes homónimas de anidados no se cuentan como partes del padre. Los recibos incluyen huella semántica del caso y hashes originales; ni publicar ni generar un informe nuevo permite confirmar una recogida caducada por cambios de implementación. Recoge de nuevo si cambiaron esos inputs o decisiones relevantes.

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
5. **Código** — `src/components/<Nombre>/` con tokens y reutilizando anidados `mapped`. Declara `interface <Nombre>Props extends ... { ... }` o `type <Nombre>Props = Omit<...> & { ... }` (también vale un literal sin herencia) en su TSX y úsalo en el componente; hereda props nativas en vez de redefinirlas cuando corresponda. Para los valores de `kind: prop`, documenta en `usage.md` las correspondencias candidatas Figma → código según `references/component-metadata.md`; la comparación renderizada del paso 9 puede confirmarlas, no el mero hecho de haber escrito ese código. Aplica el mismo criterio en importaciones y actualizaciones posteriores.
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

## Diagnóstico Experimental De Composición

Un timeout de captura o fallo técnico de guardado/restauración también produce NOT RUN y reintento. No lo confundas con una abstención conocida del modelo: conserva los motivos y artefactos parciales; si falla la restauración, los checks de ese grupo no acreditan PASS.

Si compositionSummary contiene NOT RUN, --diagnose falla y RETRY_COMPOSITION_DIAGNOSTICS conserva caso/check/motivo técnico: resuelve el error y repite con los permisos necesarios, sin tratarlo como diferencia visual. NOT COMPARABLE es abstención, no reintento obligatorio. nonOpaque cuenta píxeles sin tinta opaca; las regiones excluidas con tinta opaca cuentan como indeterminate. temporary-read permite leer los artefactos existentes, sin escribir ni lanzar navegador; las acciones solo declaran requisitos, no conceden autorización.

Revisa diagnostics.compositionSummary y cases[].composition en --diagnose: la tinta aislada/compuesta puede detectar un trazo tapado aunque la geometría pase. REVIEW_COMPOSITION_DIAGNOSTICS requiere examinar las capturas temporales y el balance de píxeles antes de corregir. Solo compara formas hoja hermanas inequívocas, con orden fuente legible, aislamiento estable y tinta opaca distinguible; texto, ambigüedad, filtros y translucidez no se fuerzan a PASS. Un PASS no acredita máscaras/mezclas de origen no capturadas ni fidelidad general. Esta salida no se publica ni sustituye checkReviews o la revisión visual real; no afirmes haber visto un borde por pasar geometría o composición.

## Prohibido

- Rellenar plantillas o el DS generado con un DS de ejemplo
- Copiar al DS generado recursos de `.agents/` distintos de las plantillas indicadas (incluidos `checks/`, `rules/`, `skills/`, `workflows/`, `references/`, `scripts/`, `browser-tests/` o `prop-vocabulary.json`), generar `.ai/` o mantener runtimes AI duplicados
- Generar todos los componentes del file de golpe
- Citar en reglas o inventario componentes que aún no están en el DS generado
- Una pantalla en la primera vez (si la URL es una pantalla: `DS_GAP`, sin escribir)
- Hex/spacing inventados
- Resumir variables a `colors.json` / `spacing.json` / `typography.json`
- Inventario de tokens solo con las variables del componente
- Añadir Tailwind, Storybook, CI, `docs/` o `.github/` al scaffold generado por la importación. Las verificaciones del kit son locales; no configurar pipelines ni hooks de Git sin petición explícita
- Más de dos archivos por carpeta en `design-system/components/<Nombre>/`
