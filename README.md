# CREATE DS FROM FIGMA

Proyecto para arrancar un Design System desde 0 dentro de este repo preparado.

No trae tokens, componentes ni pantallas. El agente analiza la URL de Figma antes de escribir y crea el DS cuando el componente puede importarse.

## Usar

Instala las dependencias con `npm install`. Antes de importar, necesitas acceso a Figma y un transporte capaz de ejecutar el colector en Plugin API y guardar su respuesta sin transcripción del modelo. Una conexión que solo devuelve contexto de diseño no basta.

- Si tu entorno dispone del orquestador de Codex requerido por el adaptador, el agente puede usarlo con la conexión de Figma disponible.
- En Claude Code u otro entorno sin ese adaptador, comprueba primero si existe una conexión MCP directa compatible (stdio o HTTP) y autorizada. Si existe, usa su configuración y el mecanismo de autenticación que requiera; no presupongas que hacen falta un servidor nuevo o credenciales nuevas. Si no existe, solicita la configuración de una conexión compatible. No se reutiliza automáticamente el OAuth del editor.

Antes de ejecutar una conexión directa, el usuario debe revisar y autorizar su configuración. --approve-connection evita una ejecución accidental, pero el agente puede añadir la opción: no acredita revisión humana ni sustituye los permisos del entorno.

Consulta [la configuración y comprobación del transporte](.agents/skills/create-ds-from-figma/references/figma-evidence.md). No hay una conexión de Claude Code validada en este repo. Esa falta de validación no implica que todas sus conexiones sean incompatibles: hay que comprobar la conexión concreta. Si no existe transporte operativo, informa `NOT RUN` y `DS_GAP` sin crear el componente ni copiar respuestas a mano; es un bloqueo de la importación en ese entorno, no del mantenimiento del kit.

Abre este repo en tu IDE, abre un chat con la IA y pide:

```text
Crea un DS

<URL de UN componente de Figma>
```

El componente debe disponer de variables locales en su file de origen o de bindings a variables externas con ID y valor resuelto verificables. La URL puede apuntar a un componente, un component set, una variante o una instancia cuyo componente principal se pueda resolver; un frame o pantalla no se importa por este flujo.

Antes de crear archivos, el agente identifica el componente y sus variantes, lee **todas** las colecciones del file de origen y resuelve los componentes anidados. Si falta uno local, informa `DS_GAP` y espera su URL sin escribir archivos. Solo prepara el scaffold y los tokens pese a ese bloqueo si el usuario lo pide expresamente; el componente bloqueado nunca figura como importado. Si el análisis permite continuar, vuelca un JSON por colección e implementa **solo** el componente pedido.

Si se prepara solo el scaffold, `App.tsx` queda válida y vacía hasta importar el primer componente.

Siguiente componente: otra URL. Pantalla: cuando ya haya componentes importados.

## Qué incluye

| Ruta desde la raíz del repo                                                                          | Para qué                                                    |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `README.md`                                                                                          | Guía humana del kit y su estructura                         |
| `.agents/skills/create-ds-from-figma/SKILL.md`                                                       | Skill canónica                                              |
| `.agents/skills/create-ds-from-figma/references/`                                                    | Formatos consultados durante el preanálisis y la escritura  |
| `.agents/skills/create-ds-from-figma/evals/`                                                         | Casos de evaluación del flujo de importación                |
| `.agents/skills/create-ds-from-figma/scripts/`                                                       | Preflight, generador de `tokens.css` y tests de estructura  |
| `.agents/skills/create-ds-from-figma/plantillas/design-system/`                                      | Árbol fijo vacío que se copia tal cual a `design-system/`   |
| `.agents/skills/create-ds-from-figma/plantillas/componentes/`                                        | Plantillas de ficha por componente                          |
| `.agents/checks/`                                                                                    | Checks automáticos y manuales que se ejecutan desde el repo |
| `.agents/checks/tests/`                                                                              | Tests de los verificadores automáticos                      |
| `.agents/rules/`                                                                                     | Reglas persistentes para el DS generado y `src/`            |
| `.agents/skills/find-component/`, `.agents/skills/map-figma-to-code/`, `.agents/skills/validate-ds/` | Skills auxiliares del flujo                                 |
| `.agents/workflows/`                                                                                 | Workflow de construcción desde Figma                        |
| `.agents/prop-vocabulary.json`                                                                       | Vocabulario canónico de props                               |

Para validar el kit, instala las dependencias y ejecuta `npm test` desde la raíz de este repo. `npm run verify:docs` comprueba enlaces locales, rutas del kit y referencias a scripts Node y comandos npm en la documentación; informa de hallazgos sin fallar salvo con `npm run verify:docs -- --strict`.

Cada componente mapeado exige una captura estructurada e inmutable de Figma, separada de las decisiones de API y CSS, sin excepciones. El colector preserva valores brutos, modos, estilos y limitaciones; el SHA-256 identifica la captura, no la revisión de Figma. El kit sigue vacío: las capturas nacen al importar, en `design-system/figma/snapshots/`.

`node .agents/checks/verify-figma-evidence.mjs .` comprueba cobertura y fidelidad contra la captura de importación. verify-ds incluye errores y avisos, y rechaza fichas sin evidencia. Valida referencias y reglas, no equivalencia visual ni calidad de razones manuales. El CLI portable captura directamente mediante MCP por stdio o HTTP, sin APIs del editor ni copia del modelo; requiere conexión y autenticación configuradas. Codex dispone además de un adaptador opcional. Procedimiento y límites en [.agents/skills/create-ds-from-figma/references/figma-evidence.md](.agents/skills/create-ds-from-figma/references/figma-evidence.md).

`node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs propose SNAPSHOT` ofrece candidatos conservadores de clasificación; no decide la API. `node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs compare ANTES DESPUES` compara una relectura opcional después de comprobar la importación original, sin modificar componentes.

`node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs dimensions SNAPSHOT` devuelve la semántica de dimensiones TEXT con refs de apoyo. Toda ficha exige `evidence.textDimensions`: ancho/alto fijo, dependiente del contenido o no determinado, separado de su tratamiento de implementación. No permite congelar una dimensión intrínseca al tamaño del texto de ejemplo. El check verifica cobertura y enlaces, no comportamiento CSS: la comparación renderizada sigue siendo necesaria. No cambia el perfil de captura ni añade retrocompatibilidad a las fichas.

`src/styles/tokens.css` no se edita: lo genera `.agents/skills/create-ds-from-figma/scripts/generate-tokens-css.mjs` y `verify-ds` comprueba que coincide. En un DS generado, instala las dependencias y ejecuta `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y `node .agents/checks/verify-bindings.mjs`. Los dos primeros validan la coherencia del DS y la API de componentes; el último informa cobertura y diferencias de bindings CSS sin bloquear por sus hallazgos.

## Verificación Reproducible

La resolución TypeScript no busca configuración en directorios padre y registra los extends locales consultados; herencia externa queda NOT VERIFIED. La vista exige definiciones CSS alcanzables para los tokens usados: tokens.css debe importarse realmente o figurar en verification.stylesheets, no solo en inputs. Esta disponibilidad estática no demuestra el modo activo ni sustituye la comprobación renderizada.

La caducidad de una confirmación íntegra produce NOT VERIFIED, sin bloquear el DS ni reescribir usage.md. Registros corruptos o mal formados siguen fallando. Se examinan las dependencias locales reales del componente, no todo src/public ni el mapa completo: importar otro componente no invalida por sí solo los casos anteriores. verification.inputs declara archivos adicionales; imports dinámicos/globs o aliases no resueltos quedan pendientes, sin fingir una clausura completa. Archivos de sistema se excluyen explícitamente; symlinks locales y ciclos se resuelven, y destinos externos requieren revisión.

Los recibos conservan la huella semántica del caso y los hashes de la recogida original. Se vuelven a comprobar al publicar, generar un informe y validar confirmed: un informe nuevo no vuelve vigentes unas mediciones caducadas. La vista distingue la raíz superior del componente de las raíces y partes de sus anidados.

`node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs publish . METADATA CASE RECEIPT` publica las mediciones temporales y sus recibos sin reserializarlos, comprobando hashes de origen/destino y archivos examinados. Usa el artefacto devuelto en el informe. El PNG Figma se decodifica con CRC y registra sus dimensiones reales, que deben quedar a ≤1 px del tamaño capturado del nodo por la escala declarada (sin asumir cómo redondea Figma); un tamaño correcto no prueba que la imagen muestre el nodo. publish y report exigen el CSS del mapa aunque esté fuera de src/. Los recursos compartidos, colecciones usadas y manifiestos/locks siguen siendo conservadores; no se cubren recursos remotos, fuentes del sistema ni bytes de node_modules. La publicación y la decodificación no autentican el origen ni sustituyen el juicio visual del revisor. El kit usa parsers CSS/TypeScript, pngjs y el SDK MCP.

apply valida la propuesta en memoria contra verify-ds antes de reemplazar la ficha de forma atómica: un error no modifica metadata.json. Prepara primero código, tokens, relaciones y usage de esa propuesta. confirmed usa informes v2 y requiere una medida original del navegador y una captura PNG Figma tipadas bajo design-system/verification/artifacts. Su caducidad depende de decisiones relevantes del caso y archivos examinados, no de prosa o casos ajenos. El hash completo de metadata queda para auditoría histórica. Esto permite auditar, no autentica ni demuestra la fidelidad del juicio.

`node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs requirements SNAPSHOT` deriva hechos y agrupa fuentes. `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs apply . METADATA DECISIONS` incorpora esos hechos sin transcripción del agente. Los checks detectan sizing intrínseco contradicho por CSS fijo cuando es demostrable y agrupan avisos; lo ambiguo requiere revisión. usage.md usa JSON ligado a los casos: confirmed exige informe renderizado persistido con configuración exacta, archivos/artefactos y hashes vigentes. Esto valida el registro, no su veracidad visual. checkResult de fuentes es el retorno bruto de la API, no prueba de disponibilidad. La vista puede cargar configuración Vite explícitamente revisada con `--config vite.config.ts --approve-config`; nunca la carga automáticamente.

Las importaciones incluyen `metadata.verification`: recursos observados con archivos autorizados/hashes, tipografía esencial cubierta y casos separados de fidelidad y comportamiento. `node .agents/checks/verify-render-plan.mjs .` está integrado en verify-ds. Sin retrocompatibilidad para fichas que omitan el contrato.

Con React, React DOM y Vite del DS instalados, `node .agents/skills/create-ds-from-figma/scripts/verification-preview.mjs . design-system/components/Nombre/metadata.json 5174` sirve los casos sin modificar App.tsx. Usa un puerto libre y ajusta el viewport declarado. La página guarda medidas originales y recibos con SHA-256 navegador/servidor en la carpeta temporal emitida. La vista no instala dependencias adicionales en el proyecto generado ni activa estados o hereda providers/plugins de la app. Los recibos quedan NOT VERIFIED: revisar recursos, modos, estados, contenido y fidelidad sigue siendo necesario. Detén el servidor al terminar. Formato y límites en [el contrato de fichas](.agents/skills/create-ds-from-figma/references/component-metadata.md).

## No negociable

- El repo empieza sin componentes importados
- Sin Tailwind, Storybook ni CI
- Cada ficha en `design-system/components/<Nombre>/` contiene solo `metadata.json` y `usage.md`; el código vive en `src/components/<Nombre>/`
- Si falta información esencial o un componente anidado local, informa `DS_GAP`; no inventes un sustituto
- `design-system/inventory.json` solo registra componentes implementados y pantallas con su composición declarada
- No resumir tokens a color/spacing/type
