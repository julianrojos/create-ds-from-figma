# CREATE DS FROM FIGMA

Kit para crear un Design System desde Figma dentro de este repositorio. Parte sin tokens, componentes ni pantallas: el agente analiza un componente antes de implementar únicamente lo solicitado.

[AGENTS.md](AGENTS.md) y [.agents/](.agents/) son la fuente canónica de instrucciones. Este README ofrece el inicio rápido y enlaza los procedimientos y contratos.

## Usar

Instala las dependencias con `npm install`, abre el repositorio en tu IDE y pide a tu agente:

```text
Crea un DS

<URL de UN componente de Figma>
```

Necesitas una conexión Figma autorizada que pueda ejecutar el colector en Plugin API y guardar la respuesta sin transcripción del modelo. Antes de usar una conexión directa, revisa y autoriza su configuración: `--approve-connection` no acredita por sí solo revisión humana. Consulta la [configuración, comprobación y límites del transporte](.agents/skills/create-ds-from-figma/references/figma-evidence.md#cli-portable). Las conexiones concretas de Claude Code y OpenCode aún requieren validación propia; no se presupone que sean incompatibles ni que necesiten credenciales nuevas.

La [skill de importación](.agents/skills/create-ds-from-figma/SKILL.md) acepta componentes, sets, variantes e instancias con principal resoluble. Requiere variables locales o bindings externos verificables. Un frame pertenece al [flujo de pantallas](.agents/workflows/build-from-figma.md) solo cuando se pide construir una pantalla; pedir «crea un DS» desde un frame sigue el flujo de importación y devuelve `DS_GAP` sin escribir.

El preanálisis resuelve variantes, todas las colecciones locales y componentes anidados. Si faltan recursos esenciales o un anidado local, se detiene con `DS_GAP` antes de implementar. Solo si el único bloqueo son anidados locales, preparar scaffold y tokens exige petición expresa; no registra el componente bloqueado. Consulta las [decisiones antes de escribir](.agents/skills/create-ds-from-figma/references/import-preanalysis.md#decisión-antes-de-escribir).

Para el siguiente componente, proporciona otra URL. Repetir una URL no autoriza una actualización general. Las pantallas se construyen cuando existen los componentes necesarios. El [procedimiento de implementación](.agents/skills/create-ds-from-figma/references/import-implementation.md) describe el árbol generado y la integración con el manifiesto existente.

## Estructura y contratos

| Ruta | Contenido |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Restricciones y obligaciones generales |
| [.agents/skills/](.agents/skills/) | Importación, búsqueda, mapeo y validación del DS |
| [.agents/rules/](.agents/rules/) | Reglas de código, composición y accesibilidad |
| [.agents/workflows/](.agents/workflows/) | Construcción de pantallas y cierre por perfiles |
| [.agents/checks/](.agents/checks/) | Verificadores y checks manuales |
| [.agents/checks/tests/](.agents/checks/tests/) | Regresiones y fixtures sintéticos |
| [.agents/evals/](.agents/evals/) | Casos, procedimientos y resultados de evaluación de instrucciones |
| [.agents/reading-plan.json](.agents/reading-plan.json) | Selección de referencias por fase y condiciones observadas |
| [.agents/prop-vocabulary.json](.agents/prop-vocabulary.json) | Vocabulario de props |
| [plantillas](.agents/skills/create-ds-from-figma/plantillas/) | Scaffold vacío y fichas adaptables |

Los contratos completos viven en las referencias de [tokens](.agents/skills/create-ds-from-figma/references/tokens.md), [relaciones](.agents/skills/create-ds-from-figma/references/relationships.md), [captura Figma](.agents/skills/create-ds-from-figma/references/figma-evidence.md) y [ficha y verificación renderizada](.agents/skills/create-ds-from-figma/references/component-metadata.md). Las [operaciones auxiliares](.agents/skills/create-ds-from-figma/references/tooling.md) describen exportación SVG, diagnóstico experimental de píxeles, mutaciones y experimentos históricos.

Cada ficha generada contiene solo `metadata.json` y `usage.md`; el código vive en `src/components/<Nombre>/`. El inventario registra únicamente implementaciones existentes. Se conserva un JSON por colección Figma y `tokens.css` se genera, no se edita a mano. El kit mantiene verificaciones locales, sin Tailwind, Storybook, CI ni hooks de Git; las [restricciones de implementación](.agents/skills/create-ds-from-figma/references/import-implementation.md#prohibido) concretan el alcance.

## Verificar

Node >=22.12.0 es requisito para importar, verificar y validar el kit (`package.json` declara `engines` y `.nvmrc` fija la línea 22). Una shell sin el perfil de `nvm`, `fnm`, `volta` o `asdf` no lo encuentra aunque esté instalado: cárgalo antes de concluir que falta. Para validar el kit, además, prepara una vez el runtime aislado de navegador; repite la preparación si cambia su lock:

```sh
npm install
npm run test:browser:setup
npm run verify:all -- kit
```

El perfil `kit` agrupa `npm test` completo, incluido Chromium real, documentación estricta, estructura de fixtures de routing/comportamiento y comprobación de punteros y cobertura del plan de lectura. Los requisitos ausentes producen error; las pruebas no instalan dependencias. El runtime de [.agents/browser-tests/](.agents/browser-tests/) tiene lock y dependencias propios, que no se añaden a la app generada. Los resultados de navegador quedan en `test-results/browser/`, ignorado por Git.

`npm run test:unit` solo cubre unitarias/simuladas; no sustituye la suite completa. `npm run test:browser` ejecuta el perfil real. `npm run verify:docs` informa enlaces, rutas y comandos rotos; añade `-- --strict` para que los hallazgos fallen. Los perfiles y sus efectos se documentan en [verificación y evaluación](.agents/workflows/verify-and-evaluate.md).

Tras una implementación permitida, el [bucle de diagnóstico](.agents/skills/create-ds-from-figma/references/import-verification.md#recursos-y-casos) exige medir, revisar diferencias, corregir defectos demostrados y repetir. `--diagnose` ejecuta código y conserva resultados temporales; no publica ni confirma. Entregar una importación exige `npm run verify:imports`, evidencia vigente y revisión renderizada real. Un candidato, `NOT VERIFIED` o navegador `NOT RUN` no son una entrega completa. Los modos `--collect` y `--reviews` escriben y requieren la autorización correspondiente; consulta la [finalización integrada](.agents/skills/create-ds-from-figma/references/component-metadata.md#finalización-integrada).

Las skills seleccionan apartados con `npm run read:guidance -- FASE`, añadiendo condiciones observadas con `--with`. `--stats` mide bytes y palabras para escenarios explícitos, sin acreditar ahorro general de tokens ni cumplimiento del agente. El [contrato de comportamiento](.agents/evals/behavior/contract.md) define trazas de proceso y sus límites. El [índice de evaluaciones](.agents/evals/README.md) distingue pruebas técnicas, selección con catálogo suministrado y experimentos históricos; el routing es una prueba de humo, no discovery real ni garantía de ejecución.

El [mapa de migración](.agents/evals/readme-migration.json) conserva cada bloque de la guía anterior, su hash, líneas y destino para revisar la consolidación documental.
