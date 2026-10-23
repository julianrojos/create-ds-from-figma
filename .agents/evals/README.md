# Índice de evaluaciones del kit

## Ubicación por alcance

- Catálogo completo, routing y coste de lectura: `.agents/evals/results/`.
- Experimentos de una skill: carpeta evals/results de esa skill. La [calibración histórica](../skills/create-ds-from-figma/evals/results/README.md) conserva sus rutas y hashes originales.
- Regresiones automáticas: test-results, ignorado por Git; no son evaluaciones del agente.

No se mueven informes históricos solo para uniformar carpetas. Al añadir un
resultado, registra alcance, entradas, versiones disponibles y límites; conserva
los bytes anteriores. Los resultados cuyos nombres/descripciones o casos hayan cambiado quedan
caducados, sin editar sus hashes para hacerlos pasar.

Los índices de comportamiento nuevos usan `scorerSha256AtArchival` y
`recorderSha256AtArchival`. El campo histórico `scorerSha256` también describe
la huella al archivar; no tiene que coincidir con el código actual. Véanse el
[contrato de índices y sus límites de procedencia](behavior/contract.md#hashes-de-los-índices-archivados).

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
La consolidación posterior de Recursos Y Casos se documenta en el
[mapa de revisión semántica](reference-consolidation.json); las cláusulas únicas
se conservaron en el procedimiento o en preanálisis. El check de cobertura no
prueba equivalencia semántica.

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
escenarios históricos de cobertura del 22 de octubre, la comparación acumulada era:

| Escenario | Seleccionado (KB decimales) | Archivos completos (KB) | Reducción de bytes |
| --- | ---: | ---: | ---: |
| simple-first-import | 166,3 | 225,5 | 26,3 % |
| text-first-import | 186,1 | 225,5 | 17,5 % |
| delegated-multimode-import | 202,8 | 225,5 | 10,1 % |

La selección por fase permite posponer detalle hasta que hace falta. No garantiza
que el runtime descarte contexto anterior ni reduce por sí sola el acumulado a
una sola fase. Estos porcentajes describen bytes de esos escenarios, no ahorro
de tokens, coste real ni resultados típicos de un modelo.

## Consolidación y lecturas por momento

La [medición posterior](results/guidance-plan-2026-10-23.json) compara las mismas
condiciones ilustrativas antes y después de esta consolidación; incluye la nueva
lectura de resultados después del diagnóstico. simple-first-import pasa de
166,3 a 152,2 KB; text-first-import de 186,1 a 172,0 KB y
delegated-multimode-import de 202,8 a 187,6 KB. Son uniones de documentación,
no consumo efectivo ni escenarios típicos. La entrada bloqueada crece de 17,8
a 18,1 KB para conservar una cláusula única; no se ha eliminado para mejorar cifras.

La preparación del diagnóstico pasa de 39,3 a 18,5 KB; después se leen al menos
5,9 KB de interpretación y el detalle de composición cuando la salida lo exige.
API pasa de 25,1 a 23,2 KB al posponer confirmación hasta el cierre; código
conserva sus 26,9 KB base porque no se identificó una condición previa segura
para excluir más contratos. No se atribuye ahorro a esa fase.

El [mapa del README](readme-migration.json) conserva los 123 bloques originales,
hashes, líneas y destinos revisados. La guía humana pasa de 66,1 a unos 7 KB;
el beneficio buscado es un único dueño de contratos. Las pruebas de migración
verifican integridad y destinos, no conservación automática del significado.

## Comportamiento histórico

La [primera ejecución real](results/behavior-2026-10-23/index.json) incluye cuatro
casos con dos repeticiones independientes: 2 PASS, 0 FAIL y 6 NOT VERIFIED.
Cada carpeta conserva la traza original, el resultado al cierre, la repuntuación
y los archivos originales del proyecto como datos; las instrucciones selladas
se conservan una vez en instruction-snapshot.json. Modelo y versión unreported.

Ambos bloqueos de recurso esencial pasan. Las dos reutilizaciones contienen una
lectura incompleta del registrador previo a su corrección; uno de esos runs y
los otros cuatro incluyen órdenes opacas para el puntuador (consultas rg o
comandos del kit ejecutados desde el fixture). Sus efectos no se infieren del
nombre de la orden: quedan NOT VERIFIED. No se borraron errores ni se completaron
operaciones históricas para aprobarlas. El registrador actual conserva también
lecturas fallidas e intentos rechazados, con regresiones específicas.

Los dos casos candidatos ejecutaron Chromium y mantuvieron candidate sin
publicar; su diagnóstico geométrico fue negativo. Cumplir la obligación de
ejecutarlo no acredita fidelidad. No se detectaron infracciones de proceso
en las ocho trazas, pero seis no permiten aprobar todas las obligaciones.
Ese resultado motivó las consultas estructuradas y las nuevas ejecuciones
descritas abajo; las órdenes arbitrarias no se han autorizado como lectura. Procedencia y completitud
siguen declaradas, no autenticadas.

## Cierre con consultas estructuradas

La [nueva evaluación](results/behavior-structured-2026-10-23/index.json) conserva
ocho sesiones nuevas con contexto limpio, dos por cada caso: **8 PASS, 0 FAIL,
0 NOT VERIFIED**. Usaron consultas files/guidance/static, y ambos casos candidatos
ejecutaron Chromium después de conservar el intento inicial bloqueado por EPERM.
No recibieron etiquetas esperadas, puntuador ni resultados anteriores. Se guardan
entradas, instrucciones selladas como datos JSON, resultados originales, trazas
y repuntuaciones. Modelo y versión siguen unreported. El histórico anterior y
sus seis NOT VERIFIED permanecen intactos; al cambiar instrucciones su hash es
histórico, no se renueva editando los informes.

PASS significa únicamente que las obligaciones de proceso de estos cuatro casos
están satisfechas en las trazas declaradas. El diagnóstico geométrico sintético
fue negativo y no se confirmó ni publicó. No acredita fidelidad, revisión visual,
autenticidad, discovery real ni fiabilidad general entre modelos. Los controles
negativos siguen fallando y una traza sin eventos/capacidades declaradas no pasa.

La [auditoría de los 40 apartados de API/código](phase-reading-audit-2026-10-23.json)
registra decisiones y destinos por sección. El texto del contrato de metadata
se conserva; se añadieron límites de sección y condiciones basadas en capturas.
El [contraste posterior](results/guidance-followup-2026-10-23.json) mide:

| Fase base | Antes (KB) | Después (KB) | Motivo |
| --- | ---: | ---: | --- |
| import-api | 23,2 | 16,1 | Integridad del snapshot se lee antes, en captura; vigencia se consulta al cierre |
| import-code | 26,9 | 18,6 | Detalle tipográfico/remoto condicionado por hechos capturados; informe estático en diagnóstico |
| import-capture | 14,1 | 19,9 | Incorpora la integridad necesaria antes de consumir el snapshot |
| import-diagnose | 18,5 | 20,5 | Incorpora la interpretación del informe estático de bindings |

No todo lo desplazado se elimina del contexto acumulado. En la unión ilustrativa
simple-first-import baja de 152,2 a 145,9 KB; con texto/recursos pasa de 172,0 a
171,8 KB y con delegación/modos de 187,6 a 187,3 KB. text/resources reactivan
detalle necesario: el efecto principal es leerlo en su momento, no un gran ahorro
acumulado general. Ninguna cifra representa una importación típica ni tokens
medidos del modelo. Los ejemplos no eximen de resolver condiciones desconocidas.

## Lanzador restringido y repuntuación histórica

El registrador actual rechaza cualquier exec distinto del diagnóstico exacto
antes de crear un proceso hijo y conserva el intento como REJECTED. Consultas
files/guidance/static siguen disponibles. El diagnóstico ejecuta código; esta
lista de admisión no es un sandbox ni autentica la completitud de las trazas.
Los ocho resultados archivados documentan la versión usada entonces, anterior
a esta restricción: no se han cambiado sus hashes ni presentado como una nueva
ejecución con el lanzador actual. Las regresiones técnicas comprueban rechazo
sin efectos externos y diagnóstico real con Chromium; no son evaluaciones nuevas
del agente.

Para comparar una traza contra sus entradas selladas usa --results TRACE
--snapshot INSTRUCTIONS --case CASE, según el [contrato](behavior/contract.md).
La salida histórica usa el puntuador actual y declara coincidencia con las
entradas actuales por separado. No elimina la caducidad del modo normal, no
renueva resultados y no modifica archivos históricos.

## Integridad ante concurrencia

El registrador serializa todas las operaciones y el cierre, con cola dentro del
proceso y lock entre procesos, y reemplaza los JSON atómicamente. Las regresiones
técnicas cubren consulta pendiente con edición y reversión (FAIL), cierre sin
reapertura, recuperación tras errores, timeout con registro incompleto y cuatro
procesos concurrentes sin pérdida de eventos. Son pruebas del arnés, no nuevas
evaluaciones del agente; los archivos históricos permanecen intactos.
