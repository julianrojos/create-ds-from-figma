# Formato de tokens

Consulta esta referencia durante el inventario previo de variables y antes de escribir los JSON de colección y `src/styles/tokens.css`. La política de bloqueo está en `../SKILL.md`.

### Forma de cada `design-system/tokens/<Coleccion>.json`

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

`cssName` es la custom property única y estable asignada a ese ID; anótala también en `tokens.css`. `defaultMode` es el modo por defecto que devuelve Figma para esa colección, no el primer nombre de `modes` por convención; `:root` usa sus valores. No deduzcas el ID a partir del nombre CSS ni cambies `cssName` al importar otro componente. El validador detecta nombres duplicados, bindings cuyo ID no figure en el inventario local o en `externalVariables` y diferencias entre el JSON y las declaraciones del modo base en `:root`; los selectores de modos adicionales aún no se comprueban automáticamente. El proyecto generado instala `postcss` y `postcss-selector-parser` como dependencias de desarrollo para `verify-ds` y `verify-bindings`; instala las dependencias antes de ejecutar cualquiera de los tres checks.

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

Mismos nombres que en Figma. Para cada alias guarda el ID de destino que devuelve Figma y el valor resuelto por modo. `alias` (el nombre del destino) es opcional tanto para alias locales como externos; para uno local, el nombre se obtiene del inventario mediante `targetVariableId` y, si `alias` está presente, debe coincidir. Marca `source: "local"` solo si `targetVariableId` está en el inventario local del file; en otro caso marca `external` y consérvalo como dependencia externa, no como variable local inventada. No deduzcas el origen por el nombre. Si no puedes obtener el ID o el valor resuelto, declara la laguna y aplica la fila `DS_GAP` de la tabla antes de generar tokens. Un objeto de valor representa siempre un alias y debe tener `targetVariableId`, `source` y `value`. FLOAT de spacing/radius/tipo: añade unidad `px` en CSS cuando el valor sea longitud.

`src/styles/tokens.css`: una custom property por variable de **todas** las colecciones. Alias local → `var(--…)` de la variable local identificada por ID, no solo por nombre. Alias externo → valor resuelto por modo como instantánea; no emitas un `var(--…)` sin definición local ni prometas sincronización automática con la librería. Informa de estas instantáneas en el resumen y vuelve a resolverlas cuando se actualicen los tokens. No dupliques valores de aliases locales.
