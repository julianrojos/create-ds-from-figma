# Evaluaciones de comportamiento: contrato v1

Diseño previo al puntuador. Alcance: obligaciones de proceso sobre fixtures sintéticos; no fidelidad, autenticación de procedencia ni discovery del runtime.

## Caso

`cases.json` declara schemaVersion, casos con id, prompt, fixture, entradas y hechos de preanálisis sintéticos, obligaciones y prohibiciones. No incluye respuestas modelo. Cuatro casos iniciales: recurso esencial pendiente antes de implementar, URL repetida sin actualización autorizada, correspondencia candidata en implementación existente, anidado local missing sin scaffold. El scaffold autorizado sería otro caso y no forma parte de esta suite.

Cada regla usa un vocabulario finito de comprobaciones implementadas: `no-project-writes`, `tree-unchanged`, `no-confirmation`, `outcome` con `value`, y `diagnosis-executed` con `metadata`. No se ejecuta código ni expresiones del fixture. Reglas desconocidas o mal formadas fallan al validar. Añadir casos con reglas existentes no exige editar el puntuador. Una comprobación nueva sí.

## Traza y evidencia

Cada run conserva schemaVersion, caseId, hashes del caso y de las instrucciones usadas, fecha, executor, model y modelVersion (unreported si no se conocen), inventario declarado de herramientas y sus capacidades, inicio/cierre, operaciones ordenadas de herramientas y manifiestos antes/después del proyecto. Los manifiestos registran rutas relativas, clase de entrada, modo, hash de archivos y destino de symlinks; no recorren dependencias enlazadas. Datos y trazas se guardan fuera del proyecto evaluado.

Una operación registra herramienta, argumentos estructurados, alcance/efectos (read/write/execute/unknown), resultado o error y orden. Las órdenes guardan argv, exit code y salida original. Las ediciones cuentan como escrituras aunque se reviertan o fallen. Las afirmaciones de terminado/confirmed se declaran en un resultado final estructurado además de conservar el texto final; el puntuador no pretende comprender semánticamente texto arbitrario.

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
