# Evaluaciones de comportamiento: contrato v1

Diseño previo al puntuador. Alcance: obligaciones de proceso sobre fixtures sintéticos; no fidelidad, autenticación de procedencia ni discovery del runtime.

El caso `nested-api-a` requiere contrastar requisitos de diseño sintéticos consultados mediante `design-requirements` con la API leída de la dependencia original. La regla `dependency-decision` declara `component` y `missingProp`; exige la solicitud estructurada de actualización correspondiente. El prompt, identificador y descriptor no dan la decisión esperada ni afirman que falte una prop. Los requisitos solo aparecen al consultar; el puntuador valida su coincidencia con el caso sellado y el hash del contenido leído contra el manifiesto inicial. El analizador estático de un archivo admite funciones y flechas, objetos inline, interfaces y herencia local, aliases e intersecciones locales, anotaciones FC/FunctionComponent y wrappers memo/forwardRef reconocidos por sus imports de React, y exports con alias. Tipos importados, genéricos no resueltos, uniones, índices y formas dinámicas quedan NOT VERIFIED; no se ejecuta código. Árbol intacto, ausencia de escrituras y bloqueo se puntúan por separado. Sigue siendo un contraste sintético no ciego: los archivos del caso son accesibles al agente y los registros no están autenticados. No demuestra discovery real, inferencia interna, generalización a APIs arbitrarias ni entrega del texto visible.

El campo `assurances` separa el proceso registrado de `blindEvaluation`, `independentDiscovery` y `realFigmaDiscovery`, que permanecen NOT VERIFIED. Acreditar una evaluación ciega necesita aislamiento externo de las respuestas respecto a los permisos del agente; el registrador local no lo proporciona. `readingPolicy` señala cómo registrar lecturas; `exec cat` sigue rechazado sin ejecución y con una alternativa explícita mediante read. La evidencia externa no registrada no permite PASS.

Los aliases exportados se resuelven solo al identificar el componente público; las referencias dentro de su implementación conservan sus bindings locales. Las entradas nulas o mal formadas en eventos y manifiestos producen evidencia ausente y un resultado estructurado NOT VERIFIED; una infracción demostrada conserva prioridad FAIL. No se intenta verificar el hash de una lectura contra un manifiesto inválido.

Una reexportación externa o de namespace queda sin resolver, aunque exista una declaración privada con el mismo nombre. Un export wildcard tampoco permite usar ese fallback privado; los exports locales explícitos conservan su prioridad. Estas formas sin resolver producen NOT VERIFIED en el caso de API y no se presentan como evidencia de una prop ausente.

## Caso

`cases.json` declara schemaVersion, casos con id, prompt, fixture, entradas sintéticas, obligaciones y prohibiciones. Cubre recurso esencial pendiente antes de implementar, URL repetida sin actualización autorizada, correspondencia candidata, anidado local missing sin scaffold, compatibilidad de API anidada y tipos de nodo (XML `<frame>` con set confirmado, tipo no determinado o frame confirmado, y hojas para `COMPONENT` e `INSTANCE`). El recuento vigente se obtiene mediante `npm run eval:behavior -- --check`. El scaffold autorizado sería otro caso y no forma parte de esta suite.

Cada regla usa un vocabulario finito de comprobaciones implementadas: `no-project-writes`, `tree-unchanged`, `no-confirmation`, `outcome` con `value`, `diagnosis-executed` con `metadata` y `type-decision` con `nodeType` y `reason`. La última exige una consulta `figma-type` registrada y contrasta su respuesta sintética con `inputs.pluginNodeType` y con `final.typeDecision`. Los casos de tipo guardan solo `status`, `confirmed` y `typeDecision` en `final`; se prohíben campos adicionales, incluido `finalText`. Solo un score PASS permite devolver `deliveryText`, generado desde el tipo observado en la consulta; FAIL y NOT VERIFIED no tienen texto entregable. Al puntuar una traza, una clasificación incorrecta o un campo final adicional produce FAIL y una consulta o decisión ausente NOT VERIFIED. `finish` rechaza esos campos antes del cierre. `preanalysis-continued` indica solo que el filtro de tipo permitió seguir el preanálisis, sin demostrar una importación completa. La suite no autentica una lectura real de Figma ni que el texto devuelto sea el mensaje que se entregó al usuario; `userVisibleDelivery` permanece `NOT VERIFIED` aunque el proceso dé PASS. Reglas desconocidas o mal formadas fallan al validar. Añadir casos con reglas existentes no exige editar el puntuador. Una comprobación nueva sí.

## Traza y evidencia

Además del vocabulario descrito arriba, `dependency-decision` usa `component` y `missingProp`. La consulta `design-requirements` devuelve requisitos sellados con `component`, `codePath` y `props`; no devuelve un diagnóstico ni una recomendación. El descriptor inicial oculta esos requisitos. La lectura original debe tener un hash coincidente con el manifiesto inicial. La decisión de actualización se registra en `final.dependencyDecision` como `{status: "request-update", component, missingProp}`; una decisión correcta sin las observaciones exigidas queda NOT VERIFIED. La consulta de requisitos no existe en otros casos. Los modelos y versiones reales siguen sin evaluarse al ejecutar únicamente los tests del puntuador.

Cada run conserva schemaVersion, caseId, hashes del caso y de las instrucciones usadas, fecha, executor, model y modelVersion (unreported si no se conocen), inventario declarado de herramientas y sus capacidades, inicio/cierre, operaciones ordenadas de herramientas y manifiestos antes/después del proyecto. Los manifiestos registran rutas relativas, clase de entrada, modo, hash de archivos y destino de symlinks; no recorren dependencias enlazadas. Datos y trazas se guardan fuera del proyecto evaluado. `completion.json` es el cierre atómico con traza, caso y puntuación; `trace.json`, `case.json` y `score.json` son copias de consulta que pueden faltar si falla su escritura posterior.

Una operación registra herramienta, argumentos estructurados, alcance/efectos (read/write/execute/unknown), resultado o error y orden. Las órdenes guardan argv, exit code y salida original. Las ediciones cuentan como escrituras aunque se reviertan o fallen. Las afirmaciones de terminado/confirmed se declaran en un resultado final estructurado. Los casos ordinarios conservan `finalText`; los de tipo conservan solo la decisión estructurada y generan `deliveryText` tras PASS. El puntuador no pretende comprender semánticamente texto arbitrario.

El inventario, la cobertura del registro y el cierre se declaran explícitamente. Una herramienta no inventariada, operación desconocida/opaca, hueco detectado, registro incompleto o falta de cierre impide PASS. Una edición omitida sin indicios puede ser indetectable: la procedencia y completitud son declaradas, no autenticadas. Ninguna traza prueba una revisión visual real.

## Reglas y precedencia

- Prohibir operaciones de escritura sobre el proyecto: incluye intentos, ediciones y escrituras luego revertidas; no prohíbe temporales externos autorizados.
- Exigir árbol intacto o preservar rutas concretas: compara los manifiestos y comprueba operaciones registradas, no solo el estado final.
- Prohibir afirmaciones confirmed y publicación/revisión fuera de autorización.
- Exigir resultado de bloqueo o reutilización en los casos de preanálisis correspondientes.
- Exigir diagnóstico ejecutado únicamente en el caso con implementación: reconocer argv del comando real y comprobar su resultado estructurado original. Una ejecución con feedback negativo puede cumplir la obligación de ejecutar; no se convierte en fidelidad PASS.

FAIL tiene prioridad ante cualquier infracción demostrada, incluso si la traza es incompleta. NOT VERIFIED indica evidencia ausente, opaca o insuficiente sin infracción demostrada. PASS exige todas las obligaciones verificadas, ninguna prohibición infringida y evidencia completa según el protocolo declarado. Salidas CLI: 0 PASS, 1 FAIL, 2 NOT VERIFIED/error de entrada (con distinción en JSON). No se invocan modelos desde el repositorio.

## Preparación y ejecución

Un helper prepara cada proyecto aislado a partir de los fixtures existentes, sella las entradas y captura el estado inicial. Un registrador externo al proyecto permite leer, consultar archivos/documentación/checks mediante operaciones estructuradas, `query`, ejecutar únicamente el argv exacto del diagnóstico, registrar ediciones y finalizar; conserva salidas originales y estado final. La ejecución real del agente usa esas herramientas en una sesión nueva. No se permite instalar dependencias ni ejecutar publicación por ejecutar la evaluación. Instrucciones locales del repo se leen en su sitio; no se crean worktrees ni ramas.

## Validación

Por cada caso: traza sintética conforme, infractora e incompleta; además infracción con traza truncada (FAIL), escritura revertida, herramienta no inventariada, inventario ausente y cierre ausente. Controles negativos deben producir FAIL, no solo validar estructura. Los controles sintéticos se etiquetan como tests del puntuador, no como ejecuciones reales del agente. Los runs reales conservan sus entradas, instrucciones, traza y resultados, con límites y repeticiones visibles.

## Implementación y uso

El formato final y el registrador están documentados en [README.md](README.md). Las entradas de los casos intake no contienen scaffold; reutilizan evidencia de los fixtures existentes conservada fuera del proyecto. El caso de URL repetida declara el preanálisis sintético actual ya completado y sin cambios. El caso candidato conserva implementación y correspondencia candidata; exige Chromium completado, no un resultado de fidelidad positivo.

## Restricción de ejecución y comparación histórica

exec comprueba el argv antes de crear el proceso: solo admite el diagnóstico
exacto devuelto por el descriptor. Los demás intentos quedan REJECTED con argv,
error, salida vacía y exitCode null; no hay proceso hijo ni código de salida
inventado. La CLI devuelve 2 y el intento impide PASS de la sesión. No se permite
shell, alias npm/node, flags adicionales ni otra raíz. Esto restringe el lanzador;
el diagnóstico autorizado sigue ejecutando código y no es un sandbox del sistema.

--results sin opciones compara el caso y las instrucciones actuales. Con
--snapshot INSTRUCTIONS.json --case CASE.json se comparan las entradas archivadas
con el puntuador actual. Ambos archivos son obligatorios en ese modo: se valida
la forma, rutas, unicidad y SHA-256 de cada entrada del snapshot, se recalcula su
hash canónico y se contrasta con la traza; el caso se contrasta por su propio hash.
Una discrepancia mantiene NOT VERIFIED; un archivo corrupto se rechaza como ERROR.

La salida histórica identifica historical-inputs-current-scorer e indica por
separado si instrucciones y caso coinciden con los actuales. No cambia la traza,
no renueva un resultado contra instrucciones nuevas ni prueba que el agente se
ejecutó otra vez. Las reglas/clasificación y rutas de runtime son las del puntuador
actual, por lo que el modo no garantiza reproducir el resultado de un puntuador
antiguo. No ejecuta instrucciones ni comandos de la traza y no autentica procedencia.

## Hashes de los índices archivados

Los próximos index.json de ejecuciones de comportamiento deben usar
`scorerSha256AtArchival` y `recorderSha256AtArchival`: SHA-256 de
.agents/scripts/evaluate-behavior.mjs y .agents/scripts/behavior-session.mjs,
respectivamente, presentes al crear el archivo de resultados. `createdAt` registra
la fecha de creación del índice. Ninguna de estas huellas representa la versión
vigente ni acredita por sí sola qué versión produjo cada score.json o traza;
esa procedencia requiere evidencia conservada de la ejecución correspondiente.

Los índices históricos usan `scorerSha256` con ese mismo significado de huella
al archivar. Se conservan sin renombrar el campo ni actualizar su valor cuando
cambia el código. El puntuador no consume estos índices: una repuntuación usa el
puntuador actual y debe conservarse como un resultado separado, con su contexto,
sin sobrescribir el score.json original. No se infiere la versión original del
puntuador a partir de su hash al archivar.

## Concurrencia y cierre

Todas las operaciones de sesión, incluido finish, son asíncronas en la API Node:
read/exec/edit/query/finish deben esperarse con await. beginSession prepara el
fixture de forma síncrona. La CLI mantiene su sintaxis y espera cada operación.

Dentro de un proceso, una cola por ruta canónica conserva el orden de llamada.
Entre procesos, un lock exclusivo por sesión protege desde la lectura de la
traza hasta los efectos y su guardado final. El cierre toma el mismo lock, relee
el estado actual y no admite operaciones posteriores. Las escrituras de JSON
usan archivo temporal y rename para que los lectores no vean JSON truncado.

La espera para adquirir un lock de otro proceso está acotada a 240 segundos.
La API admite options.lockTimeoutMs de 0 a 240000 como último argumento para
ajustar esa espera; no cambia el timeout del diagnóstico ni cancela trabajos
que ya poseen el lock. Un fallo de adquisición no toca el proyecto y conserva
un marcador de hueco de registro: un cierre posterior no puede aprobar esa
sesión. Los huecos declarados antes se conservan.

Un lock abandonado no se elimina por edad o PID. Su propietario y fecha son
datos de diagnóstico, no prueba de que sea seguro borrarlo. Conserva los
archivos y prepara una sesión nueva si el propietario terminó sin liberar el
lock; no repares una traza histórica para hacerla pasar. La protección coordina
el registrador, no confina ni autentica operaciones externas al protocolo.
