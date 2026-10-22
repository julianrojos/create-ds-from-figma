# Referencia para reorganizar la skill de importación

Fecha: 2026-10-22. Alcance: reorganización documental de la skill canónica,
sin cambios de formato, publicación, permisos, tolerancias ni verificadores.
Esta referencia sirve para revisar la conservación de obligaciones; no es
otro procedimiento operativo ni una evaluación ejecutada del agente.

## Validación inicial

- Árbol de Git limpio antes del trabajo; rama activa del repositorio principal.
- `npm run verify:docs`: PASS, 0 hallazgos.
- Primera ejecución de `npm test` en sandbox: dos errores `listen EPERM`;
  el perfil de navegador quedó NOT RUN. Fue una restricción del entorno.
- Repetición autorizada de `npm test`: 603 pruebas unitarias y 15 de Chromium
  real, 618 aprobadas, 0 fallidas y 0 omitidas.
- Los fixtures sintéticos no acreditan fidelidad frente a Figma ni routing real.

## Correspondencia para revisar el cambio

Las ubicaciones siguientes están dentro de la misma skill. La entrada canónica
enlaza directamente cada referencia y exige leerla en su fase.

| Escenarios existentes en cases.md | Obligación que se conserva | Ubicación del detalle |
| --- | --- | --- |
| Enrutado de skills; captura no disponible; anidado local sin mapear | Inspección del tipo, origen y bloqueos antes de escribir | SKILL.md y references/import-preanalysis.md |
| Inventario completo; prefijo; JSON ausente; inventario ausente | Captura file-level sin transcripción, nombres preservados y reparación condicionada | references/import-preanalysis.md y references/import-implementation.md |
| Dependencia externa ahora mapeada; cambio solo en evidencia | Identidad verificable, actualización automática localizada y autorización de otros cambios | references/import-preanalysis.md |
| Modos; FLOAT; alias entre colecciones | No elegir ámbito, unidad o modo ambiguo; conservar decisiones explícitas | references/import-preanalysis.md, references/import-implementation.md y references/tokens.md |
| Dimensiones intrínsecas; estilos mixtos; variantes y API | Hechos de captura separados de decisiones; API candidata y bloqueo esencial | references/import-implementation.md y references/component-metadata.md |
| Recursos y tipografía; configuración nativa; delegación | Recursos esenciales autorizados, estados originales y diferencias delegadas explícitas | references/import-preanalysis.md y references/import-verification.md |
| Prevención antes de entregar; composición; cierre acotado | Diagnóstico temporal tras implementación permitida, corrección y nueva medición; sin aprobación automática | references/import-verification.md |
| Correspondencia confirmada; vigencia; consulta sin escritura | Publicación autorizada, revisión real, hashes vigentes, behavior PASS y gate de entrega | SKILL.md y references/import-verification.md |

## Discrepancia corregida en los casos

«JSON registrado ausente» permitía reconstruir una colección con variables
publicadas a partir de Figma. La skill y la prueba existente de preflight exigen
restaurar el JSON original para conservar sus nombres publicados. Se corrige
la expectativa del caso, conservando la reconstrucción de colecciones antes vacías.

## Límites de esta comprobación

Se trasladan los párrafos de detalle y se revisan los punteros entre secciones;
la entrada resume las fases y conserva el diagnóstico de salida y el routing.
La revisión de conservación no prueba que un modelo vaya a obedecer la skill.
Las evaluaciones de routing y comportamiento requieren ejecuciones separadas.
