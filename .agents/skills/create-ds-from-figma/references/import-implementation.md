# Implementación según el alcance permitido

Detalle de la fase indicada en la skill canónica; no es un flujo independiente.

Contenido: Kit vacío; Recursos y plantillas; Árbol generado; Dimensiones De Texto; Tokens (inventario file-level); Inventario (obligatorio al incluir); Primera vez (orden); Siguiente componente; Prohibido.

## Kit vacío

Las plantillas van **en blanco**. No incluyen colecciones, tokens, componentes ni pantallas de ningún file de ejemplo.

- `design-system/inventory.json` → listas `components` y `screens` vacías
- `figma-code-map.json` → solo `_schema`, sin entradas
- `figma-state.json` → `_schema` + colecciones, variables y components vacíos
- **no** hay `design-system/tokens/` en el kit; esa carpeta nace en el primer volcado MCP

No copies un DS ya relleno “para que se vea”. El usuario parte de este repo sin componentes importados y el agente escribe tokens y el primer componente desde Figma.

## Recursos y plantillas

Este repo es la fuente única de los recursos del agente. Los archivos que usa este flujo se dividen en dos grupos con tratamiento distinto:

- **Recursos del agente: se usan en su sitio y no se copian nunca.** Son los de la tabla siguiente y las referencias enlazadas desde la skill canónica, que son instrucciones.
- **Plantillas: lo único que se copia o adapta desde el repo al DS generado.** Se describen después de la tabla. El agente genera tokens, `tokens.css` y código a partir de Figma, completa los mapas inicializados desde plantillas y adapta las fichas de cada componente.

| Recurso                                        | Uso                                                |
| ---------------------------------------------- | -------------------------------------------------- |
| `.agents/checks/`                              | checks automáticos y manuales                      |
| `.agents/skills/find-component/SKILL.md`       | resolución de nodos Figma a componentes existentes |
| `.agents/skills/map-figma-to-code/SKILL.md`    | mapeo de componentes DS a código y props           |
| `.agents/skills/validate-ds/SKILL.md`          | validación visual y de bindings computados         |
| `.agents/skills/create-ds-from-figma/SKILL.md` | documento canónico de esta skill                   |
| `.agents/workflows/build-from-figma.md`        | workflow de construcción desde Figma               |
| `.agents/rules/design-system.md`               | reglas persistentes para `src/` y `design-system/` |
| `.agents/rules/design-system-composition.md`   | reglas de composición de UI                        |
| `.agents/rules/design-system-accessibility.md` | reglas de accesibilidad de UI                       |
| `.agents/prop-vocabulary.json`                 | vocabulario canónico de props                      |

`plantillas/` está en `.agents/skills/create-ds-from-figma/plantillas/`, junto a este documento. Si falta, detente e informa que este repo está incompleto. Contiene dos carpetas:

- `plantillas/design-system/`: si aún no existe el scaffold, copia **sin editar** `inventory.json` y `relationships/` a `design-system/`. Si quedó parcial, añade solo lo que falte sin sobrescribir archivos existentes; reconstruye el inventario según la regla de reparación del preanálisis ya leído. La [plantilla de clasificación](../plantillas/design-system/component-classification.json) es opcional: cópiala a `design-system/component-classification.json` solo al necesitar clasificar un directorio auxiliar privado, completando su motivo. Si ya existe, conserva sus entradas. No clasifiques componentes públicos como auxiliares para silenciar hallazgos; la clasificación no acredita autorización. Su ausencia equivale a una lista vacía.
- `plantillas/componentes/`: no se copia tal cual. Adapta sus fichas (`metadata.json` y `usage.md`) al crear `design-system/components/<Nombre>/`.

Al trabajar en `src/` o `design-system/`, aplica `.agents/rules/design-system.md`. Registra las piezas implementadas solo en `design-system/inventory.json`.

## Árbol generado

Estos son los archivos que pertenecen al DS/app generado:

```text
design-system/inventory.json
design-system/component-classification.json ← opcional; solo para auxiliares privados
design-system/relationships/figma-code-map.json
design-system/relationships/figma-state.json
design-system/figma/snapshots/<fileKey>/<root-id>/<SHA256>.json
design-system/tokens/<ArchivoDeColeccion>.json ← no está en plantillas; nace al volcar Figma
design-system/components/<Nombre>/metadata.json
design-system/components/<Nombre>/usage.md
src/styles/tokens.css   ← generado; no se edita a mano
src/components/<Nombre>/<Nombre>.tsx
src/components/<Nombre>/<Nombre>.module.css
src/components/<Nombre>/index.ts
src/App.tsx
src/main.tsx
index.html
tsconfig.json
package.json       ← ya existe; se amplía, no se sustituye
package-lock.json  ← ya existe; se actualiza al instalar dependencias
```

En la primera importación, añade una app Vite React TS compatible con `index.html` y `tsconfig.json`. Integra React, React DOM, Vite y las dependencias de tipos necesarias en el `package.json` existente; conserva `private`, `type`, `scripts.test`, cualquier otro script y todas las dependencias actuales (incluidas TypeScript, PostCSS, postcss-selector-parser y `yaml`). Añade `dev`, `build` y `preview` sin reemplazar scripts existentes. Actualiza el `package-lock.json` existente al instalar dependencias y conserva `.gitignore`; no ejecutes un scaffold que sobrescriba esos archivos del repo.

`design-system/tokens/` contiene **un JSON por colección de variables de Figma**. Su nombre y los `cssName` los decide el preflight de `scripts/preflight-token-files.mjs`; el archivo se guarda en `figma-state.json.collections[<ID>].file` y el prefijo en `figma-state.json.tokenPrefix`; conserva espacios y la ruta registrada cuando Figma renombre una colección. `references/tokens.md` describe la codificación y los casos de colisión. No uses `colors.json` / `spacing.json` / `typography.json` como resumen fijo.

`src/pages/` **no** se crea hasta que pidan una pantalla.

## Dimensiones De Texto

Tras persistir la captura y antes de escribir la ficha o el TSX, ejecuta `node .agents/skills/create-ds-from-figma/scripts/figma-capture.mjs dimensions SNAPSHOT`. Completa el array obligatorio `evidence.textDimensions` con cada requisito, su comportamiento y refs exactas, y el tratamiento enlazado a declaración, traducción, delegación o duda no bloqueante según el contrato de ficha ya leído. WIDTH_AND_HEIGHT no autoriza fijar width/height a la medida de la letra de ejemplo; HEIGHT permite ancho fijo, no alto fijo. No excluyas automáticamente texto oculto, no supongas fixed cuando el resultado sea unknown y no ocultes incertidumbre esencial en unresolved. Si no hay dimensiones TEXT capturadas, guarda el array vacío. El comando no genera CSS ni modifica snapshots: las traducciones requieren revisión del código y del comportamiento renderizado, incluyendo contenido alternativo permitido por la API; esa prueba no confirma variantes nuevas de Figma.

## Tokens (inventario file-level)

Si el gate o finalize:import devuelven RESOLVE_FLOAT_SERIALIZATION, revisa sus variables, fichas y referencias y registra solo decisiones respaldadas por evidencia o criterio expreso del usuario. No asignes px por defecto ni uses generate-token-json save como si decidiera unidades. Consumo PARTIAL/UNKNOWN exige revisar los avisos: ausencia de referencias identificadas no significa sin uso. Ante OBTAIN_VALID_CAPTURE o RESTORE_OR_INSPECT_CAPTURE, sigue el motivo: restaura el original histórico si existe o pide transporte autorizado para una nueva captura y persistencia explícita; nunca inventes snapshots, observaciones ni hashes. El diagnóstico de la aplicación es independiente del bloqueo.

El inventario de tokens es siempre a **nivel de file**, no del nodo del componente. En el preanálisis se lee sin escribir; tras superar el diagnóstico se persiste.

1. El colector de inventario lista **todas** las colecciones locales mediante `figma.variables.getLocalVariableCollectionsAsync()`; no transcribas la respuesta.
2. El mismo colector lista **todas** las variables locales mediante `figma.variables.getLocalVariablesAsync()`, incluidos los valores no usados por el componente. Usa su sobre sellado como entrada de los scripts, no otra lectura manual.
3. Genera la propuesta con `node .agents/skills/create-ds-from-figma/scripts/generate-token-json.mjs plan . --inventory INVENTORY`. Solo si el diagnóstico permite escribir, usa `save` en lugar de `plan`: mezcla los hechos observados sin transcribir valores, conserva cssName, ámbitos, serializaciones y registros ausentes de esta captura. No inventa un modo activo para un alias entre colecciones: si sus valores dependen del modo y no hay resolución inequívoca, bloquea y pide criterio. No sobrescribas esa limitación a mano. Los ámbitos nuevos quedan null y las serializaciones FLOAT sin decidir siguen pendientes. Registra únicamente decisiones de integración explícitas en los campos existentes del estado. Después de registrar la ficha y el mapa, genera `src/styles/tokens.css` con `scripts/generate-tokens-css.mjs . --inventory INVENTORY`; nunca lo edites a mano. El argumento compara datos observados, no demuestra vigencia ni autenticidad y no borra registros conservados. Sin `--inventory` no hay una afirmación de trazabilidad.

**Prohibido como inventario de tokens:**

- `get_variable_defs` del nodo del componente (solo trae las ligadas a ese nodo)
- quedarse con las variables que usa el componente de la URL
- fusionar colecciones distintas en tres buckets (color / spacing / type)

`get_design_context` puede usarse en el preanálisis, pero nunca como fuente del inventario de tokens: ese inventario procede de todas las variables del file de origen.

Si no hay variables locales en el file, deja el inventario local vacío. Solo continúa si hay bindings externos directos con ID y valor resuelto verificables en `externalVariables`; en otro caso, `DS_GAP`. No inventes hex ni colecciones locales.

Antes de persistir los tokens, aplica el formato de `references/tokens.md` leído durante el preanálisis. Antes de escribir `figma-state.json` o `figma-code-map.json`, aplica `references/relationships.md`. No inventes valores ni refs; conserva los ya importados.

## Inventario (obligatorio al incluir)

Tras importar un componente, añade su nombre a `design-system/inventory.json` sin borrar las entradas anteriores. `components` recibe `"<Nombre>"` solo si existe `design-system/components/<Nombre>/` y su código. La descripción de uso vive únicamente en `design-system/components/<Nombre>/usage.md`. No registres nombres previstos ni anidados externos.

## Primera vez (orden)

1. **Preanálisis y diagnóstico** — identifica el nodo, lee variables del file de origen, analiza el set y sus anidados. Aplica la tabla de decisiones y comunica el resultado antes de escribir.
2. **Árbol** — si se puede importar, integra Vite React TS (CSS modules, sin Tailwind) en este repo conservando su manifiesto, lockfile y `.gitignore` como se indica en «Árbol generado» de este documento; inicializa `design-system/` desde `plantillas/design-system/` sin sobrescribir archivos de un scaffold parcial.
3. **Tokens** — persiste el inventario **file-level** ya leído: un JSON por colección y su entrada en `figma-state.json`. No escribas `src/styles/tokens.css` a mano.
4. **Ficha** — `metadata.json` + `usage.md` con variantes, estados, estilos aplicados, valores medidos y tokens observados (plantilla `plantillas/componentes/`); conserva el valor bruto de Figma para traducciones CSS aproximadas.
5. **Código** — `src/components/<Nombre>/` con tokens y reutilizando anidados `mapped`. Declara `interface <Nombre>Props extends ... { ... }` o `type <Nombre>Props = Omit<...> & { ... }` (también vale un literal sin herencia) en su TSX y úsalo en el componente; hereda props nativas en vez de redefinirlas cuando corresponda. Para los valores de `kind: prop`, documenta en `usage.md` las correspondencias candidatas Figma → código según el contrato de metadata leído desde la skill canónica; la comparación renderizada del paso 9 puede confirmarlas, no el mero hecho de haber escrito ese código. Aplica el mismo criterio en importaciones y actualizaciones posteriores.
6. **Mapa y CSS** — entradas en `figma-code-map.json` con `refs` y en `figma-state.json` con `nestedComponents` `mapped` o `external`. Después genera `src/styles/tokens.css` con `node .agents/skills/create-ds-from-figma/scripts/generate-tokens-css.mjs .` (falla sin escribir si las fuentes son inconsistentes); regenera siempre que cambien tokens, estado, mapa o `externalVariables`.
7. **App** — `App.tsx` renderiza **solo** ese componente (para `npm run dev`).
8. **Inventario** — añade solo ese componente a `design-system/inventory.json`.
9. **Checks** — `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y `node .agents/checks/verify-bindings.mjs` (tras instalar las dependencias de `package.json`), más `.agents/skills/validate-ds/SKILL.md` sobre ese componente. Informa PASS, FAIL o NOT RUN con motivo para cada check; no llames conforme a lo no evaluado.

## Siguiente componente

1. Preanálisis y diagnóstico completos antes de escribir, también si el componente ya existe. Si hay `missing`, para sin tocar el proyecto.
2. `find-component` — si no existe, continúa con la importación. Si existe, compara el análisis actual con `metadata.json`, la entrada del mapa y `nestedComponents`, y aplica la tabla del preanálisis y su criterio de identidad. No supongas cambios que esos datos no permitan comparar ni reescribas por repetir la URL.
3. Si el componente es nuevo o el usuario pidió expresamente una actualización general, mezcla las colecciones y variables leídas del file en los JSON existentes; no borres variables.
4. Para un componente nuevo, crea ficha + código + mapa. Para uno existente, sigue «Actualización solicitada» si el usuario pidió una actualización general o autorizó una sustitución concreta; en otro caso, aplica únicamente la actualización automática permitida por la tabla y el criterio de identidad. Si no puedes aislar el cambio sin pisar trabajo existente, muestra la modificación propuesta y pide confirmación. No guardes `missing` ni estados `blocked`. Regenera `src/styles/tokens.css` después de actualizar el mapa cuando cambien tokens, estado, mapa o fichas.
5. Si `App.tsx` está vacío porque solo se preparó el scaffold, renderiza ahí el primer componente que se importe. En los demás casos, no lo sustituyas salvo que pidan ver el nuevo; no borres componentes viejos.
6. Inventario: añade solo nombres nuevos; no quites los anteriores.
7. Checks de **este** componente, también tras una actualización localizada; ejecuta `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y `node .agents/checks/verify-bindings.mjs` e informa los checks no realizados con su motivo.

## Prohibido

- Rellenar plantillas o el DS generado con un DS de ejemplo
- Copiar al DS generado recursos de `.agents/` distintos de las plantillas indicadas (incluidos `checks/`, `rules/`, `skills/`, `workflows/`, `references/`, `scripts/`, `browser-tests/` o `prop-vocabulary.json`), generar `.ai/` o mantener runtimes AI duplicados
- Generar todos los componentes del file de golpe
- Citar en reglas o inventario componentes que aún no están en el DS generado
- Una pantalla en la primera vez (si la URL es una pantalla: `DS_GAP`, sin escribir)
- Hex/spacing inventados
- Resumir variables a `colors.json` / `spacing.json` / `typography.json`
- Inventario de tokens solo con las variables del componente
- Añadir Tailwind, Storybook, CI, `docs/` o `.github/` al scaffold generado por la importación. Las verificaciones del kit son locales; no configurar pipelines ni hooks de Git sin petición explícita
- Más de dos archivos por carpeta en `design-system/components/<Nombre>/`
