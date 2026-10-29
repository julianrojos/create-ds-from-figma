# Diagnóstico y cierre de la importación

Aplica las [invariantes de proceso](../../../../AGENTS.md#invariantes-de-proceso). Los formatos completos son los seleccionados por el plan; esta referencia contiene el procedimiento, sin copiar sus contratos.

## Preparar el diagnóstico

Diagnostica código existente únicamente dentro del alcance autorizado. Después de implementación permitida y cada corrección visual ejecuta `npm run finalize:import -- ROOT METADATA --diagnose`; INV-PREWRITE sigue impidiendo crear una importación bloqueada para medirla. El diagnóstico ejecuta código/navegador y escribe temporales; INV-DIAGNOSE prohíbe publicar o confirmar por ese hecho.

Antes de arrancar, completa preflight estático, recursos esenciales previstos, casos, contenido, modos, estados y viewport. Los contratos de ficha/casos se leen antes de TSX en import-code. Para vista manual usa import-preview. Un estado que no puede activar el adaptador necesita un harness autorizado, no eventos inventados.

La CLI limpia devuelve NOT VERIFIED, complete=false y salida 1; errores y falta de ejecución conservan FAIL/NOT RUN. Lee execution, errors y blocked antes de interpretar números. Revisa por separado el diagnóstico de literales de la app. No combines --diagnose, --collect, --reviews o --check. Sin navegador informa NOT RUN/BLOCKED.

## Interpretar el diagnóstico

Después de ejecutar, lee esta fase antes de corregir, reintentar o informar conclusiones. Examina diagnosis.diagnostics.cases, resources, warnings, application y nextActions. Distingue ejecución, conformidad estática, resultado numérico y revisión visual. Las dimensiones de cada parte, bordes parciales y posición AABB se contrastan con su snapshot, no con nombres de variantes. Una fuente pendiente puede alterar anchos/posiciones; los deltas no demuestran su causa.

`--diagnose` evalúa composición automáticamente; --with composition solo elige documentación. Si compositionSummary contiene checks (PASS/FAIL/NOT RUN/NOT COMPARABLE), cases[].composition contiene resultados, o nextActions incluye REVIEW_COMPOSITION_DIAGNOSTICS o RETRY_COMPOSITION_DIAGNOSTICS, lee import-diagnose-results --with composition antes de interpretarlos. Los errores técnicos requieren reintento; una abstención conocida no es un error de ejecución. No cambies tolerancias, snapshots ni recursos para obtener PASS.

Tras corregir defectos demostrados, repite el diagnóstico. No publiques ni confirmes por un diagnóstico limpio: aplica INV-STATUS/INV-DELIVERY y lee import-close antes de las acciones autorizadas de recogida/revisión.

## Recursos Y Casos

Usa los contratos canónicos de metadata seleccionados por fase: cobertura de nodos, estados originales, dimensiones intrínsecas, recursos registrados/configurados/cargados, CSS.supports, puerto efectivo, mediciones originales y revisión específica. No contabilices un contenedor oculto ni internos delegados como omisiones automáticamente. Las tolerancias TEXT son provisionales y mantienen la revisión renderizada específica; behavior exige todos sus checks en PASS.

El kit sin DS ni aplicación es NOT APPLICABLE, no una importación confirmada. Un scaffold coherente sin componentes es admisible; un scaffold parcial falla y un index.html aislado no permite aprobar un kit vacío. La detección de demo usa application.signals; revisa el motivo de NOT APPLICABLE si la estructura es distinta.

El gate y la finalización conservan sus contratos en metadata y AGENTS; para publicar cuerpo/recibo o registrar revisiones aplica exactamente sus comandos y evidencias. La sintaxis CSS de la demo se diagnostica independientemente; no prueba ejecución de la demo ni fidelidad. La comparación de imágenes y las revisiones son reales, no afirmaciones fabricadas en un informe.

## Diagnóstico Experimental De Composición

El modelo, contadores, límites y motivos de abstención están en los apartados canónicos de metadata que selecciona import-diagnose-results --with composition. Revisa capturas temporales compuestas/aisladas y sus motivos antes de corregir. La geometría o un PASS de composición no acreditan visibilidad general, máscaras, glifos ni fidelidad; no sustituyen checkReviews ni comparación visual.
`verify:imports` y los perfiles de UI incluyen el [diagnóstico de cierre](../../../checks/closure-conformance.md). Los huérfanos y tokens inexistentes fallan; un ámbito CSS obligatorio NOT_RUN también bloquea la entrega. `finalize:import --check` hereda este gate sin publicar ni reparar registros. La consulta de desarrollo `npm run verify:closure -- ROOT` solo informa; no autoriza cambios de clasificación. Cita el resultado del gate al entregar y muestra las causas de confirmaciones caducadas.
