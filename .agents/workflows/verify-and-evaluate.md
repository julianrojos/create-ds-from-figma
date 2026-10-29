# Cierre automatizado y evaluaciones de routing

## Cierre por perfil explícito

Ejecuta desde la raíz del kit; ROOT es el proyecto que se va a comprobar y
METADATA una ruta relativa a él. No se deduce alcance por Git. Enumera cada
componente importado modificado; la lista no demuestra por sí sola completitud.

```sh
npm run verify:all -- kit
npm run verify:all -- import --root ROOT --metadata METADATA
npm run verify:all -- screen --root ROOT
npm run verify:all -- screen --root ROOT --metadata METADATA
npm run verify:all -- import --root ROOT --metadata METADATA --dry-run
```

`--metadata` se puede repetir. `--dry-run` muestra plan y efectos sin ejecutar
checks, navegador ni código del proyecto. No instala dependencias ni soporta
publicación, `--collect` o `--reviews`. Cada proceso tiene un timeout; un timeout,
salida inválida o ejecución ausente no se convierte en PASS.

| Perfil | Checks | Efectos |
| --- | --- | --- |
| kit | Suite completa unitaria/Chromium, documentación estricta, estructura de fixtures de routing/comportamiento y comprobación de punteros y cobertura del plan de lectura | Código de tests, servidores, navegador, temporales y test-results |
| import | DS, props, bindings, diagnóstico por cada ficha y gate de importaciones actuales | Lectura del proyecto, navegador y servidores; diagnóstico ejecuta el componente y usa temporales |
| screen | DS, props, bindings; diagnóstico de componentes solo si se suministran fichas | Lectura; con fichas también navegador/servidores/código de componentes y temporales |

El wrapper no escribe código ni documentación del DS, pero ejecutar código del
proyecto puede tener efectos propios. Respeta permisos del entorno; un perfil no
autoriza instalar dependencias, usar red ni cargar configuración no revisada.
No se cargan automáticamente configuraciones Vite del proyecto.

La salida declara `automationStatus`, scope y cada check. Exit 0 significa que
pasaron los checks automáticos solicitados, o se imprimió el plan; no confirma
entrega visual. Exit 1 indica fallo/ejecución automática pendiente y exit 2 error
de argumentos/runner. El diagnóstico limpio devuelve exit 1 en su propia CLI;
el wrapper lo acepta solo con NOT VERIFIED, complete=false y ejecución COMPLETED,
sin errores ni checks FAIL/NOT RUN. Lo registra como DIAGNOSTIC, nunca confirmado.
Los FAIL de bindings se conservan aunque su CLI sea informativa; NOT_RUN queda
señalado para revisión calculada/manual, sin convertirlo en comprobación hecha.

En perfiles UI, `deliveryStatus` sigue NOT VERIFIED BY THIS COMMAND. Completa
composición/reutilización, accesibilidad/teclado/foco y comparación independiente
con Figma y activación real de modos/estados según las skills. El perfil screen
no ejecuta ni compara la pantalla completa. El gate de importaciones consume las
confirmaciones persistidas; el wrapper no genera juicios ni cambia sus contratos.
Los logs de procesos van a stderr y el resultado JSON a stdout; npm añade sus
cabeceras. Para consumo JSON invoca directamente el script Node del wrapper.

## Evaluaciones de routing

Cada skill tiene un archivo routing.json en su carpeta evals: activación, exclusión, límite y pares de confusión. El catálogo
incluye las cuatro skills, el workflow build-from-figma y la opción none.

```sh
npm run eval:routing -- --check
npm run eval:routing -- --prompts
npm run eval:routing -- --results RESULTADOS.json
```

El primer modo valida solo estructura. El segundo produce prompts sin las
etiquetas esperadas ni acciones prohibidas. Un evaluador independiente debe
seleccionar la ruta principal, sin ejecutar las tareas. Conserva su salida real
en un archivo con schemaVersion=1, executor, model (unreported si no se conoce),
createdAt ISO, catalogHashVersion=2, catalogHash y suiteHash devueltos por prompts, y observations:
lista de id, primary, reason. Los resultados deben cubrir todos los IDs una vez.
No rellenes observaciones a partir de expectedPrimary. `--results` solo lee y
puntúa: no invoca modelos ni fabrica una ejecución. Rechaza resultados caducados
si cambian nombres/descripciones o los casos. catalogHash cubre exactamente el catálogo
visible (nombre y descripción); editar únicamente el cuerpo de una skill no invalida
una evaluación de selección, porque ese cuerpo no forma parte de su entrada.
Los resultados anteriores sin catalogHashVersion=2 conservan su protocolo histórico
y se rechazan al puntuarlos con el nuevo; no se migran editando hashes. Procedencia declarada no significa autenticada.

Una selección de ruta correcta no demuestra respeto de permisos ni cumplimiento
durante la ejecución. forbiddenActions sirve para diseñar futuras evaluaciones
de comportamiento; no se puntúa como conducta observada en esta prueba. Los
tests técnicos del scorer no son una evaluación real del agente. Los resultados
de un evaluador no generalizan a todos los modelos/editores ni calibran costes.

Los resultados de este protocolo siempre indican evidenceLevel=smoke-selection
y runtimeDiscovery=NOT RUN. modelRecorded señala si se conoce el modelo; no lo
deduzcas del nombre comercial de la app ni inventes una versión. La selección
con catálogo suministrado no evalúa discovery en el catálogo global del editor.
Consulta el [índice de resultados](../evals/README.md) para alcance e históricos.

## Lectura por secciones

La selección canónica está en `.agents/reading-plan.json`. Las skills indican
la fase y las condiciones observadas; no obligan a leer siete referencias enteras.
Ejemplo con fuentes, texto, modos y serialización numérica: añade text/resources
a import-code y modes/float a import-tokens según corresponda. Cada --with lleva
un único nombre y se puede repetir. Los flags no autorizan acciones ni permiten
omitir obligaciones cuya aplicabilidad sea desconocida.

```sh
npm run read:guidance -- import-intake
npm run read:guidance -- import-capture --with direct-mcp
npm run read:guidance -- import-code --with first --with text --with resources
npm run read:guidance -- --scenario simple-first-import --stats
npm run read:guidance -- --check
```

El lector solo emite secciones nombradas, deduplica solapamientos y no amplía a
un archivo completo si falta un título: falla y exige corregir el puntero.
--stats informa bytes y palabras, no tokens del modelo. El perfil kit comprueba
los punteros, incluidas ramas condicionales, e inventaría todos los Markdown de
references/ bajo las skills, incluso archivos nuevos. Cada encabezado y preámbulo
con contenido debe estar seleccionado. exclusions solo admite kind=navigation con
un motivo para encabezados sin contenido propio. Se rechazan exclusiones obsoletas,
sin motivo, con contenido o que solapan una selección. No se admite excluir contenido
como duplicate ni out-of-scope. Para eliminar duplicación, revisa y consolida los
contratos en su fuente canónica y actualiza sus consumidores: el check no compara
equivalencia semántica ni demuestra que una fase esté asignada en el momento correcto.
import-preview cubre vista/configuración manual; kit-performance solo consultas de rendimiento. La reducción depende del escenario;
un caso complejo puede necesitar más secciones. simple-first-import es un mínimo sin
texto ni recursos, no una estimación típica; text-first-import y
delegated-multimode-import añaden condiciones explícitas y tampoco son promedios
medidos. imported-validation incluye evidencia/recursos y revisión de modos.
El denominador suma archivos con al menos una sección seleccionada, no referencias
exclusivamente condicionales desactivadas. Las mediciones no incluyen contexto
compartido, herramientas ni relecturas del agente. No se modifican los contratos
de metadata, captura, relaciones o confirmación al añadir títulos de navegación.

## Contrato estructurado de bindings

`node .agents/checks/verify-bindings.mjs ROOT --json` emite schemaVersion 1,
results y counts derivados (PASS/FAIL/NOT_RUN/ADVISORY). El cierre usa ese JSON,
recalcula contadores y rechaza versiones, registros o recuentos incoherentes;
no extrae REPORT de la consola humana. La salida humana conserva su política
informativa de exit code. Un fallo de ejecución JSON devuelve error y exit 1.

## Preparación e interpretación del diagnóstico

Lee import-diagnose antes de ejecutar el componente: efectos, permisos, preflight,
casos y bloqueos. Después de recibir la salida original, usa:

```sh
npm run read:guidance -- --diagnosis RESULTADO.json
```

Selecciona import-diagnose-results y activa composition a partir de contadores,
resultados o acciones presentes en esa salida, antes de corregir, reintentar o
informar conclusiones. También puede leerse la fase con --with composition cuando
esos hechos ya se conocen. --diagnose evalúa composición automáticamente; el flag
de lectura no activa ni desactiva el motor. Sin salida válida no se presumen
contratos inaplicables. Adaptador externo/calibración se consultan explícitamente
en import-browser-adapter; SVG y píxeles en tooling-vectors/tooling-pixels.

## Evaluaciones de comportamiento

El [contrato de comportamiento](../evals/behavior/contract.md) define los casos de `cases.json` (recuento vigente: `npm run eval:behavior -- --check`),
obligaciones/prohibiciones declarativas y trazas con herramientas, operaciones,
salidas originales y árbol antes/después. El repo prepara fixtures y puntúa runs;
no invoca modelos. La preparación escribe exclusivamente en directorios temporales.

```sh
npm run eval:behavior -- --check
npm run eval:behavior -- --results TRACE.json
node .agents/scripts/behavior-session.mjs begin essential-resource
```

Los comandos read/exec/finish del registrador se describen en el contrato. No
edites el proyecto evaluado fuera del registrador. Una operación de escritura
prohibida falla incluso si se revierte; evidencia incompleta sin infracción
demostrada queda NOT VERIFIED. FAIL tiene prioridad sobre completitud insuficiente.
Las trazas no autentican procedencia, herramientas omitidas ni revisión visual.
Los controles sintéticos son tests del puntuador; no se presentan como conducta
observada del agente. kit comprueba su estructura junto con los fixtures de routing.

En evaluaciones de comportamiento, query files/guidance/static del registrador
cubre exploración, lectura por fases y las APIs de checks del kit sin npm ni
scripts del proyecto. Usa esas operaciones explícitas para consultar el fixture;
un comando opaco sigue sin establecer efectos ni permitir PASS. El detalle y
las formas de invocación están en el contrato de comportamiento enlazado arriba.

En import-code, text incluye TEXT ocultos y descendientes de instancias;
resources incluye IMAGE ocultos y external-bindings depende de variables remotas
capturadas. Resuelve esos hechos antes de omitir detalle. Integridad del snapshot
se lee en import-capture; el informe estático de bindings en import-diagnose.
