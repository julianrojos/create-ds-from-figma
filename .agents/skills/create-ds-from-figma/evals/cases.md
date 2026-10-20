# Casos de evaluación de create-ds-from-figma

Estos casos describen decisiones observables, no sustituyen una ejecución real con Figma. Para cada prueba, registra la URL, refs consultados, diagnóstico, archivos modificados y resultados de los checks. Ejecútalos en una rama que el usuario haya seleccionado; no cambies de rama por cuenta del kit.

## Recuperación De Capturas Y Serializaciones

- Transporte figma_execute seleccionado explícitamente en CONFIG: capturar más de 259236 caracteres por un servidor MCP sintético, en una llamada y por bloques; conservar respuestas MCP y validar los mismos datos sin copiar valores por el modelo. success falso/ausente, error contradictorio, contexto de otro file, JSON truncado, bloques cambiantes y formato no seleccionado fallan. No confundir este fixture con un servidor Figma real ni una ejecución OpenCode. Un fallo de formato no autoriza crear scaffold o snapshots manuales.
- Captura vacía, perfil incompatible, JSON/sello corrupto y archivo ilegible producen motivos y acciones distintos, también con la sesión de evidencia reutilizada. Nunca se completa evidencia a mano ni se sobrescribe historia; restaurar bytes originales y realizar una captura autorizada nueva son recuperaciones distintas.
- Una captura inválida bloquea la recogida, no oculta el diagnóstico independiente de la demo ni las acciones de serialización. El diagnóstico temporal no publica, restaura ni modifica archivos.
- FLOAT pendiente referenciado por bindings, CSS, objetos inline literales o alias: acción con variable, ficha y referencias, sin inventar unidad. Una mera declaración de alias no demuestra consumo. Pendientes sin referencias identificadas conservan su nivel de aviso; lectura fallida o análisis dinámico no equivale a sin uso.
- Estos fixtures y mutaciones prueban orientación y bloqueo, no autenticidad del transporte ni fidelidad frente a Figma.
- Un alias inline no usado no origina accion FLOAT; uno consumido sigue su cadena local y conserva la ubicacion consumidora. Nombres iguales en objetos distintos no contaminan una cadena local resuelta. Un consumidor externo identificado mantiene el diagnostico con aviso de correspondencia/herencia no verificada.

## Delegación Con Diferencias Visuales

- Padre sintético con instancia mapped de un hijo cuyo icono cambia de variable de trazo, sin cambiar geometría. Fills puede ser same y binding/stroke difference: no se clasifica todo el nodo por una propiedad.
- Diferencia no declarada: error. Omitted: contabilizada, pero bloquea confirmed. Implemented: exige checkReview específico del mismo caso; una revisión general o de otra diferencia no basta.
- Cubrir ausencia de ligadura, pinturas múltiples/reordenadas, modos distintos, lecturas fallidas, principal equivocado, estructura distinta, snapshot del hijo ausente y anidados profundos. Incertidumbre nunca produce same.
- Cambiar snapshot del hijo, correspondencia, tratamiento o reglas caduca confirmaciones afectadas del padre. Cambiar solo el motivo del tratamiento no modifica hechos verificados.
- Fixtures y mutaciones no acreditan fidelidad frente a Figma real. Recoger valores calculados no equivale a compararlos automáticamente.

## Prevención Antes De Entregar

- Fuerza el primer page.evaluate de composición después de montar la página 4×, sin impedir la medición principal. El helper propaga el rechazo antes de aislar/capturar/escribir; verification-browser conserva el motivo exacto en composition:collection/NOT RUN y cierra el contexto. La acción compartida RETRY_COMPOSITION_DIAGNOSTICS mantiene caso/check/motivo. No se generan capturas de composición ni publicaciones, y los hashes del proyecto permanecen intactos. El gate diagnóstico de NOT RUN ya debe producir FAIL, no una diferencia visual ni una confirmación.

- Provoca un timeout de screenshot después de aislar una parte: los checks del grupo son NOT RUN, se solicita reintento, se conserva el PNG compuesto ya escrito y el DOM/layout se restaura en Chromium real. Simula también un destino de guardado ocupado por un archivo, una desconexión al inspeccionar y un error de restauración: nunca se convierten en NOT COMPARABLE ni conservan checks PASS del grupo. La limpieza intenta todos sus pasos y no oculta el motivo original. Condiciones explícitas de máscaras, aislamiento inestable y presupuesto excedido siguen siendo abstenciones, no fallos técnicos.

- Provoca un fallo solo en la página de composición 4×: geometría y recogida principal siguen sin FAIL/NOT RUN, pero compositionSummary.NOT RUN hace fallar --diagnose y genera RETRY_COMPOSITION_DIAGNOSTICS con caso/check/motivo y requisitos de reintento, sin afirmar una diferencia visual. Una abstención NOT COMPARABLE no genera reintento. Verifica opaque + nonOpaque = píxeles muestreados y el reparto de opaque; una región excluida con tinta opaca aumenta indeterminate, no nonOpaque. No se conserva el nombre anterior del contador ni se publican evidencias o confirmaciones.

- Fuerza mensajes info/warn/error del logger de Vite con una configuración sintética autorizada: stdout sigue conteniendo un único JSON válido y stderr conserva los tres mensajes. Comprueba deduplicación de warnOnce, hasWarned/hasErrorLogged y ausencia de borrado de terminal. React, react-dom y los runtimes JSX figuran en optimizeDeps.include. Con un fixture solo de texto, el diagnóstico conserva la abstención de composición pero no crea contexto 4×; los fixtures con formas elegibles siguen capturando y detectando oclusión. No se afirma que la preoptimización impida toda recarga ni se redirige globalmente stdout del proceso.

- Composición experimental en Chromium real: dos formas hoja hermanas (relleno y trazo rotados) con orden CSS invertido deben conservar geometría y producir FAIL de tinta superior tapada; elevar el trazo en el fixture hace visible su tinta. Usar también orden fuente invertido por itemReverseZIndex. La tinta opaca estable se obtiene sobre dos fondos y su balance debe cerrar, sin atribuir colores iguales ni suavizado a un pintor. Una tercera parte superior puede cubrir legítimamente. Texto, descendientes, opacidad, filtros, pseudo-elementos, mapeos ambiguos, modos distintos, aislamiento sobrescrito o cambios de layout producen NOT COMPARABLE, no aprobación inventada. Verifica estilos/cajas/contenido antes/después y el compuesto restaurado; conserva PNG/hash temporales. La integración --diagnose emite compositionSummary/REVIEW_COMPOSITION_DIAGNOSTICS y FAIL ante oclusión observada, sin publicar, editar el proyecto, cambiar el gate ni confirmar. Los snapshots no capturan máscaras/mezclas completas y el PASS del modelo no demuestra fidelidad general.

- Fuente o imagen esencial sin origen autorizado en el preanálisis: DS_GAP/BLOCKED antes del scaffold y del TSX. Pregunta única por los recursos; si no hay interacción, detente sin escribir. requirements lista candidatos, no declara esenciales todos los recursos ocultos. Una petición de importación no autoriza placeholders ni paquetes deducidos del nombre.
- Implementación existente con recursos pendientes: finalize:import --diagnose recoge en temporal y compara sin publicar. Conserva FAIL de recursos y diferencias geométricas por caso; no atribuye toda diferencia al CSS ni declara fidelidad por falta de FAIL. --collect sigue bloqueado por recursos esenciales y --reviews no se puede combinar con diagnóstico.
- Fixture genérico con clase de tamaño compartida por raíz/texto, punta en borde contrario y anchos de borde parciales: el diagnóstico detecta geometry:initial FAIL, position:pointer FAIL y aviso de anchuras. Corregir el fixture elimina esos fallos, pero la fuente pendiente conserva FAIL y complete=false. Regresión real de Chromium, no solo DOM simulado.
- Compara todos los archivos del proyecto antes/después: ni fichas, usage, snapshots ni design-system/verification cambian; cuerpos, recibos, capturas, caché y resultados viven en un temporal nuevo. Incluso un diagnóstico numéricamente limpio conserva NOT VERIFIED, complete=false y no confirma candidatos.
- Tras escribir código permitido, repite diagnóstico/corrección antes del informe final. Sin navegador: NOT RUN/BLOCKED. Nunca uses el diagnóstico como permiso para crear una importación bloqueada, modificar tolerancias o reconstruir snapshots.

## Enrutado de skills

### Publicación Y Vigencia De Artefactos

- FLOAT sin decisión ni consumo: solo aviso. Añade binding: error de serialización y token sin definición cargada. Decide explícitamente la unidad y regenera: ambos errores desaparecen.
- Dentro de una ejecución, repetir el mismo grafo reutiliza resultados sin compartir arrays mutables; los grafos de ejecución y auditoría no se confunden. Entre ejecuciones, añade un import y comprueba que se detecta sin reiniciar el proceso. Los hashes de recibos se siguen leyendo en cada recogida.
- Ejecuta benchmark-static-analysis.mjs con un proyecto fijo, sin cargas concurrentes; guarda alcance, Node, casos, iteraciones, mediana/p95 y recuentos. No deduzcas arranque frío o rendimiento general de esa microprueba ni uses umbrales temporales en tests.

- Pon un tsconfig inválido en el padre de un proyecto sin tsconfig local: no debe consultarse ni añadirse a inputs. Herencia local encadenada debe resolver aliases y registrar todos los JSON; extends/symlinks externos generan NOT VERIFIED sin leer contenido externo.
- Usa un token y omite sus definiciones del CSS de la vista: verify-ds y preview deben rechazarlo. Añadir tokens.css solo a inputs o mediante import type no basta. Un import de ejecución, un @import local o stylesheets con definiciones alcanzables satisface disponibilidad estática; modo, cascada y valor efectivo siguen pendientes de comparación renderizada.

- Confirma un componente y luego importa otro: cambios en su código y en entradas ajenas del mapa/estado no caducan el primero. Finder .DS_Store no entra en los inputs. Modificar un import real o recurso compartido sí produce caducidad actual NOT VERIFIED, no error de DS ni edición automática de usage.
- Corrompe un artefacto de un informe también caducado: debe seguir fallando por integridad. sourceSnapshot conserva la referencia histórica para comprobar artefactos antes de evaluar vigencia.
- Imports, CSS URLs y aliases TypeScript deben seguir archivos locales y symlinks internos sin ciclos. Symlinks externos, imports dinámicos y globs no resueltos deben generar un diagnóstico NOT VERIFIED, no afirmar cobertura completa.

- Publica una recogida, cambia CSS y solicita un informe nuevo: debe rechazarse por los hashes originales del recibo. Refrescar manualmente los hashes del informe tampoco debe permitir confirmed. Cambiar decisiones relevantes exige nueva recogida; reescribir descripción o prosa no.
- Renderiza un padre con un hijo DS que tenga root y partes con los mismos nombres: recoge solo las partes del padre sin error de raíz ambigua. Dos raíces superiores hermanas o ninguna deben seguir fallando.
- CSS .initial.large con width fijo seguido de .initial.initial con width auto tiene igual especificidad y gana auto. Invierte el orden y comprueba que gana el valor fijo; aumentar clases repetidas aumenta especificidad sin exigir más clases DOM.

- Recoge un caso en navegador y publica su .receipt.json mediante verification-plan.mjs publish: cuerpo y recibo deben conservar exactamente sus bytes y hashes, sin transcripción. Repetir es idempotente y conserva NOT VERIFIED.
- Altera el cuerpo o recibo: error de integridad. Cambia una dependencia real, una colección usada o añade un import: la publicación rechaza la recogida desactualizada; el informe íntegro anterior queda NOT VERIFIED, no bloquea el DS. Un archivo nuevo ajeno no cambia ese alcance.
- Prueba PNG truncado, CRC corrupto y cabecera sin datos: deben fallar. Prueba escalas positivas y dimensiones fraccionarias de origen: no se debe imponer un redondeo Figma supuesto. El informe deriva los píxeles reales y conserva dimensionComparison NOT VERIFIED; un registro image adulterado falla. Una captura íntegra, incluso 1x1, aún necesita procedencia real y revisión visual; no se deduce autenticidad ni PASS de la decodificación.
- Mapea CSS fuera de src/public y elimínalo de los inputs del recibo: publish debe rechazarlo y report debe exigir su hash, igual que con CSS dentro de src/.

Las URL siguientes son entradas de ejemplo: al ejecutar el caso, usa nodos reales y registra qué skill o workflow se activó como tarea principal y cuáles se invocaron como subpasos. Un test de frontmatter no demuestra este enrutado.

| Petición y contexto                                               | Ruta principal esperada                                                                                       | No debe ocurrir                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| "Crea un DS" + URL de `Button` aún no importado                   | `create-ds-from-figma`; puede llamar a `find-component` y `validate-ds`                                       | Tratar el nodo como pantalla o importar otros componentes del file |
| URL de `Button` pegada sin ningún texto                           | `create-ds-from-figma`; inspecciona el tipo de nodo antes de decidir                                          | Exigir la frase «crea un DS» o construir una pantalla por defecto  |
| "¿Qué componente del DS corresponde a este nodo?"                 | `find-component`, solo lectura                                                                                | Activar una importación o escribir código                          |
| "¿Qué archivo y props implementan este Button ya mapeado?"        | `map-figma-to-code`, tras confirmar la coincidencia                                                           | Crear un mapeo o reimportar el componente                          |
| "Implementa esta pantalla" + URL de un frame                      | `.agents/workflows/build-from-figma.md`; puede llamar a `find-component`, `map-figma-to-code` y `validate-ds` | Usar `create-ds-from-figma` como flujo principal                   |
| "Ajusta este botón existente" sin URL de Figma                    | Regla del DS; `validate-ds` al terminar la edición                                                            | Activar una importación solo por mencionar un componente           |
| URL repetida de `Button` ya importado, sin diferencias observadas | `create-ds-from-figma`; diagnóstico y decisión de reutilizar                                                  | Reescribir ficha, código, mapa o tokens                            |
| "Valida este componente ya implementado"                          | `validate-ds`, con checks estáticos y comprobaciones renderizadas                                             | Exigir una nueva importación de Figma                              |
| "Crea un DS" + URL que resulta ser un frame                       | `create-ds-from-figma` inspecciona el nodo y devuelve `DS_GAP` sin escribir                                   | Construir la pantalla o preparar el scaffold automáticamente       |

## Primera importación

### Inventario Completo Y Transporte

- Captura el inventario completo con un transporte autorizado y guarda el sobre sellado sin transcripción; prueba variables no usadas, todos los modos y alias remotos. IDs duplicados, modos ausentes, destino local omitido o tipo incompatible deben bloquear antes de escribir tokens.
- El sobre exige los cuatro campos exactos. Elimina capturedAt, usa un número, fecha no canónica o imposible, añade un campo o sustituye el sobre por null: debe fallar con diagnóstico Variable inventory, sin crear una fecha de respaldo. Un sobre válido conserva el mismo hash si solo cambia su fecha canónica.
- Ejecuta generate-token-json plan y comprueba que no crea DS. save conserva nombres/serializaciones/ámbitos previos y variables antiguas ausentes de la captura; las enumera por separado en check, sin afirmar presencia actual. Un inventario de otro file, hash corrupto, colisión conservada o alias dependiente de un modo no registrado bloquea sin modificar archivos.
- figma-preanalysis combina tokens/anidados/recursos sin escribir. Un anidado sin identidad queda unresolved; missing exige identidad local demostrada. No aplicar mapped por nombre.
- Usa mapas canónicos con refs en figma.refs y figma.variants[*].refs, nunca entry.refs: el principal de una instancia local/remota que corresponde a una variante ya mapeada debe quedar mapped tanto en el diagnóstico como en preanalysis. Refs repetidas dentro de una entrada no son ambiguas; coincidencias en dos entradas sí. Un nombre coincidente o un nodeId remoto aislado no autorizan mapped.
- Exporta PNG mediante figma-reference: payload truncado, CRC corrupto, escala no válida y cambios entre bloques deben fallar. Solo save publica bytes y devuelve el artefacto tipado; no genera PASS visual ni revisiones.
- Regenera y reproduce el inventario sintético de `.agents/checks/tests/fixtures/variable-inventory-sealed.json` offline, con el mismo mock y fecha fija. Ningún dato ni PNG real forma parte de esa prueba; no confundirla con validación de un transporte vivo. Ejecuta `npm run test:inventory:mutations` y exige base correcta, cero supervivientes y ningún error de infraestructura.

La ficha exige también verification con recursos autorizados/hashes, tipografía esencial cubierta y casos concretos fidelity/behavior. Ejecuta verify-render-plan y la vista aislada sin editar App.tsx; un recibo de medidas no confirma fidelidad. Registra activaciones reales, viewport, fuentes y limitaciones.

- Entrada: repo sin `figma-code-map.json` ni `tokens.css`; URL de un componente local con variables del file resueltas y sin anidados locales `missing`.
- Decisión esperada: modo primera vez; captura temporal estructurada mediante un transporte operativo y autorizado, con procedencia y valores brutos, y diagnóstico completo antes de escribir en el repo; importa solo el componente solicitado y todas las colecciones de variables del file.
- Debe producir: tras el diagnóstico permitido, snapshot persistido por `save` y ficha con `evidence` enlazando su ruta y hash; bindings y literales referencian observaciones existentes y las decisiones quedan justificadas. Scaffold con `index.html` y `tsconfig.json`, tokens por colección, ficha, código, mapa, estado e inventario coherentes; `verify-figma-evidence`, `verify-ds` y demás checks ejecutados con resultado explícito. Amplía el `package.json` existente con Vite/React y scripts de app, actualiza su lockfile y conserva `npm test`, `yaml`, las demás dependencias y `.gitignore`.
- No debe: reemplazar `package.json` o `package-lock.json` desde un starter, generar pantallas, otros componentes del file, tokens de ejemplo ni copiar recursos auxiliares de `.agents/`.

## Captura obligatoria no disponible

- Entrada: componente nuevo, sin transporte operativo para obtener la captura estructurada, o con una captura truncada o inválida.
- Decisión esperada: informa `NOT RUN` y `DS_GAP` con el motivo concreto antes de escribir el scaffold o registrar el componente; solicita la configuración faltante sin pedir secretos en el chat.
- No debe: transcribir respuestas manualmente, inventar observaciones, omitir `evidence` ni presentar una conexión simulada como validada con Figma real.

## Cambio solo en evidencia de un componente importado

- Entrada: URL repetida; código, variantes, bindings y demás campos no cambian, pero el análisis propone modificar `evidence.decisions`, `translations` o `dispositions`.
- Decisión esperada: muestra la diferencia como «otros cambios observados» y solicita actualización explícita; una interpretación nueva no demuestra un cambio en Figma. No escribe ficha, mapa ni snapshot enlazado.
- Segunda entrada: solo difiere el hash o enlace de una captura nueva, sin decisiones nuevas.
- Decisión esperada: compara las capturas del mismo origen y raíz, comunica las diferencias verificables y conserva el enlace histórico salvo actualización autorizada. No deduce una revisión Figma a partir del hash ni reescribe al reutilizar o sustituir solo una dependencia.

## Inventario ausente tras una importación

- Entrada: existen mapa, `tokens.css`, ficha, código y una página implementada, pero falta `design-system/inventory.json`; se solicita importar otro componente.
- Decisión esperada: modo siguiente componente; diagnostica el scaffold incompleto antes de escribir. Solo después de una decisión que permita reparar, reconstruye `components` a partir de entradas mapeadas con ficha y código, y `screens` a partir de páginas cuya composición pueda comprobarse.
- Si no se puede establecer la composición de una pantalla, pide la información que falta antes de registrarla; no inventa una descripción ni omite silenciosamente la página.
- No debe: copiar el inventario vacío sobre trabajo existente, registrar componentes bloqueados ni reparar el scaffold durante una decisión de no escribir o una sustitución autorizada solo para una dependencia.

## Nombres de colecciones en importaciones sucesivas

- Entrada: Figma contiene `Color/Primitives` y `Color-Primitives` como colecciones nuevas con IDs distintos.
- Decisión esperada: el preflight asigna sufijos codificados por ID a ambas en `files` antes de escribir; `state.collections` y `state.variables` quedan indexados por ID y cada `file` apunta a su JSON.
- Segunda entrada: Figma añade una colección nueva cuyo nombre colisiona con un JSON ya importado, o renombra una colección existente conservando su ID.
- Decisión esperada: el archivo existente conserva su nombre; solo la colección nueva recibe sufijo. Un renombrado actualiza el nombre en el estado y en el JSON, no `file`.
- No debe: sobrescribir o renombrar un archivo anterior por una colisión nueva, guardar una ruta fuera de `design-system/tokens/` ni atribuir a Figma un nombre reconstruido del archivo.

## ID registrado que no aparece en la entrada del preflight

- Entrada: `state.collections` conserva una colección con JSON existente, pero su ID no aparece en la entrada del preflight; puede proceder de otro file de Figma.
- Decisión esperada: el preflight conserva el nombre en `files` y declara `{ id, file }` en `diagnostics.registeredIdsNotInInput`; el agente comunica solo esa diferencia de entrada, sin afirmar que Figma cambió ni borrar el JSON o el estado. El resultado debe ser interpretable aunque no se lea stderr.
- No debe: retirar tokens automáticamente ni convertir el aviso en permiso para escribir cuando la tabla lo prohíbe.

## JSON registrado ausente

- Entrada reparable: `state.collections` registra un JSON que falta, pero el mismo ID aparece en la entrada del preflight y el agente ha observado sus variables y modos en Figma.
- Decisión esperada: el preflight conserva el nombre en `files` y declara `{ id, file }` en `diagnostics.missingRegistered`. Solo después de una decisión de la tabla que permita reparar el scaffold, el agente reconstruye ese JSON con los datos observados y ejecuta los checks.
- Entrada no reparable con la entrada actual: falta el JSON registrado y su ID tampoco aparece en la entrada del preflight.
- Decisión esperada: el preflight falla antes de escribir y el agente pide restauración o una reparación explícita con la fuente necesaria.
- No debe: sobrescribir otro JSON, inventar variables ni reparar durante `DS_GAP`, una decisión de no escribir o una sustitución autorizada solo para una dependencia.

## Anidado local sin mapear

- Entrada: URL de un componente cuyo análisis revela una instancia local `missing`, con ref estable del componente principal.
- Decisión esperada: `DS_GAP` antes de escribir; indica el nombre y ref del anidado y pide importar primero su URL.
- Debe producir: diagnóstico y ninguna modificación del DS o del código.
- No debe: implementar el anidado implícitamente, registrar el padre como importado ni preparar el scaffold salvo petición expresa del usuario.

## Dependencia externa ahora mapeada

- Entrada: URL de un padre ya importado con un anidado `external` guardado; el mapa actual resuelve ese anidado como `mapped`.
- Decisión esperada: compara los identificadores compartidos del componente principal y todos los demás campos observables antes de editar.
- Si la identidad se verifica igual y no hay otros cambios: actualiza solo la composición de esa dependencia, su import y su entrada de `nestedComponents`; comprueba que el cambio no pisa ediciones del usuario y ejecuta los checks.
- Si la identidad no es verificable: no escribe; pide otro ref o autorización explícita para esa sustitución.
- Si hay otros cambios: los comunica y pide una solicitud explícita de actualización general.
- No debe: actualizar tokens, ficha u otras dependencias por la mera repetición de la URL. Una autorización limitada tampoco permite reparar el scaffold.

El DS de `test/nested_component` con `Tab` dentro de `Tabs` puede servir para el tercer caso cuando el usuario seleccione esa rama. La ejecución real queda pendiente de una URL y acceso a Figma; los tests estáticos del kit no prueban estas decisiones.

## Prefijo y nombres de custom properties

- Entrada: primera importación en un DS nuevo (`tokenPrefix` es `null`, sin colecciones, JSON ni declaraciones `--*`), con un componente que solo usa variables externas con ID y valor resuelto. El usuario no menciona ningún prefijo.
- Decisión esperada: el preflight propone `ds` como predeterminado; el diagnóstico lo comunica sin detener la importación y el estado resultante queda con `tokenPrefix: "ds"` aunque no haya colecciones locales. Una segunda importación con variables locales reutiliza ese prefijo.
- Segunda entrada: Figma renombra una variable o su colección conservando el ID.
- Decisión esperada: el `cssName` ya asignado se conserva; solo las variables nuevas reciben nombre, y reciben sufijo si colisionan con uno existente, reservado o entre sí.
- Tercera entrada: el usuario pide otro prefijo cuando ya hay uno fijado, o el estado tiene `tokenPrefix: null` pero ya hay tokens, componentes o declaraciones `--*`.
- Decisión esperada: el preflight falla y no escribe; en el segundo caso explica que el estado es inconsistente y pide una reparación explícita, sin sugerir que basta con pasar un prefijo.
- No debe: cambiar un prefijo fijado, recalcular un `cssName` publicado, asignar `ds` a un DS existente sin prefijo ni imponer el prefijo a variables externas.

## Modos de una colección

- Entrada: el file tiene una colección con los modos `Light` y `Dark`, y otra, `Responsive`, con puntos de ruptura.
- Decisión esperada: el agente importa con `modeScopes` en `null` para cada modo no predeterminado, sin inventar selectores, y pregunta una vez por colección qué ámbito usar. Mientras sean `null`, `verify-ds` avisa de que esos modos están NOT VERIFIED.
- Con ámbitos decididos: `tokens.css` tiene el `:root` base y después un bloque por modo con solo las variables que difieren; las media queries van en el orden indicado.
- No debe: elegir `[data-theme="dark"]` por su cuenta, emitir CSS para un modo pendiente, declarar PASS para un modo no verificado ni dar por demostrado el valor efectivo sin la comprobación renderizada.

## Variables numéricas sin unidad decidida

- Entrada: el file tiene una colección `Space` con variables `FLOAT` (`Space/100` = 4, `Space/200` = 8, …) y el componente solo usa `Space/100` en el relleno izquierdo; otro componente usaría la misma variable como opacidad.
- Decisión esperada: para `Space/100` se registra `serialization` con `px` y como evidencia el nodo y la propiedad de Figma observados, y `tokens.css` lleva `4px`. Las demás variables `FLOAT` quedan pendientes: no se escriben y `verify-ds` avisa NOT VERIFIED. Si una variable se usa en propiedades de unidad o escala incompatible, el agente comunica el conflicto y pregunta; no elige.
- No debe: publicar un número sin unidad como valor provisional, deducir `px` del nombre de la propiedad CSS o de los `scopes`, cambiar una decisión ya escrita por la llegada de otro uso, ni dar por verificadas las variables pendientes.

## Hoja de tokens generada

- Entrada: importación que añade colecciones, una instantánea externa y un modo con ámbito decidido; el agente tiene la tentación de escribir o retocar `src/styles/tokens.css` a mano.
- Decisión esperada: el agente persiste JSON, estado y ficha, y genera la hoja con `generate-tokens-css.mjs`; ejecuta `--check` y `verify-ds`. Una segunda ejecución sin cambios deja el archivo idéntico.
- No debe: editar el archivo a mano, añadir declaraciones propias, escribir variables `FLOAT` pendientes ni dejar que `verify-ds` pase con una hoja que difiere de la generada.

## Estilo aplicado con literal aproximado

- Entrada: un nodo de texto usa un estilo `TEXT` identificable y su observación PLUGIN de `lineHeight` tiene `{ unit: "PERCENT", value: 124.874997... }`; la herramienta no prueba si esa propiedad procede del estilo o de un override.
- Decisión esperada: `styles` registra ID, nombre, file y nodo; el literal enlaza `observation`, conserva `figmaValue: { source: "PLUGIN", field: "lineHeight", value: <objeto bruto observado> }`, `translation: approximate`, `styleRef` y `styleOrigin: unknown`. No redondea en silencio ni inventa un origen. `verify-figma-evidence` rechaza fuente REST, otro campo o un valor normalizado aunque el CSS coincida. `verify-bindings` deja `writtenStatus: PASS` solo si coincide el CSS y `status: NOT_RUN` hasta la comparación renderizada.
- Cierre esperado: `validate-ds` obtiene el tamaño de fuente de Figma independientemente para el mismo nodo (o segmento y rango), variante y modos; calcula `fontSize × p / 100` solo para ese `lineHeight` PERCENT y compara el valor calculado en navegador para las configuraciones pertinentes. Con tamaño mixto o ausente no aplica la fórmula. Informa resultado estático, calculado y visual por separado.
- No debe: considerar cualquier porcentaje como porcentaje del tamaño de fuente, ni convertir un `NOT_RUN` estático en PASS sin prueba renderizada.

## AUTO y procedencia de estilo no disponible

- Entrada: Figma devuelve `AUTO` para line-height y la herramienta no devuelve el ID del estilo, pero sí los valores esenciales del nodo.
- Decisión esperada: `figmaCoverage.styles` queda `unavailable` con la llamada intentada y el motivo (la captura de procedencia es `NOT RUN`), y `styles` vacío; no bloquea la importación solo por faltar procedencia ni degrada por sí solo el Overall. La evidencia y el snapshot siguen siendo obligatorios. Si el CSS usa `normal`, el literal enlaza la observación y registra `translation: approximate` y `figmaValue: { source: "PLUGIN", field: "lineHeight", value: { unit: "AUTO" } }`.
- Cierre esperado: `validate-ds` compara visualmente los mismos contenidos, fuente, tamaño, variante y modo; limita cualquier PASS a las configuraciones observadas. Sin esa comparación, el literal y el Overall quedan NOT VERIFIED.
- No debe: afirmar que `normal` equivale siempre a `AUTO`, ni usar solo la altura de la caja de texto como prueba.

## Texto con estilos por segmentos

- Entrada no bloqueante: un mismo nodo de texto tiene dos estilos en rangos observados, pero la diferencia de propiedades no es esencial para la implementación solicitada.
- Decisión esperada: se registran las aplicaciones con `start`, `end` y `rangesSource` tal como los devolvió la API; no se inventa un binding o literal escalar para la propiedad mixta. Se añade `unresolved` no bloqueante y la parte queda NOT VERIFIED en el informe.
- Entrada bloqueante: la diferencia entre segmentos es esencial para reproducir el componente y el modelo de una observación por propiedad no la representa fielmente.
- Decisión esperada: `DS_GAP` antes de escribir, explicando qué segmento o propiedad falta y qué fuente se intentó.
- No debe: usar los rangos como prueba de fidelidad de las propiedades por segmento, ni esconder la diferencia esencial en `notBuilt` para declarar PASS.

## Variantes Figma y API de código

- Entrada: una variante mapeada declara `Size=Large`, `State=Hover` e `Icon=Mic`. La ficha clasifica `Large` como `prop` con `codeProp: size`, `Hover` como `interaction` y `Mic` como `content` de la parte `icon`. El tipo admite `size: "sm" | "lg"`, pero no hay evidencia que relacione `Large` con `lg`.
- Decisión esperada: la búsqueda devuelve los ejes de Figma como observaciones; el mapeo separa props, estados, interacciones y contenido. Deja el valor de `size` sin correspondencia establecida e informa la evidencia que falta. Puede documentar y probar una candidata en una vista de verificación, pero no la usa como confirmada en una pantalla ni declara PASS sin comparación. El tipo solo demuestra admisibilidad.
- Con correspondencia explícita `Large -> lg`: devuelve `size="lg"` tras comprobar el tipo, activa hover mediante el navegador y localiza la API implementada para el contenido de `icon`. Para un estado `consumer` o `shared`, comprueba además su vía real de control. La correspondencia documentada no sustituye la comparación renderizada.
- No debe: pasar `Size`, `State` o `Icon` como props por ser ejes de Figma, inventar `hover` como prop, deducir `lg` de su nombre o agregar `codeValue` al contrato de ficha en este cambio.

## Correspondencia confirmada durante una importación

- Entrada: el agente importa una variante inequívoca `Size=Large` y propone una API nueva `size="lg"`. No existe un mapeo previo ni una decisión del usuario sobre el nombre del valor de código.
- Decisión esperada: registra la correspondencia como candidata en `usage.md`, escribe el tratamiento medido y renderiza esa configuración para compararla con la ref exacta de Figma. Tras resolver diferencias y comprobar los requisitos pertinentes, puede confirmar la correspondencia y alcanzar PASS sin pedir al usuario que dicte `lg`.
- Evidencia esperada: variante/ref Figma, props exactas, estados/interacciones y contenido, modos/configuración examinados, refs de captura o navegador y resultado de la comparación. La correspondencia y evidencia quedan en `usage.md`; el informe conserva el resultado actual y no convierte un PASS antiguo en garantía permanente.
- Sin navegador o evidencia Figma: conserva la candidata sin confirmar, informa NOT RUN y Overall NOT VERIFIED.
- No debe: usar el propio código nuevo como prueba de fidelidad, declarar PASS por pertenencia al tipo, ni bloquear solo porque aún no existe `codeValue`.

## Inventario file-level incompleto aunque coherente

- Entrada: los JSON y el estado son coherentes entre sí, pero Figma tiene colecciones o variables adicionales no ligadas al componente que faltan en la captura; otro intento agrupa las colecciones en `colors`, `spacing` y `typography`.
- Decisión esperada: compara los IDs con el inventario completo del file y reporta FAIL por la omisión o el agrupado artificial, aunque el validador local no descubra la diferencia. No confunde falta de captura JSON con variables FLOAT capturadas cuya emisión CSS sigue pendiente.
- Si no puede obtener el inventario completo: informa NOT RUN para la completitud, sin inferirla de un PASS estructural.
- No debe: limitar la captura a los bindings actuales ni tratar la consistencia interna como prueba de completitud frente a Figma.

## Vigencia de correspondencias documentadas

- Entrada: usage.md contiene JSON canónico con status confirmed, caseId y ruta/hash de un informe rendered-comparison; el TSX o la variante Figma cambiaron, o la revisión no es verificable.
- Decisión esperada: el agente no hereda el PASS. Conserva la evidencia histórica, trata el estado actual como `candidate` en el informe, indica qué debe revisar y compara la configuración actual antes de volver a confirmar. Propone la entrada con revisión y evidencia en las columnas fijas y solo la escribe dentro de una importación/actualización autorizada o por petición expresa de registrar el resultado; una fecha no sustituye esas pruebas.
- Sin correspondencias: mantiene el JSON con correspondences vacío y contabiliza refs/motivos en verification.unestablished. Cada caso fidelity establecido sí requiere su entrada. Tabla manual o None son errores, sin retrocompatibilidad.
- No debe: considerar que hashes/configuración conforme prueban el juicio visual, que confirmed garantiza vigencia, ni inventar revisiones.

## Consulta y validación sin escritura implícita

- Entrada: «valida esta UI» o «¿qué props usa este componente?»; una correspondencia antigua requiere revisión.
- Decisión esperada: el agente deja `usage.md` y la implementación sin cambios y entrega resultados y propuestas. Trata la correspondencia actual como candidata en el informe, sin rebajar automáticamente la entrada histórica.
- Con una importación/actualización autorizada o «registra el resultado en usage.md»: puede escribir las entradas dentro de ese alcance; registrar resultados no autoriza corregir código.
- No debe: considerar la activación de `validate-ds` como permiso para editar la ficha ni copiar la fila ficticia de la referencia como evidencia real.

## Valores calculados con ejes independientes y serialización

- Entrada: la colección `Layout` tiene modos `Compact` y `Wide`; una variable alias apunta a `Space/100` de otra colección, cuyos modos son `Base` y `Roomy`. Los ámbitos están decididos y la configuración examinada activa `Layout=Wide` y `Space=Roomy`. `Space/100` vale 8 en `Roomy` y tiene serialización `unit: px`; la instantánea resuelta del alias en origen conserva 4.
- Decisión esperada: el informe registra la activación y el modo de cada colección por ID. Sigue el alias hacia el modo activo del destino y compara con `8px`, no con `4`, `4px` ni un supuesto modo `Wide` en `Space`. Comprueba el resultado bajo la cascada real, no solo el orden de los bloques.
- Segunda entrada: una variable directa vale 50 y tiene decisión `scale` con factor `0.01` y unidad vacía. El esperado es `0.5`, no una unidad o conversión deducida de la propiedad CSS.
- Con un ámbito requerido en `null`: no inventa selector ni breakpoint, informa NOT RUN y Overall NOT VERIFIED para la configuración pendiente. Una serialización pendiente no autoriza consumir ni publicar el token.
- No debe: considerar suficiente un PASS de regeneración, comparar contra la custom property del mismo elemento ni usar el nombre del modo de origen para resolver el destino.

## Consulta de mapeo de solo lectura

- Entrada: el usuario pregunta «¿qué props implementan este botón?» y la ficha del componente tiene correspondencias `candidate` y `confirmed` en `usage.md`.
- Decisión esperada: map-figma-to-code lee el JSON, sigue caseId hasta la configuración y revisa informe/hashes/revisión frente a lo actual; devuelve props, estados, contenido, evidencia y dudas. Si necesita cambios, devuelve una propuesta sin editar.
- No debe: editar usage.md, metadata.json ni código en una consulta. Registrar el JSON exige importación/actualización autorizada o petición expresa; validar no autoriza escribir ni corregir implementación.

Estos casos especifican el comportamiento esperado; no prueban por sí solos la ejecución del agente. Su confirmación requiere evidencia Figma y una revisión real en navegador.

## Dimensiones De Texto Intrínsecas

- Entrada: texto con WIDTH_AND_HEIGHT, medida 12x24 y contenido de ejemplo F. Otro caso usa HEIGHT, ancho fijo 120 y contenido que puede envolver.
- Decisión esperada: el comando dimensions deriva por dimensión sus observaciones y comportamiento; la ficha registra todos los requisitos en evidence.textDimensions. WIDTH_AND_HEIGHT requiere content en ancho y alto; HEIGHT permite fixed en ancho, content en alto. Las traducciones incluyen la dimensión y las refs de sizing; no convierten 12x24 en medidas CSS fijas para toda inicial.
- El check debe fallar si falta el array o una dimensión, si se clasifica como fixed sin evidencia, si se registra un literal sobre una dimensión content (también approximate), o si el tratamiento no tiene declaración/traducción/delegación válida. Texto oculto con control de visibilidad no se excluye automáticamente.
- Con FILL, auto-resize desconocido o un binding que interfiera con sizing intrínseco: unknown y una duda explícita, o DS_GAP si bloquea una implementación fiel. No se inventan reglas de constraints o centrado.
- Cierre esperado: comparar F y su geometría con Figma; por separado probar W y M, en cada tamaño/forma aplicable, mediante la API real. Comprobar sizing, anclaje y clipping, sin exigir igual anchura para letras diferentes ni confirmar W/M como variantes Figma. Sin renderizado: NOT RUN/NOT VERIFIED. Las pruebas sintéticas del check no sustituyen estas pruebas de comportamiento.

## Recursos, Tipografía Y Vista Reproducible

- Registra .initial o inline-size y usa .initial.large { width:12px }: el contrato intrínseco debe detectar esa especialización y ambos sentidos físicos/lógicos; ámbitos condicionados/writing-mode incierto requieren revisión.
- apply con viewport, tratamiento o correspondencias inválidas debe fallar antes de escribir, dejando los bytes originales intactos. Una propuesta válida se publica atómicamente tras preparar el resto del DS.
- Informes v4: exige medida original exacta y PNG Figma con procedencia bajo verification/artifacts; código/JSON genérico, refs/viewport ajenos y falta de uno de los tipos no confirman.
- Cambia descripción/razones o un caso ajeno: la huella del caso confirmado sigue igual. Cambia medida, selector, recurso o configuración relevantes: caduca; hashes compartidos de código/CSS siguen siendo conservadores. Esto no prueba veracidad visual ni autenticidad.

- Deriva requisitos, materializa decisiones y comprueba que familia/estilo/refs, imageHash, datos dimensionales y figmaValue no se copian a mano. Una fuente idéntica aparece una vez; la equivalencia de segmento completo no borra rangos/overrides distintos.
- Dimensión content con width:12px local ganador: error de CSS; regla condicional o conflicto de cascada: NOT VERIFIED. Un motivo translation no evita el check.
- Fuente inexistente con checkResult true y faces vacío: no hay prueba de carga ni glifos. No se informa available.
- confirmed sin informe, con simple recibo measurement, artefacto corrupto o hash de evidencia incorrecto: error. Una configuración anterior o input modificado con evidencia íntegra queda NOT VERIFIED para la ejecución actual. Un informe conforme no prueba por sí solo fidelidad ni autenticidad.

- Omite lineHeight observado de un TEXT: verify-ds debe fallar aunque el resto de bindings/literales estén contabilizados.
- Cambia bytes de una fuente o asset declarado: debe fallar su SHA-256; un origen no disponible exige motivo y NOT VERIFIED, o DS_GAP si es esencial: una imagen visible `unresolved` falla `verify:imports` aunque sus confirmaciones estén vigentes, y un paint oculto no la bloquea. `verification.inputs` con el `usage.md` del componente o `design-system/verification/` se rechaza antes de escribir cualquier informe. Un paint oculto o segmento mixto no desaparece del inventario.
- Omite una variante de cases y unestablished, cambia contenido de un caso fidelity o inventa un modo: error de plan. Un caso behavior requiere base y texto alternativo, y no confirma una variante Figma.
- Abre la vista con viewport incorrecto: el recibo debe registrar viewportMatches false. Captura con F, W y M solo si son entradas válidas de la API; inspecciona el comportamiento sin exigir que todas las dimensiones cambien.
- Revisa la transferencia navegador/archivo: cuerpo original, tamaño/hash coincidentes y sin reescritura del agente. Hash incorrecto, sesión incorrecta o cuerpo mayor de 256 KiB deben rechazarse. El recibo siempre queda NOT VERIFIED.
- Cambia un input durante la sesión: el recibo identifica los nuevos hashes e inputsUnchangedSinceStart false, sin afirmar qué versión ejecutó el navegador. Reinicia antes de cerrar validación.
- Fuente declarada pero no cargada, imagen rota, estado no activado o contexto de app ausente: no hay PASS de fidelidad. Separa la conformidad del plan de la comparación visual contra Figma real.
## Geometría Y Recursos Generales

### Recogida Y Cierre Acotados

- Viewport distinto del caso: se muestran esperado/obtenido antes de enviar; collect falla sin POST. collect({diagnostic:true}) conserva un recibo no publicable y no completa el cierre.
- Pestaña sin frames o fuente que no termina: la recogida tiene fallback y timeout; el wait externo termina aunque la página se suspenda. Un recibo anterior al inicio de wait no satisface el intento nuevo.
- close con mediciones fidelity pero behavior ausente: pending y salida no cero. Un FAIL en otro caso prevalece como failed, conservando la lista de pendientes.
- Mediciones publicadas vigentes y comprobaciones satisfechas, sin juicio visual confirmado: measured, complete=false. No cambia usage ni metadata. Solo todas las confirmaciones actuales permiten confirmed/complete=true/salida 0.
- CSS/tokens/configuración cambian tras recoger: stale/pending, sin rejuvenecer evidencia. Artefacto corrupto: failed incluso si otro input caducó. Revisión manual de comportamiento no rescata NOT COMPARABLE.
- Alcance: el cierre cubre componente y dependencias; el diagnóstico de aplicación cubre App.tsx por separado. No afirmar calibración universal ni validación de valores sustituidos/dinámicos por un PASS de sintaxis literal.

### Diagnóstico Temprano De Recursos

- Tras capturar fuera del proyecto, requirements conserva sus requisitos y añade candidatos agrupados con nodos/variantes; pesos CSS y casos quedan pendientes, sin inferir essentiality. Pregunta por los orígenes autorizados necesarios antes del TSX, no después de construir todo. No bloquees por cada candidato oculto ni inventes paquetes.
- inspect no escribe ni exige código montado; verifica snapshot y registros existentes. Separa REGISTERED de configuración DECLARED/NOT VERIFIED y carga NOT RUN. Solo una declaración incondicional con el archivo registrado y descriptores coincidentes puede dar DECLARED; archivo o peso distintos no. Sigue imports CSS locales sin bucles; condiciones, errores de parseo y URLs externas no dan un enlace verificado. No confundir esa declaración con selección/carga real o glifos verificados.
- register calcula el hash de un archivo autorizado relativo al proyecto y solo modifica source existente. Una imagen con seis apariciones recibe la misma fuente en las seis, sin duplicar decisiones. Fuente desconocida, imagen sin identidad, entrada ausente/duplicada, ruta externa o snapshot inválido fallan sin escritura. Cambiar ruta o bytes registrados exige --replace explícito; repetir el registro conserva los bytes de metadata. Nunca instala, copia recursos o edita stylesheets.
- Diagnóstico, gate y finalización comparten acciones por recurso/casos y códigos estables. Sus comandos son argv con argumentos pendientes tipados, no permisos concedidos ni shell para ejecutar ciegamente. Sin imageHash pide recapturar; archivo cambiado pide revisar, no sustituir automáticamente. Colección pendiente no produce una revisión visual PASS.
- Un aviso estático de recurso sin resolver no autoriza confirmar: incluso una cara loaded no rescata source unresolved, y registrar el archivo no rescata una cara no cargada. Las imágenes esenciales siguen bloqueando tras resolver las fuentes. Conserva el diagnóstico del adaptador sin declarar completa la importación. El gate muestra el enlace CSS y acciones de revisión sin cambiar las reglas del comparador.
- Ejecuta npm run test:resources:mutations para las garantías de este bloque: baseline correcto, mutantes sintácticamente válidos en copia temporal y fallos de aserción observables. Supervivientes o problemas de infraestructura fallan el comando; nunca modifica el checkout ni convierte el resultado en cobertura exhaustiva.
- CSS por imports/reexports estáticos desde el componente o subpaths CSS exportados de paquetes instalados cuenta como declaración alcanzable sin ejecutar código. Imports type-only, dinámicos, globs, cualquier consulta ?, condiciones CSS y efectos de paquetes JS no cuentan: registra diagnósticos concretos y respeta rutas fuera del proyecto. Workers, sharedworkers, raw/url/inline, caché y consultas futuras se prueban tanto en JS como @import; no acredites el CSS de un worker en el documento del componente. Los inputs auditados solos nunca cuentan como carga.
- Un exports con require antes de import no puede acreditar require.css para un import JS o CSS. Respetar claves exactas, comodines y exclusiones null sin fallback físico. Un destino distinto por browser/module, development/production o style opcional en @import queda NOT VERIFIED; una rama estable puede acreditarse. Probar anidados, arrays ambiguos, campos desconocidos, browser remapping, subpaths scoped y objetivos no existentes/fuera del proyecto. No ejecutar JS del paquete ni configuración del proyecto para resolverlos.
- Las URLs remotas en imágenes JSX o new URL no generan avisos de import CSS. Los imports/reexports externos siguen NOT VERIFIED, y los imports dinámicos/require externos conservan un diagnóstico específico; no silenciarlos para eliminar ruido de assets. Probar HTTPS, URLs relativas al protocolo y data sin red ni ejecución del componente.
- Con dos componentes, gate y finalización deduplican acciones idénticas uniendo targets (rutas de las fichas), sin mezclar comandos distintos ni mutar las entradas. Los avisos de fuentes aparecen tanto en su detalle como en warnings globales prefijados por componente. Los pesos registrados solo pueden ser cadenas numéricas concretas 1..1000, normal o bold; rangos y valores relativos fallan el plan/registro sin modificar source. Un @font-face con rango sí puede satisfacer un peso concreto.
- Regresión con Chromium: una hoja stylesheets ausente falla el preflight; un import CSS del componente roto no publica medidas de un montaje inexistente; un archivo de fuente con hash válido pero bytes no decodificables produce caras error y nunca complete. Se pueden conservar sus medidas diagnósticas. Comprueba también la vigencia por la nueva versión del comparador compartido, sin cambiar versiones históricas de medición.

### Cobertura Y Regresión En Navegador

- Ejecución local, sin pipeline ni hooks instalados: los fixtures versionados deben reproducir los fallos sin depender de una rama local de Tooltip. No afirmar bloqueo automático de commits/pushes por el código de salida del gate.
- Recoger sin puerto explícito asigna uno libre y guarda puerto/URL efectivos en collection.preview/result.json. Un --port ocupado da NOT RUN y conserva el servidor ajeno; inválidos, duplicados o --port junto a --reviews/--check se rechazan antes de escribir o arrancar. La vista se cierra al terminar.

- Una demo con entrada main/index o nombre personalizado desde index.html no puede omitir el diagnóstico por no existir App.tsx: conservar application.signals y exigir Chromium. Un index.html sin scaffold falla, no pasa como kit vacío. Fallos de arranque/cierre del navegador conservan los resultados de estructura y componentes.
- Incluir el propio usage.md en verification.inputs, inputs del revisor o dependencias examinadas debe fallar antes de publicar informes o cambiar usage. Diferencias de tamaño AABB usan un umbral diagnóstico independiente: cambiar la tolerancia de posición no suprime el aviso ni cambia los estados objetivos.

- Finalización integrada: collect publica medidas sin inventar PASS; reviews exige una revisión explícita por caso fidelity, genera informes y hashes, revalida y actualiza solo el JSON de usage.md. Conserva Use/Do not, comentarios ajenos y metadata; repetir la misma revisión es idempotente. Reviews duplicadas, incompletas, FAIL o con geometría objetiva fallida no modifican usage ni generan informes. --check es de solo lectura y nunca acepta candidatos.
- El cierre conserva avisos estáticos de bordes parciales/implícitos sin elevarlos automáticamente a FAIL. Un vector con centro correcto y tamaño AABB distinto conserva posición PASS y geometría NOT COMPARABLE, pero muestra el delta como diagnóstico. No certificar su forma. Las fuentes esenciales pendientes se agrupan por requisito y casos afectados, con petición de origen autorizado, sin inventar paquetes.

- Gate de entrega `npm run verify:imports`: un kit vacío pasa como NOT APPLICABLE y un scaffold coherente sin componentes puede pasar; un scaffold parcial o una discrepancia inventario/mapa/fichas falla. Archivos de sistema como .DS_Store no cuentan como importación. Un componente sin resumen o sin casos de fidelidad falla, sin aprobado por conjunto vacío.
- Candidatos estáticamente válidos, confirmaciones caducadas, artefactos corruptos y comportamiento obligatorio no superado no permiten entregar. Una confirmación vigente se revalida localmente desde los informes persistidos, sin medir geometría de nuevo y sin un manifiesto nuevo. El gate no modifica metadata ni usage ni promueve correspondencias.
- El diagnóstico independiente de la demo ejecuta CSS.supports en una página en blanco del Chromium fijado, aunque la evidencia del componente sea inválida. No ejecuta módulos del proyecto ni Vite; un literal display con comillas internas falla, padding numérico válido pasa. Sin navegador el resultado es NOT RUN y falla el gate, conservando los fallos del componente. No afirmar validez universal, ejecución React o fidelidad visual a partir de ese diagnóstico.

- Omite un nodo visible o un contenedor del mapa de partes: el plan falla. same-layout-box solo se acepta con caja/matriz coincidentes y sin efectos/controles propios; clipping, opacidad o pintura impiden agrupar. unresolved produce NOT RUN que no puede rescatar checkReviews.
- Una instancia delegada sigue necesitando su caja exterior mapeada. Oculto con propiedad visible o binding de opacidad no autoriza permanently-hidden.
- Introduce border-style sin reiniciar todos sus bordes y color: aviso de valores iniciales/cascada, no prohibición universal. Introduce display con comillas internas en App.tsx: CSS.supports=false en diagnóstico de app, sin contaminar el cierre del componente.
- Cambia/elimina resultados CSS de una medición: el gate exige los IDs actuales y no declara PASS por ausencia. Variables var()/env() no se presentan como validadas por sintaxis.
- Regresión real obligatoria: tras npm run test:browser:setup, npm test incluye Chromium fijado sin variables especiales. La ausencia de runtime/binario falla, nunca omite pruebas. El fixture defectuoso pasa por preview, navegador, transferencia, publish y close: falla por geometría. Corregir el borde elimina ese fallo, pero queda pending hasta la revisión específica de la tipografía provisional; nunca genera confirmed automático. El error inline de App sigue separado. npm run test:unit no representa este recorrido real.
- El corpus de 56 combinaciones de texto/tamaño/peso verifica caras cargadas y repetibilidad en dos contextos aislados del mismo Chromium. Conserva hashes y medidas; no usa un ground truth de Figma ni establece tolerancia universal. Un TEXT dentro del margen necesita revisión específica geometry:PARTE para medirse/confirmarse; fuera del margen sigue siendo FAIL sin excepción manual.
- Un fallo estático conserva el titular failed y enumera mediciones ausentes; las aportadas quedan sin evaluar, nunca implícitamente vigentes. Casos mal formados no permiten inventar cobertura pendiente.
- El adaptador no lanza navegador ante evidencia/plan inválidos: persiste el cierre failed y pendientes, con execution en static-validation y salida 1. Ante binario ausente persiste execution NOT RUN en browser-launch y salida 2; el puerto de preview debe quedar libre. Directorios de salida con contenido o una reserva ajena se rechazan antes de leer la ficha o medir, conservando sus bytes. Reutilizar una salida anterior no espera al final de la ejecución para fallar.
- Una reserva que sobrevive a su proceso se inspecciona sin cambios, por API y CLI. PID visible no prueba identidad; PID no visible, otra máquina y formato ilegible nunca autorizan borrar. La colisión aporta DS_OUTPUT_RESERVED y orientación para usar una salida nueva. Prueba que los bytes del lock y los resultados previos permanecen intactos al inspeccionar y reintentar en otra carpeta.
- application mantiene status/reason también cuando el navegador devuelve resultados: literal inválido da FAIL, extensión sin verificar NOT VERIFIED, números React válidos PASS y bloqueo de arranque NOT RUN. execution COMPLETED no equivale a PASS. La documentación no fija versiones de medición antiguas; remite a MEASUREMENT_VERSION y al productor.
- El runner acumula contadores estructurados de ambos perfiles, incluidos subtests, y muestra el total final. Un fallo unitario deja browser NOT RUN; unit-only indica browser NOT REQUESTED. Un resumen ausente o mal formado no permite una salida correcta ni inventa contadores. Los recursos de test del kit no se copian al scaffold generado.
- Comprueba en Chromium números inline positivos/negativos, cero y propiedades sin unidad; no deben generar avisos de expresión dinámica. Una declaración inválida dentro de @supports inactivo no bloquea como FAIL; la misma declaración bajo una condición activa sí. Una extensión de otro motor no soportada queda NOT COMPARABLE, no inválida universalmente; la sintaxis literal ordinaria inválida sigue fallando. La aplicación usa los mismos estados contextuales, no solo el booleano bruto de CSS.supports.
- La calibración sobre fuente explícita registra hashes/caras cargadas y deltas, sin modificar el componente. Una discrepancia mayor que el margen sigue siendo discrepancia: no se amplía la tolerancia ni se afirma igualdad binaria con Figma a partir de un único caso.

- Cambiar solo reason/scope conserva confirmed; modificar un valor o tolerancia bajo la misma versión es inconsistencia. Otra comparatorVersion produce candidate/NOT VERIFIED, sin ocultar un PNG/recibo corrupto.
- Un vector rotado con centro correcto puede tener position PASS y geometry NOT COMPARABLE. Moverlo al borde opuesto da position FAIL; ninguna revisión de forma lo rescata. Perspectiva/3D o raíz transformada no admiten comparación parcial inventada.
- Declarar contained, anchored, centered (center y preserve-offset en x/y) y relaciones grow/equal en casos behavior; comparar con mediciones actuales/base sin copiar la caja fuente. Falta de baseline da NOT RUN donde se necesita. Texto DOM que no coincide con la configuración, desbordamiento o anclaje cambiado da FAIL.

- Capturar con v2 cajas/matrices absolutas sin transcripción; una captura v1 falla y exige recaptura. Null y errores de lectura no se convierten en coordenadas.
- En fixtures sintéticos, comparar un hijo absoluto en el borde equivocado, una alineación distinta por variante, texto congelado al ancho del ejemplo y un trazo INSIDE convertido en borde que añade tamaño. Cada diferencia numérica fuera de tolerancia debe ser FAIL y bloquear confirmed aunque el juicio general diga PASS.
- Probar vector rotado, ancestro rotado/escalado/reflejado, grupo intermedio y matriz singular. Deben quedar NOT COMPARABLE con motivo, no dar PASS ni reconstruir una forma desde el AABB.
- Probar ancestro oculto: se admite DOM ausente u oculto, no contenido visible; no se exige idéntica estructura DOM. Behavior no hereda cajas exactas de fidelity.
- Una fuente esencial pendiente o sin cara loaded del peso/estilo requeridos impide confirmar ese caso; no bloquea guardar/publicar medidas diagnósticas. La carga no prueba la fuente de los glifos.
- Un informe v4 sin renderChecks, con checks alterados o sin checkReviews específicos para los no comparables debe rechazarse al producirlo o al verificarlo. Los informes caducados conservan NOT VERIFIED. Omitir una medición behavior asociada, fallar una invariante o dejarla NOT RUN/NOT COMPARABLE bloquea confirmed; el juicio general no lo rescata. Cambiar su plan/cobertura/versión caduca sin ocultar corrupción de los artefactos. Cambiar una regla o tolerancia sin registrar nueva versión debe fallar el test de huella; corregir prosa del comparador no. Mutar renderRequirements/textDimensionRequirements debe activar la guarda del comparador; mutar renderedExpectation solo la del productor. Helpers nuevos entran en la clausura y formas no soportadas fallan explícitamente. measurementVersion anterior en una medida fidelity o behavior caduca sin ocultar corrupción; cuerpo/recibo sin versión o discrepantes son inválidos. Una obligación NOT RUN/NOT COMPARABLE mantiene candidate/NOT VERIFIED sin afirmar un defecto visual.
- El cierre informa conformidad estática y cobertura visual separadas: candidatos sin medición no son PASS, ni diferencias visuales demostradas. Fixtures y navegador/Figma reales son validaciones distintas.
- Una parte solo mapeada en otras variantes, con la cobertura de nodos completa, produce absence:PARTE (PASS si no se renderiza, FAIL si se ve) y no exige revisión específica; con un nodo sin cubrir, sin variante mapeada o sin mapeo alguno sigue NOT COMPARABLE. Un caso cuyas props no producen una parte esperada falla con una pista sobre props y data-ds-part.
- Un check de comportamiento NOT COMPARABLE o NOT RUN genera RESOLVE_BEHAVIOR_CHECKS, sin comando y sin permitir reviews: no se inventa una relación para que pase. Las diferencias FAIL siguen en REVIEW_RENDERED_DIFFERENCES y los resultados de fuentes no cuentan como diferencias.
- Un archivo de imagen idéntico byte a byte al relleno original informa MATCHES_FIGMA_IMAGE_HASH (SHA-1 igual al imageHash); uno distinto sigue pudiendo registrarse y solo informa DIFFERS_FROM_FIGMA_IMAGE_HASH. Nada de esto se escribe en la ficha ni sustituye la aprobación.
- Un nodo vectorial observado aparece en `vectors` con representación sin determinar y genera EXPORT_VECTOR_SOURCES sin `--approve-connection`. El colector exporta también los ocultos y conserva `renderBounds`; el sobre sellado rechaza hash alterado, campos desconocidos, otro origen o nodo y todo SVG incompleto, con DOCTYPE, `style`, elementos activos, manejadores, otro espacio de nombres, `xml:base` o referencias externas (también ocultas tras entidades XML, escapes CSS como `u\72l(` o funciones como `image-set()`), y `svg` nunca sobrescribe un archivo. Sellar un SVG no lo vuelve seguro para insertar en línea. Reconstruir el vector con CSS no se da por equivalente: exige aprobación y revisión visual.
- La fecha del sobre vectorial se valida como ISO UTC canónico al sellar y al leer: una fecha abreviada, sin milisegundos, con offset o imposible se rechaza. Cambiar solo una fecha canónica no cambia el hash del contenido. La declaración XML se acepta, pero una instrucción `xml-stylesheet` se rechaza. La obligación del agente de usar la exportación original no equivale a un check de uso del archivo en la implementación.
- El residuo de píxeles por región ordena zonas por diferencia tras alinear cada una, siempre NOT VERIFIED: un pico sin contorno destaca frente a las demás partes y el mismo pico corregido baja pero sigue siendo la región más alta. No define umbrales ni se conecta a --diagnose; requiere dos imágenes a la misma escala y una exportación de Figma con los límites de renderizado. Su coste se presupuesta antes de empezar (rechazo previo, 256 regiones como máximo, 8 megapíxeles) y la búsqueda con descarte temprano devuelve exactamente lo mismo que un recorrido completo. Un candidato totalmente distinto (blanco frente a negro), recortado o desplazado fuera de la imagen da diferencia total con `coveragePercent` bajo, nunca 0 %; un PNG pequeño que declare dimensiones enormes, entrelazado o con cabecera inválida se rechaza antes de decodificar.
