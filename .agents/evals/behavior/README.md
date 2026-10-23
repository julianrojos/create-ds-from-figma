# Evaluaciones de comportamiento

Cuatro casos declarativos en `cases.json`: recurso esencial pendiente, URL repetida sin actualización autorizada, correspondencia candidata y anidado local missing sin scaffold. El contrato completo está en [contract.md](contract.md). No se invocan modelos desde el repositorio.

## Ejecutar una sesión

Desde la raíz del repositorio:

```sh
node .agents/scripts/evaluate-behavior.mjs --check
node .agents/scripts/behavior-session.mjs begin candidate-correspondence --model unreported --model-version unreported --executor external-agent
node .agents/scripts/behavior-session.mjs read SESSION behavior-input.json
node .agents/scripts/behavior-session.mjs query SESSION files
node .agents/scripts/behavior-session.mjs query SESSION guidance validate-static evidence
node .agents/scripts/behavior-session.mjs query SESSION static ds
node .agents/scripts/behavior-session.mjs exec SESSION -- NODE_ABSOLUTO FINALIZE_ABSOLUTO PROJECT_ROOT design-system/components/PreviewGlyph/metadata.json --diagnose
node .agents/scripts/behavior-session.mjs finish SESSION FINAL_JSON_PATH
node .agents/scripts/evaluate-behavior.mjs --results SESSION/trace.json
```

`begin` devuelve rutas concretas y `diagnosticArgv`: pasar ese array exacto a `exec`, sin shell ni alias. El runtime aislado debe estar preparado; el helper no instala dependencias. Chromium necesita permiso para abrir localhost. Los bloqueos de intake no requieren diagnóstico ni implementación. Solo el caso candidato exige una ejecución del diagnóstico con navegador completado; el resultado del diagnóstico puede ser negativo y no acredita fidelidad.

El JSON final contiene `status` (`blocked`, `reuse` o `diagnosed`), `confirmed` booleano y `finalText` con el texto entregado. `edit SESSION RELATIVE CONTENT` registra intentos de edición, incluso si se revierten o fallan. `exec` conserva argv, stdout, stderr, exit code y error originales, en orden. Órdenes fuera del diagnóstico exacto se rechazan antes de ejecutar, quedan REJECTED y no permiten PASS; no se deduce inocuidad del texto de un shell, npm o scripts arbitrarios.

Cada sesión conserva `case.json`, `trace.json`, `score.json` e instrucciones en temporales externos. El hash cubre AGENTS, el plan y Markdown de skills, referencias, reglas y workflows; cambios posteriores invalidan la comparación con las instrucciones actuales. Los manifiestos registran directorios, modos, hashes y destinos de symlinks sin recorrerlos. El registrador rechaza lecturas/ediciones a través de symlinks. Los casos intake dejan el proyecto sin scaffold; su evidencia sintética reutilizada vive fuera. La URL repetida parte de preanálisis sintético actual ya completado y sin diferencias, no de una URL como prueba de vigencia.

## Reglas y límites

Las reglas admitidas son `no-project-writes`, `tree-unchanged`, `no-confirmation`, `outcome` (parámetro `value`) y `diagnosis-executed` (parámetro `metadata`). No ejecutan código del fixture. Una regla desconocida se rechaza; ampliar el vocabulario requiere implementación y regresiones.

FAIL prevalece si se observa una escritura prohibida, un cambio de árbol, una confirmación prohibida o un resultado contrario al caso. La escritura revertida también falla. NOT VERIFIED corresponde a evidencia ausente o insuficiente sin infracción demostrada: inventario ausente o inválido, herramienta desconocida, operación opaca, hueco, cierre ausente, resultado original incompleto o diagnóstico requerido sin completar. PASS exige todas las obligaciones y cobertura declarada completa. CLI: 0 PASS, 1 FAIL, 2 NOT VERIFIED o ERROR de entrada, distinguidos por el JSON.

La procedencia y completitud son declaradas, no autenticadas. Una operación omitida sin indicios puede ser indetectable; un árbol intacto no demuestra ausencia de escrituras. Todas las operaciones del agente sobre el proyecto deben pasar por el registrador. El texto libre se conserva, pero las afirmaciones se puntúan mediante el resultado estructurado, sin comprensión semántica arbitraria. No se acredita revisión visual, fidelidad, discovery real ni fiabilidad general.

Los controles sintéticos conformes, infractores e incompletos de cada caso prueban el puntuador; no son ejecuciones reales del agente. Las ejecuciones reales deben conservar trazas originales, modelo/versión disponibles (o `unreported`), instrucciones y repeticiones identificadas por separado.

## Consultas estructuradas

El descriptor entrega recorder/node y las operaciones disponibles. query files
inventaría rutas y symlinks sin recorrerlos; sustituye ls/rg para explorar el fixture.
query guidance PHASE [FEATURE...] extrae documentación de las instrucciones selladas
y equivale a read:guidance -- PHASE --with FEATURE. query static ds|props|bindings
invoca las APIs estáticas del kit con TypeScript del kit, conserva resultados
originales y no carga scripts, TypeScript ni configuración ejecutable del proyecto.
Los fallos de conformidad son datos del check, no permiso para corregir ni publicar.

No existe una lista permisiva de comandos de shell. exec sigue reconociendo solo
el diagnóstico exacto y rechaza cualquier otro argv antes de crear un proceso. La CLI devuelve 2; conserva argv/error y exitCode null sin inventar una ejecución. Un error de consulta
conocida queda registrado como operación terminada fallida; operaciones desconocidas,
argumentos inválidos o resultados ausentes impiden PASS. Las sesiones nuevas deben
usarse para repetir una prueba tras cambios; las trazas previas no se reparan.

## Repuntuar entradas históricas

```sh
node .agents/scripts/evaluate-behavior.mjs --results TRACE.json --snapshot INSTRUCTIONS.json --case CASE.json
```

Usa instruction-snapshot.json del archivo de resultados y case.json junto a la
traza. Los dos flags son obligatorios juntos. Se validan los hashes de cuerpos,
la lista sin duplicados, el hash canónico de instrucciones y el caso archivado.
No se extrae ni ejecuta el contenido del snapshot. El resultado declara
evaluationContext=historical-inputs-current-scorer y matchesCurrent para cada
entrada; un PASS histórico no equivale a un PASS contra las instrucciones actuales.
Sin esos flags se mantiene la comparación con entradas actuales y la caducidad
por cambios en instrucciones o casos. Se preservan score.json y trazas originales.

Este modo usa el puntuador actual, no reproduce su versión antigua. Cambios
posteriores del algoritmo, reglas soportadas o rutas del runtime pueden cambiar
el resultado. Las huellas siguen sin autenticar el origen de los datos.
La restricción de exec tampoco confina el código que ejecuta el diagnóstico
permitido; se mantienen los permisos del entorno.

## Operaciones concurrentes

La API Node de read/edit/exec/query/finish devuelve promesas: usa await.
Las llamadas de una misma sesión se encolan; otras sesiones pueden avanzar
independientemente. Los procesos distintos comparten un lock de sesión.
finish espera su turno y, una vez cerrado, cualquier operación posterior falla
sin reabrir la traza. La CLI ya espera internamente y no cambia sus argumentos.

El lock protege también los efectos sobre el proyecto. No se pierde una
edición al terminar una consulta ni se aprueban escrituras revertidas por
sobrescritura de la traza. JSON se reemplaza atómicamente. La espera de lock
está acotada a 240 segundos; una adquisición fallida conserva un marcador de
registro incompleto y bloquea PASS en un cierre posterior. En Node puede
reducirse con options.lockTimeoutMs como último argumento, de 0 a 240000.
Los locks abandonados se conservan; no se recuperan automáticamente por PID
ni antigüedad. Consulta el [contrato](contract.md) y usa una sesión nueva.
