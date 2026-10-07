# Formato de relaciones Figma

Consulta esta referencia durante el preanálisis de anidados y antes de escribir `figma-state.json` o `figma-code-map.json`. Las condiciones de identidad, bloqueo y actualización están en `../SKILL.md`.

`figma-state.json`: usa el ID de colección como clave de `collections` y de `variables`, nunca su nombre. Cada `collections[<ID>]` guarda `{ "name": "<nombre en Figma>", "modes": ["<modo>"], "varCount": 0, "file": "<nombre>.json", "modeScopes": { "<modo no predeterminado>": null }, "serialization": {} }`; `file` es solo el nombre del JSON dentro de `design-system/tokens/`, sin directorios, y `modeScopes` asigna un ámbito CSS a cada modo no predeterminado y `serialization` guarda la decisión de unidad de cada variable `FLOAT` usada (el formato de ambos lo define la referencia de tokens, que ya leíste durante el inventario). `variables[<ID>]` agrupa por nombre de variable sus `{ "id": "<VariableID>", "type": "COLOR | FLOAT | STRING | BOOLEAN" }`. Haz que el número y la identidad de estas variables coincidan con el JSON de la colección. Conserva `file` al renombrarse la colección en Figma; actualiza `name` y el campo `collection` del JSON, no su ruta. Por cada componente **importado con código disponible**, añade su entrada en `components`. No registres componentes bloqueados en `components` ni en un inventario de páginas. El kit no usa `phase` ni `pages` para representar intentos de importación.

`figma-code-map.json`: una entrada por componente o component set, en el nivel raíz junto a `_schema` (que se ignora al leer). Por defecto, usa `<FILE_KEY>:<COMPONENT_OR_SET_NODE_ID>` como clave de entrada; para remotos sin file/node fiable, usa `componentKey:<COMPONENT_KEY>`. El ref de esa clave debe estar también en `figma.refs`. Guarda refs estables del componente/set en `figma.refs` y refs estables de cada variante en `figma.variants[*].refs`. Los refs tienen forma `<FILE_KEY>:<NODE_ID>`, con el `fileKey` del file donde vive el nodo (el del DS para un nodo local; el de la librería para un componente remoto, si la herramienta lo devuelve), o `componentKey:<COMPONENT_KEY>` cuando Figma devuelva una key. Un componente se resuelve con una sola regla: busca cualquiera de sus refs estables en `figma.refs` o en los `refs` de alguna variante. Si coincide con una variante, esa es la `matched variant` y sus `props` son los que usa el código. No uses el id único de la instancia colocada como mapeo estable.

Al importar o actualizar un componente, añade a `figma.refs` y `figma.variants[*].refs` todos los refs que devuelva Figma para el set/componente y sus variantes: refs `<FILE_KEY>:<NODE_ID>` y `componentKey:<KEY>` cuando existan. Mezcla refs nuevos con los existentes; no borres refs previos. Un ref solo puede pertenecer a una entrada del mapa; si aparece en dos entradas, para y reporta el conflicto.
## Forma de un componente con anidados

```json
{
  "components": {
    "<Nombre>": {
      "figmaNodeId": "<NODE_ID>",
      "nestedComponents": [
        {
          "figmaNodeId": "<CHILD_NODE_ID>",
          "mainComponentRef": "<FILE_KEY>:<MAIN_COMPONENT_NODE_ID> | componentKey:<COMPONENT_KEY>",
          "mainComponentNodeId": "<MAIN_COMPONENT_NODE_ID>",
          "mainComponentFileKey": "<MAIN_COMPONENT_FILE_KEY>",
          "mainComponentKey": "<COMPONENT_KEY>",
          "figmaName": "<Nombre en Figma>",
          "status": "mapped | external",
          "resolvedComponent": "<NombreLocal>"
        }
      ]
    }
  }
}
```

`mainComponentRef` aparece cuando tengas un ref estable. `mainComponentNodeId` y `mainComponentKey` aparecen solo cuando la herramienta los devuelve. `mainComponentFileKey` aparece solo para un anidado `remote` cuando la herramienta devuelve el `fileKey` de su propio file; sin él, un `mainComponentNodeId` remoto no es una identidad verificable. `resolvedComponent` solo aparece cuando `status` es `mapped`. No añadas anidados a `design-system/inventory.json` si no tienen carpeta real en `design-system/components/`.
