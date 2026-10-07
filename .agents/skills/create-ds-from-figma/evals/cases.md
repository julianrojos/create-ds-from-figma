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
