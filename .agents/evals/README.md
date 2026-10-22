# Índice de evaluaciones del kit

## Ubicación por alcance

- Catálogo completo, routing y coste de lectura: `.agents/evals/results/`.
- Experimentos de una skill: carpeta evals/results de esa skill. La [calibración histórica](../skills/create-ds-from-figma/evals/results/README.md) conserva sus rutas y hashes originales.
- Regresiones automáticas: test-results, ignorado por Git; no son evaluaciones del agente.

No se mueven informes históricos solo para uniformar carpetas. Al añadir un
resultado, registra alcance, entradas, versiones disponibles y límites; conserva
los bytes anteriores. Los resultados cuyos nombres/descripciones o casos hayan cambiado quedan
caducados, sin editar sus hashes para hacerlos pasar.

## Routing vigente

La [evaluación del protocolo 2](results/routing-protocol2-2026-10-22-score.json) obtuvo
24/24 en el catálogo actual. Se conservan la [entrada ciega](results/routing-protocol2-2026-10-22-prompts.json)
y las [observaciones del evaluador](results/routing-protocol2-2026-10-22.json), con los hashes
y la fecha de la ejecución nueva. Se ejecutó en un subagente con contexto limpio,
sin respuestas esperadas ni resultados anteriores. El identificador exacto del
modelo no está disponible y se registra como unreported.

Es una prueba smoke-selection con catálogo suministrado: discovery del runtime
y ejecución de las tareas permanecen NOT RUN. No demuestra estabilidad entre
modelos ni convierte los resultados históricos al protocolo nuevo.

## Routing histórico

El [primer resultado de 12 casos](results/routing-2026-10-22.json) es una prueba
de humo histórica: catálogo suministrado, casos sencillos y modelo no reportado.
No demuestra discovery real ni conducta. No debe presentarse como una garantía
12/12 vigente tras cambiar las skills o la suite.

La suite actual incluye pares de confusión y alcance explícito. El scorer
siempre etiqueta este protocolo como smoke-selection y runtimeDiscovery NOT RUN.
Una validación fuerte necesita ejecutar la petición en el runtime real, conservar
su catálogo/configuración, modelo y versión exactos, herramientas invocadas,
ruta elegida y trazas de acciones. No se fabrica esa evidencia con un resultado
de selección ni con un nombre de modelo supuesto. La [guía](../workflows/verify-and-evaluate.md)
describe los comandos y sus límites.

## Volumen de lectura

`npm run read:guidance -- --scenario simple-first-import --stats` mide la unión
de secciones seleccionadas sin emitir el contenido. blocked-local cubre solo
la entrada hasta un bloqueo; validation-only cubre validación sin condiciones
especiales. Son escenarios explícitos; no predicen tokens ni lectura de toda
importación. El contenido compartido de AGENTS.md y las skills no se cuenta.

La [medición previa](results/guidance-2026-10-22.json) es histórica y corresponde
a un plan con apartados omitidos. Sus 20 KB eran de validation-only, no de una
importación completa; no deben citarse como ahorro vigente. No mide consumo
efectivo de un agente.

La [prueba de contraste previa](results/routing-contrast-before-score-2026-10-22.json)
obtuvo 23/24: c15 eligió construir pantalla ante «crea un DS» con un frame.
Se conservan [entrada ciega](results/routing-contrast-before-prompts-2026-10-22.json)
y [observaciones](results/routing-contrast-before-2026-10-22.json) del catálogo
exacto. Se aclaró la descripción de discovery para exigir DS_GAP en ese caso;
no se cambió la expectativa para hacer pasar el test. El resultado previo es
histórico y su score ya no se revalida contra el catálogo actual.

La [repetición posterior con contexto limpio](results/routing-contrast-after-score-2026-10-22.json)
obtuvo 24/24 con la [entrada ciega actualizada](results/routing-contrast-after-prompts-2026-10-22.json).
Se conservan las [observaciones reales](results/routing-contrast-after-2026-10-22.json).
Ambas ejecuciones son smoke-selection con modelo no reportado: el contraste
local no prueba estabilidad estadística, discovery ni conducta del runtime.

## Cobertura de lectura y protocolo de hash actual

El plan verifica también encabezados y archivos sin asignación. Las únicas
exclusiones admitidas son títulos sin contenido propio; el resto está asignado
a fases normales, condicionales o específicas de vista manual/rendimiento.
Recursos Y Casos se conserva en diagnóstico: no se ha eliminado como duplicado
sin probar equivalencia completa con el contrato de metadata.

La [medición tras corregir cobertura](results/guidance-coverage-2026-10-22.json)
incluye los mínimos históricos y escenarios explícitos con texto/recursos,
delegación/modos y validación de una importación. Ninguno representa un promedio
observado ni acredita un ahorro general de tokens. La medición previa permanece
intacta como registro del plan anterior, con sus apartados omitidos.

Los runs de routing anteriores usan hash del cuerpo completo. Permanecen como
históricos inmutables y no se puntúan con el protocolo actual catalogHashVersion=2,
que cubre solo nombres y descripciones entregados al evaluador. Cambiar el hash
no constituye una nueva ejecución del agente ni renueva aquellos resultados.

La medición de cobertura cuenta la unión de secciones, sin relecturas. En los
escenarios de importación publicados, la comparación acumulada es:

| Escenario | Seleccionado (KB decimales) | Archivos completos (KB) | Reducción de bytes |
| --- | ---: | ---: | ---: |
| simple-first-import | 166,3 | 225,5 | 26,3 % |
| text-first-import | 186,1 | 225,5 | 17,5 % |
| delegated-multimode-import | 202,8 | 225,5 | 10,1 % |

La selección por fase permite posponer detalle hasta que hace falta. No garantiza
que el runtime descarte contexto anterior ni reduce por sí sola el acumulado a
una sola fase. Estos porcentajes describen bytes de esos escenarios, no ahorro
de tokens, coste real ni resultados típicos de un modelo.
