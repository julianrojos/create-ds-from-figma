# CREATE DS FROM FIGMA

Proyecto para arrancar un Design System desde 0 dentro de este repo preparado.

No trae tokens, componentes ni pantallas. El agente analiza la URL de Figma antes de escribir y crea el DS cuando el componente puede importarse.

## Usar

Abre este repo en tu IDE, abre un chat con la IA y pide:

```text
Crea un DS

<URL de UN componente de Figma>
```

El file de origen debe tener **variables**. La URL puede apuntar a un componente, un component set, una variante o una instancia cuyo componente principal se pueda resolver; un frame o pantalla no se importa por este flujo.

Antes de crear archivos, el agente identifica el componente y sus variantes, lee **todas** las colecciones del file de origen y resuelve los componentes anidados. Si falta uno local, informa `DS_GAP` y espera su URL sin escribir archivos. Solo prepara el scaffold y los tokens pese a ese bloqueo si el usuario lo pide expresamente; el componente bloqueado nunca figura como importado. Si el análisis permite continuar, vuelca un JSON por colección e implementa **solo** el componente pedido.

Si se prepara solo el scaffold, `App.tsx` queda válida y vacía hasta importar el primer componente.

Siguiente primitive: otra URL. Pantalla: cuando ya haya primitives.

## Qué incluye

| Ruta desde la raíz del repo                                                                          | Para qué                                                    |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `README.md`                                                                                          | Guía humana del kit y su estructura                         |
| `.agents/skills/create-ds-from-figma/SKILL.md`                                                       | Skill canónica y detectable                                 |
| `.agents/skills/create-ds-from-figma/references/`                                                     | Formatos consultados durante el preanálisis y la escritura  |
| `.agents/skills/create-ds-from-figma/evals/`                                                          | Casos de evaluación del flujo de importación               |
| `.agents/skills/create-ds-from-figma/scripts/`                                                       | Tests de estructura de la skill                             |
| `.agents/skills/create-ds-from-figma/plantillas/design-system/`                                      | Árbol fijo vacío que se copia tal cual a `design-system/`   |
| `.agents/skills/create-ds-from-figma/plantillas/componentes/`                                        | Plantillas de ficha por componente                          |
| `.agents/checks/`                                                                                    | Checks automáticos y manuales que se ejecutan desde el repo |
| `.agents/checks/tests/`                                                                              | Tests de los verificadores automáticos                      |
| `.agents/rules/`                                                                                     | Reglas persistentes para el DS generado y `src/`            |
| `.agents/skills/find-component/`, `.agents/skills/map-figma-to-code/`, `.agents/skills/validate-ds/` | Skills auxiliares del flujo                                 |
| `.agents/workflows/`                                                                                 | Workflow de construcción desde Figma                        |
| `.agents/prop-vocabulary.json`                                                                       | Vocabulario canónico de props                               |

Para validar, ejecuta `npm test` desde la raíz de este repo. `npm run verify:docs` comprueba que los enlaces, rutas `.agents/...` y comandos de la documentación resuelven; informa sin fallar salvo con `--strict`. `src/styles/tokens.css` no se edita: lo genera `.agents/skills/create-ds-from-figma/scripts/generate-tokens-css.mjs` y `verify-ds` comprueba que coincide. En un DS generado, instala las dependencias y ejecuta `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y `node .agents/checks/verify-bindings.mjs`. Los dos primeros validan estructura y props; el último informa cobertura y diferencias de bindings CSS sin bloquear todavía.

Las reglas de composición y accesibilidad permanecen en `.agents/rules/`; no se copian a `design-system/`.

## No negociable

- El repo empieza sin componentes importados
- Sin Tailwind, Storybook ni CI
- Cada primitive: solo `metadata.json` + `usage.md`
- Si Figma no mapea: `DS_GAP`, no inventar
- `design-system/inventory.json` solo registra nombres de componentes implementados y pantallas con su composición declarada; el uso de cada componente se documenta en su `usage.md`
- `verify-ds` comprueba que los componentes declarados por cada pantalla estén en el inventario y que exista su página; no infiere qué componentes se renderizan realmente
- No resumir tokens a color/spacing/type
