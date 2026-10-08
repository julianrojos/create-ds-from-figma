# Formato de tokens

Consulta esta referencia durante el inventario previo de variables y antes de escribir los JSON de colección y `src/styles/tokens.css`. La política de bloqueo está en `../SKILL.md`.

### Forma de cada JSON de `design-system/tokens/`

El nombre se asigna una sola vez con `scripts/preflight-token-files.mjs` durante el preanálisis. Pasa por stdin `{ "tokenPrefix": "<opcional>", "collections": [{ "id": "<VariableCollectionId>", "name": "<nombre en Figma>", "variables": [{ "id": "<VariableID>", "name": "<nombre en Figma>" }] }] }` para **todas** las colecciones del file con **todas** sus variables; el script lee `figma-state.json` y los JSON existentes si los hay y rechaza archivos huérfanos. Si termina bien, stdout contiene `{ "tokenPrefix": { "value": "ds", "source": "default | input | state" }, "files": { "<ID>": "<archivo>.json" }, "variables": { "<VariableID>": "--ds-..." }, "diagnostics": { "missingRegistered": [], "registeredIdsNotInInput": [] } }`; cada diagnóstico es `{ "id": "<ID>", "file": "<archivo>.json" }`.

`files` conserva los nombres de IDs existentes aunque Figma cambie `name`. `registeredIdsNotInInput` indica únicamente que un ID del estado no está en la entrada de este preflight; su archivo se conserva, sin inferir cambios en Figma. `missingRegistered` solo admite reconstruir el JSON de una colección que antes tenía cero variables y cuyo ID está en la entrada; si tenía variables, el preflight bloquea la importación porque Figma no permite recuperar sus `cssName` ya publicados. Restaura ese JSON antes de continuar. El script muestra los avisos por stderr, pero decide a partir del JSON. Si faltan tanto el archivo como su ID en la entrada, falla. No inventes rutas ni vuelvas a calcularlas a mano al escribir. Copia el nombre de `files[<ID>]` a `figma-state.json.collections[<ID>].file` y guarda el nombre original de Figma en `collection`. Copia `variables[<VariableID>]` al `cssName` de cada variable y `tokenPrefix.value` a `figma-state.json.tokenPrefix` en la primera importación.

Para una colección nueva, el preflight conserva los espacios y sustituye `/ \\ : * ? " < > |` y controles por `-`; recorta puntos y espacios finales. Si la base queda vacía, es reservada, empieza por espacio o supera el límite portable de 255 bytes, usa `Collection`. Añade un sufijo con el ID codificado en `%HH` por byte UTF-8 (incluido `%`) cuando la base no sea utilizable, cuando el recorte de puntos o espacios finales cambie el nombre (`Size.` → `Size (<ID>).json`), o cuando colisione con otra colección nueva o un archivo existente. La sustitución de caracteres inseguros por `-` no exige sufijo por sí sola. Las colecciones nuevas del mismo grupo reciben todas sufijo; las existentes nunca se renombran solo por una colisión nueva. Si dos nombres finales aún coinciden sin distinguir mayúsculas, el preflight falla antes de escribir.

```json
{
  "collection": "<nombre en Figma>",
  "id": "<VariableCollectionId:...>",
  "modes": ["<mode>", "..."],
  "defaultMode": "<modo por defecto observado en Figma>",
  "variables": {
    "<nombre en Figma>": {
      "id": "VariableID:...",
      "cssName": "--nombre-unico",
      "type": "COLOR | FLOAT | STRING | BOOLEAN",
      "valuesByMode": {
        "<mode>": "<valor directo>"
      }
    }
  }
}
```

`cssName` es la custom property única y estable asignada a ese ID por el preflight (ver «Nombres de las custom properties»); anótala también en `tokens.css`. `defaultMode` es el modo por defecto que devuelve Figma para esa colección, no el primer nombre de `modes` por convención; `:root` usa sus valores. No deduzcas el ID a partir del nombre CSS ni cambies `cssName` al importar otro componente. El validador detecta nombres duplicados, bindings cuyo ID no figure en el inventario local o en `externalVariables`, diferencias frente al modo base en `:root` y bloques de modos con ámbitos decididos; el valor efectivo en el navegador se comprueba por separado. El proyecto generado instala `postcss` y `postcss-selector-parser` como dependencias de desarrollo para `verify-ds` y `verify-bindings`; instala las dependencias antes de ejecutar cualquiera de los tres checks.

Los valores directos y los `value` resueltos de alias conservan el tipo de la variable:

| `type` | Formato en JSON |
| --- | --- |
| `COLOR` | `#RRGGBB` o `#RRGGBBAA`; convierte el RGB(A) de Figma (canales 0–1) a hexadecimal y conserva el alfa cuando no sea opaco |
| `FLOAT` | Número finito |
| `STRING` | Cadena; puede ser `""` |
| `BOOLEAN` | `true` o `false` |

Las claves de `valuesByMode` deben ser exactamente los nombres de `modes` de esa colección, sin modos ausentes ni adicionales. Resuelve cualquier valor pendiente antes de escribir; si no puedes, informa `DS_GAP`.

Cuando el valor sea un alias, sustituye el valor directo por un objeto con `targetVariableId`, `source` y `value`; `alias` es opcional si Figma no devuelve el nombre:

```json
{
  "alias": "lib/blue",
  "targetVariableId": "VariableID:123:456",
  "source": "external",
  "value": "#0000FF"
}
```

Mismos nombres que en Figma. Para cada alias guarda el ID de destino que devuelve Figma y el valor resuelto por modo. `alias` (el nombre del destino) es opcional tanto para alias locales como externos; para uno local, el nombre se obtiene del inventario mediante `targetVariableId` y, si `alias` está presente, debe coincidir. Marca `source: "local"` solo si `targetVariableId` está en el inventario local del file; en otro caso marca `external` y consérvalo como dependencia externa, no como variable local inventada. No deduzcas el origen por el nombre. Si no puedes obtener el ID o el valor resuelto, declara la laguna y aplica la fila `DS_GAP` de la tabla antes de generar tokens. Un objeto de valor representa siempre un alias y debe tener `targetVariableId`, `source` y `value`. La serialización de un `FLOAT` depende de la decisión registrada más abajo, no de que el valor parezca una longitud.

`src/styles/tokens.css` es un producto de compilación: no se edita a mano. Lo genera `scripts/generate-tokens-css.mjs` a partir de los JSON de tokens, `figma-state.json` y las instantáneas `externalVariables` de las fichas registradas en `figma-code-map.json`; registra el componente en el mapa antes de generarlo. `verify-ds` falla si el archivo difiere de la salida generada. Empieza con una cabecera fija, sigue con un único `:root` con las variables de cada colección (por nombre de archivo, en el orden del JSON; los modos predeterminados) y las instantáneas externas ordenadas por nombre, y después un bloque por cada modo con ámbito decidido, que lista solo las variables cuyo valor difiere del modo predeterminado (los `selector` en el orden de `modes` y los `media` por `order`). La salida no depende del orden de las entradas ni lleva fechas. Para cada variable:

| Valor | Salida |
| --- | --- |
| `COLOR` | el hexadecimal tal como está en el JSON |
| `STRING` | cadena CSS con comillas dobles (`"Inter"`), con `\`, `"` y los caracteres de control escapados |
| `BOOLEAN` | `true` o `false` |
| `FLOAT` | solo con decisión de serialización (`4px`); sin decisión no se escribe |
| alias local | `var(--destino)`; un `FLOAT` solo si su serialización está decidida |
| alias externo | su valor resuelto de ese modo |

Las variables externas de tipo `FLOAT` tampoco se escriben todavía y ningún `binding` puede usarlas, porque no tienen una decisión de serialización. Si las fuentes son inconsistentes (un alias sin destino, un ciclo de alias locales —también hacia sí mismo— en un modo o entre modos de colecciones distintas cuyos ámbitos coexisten con seguridad (un atributo distinto, o un selector con una media query), un JSON sin entrada en el estado, serializaciones en conflicto) el generador falla sin escribir nada. `--check` compara sin escribir. Si los ámbitos de los modos de un ciclo se excluyen (mismo atributo con otro valor, como `:root[data-theme="dark"]` y `:root[data-theme="light"]`) no hay ciclo; si no se puede demostrar ni que coexisten ni que se excluyen (dos media queries, selectores complejos), es un aviso NOT VERIFIED y no bloquea. Un modo con ámbito pendiente (`null`) no escribe CSS y no cuenta.

### Nombres de las custom properties (`cssName`)

El preflight asigna el `cssName` de cada variable nueva; no lo calcules a mano. El nombre es `--<prefijo>-<colección>-<ruta>`, donde:

- **Prefijo (`tokenPrefix`).** Solo letras minúsculas ASCII, dígitos y guiones sueltos, empieza por letra y tiene como máximo 20 caracteres. En un DS nuevo el preflight propone `ds`; el usuario puede indicar otro en su primer mensaje. Comunícalo en el diagnóstico sin esperar respuesta. La primera importación lo escribe en `figma-state.json.tokenPrefix`, también si solo hay variables externas, y el flujo no lo cambia después sin una migración explícita. Un prefijo pedido que difiera del fijado hace fallar el preflight. Si ya hay tokens, colecciones, declaraciones `--*` en `tokens.css` o componentes importados y `tokenPrefix` es `null`, el estado es inconsistente: el preflight y `verify-ds` fallan y piden reparar el estado de forma explícita; pasar un prefijo no lo arregla.
- **Colección y ruta.** Cada una se normaliza como un solo segmento: NFKD sin marcas diacríticas, minúsculas, cada secuencia de caracteres fuera de `[a-z0-9]` pasa a un único `-` y se quitan los guiones de los extremos. No se separa camelCase (`fontSize` → `fontsize`). Si un segmento queda vacío se usa `collection` o `variable` y el nombre lleva sufijo.
- **Sufijo.** `-` más el `id` de la variable, donde `[A-Za-z0-9-]` se escribe tal cual, `_` pasa a `__` y cualquier otro byte UTF-8 a `_` más dos dígitos hexadecimales en minúscula; es inyectivo y no se recorta nunca. Se añade cuando dos variables nuevas producen el mismo nombre (todas lo reciben), cuando el nombre choca con uno ya asignado o reservado (solo lo recibe la nueva) o cuando supera 120 caracteres (la base se recorta antes del sufijo; si el sufijo no cabe, el preflight falla).
- **Estabilidad.** Un `cssName` ya asignado a un `id` no se recalcula, aunque Figma renombre la variable o su colección; el flujo lo conserva y un cambio manual coordinado no lo detecta ningún validador. Se reservan los `cssName` locales y externos y cualquier declaración `--*` de `tokens.css` sin dueño conocido. Las variables externas no usan el prefijo.

Ejemplos (los comprueban los tests desde `.agents/checks/tests/fixtures/css-names.json`, que contiene más casos):

| Colección y variable | `cssName` |
| --- | --- |
| `Color Primitives` · `Slate/100` | `--ds-color-primitives-slate-100` |
| `Tamaño` · `Font Size` | `--ds-tamano-font-size` |
| `Color` · `Brand/Primary` y `Color` · `Brand Primary` (nuevas, mismo nombre) | `--ds-color-brand-primary-VariableID_3a1_3a2` y `--ds-color-brand-primary-VariableID_3a1_3a3` |
| variable con `cssName` ya asignado, colección renombrada en Figma | se conserva el nombre asignado |

### Modos y ámbitos CSS

Figma da el nombre de cada modo, pero no el selector ni la media query que lo activa. Esa correspondencia es una decisión de integración y se guarda en `figma-state.json.collections[<ID>].modeScopes`, con una entrada por cada modo **no predeterminado** (el predeterminado vive siempre en `:root` y no tiene entrada):

- `null`: decisión pendiente. El modo queda NOT VERIFIED y no se inventa ningún CSS para él. Es el valor al importar una colección nueva hasta que el usuario decida.
- `{ "kind": "selector", "value": "[data-theme=\"dark\"]" }`: un solo selector (no `:root` a secas ni una lista), que se emite después del `:root` base. Para igualar la especificidad con `:root` conviene un selector con atributo o clase; gana el que va después.
- `{ "kind": "media", "query": "(min-width: 768px)", "order": 1 }`: bloque `@media` con una regla `:root` dentro. `order` es un entero desde 1, único en la colección, y los bloques van en ese orden.

Pregunta al usuario **una vez por colección**, no una convención universal: una colección de tema y una de puntos de ruptura (`Responsive`) necesitan decisiones distintas. No decidas tú el selector. Si Figma renombra un modo, su entrada queda huérfana o falta; `verify-ds` lo detecta solo después de actualizar el JSON, nunca antes. El generador emite en `tokens.css`, tras el `:root` base, un bloque por cada modo con ámbito que declara únicamente las variables cuyo valor difiere del modo predeterminado; un alias local usa `var(--destino)` del destino de ese modo y un alias externo, su valor resuelto de ese modo.

`verify-ds` comprueba esos bloques para variables `COLOR` y `FLOAT` con decisión; `STRING` y `BOOLEAN` por modo los cubre solo la comparación con la salida generada. Que el CSS sea correcto no demuestra el valor efectivo en el navegador: eso lo comprueba `validate-ds` con valores calculados en cada modo.

### Serialización de variables `FLOAT`

Figma guarda un número sin unidad y una custom property solo puede tener una serialización, así que la unidad es una decisión registrada y no una suposición. No la deduzcas del nombre de la propiedad CSS que usará el componente ni de los `scopes` de Figma: los `scopes` indican dónde aparece la variable en el selector de la interfaz, pueden ser varios o `ALL_SCOPES` y no determinan la unidad. Si los guardas, ponlos en la variable del JSON como `scopes` (lista de los nombres que devuelve Figma): es evidencia observada, nada más.

La decisión vive en `figma-state.json.collections[<ID>].serialization[<VariableID>]`, nunca en el JSON de tokens:

- `css`: `{ "kind": "unit", "unit": "px" }` (unidades `px`, `rem`, `em`, `%`, `ms`, `s`, `deg`), `{ "kind": "unitless" }` o `{ "kind": "scale", "factor": 0.01, "unit": "" }` si el valor de Figma necesita una conversión de escala.
- `source`: `{ "type": "bindings", "evidence": [{ "node": "<ref>", "figmaProperty": "<propiedad de Figma>", "mode": "<modo>" }] }` con **todos** los usos observados, o `{ "type": "user" }` si lo confirmó el usuario.

Cuándo decidir: solo para las variables `FLOAT` que un `binding` del componente que importas usa, y con la propiedad de Figma observada. Las propiedades de dimensión de Figma (relleno, `itemSpacing`, radios, `strokeWeight`, `fontSize`, anchos y altos) están en píxeles; `fontWeight` es un número sin unidad. Esta lista es orientativa: ante cualquier otra propiedad (`letterSpacing`, `lineHeight`, opacidad, ángulos…), cuya unidad o escala puede variar según el nodo o el campo, no elijas: pregunta al usuario. Si los usos de una misma variable exigen serializaciones incompatibles, no escribas ninguna y comunica el conflicto.

Una variable `FLOAT` sin decisión está **pendiente**: no se escribe en `tokens.css` (publicar un número sin unidad crearía una API que luego habría que cambiar), `verify-ds` avisa de que está NOT VERIFIED y ningún `binding` puede usarla. No tiene valor por defecto. Una variable cuyos modos son todos alias locales no tiene entrada: hereda la serialización de sus destinos, queda pendiente si alguno lo está y es un conflicto si dos destinos tienen serializaciones distintas. Una variable con decisión propia que en algún modo es alias local (valor directo en unos modos y alias en otros) solo puede apuntar a un destino que también esté decidido y con la misma serialización; si no, el generador y `verify-ds` fallan, porque `var(--destino)` apuntaría a una propiedad que no se escribe o con otra unidad. Una decisión ya escrita no se cambia al aparecer otro uso: revísala de forma explícita con el usuario.

Con decisión, `tokens.css` lleva exactamente el valor serializado (`4px`, no `4`) en `:root` y en los bloques de modo, y `verify-ds` lo comprueba. `STRING` y `BOOLEAN` se emiten según la tabla anterior sin decisión por variable; sus modos se comprueban contra la salida del generador, aunque su valor efectivo en el navegador todavía requiere validación renderizada.
