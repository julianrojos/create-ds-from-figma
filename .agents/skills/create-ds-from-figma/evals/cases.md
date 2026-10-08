# Casos de evaluación de create-ds-from-figma

Estos casos describen decisiones observables, no sustituyen una ejecución real con Figma. Para cada prueba, registra la URL, refs consultados, diagnóstico, archivos modificados y resultados de los checks. Ejecútalos en una rama que el usuario haya seleccionado; no cambies de rama por cuenta del kit.

## Enrutado de skills

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

- Entrada: repo sin `figma-code-map.json` ni `tokens.css`; URL de un componente local con variables del file resueltas y sin anidados locales `missing`.
- Decisión esperada: modo primera vez; diagnóstico completo antes de escribir; importa solo el componente solicitado y todas las colecciones de variables del file.
- Debe producir: scaffold con `index.html` y `tsconfig.json`, tokens por colección, ficha, código, mapa, estado e inventario coherentes; checks ejecutados y resultado explícito. Amplía el `package.json` existente con Vite/React y scripts de app, actualiza su lockfile y conserva `npm test`, `yaml`, las demás dependencias y `.gitignore`.
- No debe: reemplazar `package.json` o `package-lock.json` desde un starter, generar pantallas, otros componentes del file, tokens de ejemplo ni copiar recursos auxiliares de `.agents/`.

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

- Entrada: un nodo de texto usa un estilo `TEXT` identificable, pero su altura de línea procede de `REST.lineHeightPercentFontSize = 124.874997...`; la herramienta no prueba si esa propiedad procede del estilo o de un override.
- Decisión esperada: `styles` registra ID, nombre, file y nodo; el literal conserva `figmaValue` bruto, `translation: approximate`, `styleRef` y `styleOrigin: unknown`. No redondea en silencio ni inventa un origen. `verify-bindings` deja `writtenStatus: PASS` solo si coincide el CSS y `status: NOT_RUN` hasta la comparación renderizada.
- Cierre esperado: `validate-ds` obtiene el tamaño de fuente de Figma independientemente, calcula la expectativa solo para ese par `(REST, lineHeightPercentFontSize)` y compara el valor calculado en navegador para las configuraciones pertinentes; informa resultado estático, calculado y visual por separado.
- No debe: considerar cualquier porcentaje como porcentaje del tamaño de fuente, ni convertir un `NOT_RUN` estático en PASS sin prueba renderizada.

## AUTO y procedencia de estilo no disponible

- Entrada: Figma devuelve `AUTO` para line-height y la herramienta no devuelve el ID del estilo, pero sí los valores esenciales del nodo.
- Decisión esperada: `figmaCoverage.styles` queda `unavailable` con la llamada intentada y el motivo (la captura de procedencia es `NOT RUN`), y `styles` vacío; no bloquea la importación solo por faltar procedencia ni degrada por sí solo el Overall. Si el CSS usa `normal`, el literal registra `translation: approximate` y `figmaValue` con `source`, `field` y `value: AUTO`.
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

- Entrada: `usage.md` contiene una tabla en `## Figma to code correspondences` con `Status: confirmed`, una configuración examinada y evidencia de una revisión anterior; el TSX o la variante Figma relevante cambiaron, o no se puede establecer qué revisión se examinó.
- Decisión esperada: el agente no hereda el PASS. Conserva la evidencia histórica, trata el estado actual como `candidate` en el informe, indica qué debe revisar y compara la configuración actual antes de volver a confirmar. Propone la entrada con revisión y evidencia en las columnas fijas y solo la escribe dentro de una importación/actualización autorizada o por petición expresa de registrar el resultado; una fecha no sustituye esas pruebas.
- Sin correspondencias: mantiene la sección y escribe `None:` seguido del motivo concreto; no deja una tabla vacía sin explicación ni copia marcadores o frases de la plantilla como razón. El check rechaza `None con el motivo real`, `None: <motivo real>` y `None: pendiente`.
- No debe: considerar que el detector de relleno valida la tabla, que `confirmed` garantiza vigencia, ni inventar una revisión para completar la documentación.

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
- Decisión esperada: `map-figma-to-code` lee la tabla, comprueba la revisión y la configuración documentadas frente a las actuales, y devuelve el diagnóstico: props de código con su evidencia, estados, interacciones, contenido y correspondencias sin resolver. Si una correspondencia debería crearse o actualizarse, devuelve la entrada propuesta.
- No debe: editar `usage.md`, `metadata.json` ni código por haber hecho la consulta. Escribir la tabla requiere una importación/actualización autorizada del componente o una petición expresa de registrar el resultado; pedir una validación independiente no autoriza esa escritura ni correcciones de implementación.

Estos casos especifican el comportamiento esperado; no prueban por sí solos la ejecución del agente. Su confirmación requiere evidencia Figma y una revisión real en navegador.
