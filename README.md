# CREATE DS FROM FIGMA

Proyecto para arrancar un Design System desde 0 dentro de este repo preparado.

No trae tokens, componentes ni pantallas. El agente analiza la URL de Figma antes de escribir y crea el DS cuando el componente puede importarse.

## Usar

Abre este repo en tu IDE y abre un chat con la IA y pide:

```text
Crea un DS

<URL de UN componente de Figma>
```

El file de origen debe tener **variables**. La URL puede apuntar a un componente, un component set, una variante o una instancia cuyo componente principal se pueda resolver; un frame o pantalla no se importa por este flujo.

Antes de crear archivos, el agente identifica el componente y sus variantes, lee **todas** las colecciones del file de origen y resuelve los componentes anidados. Si falta uno local, informa `DS_GAP` y espera su URL sin escribir archivos. Solo prepara el scaffold y los tokens pese a ese bloqueo si el usuario lo pide expresamente; el componente bloqueado nunca figura como importado. Si el análisis permite continuar, vuelca un JSON por colección e implementa **solo** el componente pedido.

Si se prepara solo el scaffold, `App.tsx` queda válida y vacía hasta importar el primer componente.

Siguiente primitive: otra URL. Pantalla: cuando ya haya primitives.

## Qué incluye

| Ruta desde la raíz del repo                                                                                                                                                  | Para qué                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `README.md`                                                                                                                                                                  | Guía humana del kit y su estructura                         |
| `.agents/skills/create-ds-from-figma/SKILL.md`                                                                                                                               | Wrapper mínimo para que la skill se detecte                 |
| `.agents/design-system-resources/skills/create-ds-from-figma/SKILL.md`                                                                                                       | Instrucciones canónicas del agente                          |
| `.agents/design-system-resources/skills/create-ds-from-figma/scripts/`                                                                                                       | Tests locales de los checks del kit                         |
| `.agents/design-system-resources/skills/create-ds-from-figma/plantillas/design-system/`                                                                                      | Árbol fijo vacío que se copia tal cual a `design-system/`   |
| `.agents/design-system-resources/skills/create-ds-from-figma/plantillas/componentes/`                                                                                        | Plantillas de ficha por componente                          |
| `.agents/design-system-resources/checks/`                                                                                                                                    | Checks automáticos y manuales que se ejecutan desde el repo |
| `.agents/design-system-resources/skills/find-component/`, `.agents/design-system-resources/skills/map-figma-to-code/`, `.agents/design-system-resources/skills/validate-ds/` | Skills auxiliares usadas por ruta                           |
| `.agents/design-system-resources/workflows/`                                                                                                                                 | Workflow de construcción desde Figma                        |
| `.agents/design-system-resources/prop-vocabulary.json`                                                                                                                       | Vocabulario canónico de props                               |

Para validar, ejecuta `npm test` desde la raíz de este repo. En un DS generado, instala las dependencias y ejecuta `node .agents/design-system-resources/checks/verify-ds.mjs`, `node .agents/design-system-resources/checks/verify-props.mjs` y `node .agents/design-system-resources/checks/verify-bindings.mjs`. Los dos primeros validan estructura y props; el último informa cobertura y diferencias de bindings CSS sin bloquear todavía.

## No negociable

- El repo empieza sin componentes importados
- Sin Tailwind, Storybook ni CI
- Cada primitive: solo `metadata.json` + `usage.md`
- Si Figma no mapea: `DS_GAP`, no inventar
- No citar en `composition-rules` ni `design-system/AGENTS.md` un componente que no exista aún
- No resumir tokens a color/spacing/type
