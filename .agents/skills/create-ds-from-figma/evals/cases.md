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
- Debe producir: scaffold, tokens por colección, ficha, código, mapa, estado e inventario coherentes; checks ejecutados y resultado explícito.
- No debe: generar pantallas, otros componentes del file, tokens de ejemplo ni copiar recursos auxiliares de `.agents/`.

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
