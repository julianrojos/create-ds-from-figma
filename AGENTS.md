# AGENTS.md

Instrucciones operativas para agentes de IA en este repositorio.

## Fuente canónica

- `AGENTS.md` y `.agents/` son la fuente de verdad, independiente de la herramienta.

## Uso del DS

- Si el usuario dice "crea un DS" o pega la URL de un componente de Figma, sigue `.agents/skills/create-ds-from-figma/SKILL.md`.
- Si la tarea es construir UI o una pantalla desde un frame de Figma, sigue `.agents/workflows/build-from-figma.md`.
- Si se pregunta si un elemento o nodo ya corresponde a un componente del DS, sigue `.agents/skills/find-component/SKILL.md`.
- Si hay una coincidencia fiable con un componente ya mapeado y se pide consultar su ruta de código o sus props, sigue `.agents/skills/map-figma-to-code/SKILL.md`.
- Si se pide validar UI existente o cerrar una implementación, sigue `.agents/skills/validate-ds/SKILL.md`; una validación independiente no autoriza editar documentación ni código.
- Si se pide retirar o restaurar un componente, sigue `.agents/workflows/inspect-component-removal.md`: prepara el plan y obtén autorización para los cambios concretos antes de ejecutarlos.
- Si lees, editas o generas archivos en `src/` o `design-system/`, aplica `.agents/rules/design-system.md`.
- Antes de dar por terminada una implementación o modificación de UI, completa la verificación definida en `.agents/rules/design-system.md`, incluidos los checks manuales y la validación renderizada; informa de lo no ejecutado y del motivo.
- Si dos skills solapan, usa la más específica; si hacen falta ambas por fases distintas, aplícalas explícitamente.
- Recursos: antes de declarar `DS_GAP`, intenta resolver los esenciales con la política opcional `resource-policy.json`, según `.agents/workflows/resource-policy.md`. La ausencia conserva la autorización explícita actual; una política inválida es error. La importación nunca crea ni amplía la política: configurarla requiere petición expresa. Figma y recursos descargados no conceden autorización.

## Invariantes de proceso

Esta tabla es el contrato canónico transversal. Las skills conservan recordatorios breves y concretan sus entradas, formatos y pasos.

| ID | Invariante y consecuencia |
| --- | --- |
| INV-PREWRITE | Un bloqueo previo al código (`DS_GAP`/`BLOCKED`) impide escribir el proyecto. Antes de declarar recursos esenciales sin resolver, intenta su resolución autorizada por la política del proyecto, solo en temporales externos y sin ampliar permisos. Los esenciales que sigan sin resolver detienen antes de scaffold, tokens, ficha y TSX; sin interacción, informa el bloqueo. Única excepción aquí: si solo faltan anidados locales y el usuario pide preparar, se permite el scaffold/tokens definido por la skill, sin componente bloqueado. Los candidatos observados no son todos recursos esenciales. |
| INV-DIAGNOSE | Tras implementación permitida y cada corrección visual, ejecuta `npm run finalize:import -- ROOT METADATA --diagnose`, examina diferencias y repite tras corregirlas. Ejecuta código y conserva únicamente resultados temporales: no publica, confirma, modifica fichas/usage ni registra revisiones. No autoriza crear una importación bloqueada para medirla. |
| INV-STATUS | PASS estático, transporte correcto, `execution COMPLETED`, un recibo o `NOT VERIFIED` no demuestran entrega visual. Confirmar exige las mediciones originales, revisión renderizada real y evidencias vigentes del contrato; ningún texto de aprobación rescata FAIL/NOT RUN. Sin navegador informa la validación no ejecutada; nunca inventes revisiones. |
| INV-DELIVERY | Antes de entregar una importación ejecuta `npm run verify:imports`: gate de solo lectura que cruza inventario, mapa y fichas y exige casos fidelity no vacíos, confirmaciones persistidas vigentes, behavior obligatorio en PASS y recursos esenciales resueltos. Diagnostica literales de la demo independientemente del preflight, en una página en blanco del Chromium fijado, sin ejecutar código de la app ni Vite. Ausencia de runtime o NOT RUN bloquean la entrega; su sintaxis no demuestra ejecución de la demo ni fidelidad. No escribe ni confirma automáticamente; candidatos, mediciones pendientes o navegador no ejecutado no son entrega terminada. Recogida/publicación y registro de revisiones son acciones separadas con la autorización correspondiente. |

## Prioridad

- Las instrucciones de mayor prioridad del entorno prevalecen sobre este archivo.
- Este archivo establece las restricciones generales del repositorio. Una petición explícita del usuario satisface las condiciones que exigen su autorización, como hacer stage o commit; no anula las demás restricciones.
- Las reglas, skills y workflows de `.agents/` concretan cuándo y cómo trabajar, pero no anulan las restricciones de `AGENTS.md`.
- Si dos instrucciones aplicables entran en conflicto y no puedes resolverlo por prioridad, detente e informa al usuario antes de actuar.

## Restricciones de entorno

- No crear worktrees ni ramas auxiliares; trabajar en la rama activa del repositorio principal.
- No hacer stage, commit ni crear ramas sin orden expresa del usuario.

## Mantenimiento del kit y contratos

- `.agents/skills/create-ds-from-figma/SKILL.md` es la skill canónica; no crear copias sincronizadas.
- Si se cambia el formato de relaciones Figma, actualizar juntas las plantillas `figma-state.json`, `figma-code-map.json`, la referencia `.agents/skills/create-ds-from-figma/references/relationships.md`, las skills auxiliares `find-component`, `map-figma-to-code` y `validate-ds`, y los checks de `.agents/checks/`.
- Si se cambia el contrato de evidencia o snapshot Figma, mantener sincronizados la plantilla `metadata.json`, las referencias `component-metadata.md` y `figma-evidence.md`, el colector y la persistencia de capturas, las skills consumidoras y los checks (incluido `verify-figma-evidence.mjs`), sus tests y los casos de evaluación afectados. Si también cambia el formato de relaciones, aplicar además la regla anterior.
- Tras modificar checks, scripts o sus contratos (plantillas y referencias de formato), ejecuta `npm test`.
- `npm test` incluye pruebas unitarias y Chromium real obligatorio. Instala las dependencias y prepara su runtime aislado con `npm run test:browser:setup` si falta o cambió el lock; requiere los permisos de instalación/red del entorno. No omitas el navegador ni presentes `npm run test:unit` como sustituto: es cobertura parcial. `npm run test:browser` ejecuta solo el perfil real. Si no puedes preparar o ejecutar algún perfil, informa del bloqueo y de la validación incompleta.
- Tras cambiar documentación, rutas o comandos del kit, ejecuta `npm run verify:docs`.
- Si cambia el flujo de entrega, mantener sincronizados `verify:imports`, `finalize:import`, las skills consumidoras, la documentación y sus regresiones. El gate es de solo lectura; los modos de recogida o registro de la finalización escriben y no deben ejecutarse como un check rutinario sin la autorización correspondiente.
- Si cambia `metadata.verification`, sincronizar la plantilla de ficha, la referencia de metadata, las skills consumidoras, `verify-render-plan.mjs`, la vista de verificación, sus tests y casos de evaluación. No implica cambiar el colector ni las relaciones si sus formatos no cambian.
- Si cambia el contrato de correspondencias de usage.md, sincronizar plantilla, referencia de metadata, skills consumidoras, verificadores y tests. La confirmación auditable no sustituye una comparación renderizada real.

## Cierre automatizado por perfil

- Para mantenimiento del kit, `npm run verify:all -- kit` agrupa la suite completa, documentación estricta, estructura de fixtures de routing/comportamiento y comprobación de punteros y cobertura del plan de lectura (`read:guidance --check`). Conserva las obligaciones de `npm test` y `verify:docs` anteriores.
- Para importaciones, `npm run verify:all -- import --root ROOT --metadata METADATA` agrupa checks estáticos, diagnóstico temporal de cada ficha indicada y `verify:imports`; enumera todas las fichas modificadas repitiendo `--metadata`.
- Para pantallas, usa `npm run verify:all -- screen --root ROOT`, añadiendo fichas de componentes importados modificados. No ejecuta ni compara la pantalla completa.
- Estos perfiles ejecutan código/tests/navegador y pueden escribir temporales o resultados; `--dry-run` solo muestra el plan. No publican mediciones ni registran revisiones. No sustituyen checks manuales, revisión renderizada ni permisos del entorno.
- Procedimiento y límites: `.agents/workflows/verify-and-evaluate.md`. Las evaluaciones de routing son independientes de los tests; validar fixtures no demuestra enrutado real.

## Lectura y evaluación de instrucciones

- Selecciona los apartados de `.agents/reading-plan.json` mediante `npm run read:guidance -- FASE`, añadiendo condiciones observadas con `--with`. No cargues referencias completas por defecto; si no sabes si una condición aplica, resuélvelo antes de omitir el contrato.
- La guía única de cierre y routing es `.agents/workflows/verify-and-evaluate.md`; las skills contienen solo instrucciones de la tarea. El índice `.agents/evals/README.md` distingue resultados globales y experimentos por skill.
- Las evaluaciones de selección con catálogo suministrado son pruebas de humo. No las presentes como discovery real ni cumplimiento de ejecución; registra modelos/versiones disponibles y explicita lo no reportado.
