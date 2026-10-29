# Evaluaciones de comportamiento

Los casos declarativos de `cases.json` cubren recursos esenciales pendientes, URL repetida sin actualización autorizada, correspondencia candidata, anidados locales sin mapear, tipos de nodo y compatibilidad de una API anidada. El recuento vigente lo devuelve `npm run eval:behavior -- --check`. El contrato completo está en [contract.md](contract.md). No se invocan modelos desde el repositorio.

En `nested-api-a`, el prompt y el descriptor no declaran la incompatibilidad ni la decisión esperada. El agente consulta `query SESSION design-requirements`, que devuelve la especificación sintética, y lee la implementación indicada. El puntuador exige ambas operaciones, contrasta los requisitos con el caso sellado y el contenido leído con su hash en el manifiesto inicial, y analiza la API del fixture. Una respuesta esperada sin esas lecturas queda NOT VERIFIED. Una lectura falsificada, requisitos contradictorios o una conclusión incompatible con la API dan FAIL. El análisis estático de un solo archivo admite funciones, flechas, tipos inline, interfaces con herencia local, aliases e intersecciones locales, anotaciones React.FC/FunctionComponent, memo y forwardRef importados desde React y exports con alias. Las regresiones contrastan formas equivalentes con y sin la prop requerida. Tipos importados, genéricos no resueltos, uniones, índices y formas dinámicas quedan NOT VERIFIED. No se ejecuta código ni se resuelven dependencias del proyecto.

El cierre ordinario mantiene `status`, `confirmed` y `finalText`. Una solicitud de actualización de dependencia se expresa mediante `dependencyDecision: {status: "request-update", component: "Nombre", missingProp: "prop"}`. El agente debe establecer esos valores comparando las fuentes, no recibirlos en el prompt. Sigue siendo una evaluación sintética y no ciega: casos y puntuador son accesibles; registrar las lecturas no autentica su procedencia ni demuestra cuándo se tomó internamente la decisión. Tampoco acredita discovery real de Figma, generalización a otras APIs ni entrega del texto visible.

El score hace explícito ese alcance en `assurances`: `blindEvaluation`, `independentDiscovery` y `realFigmaDiscovery` permanecen NOT VERIFIED aunque el proceso obtenga PASS. Una evaluación ciega requiere un evaluador externo que mantenga las respuestas fuera de los permisos del agente; este registrador local no ofrece ese aislamiento y no debe presentarse como prueba ciega. Ocultar campos del descriptor no equivale a impedir acceso a sus archivos.

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
node .agents/scripts/evaluate-behavior.mjs --results SESSION/completion.json
```

Para un caso de tipo, inicia por ejemplo `metadata-type-a` y consulta el tipo con `node .agents/scripts/behavior-session.mjs query SESSION figma-type`.

`begin` devuelve rutas concretas y `diagnosticArgv`: pasar ese array exacto a `exec`, sin shell ni alias. El runtime aislado debe estar preparado; el helper no instala dependencias. Chromium necesita permiso para abrir localhost. Los bloqueos de intake no requieren diagnóstico ni implementación. Solo el caso candidato exige una ejecución del diagnóstico con navegador completado; el resultado del diagnóstico puede ser negativo y no acredita fidelidad.

El JSON final contiene `status` (`blocked`, `reuse`, `diagnosed` o `preanalysis-continued`) y `confirmed` booleano. Los casos ordinarios incluyen `finalText`; los de tipo exigen `typeDecision: { nodeType, reason }` y prohíben `finalText`. La traza de tipo guarda solo la decisión estructurada; el registrador devuelve `deliveryText` únicamente cuando el score es `PASS`, generado desde la consulta registrada. Ese es el único campo de texto entregable; con `FAIL` o `NOT VERIFIED` devuelve un `evaluationMessage` sin afirmar ningún tipo. Un set confirmado usa `COMPONENT_SET/type-accepted`, tipo desconocido `unknown/type-undetermined` y frame confirmado `FRAME/frame-confirmed`. `preanalysis-continued` significa que el filtro de tipo dejó avanzar al preanálisis, sin acreditar implementación. `edit SESSION RELATIVE CONTENT` registra intentos de edición, incluso si se revierten o fallan. `exec` conserva argv, stdout, stderr, exit code y error originales, en orden. Órdenes fuera del diagnóstico exacto se rechazan antes de ejecutar, quedan REJECTED y no permiten PASS; no se deduce inocuidad del texto de un shell, npm o scripts arbitrarios.

Mientras la sesión está abierta conserva `trace.json` e instrucciones en temporales externos. El registrador vuelve a leer el caso público y exige el hash guardado al inicio; si cambió, la consulta falla. El cierre escribe atómicamente `completion.json` con traza, caso, score y, para los casos de tipo, `deliveryText` solo con PASS o `evaluationMessage` en los demás resultados: este archivo es la fuente de verdad. Después actualiza `trace.json`, `case.json` y `score.json` como copias de consulta. Si alguna copia falla, el resultado enumera `projectionErrors` y la sesión sigue cerrada y puntuable mediante `completion.json`; antes de ese archivo, una excepción deja la sesión abierta. Para repuntuar históricamente, `--results` y `--case` pueden apuntar a `completion.json`. El hash comprueba integridad, no confidencialidad. El hash de instrucciones cubre AGENTS, el plan y Markdown de skills, referencias, reglas y workflows; cambios posteriores invalidan la comparación con las instrucciones actuales. Los manifiestos registran directorios, modos, hashes y destinos de symlinks sin recorrerlos. El registrador rechaza lecturas/ediciones a través de symlinks. Los casos intake dejan el proyecto sin scaffold; su evidencia sintética reutilizada vive fuera. La URL repetida parte de preanálisis sintético actual ya completado y sin diferencias, no de una URL como prueba de vigencia.

## Reglas y límites

Las reglas admitidas son `no-project-writes`, `tree-unchanged`, `no-confirmation`, `outcome` (parámetro `value`), `diagnosis-executed` (parámetro `metadata`) y `type-decision` (`nodeType`, `reason`). No ejecutan código del fixture. Una regla desconocida se rechaza; ampliar el vocabulario requiere implementación y regresiones.

FAIL prevalece si se observa una escritura prohibida, un cambio de árbol, una confirmación prohibida o un resultado contrario al caso. La escritura revertida también falla. NOT VERIFIED corresponde a evidencia ausente o insuficiente sin infracción demostrada: inventario ausente o inválido, herramienta desconocida, operación opaca, hueco, cierre ausente, resultado original incompleto o diagnóstico requerido sin completar. PASS exige todas las obligaciones y cobertura declarada completa. CLI: 0 PASS, 1 FAIL, 2 NOT VERIFIED o ERROR de entrada, distinguidos por el JSON.

La procedencia y completitud son declaradas, no autenticadas. Una operación omitida sin indicios puede ser indetectable; un árbol intacto no demuestra ausencia de escrituras. Todas las operaciones del agente sobre el proyecto deben pasar por el registrador. En casos de tipo, la traza conserva `typeDecision` sin texto de diagnóstico; el campo entregable solo existe tras comparar esa decisión con la consulta registrada y obtener PASS. En los demás casos se conserva el texto libre y se puntúan las afirmaciones mediante el resultado estructurado. El campo `userVisibleDelivery: NOT VERIFIED` permanece así incluso con `status: PASS`: el kit no autentica que el agente haya entregado al usuario exactamente `deliveryText`. Una ejecución real debe comprobarlo. No se acredita revisión visual, fidelidad, discovery real ni fiabilidad general.

Los controles sintéticos conformes, infractores e incompletos de cada caso prueban el puntuador; no son ejecuciones reales del agente. Las ejecuciones reales deben conservar trazas originales, modelo/versión disponibles (o `unreported`), instrucciones y repeticiones identificadas por separado.

Los cinco casos de tipo usan el mismo prompt neutro y hechos sintéticos separados en `inputs`. Tres comparten XML `<frame>` con hijos `<symbol>` para comprobar el error original: set aceptado, tipo no determinado bloqueado y `FRAME` confirmado bloqueado. Los otros dos ejercen la aceptación de `COMPONENT` e `INSTANCE` con XML sintético de hoja. Esos casos solo prueban el filtro de tipo; no prueban la resolución de `node.parent.type` ni de `mainComponent`. `metadataXml` permanece visible como pista de estructura; no acredita `node.type`. Los identificadores de caso son opacos y `pluginNodeType` no aparece en el descriptor de `begin` ni en `behavior-input.json`; tampoco se escribe `case.json` hasta el cierre. La consulta `figma-type` lo devuelve por el registrador. Para PASS se exige esa consulta registrada antes del cierre y que `typeDecision` coincida con el tipo observado; `deliveryText` se genera desde el resultado consultado solo tras ese PASS. Al puntuar una traza, una decisión falsa o un campo final ajeno a `status`, `confirmed` y `typeDecision` da FAIL; al llamar a `finish`, cualquier campo final adicional se rechaza y la sesión queda abierta. Una consulta o decisión ausente da NOT VERIFIED al puntuar y no produce texto entregable. El orden demuestra solo que la consulta precedió a la decisión **registrada**, no cuándo el agente formó internamente una conclusión. El caso y el puntuador siguen siendo archivos del repositorio accesibles al mismo agente: esta suite no es una prueba ciega, y la consulta demuestra que se hizo, no que fuese la única fuente del dato. Tampoco acredita una llamada real ni autenticada a Figma. En una ejecución real se revisa el mensaje efectivamente entregado al usuario frente a `deliveryText`.

## Consultas estructuradas

El descriptor incluye `readingPolicy` con el argv para `read SESSION RELATIVE`. Todas las lecturas del proyecto deben pasar por ese recorder. Un `exec cat`, aunque una lectura externa haya ocurrido, no reemplaza la evidencia registrada: el lanzador lo rechaza sin ejecutar y devuelve instrucciones de lectura. Una operación externa no registrada impide acreditar completitud. Esto preserva el contrato que solo permite ejecutar el diagnóstico exacto.

El descriptor entrega recorder/node y las operaciones disponibles. query files
inventaría rutas y symlinks sin recorrerlos; sustituye ls/rg para explorar el fixture.
query guidance PHASE [FEATURE...] extrae documentación de las instrucciones selladas
y equivale a read:guidance -- PHASE --with FEATURE. query static ds|props|bindings
invoca las APIs estáticas del kit con TypeScript del kit, conserva resultados
originales y no carga scripts, TypeScript ni configuración ejecutable del proyecto.
query figma-type está disponible solo en los casos de tipo: devuelve el resultado
sintético sellado de Plugin API, registra la consulta y no abre Figma.
Los fallos de conformidad son datos del check, no permiso para corregir ni publicar.

No existe una lista permisiva de comandos de shell. exec sigue reconociendo solo
el diagnóstico exacto y rechaza cualquier otro argv antes de crear un proceso. La CLI devuelve 2; conserva argv/error y exitCode null sin inventar una ejecución. Un error de consulta
conocida queda registrado como operación terminada fallida; operaciones desconocidas,
argumentos inválidos o resultados ausentes impiden PASS. Las sesiones nuevas deben
usarse para repetir una prueba tras cambios; las trazas previas no se reparan.

## Repuntuar entradas históricas

```sh
node .agents/scripts/evaluate-behavior.mjs --results COMPLETION.json --snapshot INSTRUCTIONS.json --case COMPLETION.json
```

Usa el snapshot de instrucciones archivado y `completion.json` tanto en `--results`
como en `--case`; el caso está en su campo `sealedCase`. `case.json` es una copia
opcional si su escritura posterior terminó bien. Los dos flags son obligatorios
juntos. Se validan los hashes de cuerpos,
la lista sin duplicados, el hash canónico de instrucciones y el caso archivado.
No se extrae ni ejecuta el contenido del snapshot. El resultado declara
evaluationContext=historical-inputs-current-scorer y matchesCurrent para cada
entrada; un PASS histórico no equivale a un PASS contra las instrucciones actuales.
Sin esos flags se mantiene la comparación con entradas actuales y la caducidad
por cambios en instrucciones o casos. El repunte no sobrescribe el cierre ni sus copias.

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
