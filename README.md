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

`src/styles/tokens.css` no se edita: lo genera `.agents/skills/create-ds-from-figma/scripts/generate-tokens-css.mjs` y `verify-ds` comprueba que coincide. En un DS generado, instala las dependencias y ejecuta `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y `node .agents/checks/verify-bindings.mjs`. Los dos primeros validan la coherencia del DS y la API de componentes; el último informa cobertura y diferencias de bindings CSS sin bloquear por sus hallazgos.

## No negociable

- El repo empieza sin componentes importados
- Sin Tailwind, Storybook ni CI
- Cada ficha en `design-system/components/<Nombre>/` contiene solo `metadata.json` y `usage.md`; el código vive en `src/components/<Nombre>/`
- Si falta información esencial o un componente anidado local, informa `DS_GAP`; no inventes un sustituto
- `design-system/inventory.json` solo registra componentes implementados y pantallas con su composición declarada
- No resumir tokens a color/spacing/type
