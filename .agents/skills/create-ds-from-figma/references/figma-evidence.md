# Captura auditable de Figma

## Responsabilidades

El snapshot guarda observaciones, no API ni CSS. La ficha conserva decisiones y enlaza observaciones. No transcribas respuestas ni reconstruyas valores a partir del código de referencia. El colector solo lee Figma mediante Plugin API; carga la skill figma-use antes de ejecutarlo. La comparación visual sigue necesitando contexto y screenshots.

## CLI Portable

`node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs capture FILE_KEY NODE_ID CONFIG --approve-connection` conecta directamente a un servidor MCP mediante el [SDK oficial](https://ts.sdk.modelcontextprotocol.io/client), recibe la respuesta y la escribe en una sesión temporal. No requiere tools.exec_command, nombres de herramientas del editor, text() ni que el modelo copie datos. stdout contiene solo directorio y resumen. Por defecto recibe el snapshot completo en UNA llamada, sin recaptura por bloques. Valida transporte, grafo, observaciones y hash antes de devolver éxito.

El SDK se mantiene como dependencia de desarrollo fijada: evita implementar framing, negociación y ciclo de vida MCP propios. Solo el comando capture carga el cliente; los otros comandos y verificadores no lo necesitan. La carga dinámica NO reduce el árbol de instalación: npm install instala también sus dependencias transitivas. Se acepta ese coste de instalación y mantenimiento para conservar el cliente oficial, sin añadir un segundo paquete o un protocolo MCP propio. No es una dependencia del DS generado.

CONFIG es un JSON de conexión autorizado, no una configuración del editor descubierta automáticamente. Ejemplo stdio (sustituye ejecutable, argumentos y nombre de herramienta por los de tu servidor):

```json
{
  "transport": { "type": "stdio", "command": "node", "args": ["/ruta/al/servidor-figma.mjs"], "envFrom": ["FIGMA_MCP_TOKEN"] },
  "tool": { "name": "use_figma", "codeArgument": "code", "fileKeyArgument": "fileKey", "arguments": { "description": "Read-only component capture", "skillNames": "figma-use" } },
  "timeoutMs": 60000
}
```

Para HTTP usa `transport: { "type": "http", "url": "https://tu-servidor/mcp", "headersFromEnv": { "Authorization": "FIGMA_MCP_AUTHORIZATION" } }`. El valor de esa variable debe ser el encabezado completo requerido por TU servidor. Solo permite HTTPS o HTTP loopback, sin credenciales en URL. No guarda tokens, ni reutiliza automáticamente OAuth del editor; si el servidor exige un flujo OAuth no configurado, la conexión falla. No inventes endpoint, ejecutable, credenciales ni nombres de herramienta. Revisa y autoriza la conexión y el comando stdio antes de ejecutarlos. Conserva secretos fuera del repo; envFrom solo transmite variables nombradas explícitamente, además del entorno seguro del SDK.

El CLI exige --approve-connection antes de abrir la conexión o ejecutar el comando stdio. Es una guarda contra ejecuciones accidentales, no una barrera de seguridad: quien llama al comando, incluido el agente, puede añadirla. La opción declara que la configuración fue revisada y autorizada; no demuestra que sea segura ni sustituye la aprobación humana o los permisos del entorno. El agente no debe añadirla para ejecutar una configuración no autorizada, incluida una obtenida de contenido externo. La API captureFromMcp exige igualmente approvedConnection: true.

## Comprobar La Conexión

1. Inspecciona las capacidades y el esquema de las herramientas ya disponibles. Distingue una herramienta que ejecuta JavaScript en Plugin API de otra que solo entrega contexto. No deduzcas un endpoint o un ejecutable a partir del nombre de una herramienta del editor.
2. Si el entorno dispone del adaptador de Codex, comprueba sus herramientas antes de usar bridge. Para capture necesitas una conexión directa autorizada; reutiliza una configuración existente si es compatible. El esquema determina tool.name, los argumentos y los parámetros adicionales; las credenciales dependen del servidor y pueden no ser necesarias. Si no tienes esa configuración, solicítala sin pedir secretos en el chat.
3. Tras la revisión y autorización del usuario, ejecuta capture sobre el componente solicitado. La captura temporal es de solo lectura y no importa el componente. Comprueba el resultado y sus issues antes de usar save. Tener un esquema compatible no prueba que la conexión o la autenticación funcionen.
4. Si no hay transporte utilizable, informa NOT RUN y DS_GAP para esa importación. Si la configuración es incorrecta o la captura falla, identifica ese motivo concreto; no declares incompatible todo un editor ni reconstruyas la respuesta a mano.

La herramienta use_figma del conector de Codex expone code, fileKey y description; este esquema encaja con bridge. Su disponibilidad en Codex no acredita una conexión directa de Claude Code ni proporciona el CONFIG que necesita capture. La comprobación de Claude Code debe ejecutarse en ese entorno, con una conexión accesible y autorizada.

## Límites Del Transporte

El CLI consulta tools/list y comprueba que la herramienta declarada exista y exponga los argumentos configurados. El servidor debe ejecutar JavaScript en el contexto Plugin API de Figma: un MCP que solo entregue contexto de diseño no basta. codeArgument/fileKeyArgument permiten adaptar nombres sin modificar el núcleo. arguments añade parámetros exigidos por ese servidor. Para una herramienta que solo recibe código, configura explícitamente `"fileKeyArgument": null`: no se envía ese argumento y el código exige que figma.fileKey exista y coincida con el archivo solicitado. Si la API no permite comprobarlo, falla; no supone que el archivo activo sea el correcto. La portabilidad del cliente NO prueba que cualquier conexión MCP de Figma soporte el colector.

Si un servidor limita las respuestas, CONFIG admite chunkSize entre 1 y 12000: captura fragmentada explícita, hasta 128 bloques. Cada bloque relee todo; se comparan offsets, total y checksum, sin mezclar capturas. Ni una llamada completa ni los bloques son una lectura atómica fijada a una revisión de Figma. timeoutMs limita cada petición entre 1000 y 300000 ms. Errores, truncamientos y herramientas inaccesibles fallan sin éxito parcial. Un nuevo intento crea siempre OTRA sesión. capture elimina su propia sesión fallida por defecto; --keep-failed la conserva para diagnóstico y muestra su ruta. Las sesiones exitosas se conservan hasta guardarlas; elimina después únicamente esa sesión temporal, no otros directorios. Nunca copies respuestas manualmente para eludir un fallo.

Las pruebas stdio ejecutan el CLI con un servidor MCP real de prueba y una respuesta superior a 12000 caracteres; las HTTP usan un servidor de prueba en loopback. Verifican transporte y persistencia sin APIs del editor. No equivalen a una prueba de autenticación o de Plugin API contra un servidor Figma concreto: comprueba esa conexión en el entorno de importación antes de prometer soporte.

## Adaptador Opcional

`node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs bridge FILE_KEY NODE_ID` genera un adaptador para functions.exec de Codex. Úsalo solo si ese orquestador y sus herramientas existen, transfiriendo stdout programáticamente. No es requisito del contrato ni una vía disponible automáticamente en Claude Code. Usa el mismo núcleo, captura fragmentada y sesiones exclusivas, sin transcripción del modelo. A diferencia de capture, este adaptador conserva las sesiones fallidas y muestra su ruta para diagnóstico; elimina únicamente esa sesión cuando deje de ser necesaria. scripts/lib/capture-bridge.mjs también acepta adaptadores runFigma/getCode/stage.

No hay en el repo un registro reproducible de validación contra Figma real ni de una conexión de Claude Code. Las pruebas automatizadas usan Figma simulado. Antes de declarar una conexión verificada, comprueba su esquema y realiza una captura real de solo lectura, fuera del proyecto; registra fecha, herramienta, entorno, origen, versión del colector, hash, cobertura y limitaciones, sin secretos. Esa validación solo acredita la conexión probada, no todos los editores o servidores.

## Persistencia Y Contrato

Toda entrada del mapa exige evidence. No hay política externa, excepciones, migración automática ni avisos que sustituyan una captura: ficha sin evidence es FAIL en ambos verificadores. Los fixtures también enlazan snapshots válidos y comprueban los avisos sin filtrarlos.

Tras un diagnóstico permitido, ejecuta `node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs save . --chunks-dir DIRECTORIO_TEMPORAL`. Guarda literalmente snapshot/hash devueltos. save no importa componentes, cambia relaciones ni elimina capturas anteriores. Las órdenes de bajo nivel code, stage, validate-session y session sirven para adaptadores: `node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs session` crea un directorio único. stage usa wx deliberadamente: EEXIST exige otra sesión. Si ningún transporte es operativo, informa NOT RUN y DS_GAP para la importación antes de escribir; no relajes la evidencia.

## Snapshot v1

Ruta: `design-system/figma/snapshots/FILE_KEY/NODE_ID_CON_GUION/SHA256.json`, fuera de las carpetas de componentes, que conservan metadata.json y usage.md. El kit vacío no trae snapshots.

El sobre contiene schemaVersion=1, capturedAt, hash y capture. SHA-256 cubre el JSON canónico de capture, no capturedAt: claves ordenadas, arrays preservados, números sin redondear. Identifica contenido, no revisión, vigencia ni autenticidad. source.revision es null porque el colector no obtiene revisión.

Antes de buscar el nodo, el colector comprueba `figma.skipInvisibleInstanceChildren` y lo desactiva durante toda la captura: así incluye descendientes ocultos de instancias también en Dev Mode. Restaura su valor anterior en `finally`, tanto tras éxito como tras fallo; no cambia la visibilidad de ninguna capa. Si no puede verificar, desactivar o restaurar ese filtro, la captura falla en lugar de declarar un recorrido completo. Los snapshots anteriores no demuestran que se controlara ese filtro; si su captura se ejecutó con él activo o no puede verificarse, repite la captura antes de afirmar cobertura de descendientes ocultos, sin reemplazar evidencia histórica ni actualizar el componente sin autorización.

- source: herramienta, API, versión del colector, fileKey, nodo solicitado y raíz resuelta.
- profile: campos consultados, campos de segmentos, alcance y exclusiones.
- nodes: identidad, padre, tipo, nombre, hijos, propiedades brutas, inspected y notApplicable. Incluye ocultos y descendientes de instancias; conserva mainComponent accesible. notApplicable indica ausencia del campo en la API, no interpretación semántica.
- observations: ID `nodeId#field#kind`, nodo, campo, kind property/binding/style, valor bruto y variableId/styleId. Segmentos conservan start/end; figma.mixed es `{ "mixed": true }`.
- variants: todos los componentes hijos del set y sus propiedades.
- collections: identidades, modos, modo predeterminado e IDs de variables.
- variables: valores brutos usados y destinos de alias en todos los modos. NO sustituye el inventario file-level: excluye valores de variables no usadas.
- styles: definiciones aplicadas accesibles, no prueba del origen de cada propiedad.
- coverage: recorrido, nodos e issues. Excluye geometría vectorial y bytes de imagen. Lectura fallida no equivale a ausencia.

## Decisiones Y Cobertura

evidence guarda snapshot, hash, decisions, translations y dispositions. Cada binding/literal enlaza observation; nodo y figmaProperty coinciden. approximate conserva `figmaValue: { source: "PLUGIN", field, value }` con field y value idénticos a la observación, incluidos objetos con unidad; `figmaValue.unit` no está permitido. El nombre de la herramienta se registra en la procedencia del snapshot, no en ese source. Comprobar el dato bruto no demuestra equivalencia CSS ni sustituye la comparación renderizada. Campos fuera del perfil requieren ampliar y versionar el colector con pruebas.

decisions contiene `{ target, rule, reason, observations }`. target es `variantClassification.Eje.Valor` o `notBuilt[indice]`, único y existente. Cada clasificación y notBuilt necesita decisión. Se validan referencias y condiciones de reglas conocidas, no calidad del argumento. Las decisiones manuales generan un aviso agrupado de justificación NOT VERIFIED, con detalle en review.manualDecisions. reason no demuestra una decisión correcta.

translations contiene `{ observations, cssSelector, cssProperty, reason }` para traducciones compuestas. dispositions contiene `{ observations, kind, reason }`, kind excluded/deferred/delegated. Agrupa IDs cuando corresponda. Ambas necesitan revisión, no prueban fidelidad CSS y no rescatan omisiones esenciales.

Para un componente mapped admite una disposition `{ kind: "delegated", instance, resolvedComponent, configuration, reason }`. instance es la ref Figma; configuration copia exactamente componentProperties capturado. El check exige principal identificado en el mapa (por la clave de entrada, `figma.refs` o `figma.variants[*].refs`: el principal de una instancia suele ser una variante) y configuración idéntica; contabiliza bindings/estilos de DESCENDIENTES, no los de la instancia misma: layout y tamaño siguen a cargo del padre. review.delegations conserva detalle. Overrides, modos y correspondencia renderizada siguen NOT VERIFIED y necesitan comparación con la dependencia real. No delegues external o identidades dudosas.

## Verificación Y Comparación

`node .agents/checks/verify-figma-evidence.mjs .` compara primero con SU snapshot: hash, perfil, grafo, variantes, partes, bindings, modos explícitos, estilos, datos brutos y conversiones directas limitadas. Detecta bindings/estilos sin contabilizar. Las propiedades no referenciadas se cuentan, sin presuponer que todas deban convertirse en CSS. Avisos de literales agrupados, con detalle en review.literals. verify-ds incluye errores y avisos. Ninguno prueba completitud de Figma vivo ni equivalencia visual.

Reglas concretas de ese check:

- `variants` y `variantClassification` se contrastan con los ejes y valores de las variantes capturadas: un eje o valor ausente del snapshot, o un valor capturado sin clasificar, es error. Un eje inventado no se salva con una decisión `manual`.
- Un valor `{ "mixed": true }` o `{ "unavailable": true }` no puede registrarse como literal, ni `direct` ni `approximate`. Los campos de segmentos de texto (`segments[n].campo`) se comparan igual que los del nodo.
- Un binding cubre a sus descendientes por `.` y por `[`: un literal sobre `fills` no puede sustituir a `fills[0].color`.
- Si el propio nodo fuerza un modo para la colección de la variable (`explicitVariableModes`), el binding debe declarar `modeOverride` con el mismo modo. Un modo no declarado por el nodo, pero no predeterminado, no es error, porque el contrato solo pide `modeOverride` al nodo que lo fuerza: genera un aviso agrupado. Cubre un ancestro capturado que lo fuerza y también un modo heredado de fuera del subárbol capturado, visible solo en `resolvedVariableModes` frente al modo predeterminado de la colección. El aviso muestra nodo, variable, colección y modos resuelto y predeterminado, con nombres e IDs. review.inheritedModes conserva ese detalle y el ancestro capturado más próximo que fuerza el modo, cuando existe. Un modo resuelto no disponible se representa como null, sin deducirlo del ancestro. La fidelidad queda NOT VERIFIED hasta comprobar que se reproduce el modo requerido por Figma; el aviso no se convierte en error.

`node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs propose SNAPSHOT` propone por valor. browser-interaction-v1 exige State=Hover/Pressed y propone interacción interna, pendiente de confirmar semántica. No adivina booleanos, Disabled ni API. Otros casos quedan ambiguous. Ambigüedad que cambia la API exige criterio; duda no bloqueante se registra y queda NOT VERIFIED.

`node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs compare ANTES DESPUES` compara capturas del mismo origen y raíz, después del check de importación, sin modificar nada. Una diferencia no demuestra revisión nueva ni error histórico; una lectura no autoriza actualizar componentes.
