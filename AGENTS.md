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
- Si lees, editas o generas archivos en `src/` o `design-system/`, aplica `.agents/rules/design-system.md`.
- Antes de dar por terminada una implementación o modificación de UI, completa la verificación definida en `.agents/rules/design-system.md`, incluidos los checks manuales y la validación renderizada; informa de lo no ejecutado y del motivo.
- Antes de entregar una importación, ejecuta `npm run verify:imports`: exige confirmaciones persistidas vigentes y el diagnóstico independiente de literales de la demo. No presentes candidatos, mediciones pendientes ni un navegador no ejecutado como entrega terminada. El gate no escribe ni confirma automáticamente.
- Los recursos esenciales sin resolver detienen una importación antes del código; sin interacción, devuelve el bloqueo sin escribir. Tras una implementación permitida o corrección visual, ejecuta `npm run finalize:import -- ROOT METADATA --diagnose`, revisa las diferencias y repite tras corregirlas. Este diagnóstico ejecuta el componente pero solo conserva resultados temporales: no publica, confirma ni sustituye el gate de entrega. No permite crear una importación bloqueada para poder medirla.
- Si dos skills solapan, usa la más específica; si hacen falta ambas por fases distintas, aplícalas explícitamente.

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

- Para mantenimiento del kit, `npm run verify:all -- kit` agrupa la suite completa, documentación estricta, estructura de fixtures de routing y comprobación de punteros y cobertura del plan de lectura (`read:guidance --check`). Conserva las obligaciones de `npm test` y `verify:docs` anteriores.
- Para importaciones, `npm run verify:all -- import --root ROOT --metadata METADATA` agrupa checks estáticos, diagnóstico temporal de cada ficha indicada y `verify:imports`; enumera todas las fichas modificadas repitiendo `--metadata`.
- Para pantallas, usa `npm run verify:all -- screen --root ROOT`, añadiendo fichas de componentes importados modificados. No ejecuta ni compara la pantalla completa.
- Estos perfiles ejecutan código/tests/navegador y pueden escribir temporales o resultados; `--dry-run` solo muestra el plan. No publican mediciones ni registran revisiones. No sustituyen checks manuales, revisión renderizada ni permisos del entorno.
- Procedimiento y límites: `.agents/workflows/verify-and-evaluate.md`. Las evaluaciones de routing son independientes de los tests; validar fixtures no demuestra enrutado real.

## Lectura y evaluación de instrucciones

- Selecciona los apartados de `.agents/reading-plan.json` mediante `npm run read:guidance -- FASE`, añadiendo condiciones observadas con `--with`. No cargues referencias completas por defecto; si no sabes si una condición aplica, resuélvelo antes de omitir el contrato.
- La guía única de cierre y routing es `.agents/workflows/verify-and-evaluate.md`; las skills contienen solo instrucciones de la tarea. El índice `.agents/evals/README.md` distingue resultados globales y experimentos por skill.
- Las evaluaciones de selección con catálogo suministrado son pruebas de humo. No las presentes como discovery real ni cumplimiento de ejecución; registra modelos/versiones disponibles y explicita lo no reportado.
