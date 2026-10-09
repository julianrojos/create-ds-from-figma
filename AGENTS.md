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
- Tras cambiar documentación, rutas o comandos del kit, ejecuta `npm run verify:docs`.
