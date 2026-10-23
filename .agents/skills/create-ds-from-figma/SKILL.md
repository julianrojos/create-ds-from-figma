---
name: create-ds-from-figma
description: >-
  Import or explicitly update one Figma component in this DS repo.
  USE WHEN: "crea un DS"/"create a design system", a Figma URL alone (including
  repeated URLs), or an explicit component/set/variant/instance import or update.
  Inspect the node type first. A "crea un DS" request pointing to a frame stays
  in this flow: report DS_GAP without writing or switching workflows.
  DO NOT USE WHEN: explicitly building a screen from a frame, or editing existing
  UI without a component import/update request.
---

# Crear DS desde un componente Figma

Importa o actualiza un componente en este repo. Sigue `AGENTS.md`; esta es la
única skill canónica de importación. Las referencias contienen el detalle de
cada fase, sin ser workflows independientes.

Contrato transversal: [INV-PREWRITE, INV-DIAGNOSE, INV-STATUS e INV-DELIVERY](../../../AGENTS.md#invariantes-de-proceso).

## Bloqueos antes de escribir

- Comprueba primero el entorno: todo el flujo (captura, tokens, `verify:imports`,
  `finalize:import`) requiere Node >=22.12.0. Un `node -v` fallido no prueba
  que falte: una shell sin perfil no carga `nvm`, `fnm`, `volta` ni `asdf`.
  Carga el perfil del gestor o busca en rutas habituales (`command -v node`,
  `/opt/homebrew/bin`, `/usr/local/bin`, `~/.nvm/versions/node`) sin instalar
  nada sin permiso. Si no hay Node >=22.12.0 tras eso: `BLOCKED`, sin escribir
  el proyecto ni sustituir las herramientas por escritura manual; indica al
  usuario que lo instale o te dé su ruta, con la versión encontrada.
- Preanaliza antes de crear scaffold, tokens, ficha, código o registros. Durante
  esa fase, guarda capturas e inventario únicamente fuera del proyecto.
- Sin transporte autorizado, captura válida, variables verificables, información
  esencial o anidados locales resueltos: `DS_GAP`, sin escribir el proyecto.
- Solo si el único bloqueo son anidados `missing` y el usuario pide preparar
  el proyecto, aplica la excepción de scaffold y tokens del preanálisis:
  `App.tsx` válida y vacía, sin registrar el componente bloqueado.
- Si faltan fuentes o imágenes esenciales, pide sus orígenes autorizados juntos.
  Sin interacción: `BLOCKED`, sin escribir. No instales sustitutos por su nombre.
- `requirements` lista candidatos, no declara esencial todo recurso observado.
  `--diagnose` no autoriza implementar una importación bloqueada para medirla.
- Una URL repetida exige preanálisis; no autoriza reescritura. Solo la transición
  de dependencia `external` a `mapped` con identidad igual verificada y sin otras
  diferencias permite actualización automática localizada. Para las demás,
  aplica la tabla de decisiones y el alcance expresamente autorizado.
- No inventes valores, refs, props, estados, snapshots ni confirmaciones.
  Conserva el trabajo del usuario; no cambies de rama ni crees worktrees.

## Fases y evidencia de salida

Ejecuta en orden. Lee solo las secciones aplicables indicadas por el plan antes de actuar;
no avances si falta su condición de salida. Una decisión de reutilizar o de no
escribir no habilita las fases de implementación y publicación.

| Fase | Entrada | Evidencia y condición para avanzar |
| --- | --- | --- |
| Preanálisis | URL, estado actual y acceso autorizado | Tipo/origen, inventario completo, snapshot temporal, variantes y anidados; tabla de decisiones aplicada |
| Recursos y diagnóstico | Captura válida y alcance previsto | Recursos esenciales autorizados y diagnóstico comunicado antes de escribir |
| Implementación | Decisión que permite escribir | Código, ficha, tokens, relaciones e inventario coherentes; cambios limitados al alcance |
| Diagnóstico renderizado | Implementación permitida y casos declarados | Checks estáticos/manuales y `--diagnose`; diferencias examinadas y corregidas con nueva medición |
| Revisión y entrega | Mediciones publicadas autorizadas y comparación real | Revisiones explícitas, casos `confirmed` vigentes y `verify:imports` satisfactorio |

## Preanálisis antes de escribir

La selección canónica está en `.agents/reading-plan.json`. Usa
`npm run read:guidance -- import-intake` para leer solo los apartados de entrada,
anidados y decisión. No cargues referencias completas. Si una condición es
desconocida, determínala antes de omitir el contrato; ninguna selección reduce
los bloqueos de esta skill o de AGENTS.md.

| Cuándo | Fase que leer | Añadir `--with` según los hechos observados |
| --- | --- | --- |
| Actualización solicitada de una pieza existente | import-intake | update |
| Antes de capturar | import-capture | direct-mcp o bridge; figma-execute si ese es el sobre |
| Al clasificar API/estilos, tras verificar el snapshot | import-api | nested y delegation cuando existan |
| Al planificar/persistir tokens | import-tokens | float, modes según el inventario |
| Antes de ficha/TSX | import-code | first o next; text, resources, native-states, delegation y external-bindings cuando apliquen |
| Antes de abrir la vista manual o revisar una configuración explícita | import-preview | No autoriza ejecutar configuración; revisar permisos antes de --approve-config |
| Antes de medir | import-diagnose | color, resources, native-states; recovery solo ante incidencias |
| Después de medir, antes de interpretar/corregir/reintentar | import-diagnose-results | composition si la salida contiene checks o acciones de composición |
| Antes de usar el adaptador externo o calibración | import-browser-adapter | Uso explícito, con herramientas/orígenes autorizados |
| Antes de publicar/revisar/cerrar | import-close | No releer apartados ya retenidos sin cambios |

Los fragmentos se extraen de [preanálisis](references/import-preanalysis.md),
[implementación](references/import-implementation.md), [verificación](references/import-verification.md)
y los contratos enlazados abajo. Antes de exportar SVG lee tooling-vectors; antes de comparar píxeles lee tooling-pixels, según [operaciones auxiliares](references/tooling.md). Para investigar rendimiento del kit, lee `kit-performance`; no es una fase de importación ni exige ejecutar benchmarks rutinarios. `--stats` mide bytes/palabras sin cargar su contenido.

1. Inspecciona tipo y estructura con `get_metadata`. Resuelve set completo o
   `mainComponent`, según corresponda, y el file de origen. Aplica «Pantallas»
   si resulta ser un frame; una instancia raíz remota necesita su URL de origen.
2. Consulta [tokens](references/tokens.md) mediante la fase import-tokens. Captura **todas** las colecciones,
   variables y modos del file con `figma-inventory.mjs`, sin transcripción.
   Ejecuta `node .agents/skills/create-ds-from-figma/scripts/preflight-token-files.mjs . --inventory INVENTORY`,
   también con `"collections": []`; usa su `tokenPrefix`, `files` y `variables`.
   No reconstruyas un JSON perdido con variables publicadas: restaura el original.
3. Consulta la clasificación de [metadata](references/component-metadata.md) mediante import-api. Inspecciona contexto,
   todas las variantes, clasificación de API, estados, estilos y segmentos mixtos.
   Separa medido, inferido, no determinado y no aplicable; una laguna esencial bloquea.
4. Consulta [relaciones](references/relationships.md) mediante import-api. Usa
   `.agents/skills/find-component/SKILL.md` para raíz existente y cada instancia.
   Un anidado local `missing` bloquea; uno `external` no bloquea por sí solo.
5. Consulta [evidencia Figma](references/figma-evidence.md) mediante import-capture. Comprueba el transporte
   autorizado y captura sin transcripción, con inventario y snapshot separados.
   El contexto de diseño no sustituye al colector; no reconstruyas observaciones.
6. Ejecuta `node .agents/skills/create-ds-from-figma/scripts/verification-plan.mjs requirements SNAPSHOT`.
   Resuelve recursos esenciales para lo previsto, exporta vectores originales
   y comunica el diagnóstico antes de escribir. Una aproximación CSS vectorial
   requiere aprobación y revisión visual.

## Implementación permitida

Lee los apartados de import-code antes de escribir; el detalle está en
[implementación y scaffold](references/import-implementation.md). Contiene el árbol exacto, plantillas, dimensiones de texto, tokens,
inventario y pasos separados para primera importación y siguiente componente.
Antes de preparar la ficha y el TSX aplica text/resources/native-states/delegation
según lo observado; añade external-bindings si el snapshot usa variables remotas. text incluye nodos ocultos y descendientes de instancias; resources incluye pinturas IMAGE ocultas. Si se desconoce su presencia, resuélvela antes de omitir un apartado. El esquema compartido de recursos y casos siempre se lee. Lee el detalle de composición después de observar sus checks/acciones; el flag solo selecciona documentación, no activa ni desactiva el diagnóstico.
Aplica `.agents/rules/design-system.md` al leer o modificar el DS o `src/`.

- Persiste la captura antes de metadata; conserva los snapshots históricos en
  reutilización o sustituciones limitadas. Deriva hechos con los scripts.
- Primera vez: integra Vite React TS en el manifiesto existente, preservando
  scripts, dependencias, lockfile y `.gitignore`; copia solo las plantillas indicadas.
- Importa un componente, con un JSON por colección. Mezcla sin borrar registros
  existentes y genera `tokens.css` con
  `node .agents/skills/create-ds-from-figma/scripts/generate-tokens-css.mjs . --inventory INVENTORY`.
  Nunca lo edites a mano ni resumas en tres buckets.
- Prepara dimensiones, recursos, casos, decisiones y correspondencias candidatas;
  usa `apply` con el resto del DS coherente. No presentes candidatas como confirmadas.
- Reutiliza anidados `mapped`. Conserva ficha y mapa en una sustitución limitada;
  la autorización para esa dependencia no permite reparar el scaffold.
- Registra solo piezas implementadas. La ficha contiene solo metadata y usage;
  el código vive en `src/components/`. No crees pantallas, Tailwind, Storybook,
  CI, hooks ni runtimes de agente duplicados en una importación.

## Diagnóstico, revisión y entrega

Lee import-diagnose antes de medir, import-diagnose-results al recibir la salida e import-close antes de cerrar; conserva sus contratos de versiones, fuentes,
estados, colores, delegación, composición y caducidad. Sigue también
`.agents/skills/validate-ds/SKILL.md` para la comparación renderizada independiente.

1. Instala las dependencias si faltan. Ejecuta
   `node .agents/checks/verify-ds.mjs`, `node .agents/checks/verify-props.mjs` y
   `node .agents/checks/verify-bindings.mjs`, y los checks manuales de `.agents/checks/`.
   `verify-ds` incluye evidencia y plan; el PASS estático no acredita fidelidad visual.
2. Tras código permitido y cada corrección visual, ejecuta
   `npm run finalize:import -- ROOT METADATA --diagnose`. Revisa casos, recursos,
   advertencias, composición y `nextActions`; corrige defectos demostrados y repite.
   Diagnostica también los literales de la aplicación. Sin navegador: `NOT RUN/BLOCKED`.
3. El diagnóstico ejecuta código y escribe solo temporales; nunca confirma ni
   publica. No cambies tolerancias, recursos ni snapshot para conseguir PASS.
4. Con publicación autorizada, `npm run finalize:import -- ROOT METADATA --collect`
   publica mediciones originales. Después de compararlas realmente,
   `npm run finalize:import -- ROOT METADATA --reviews REVIEW_FILE` registra las
   revisiones explícitas. No combines recogida y revisión; no inventes aprobación.
5. Ejecuta `npm run verify:imports` antes de entregar. Exige confirmaciones
   persistidas vigentes y todos los behavior obligatorios en PASS. Fidelidad
   no comparable necesita revisión específica; ninguna revisión rescata FAIL/NOT RUN.
   Una medición o recibo, y `execution COMPLETED`, no son una importación terminada.

Informa por separado conformidad estática, cobertura visual y pendientes. Usa
`report` del kit para cifras y cobertura exacta; no acredita aprobación humana.
Los gates son locales; no hay bloqueo automático de commits o pushes.

## Cómo hablar

En español, después del preanálisis y antes de tocar disco, comunica el diagnóstico:

```text
**Modo:** primera vez | siguiente componente
**Diagnóstico:** nodo y file de origen; variantes, propiedades y estados; estilos aplicados y procedencia no disponible; colecciones/variables del file y tokens usados; anidados mapped/missing/external
**Prefijo de tokens:** fijado en el estado | pedido por el usuario | `ds` (predeterminado, solo en un DS nuevo); informativo, no detiene la importación
**Medido en Figma:** hechos con fileKey, nodeId o variable ID y herramienta consultada
**Inferido:** interpretación y evidencia en que se apoya; no presentarla como medición
**No determinado:** campo, fuente intentada, motivo y si bloquea la importación
**No aplica:** campo, motivo comprobado y fuente
**Cobertura:** ejes y claves de todas las variantes del set inspeccionadas; qué nodos o fuentes no se cubrieron
**API propuesta:** para cada valor de cada eje, prop | state | interaction | content; para cada estado, consumer | shared | internal; nombres de props y si ya vienen de HTML o de una librería
**No construido:** qué diferencias de Figma no se convierten en API o componente y por qué
**Decisión:** importar | reutilizar | actualizar dependencia | actualizar componente solicitado | solicitar actualización | pedir ref o autorización | DS_GAP | pedir URL de origen
**Qué voy a hacer ahora:** ...
**Qué no voy a hacer:** ni otros componentes que no estén en esta URL, ni una pantalla, ni Tailwind, ni copiar un DS ya relleno, ni resumir tokens a 3 archivos
```

Luego haz el trabajo. Al cerrar: archivos tocados + “para el siguiente, pega otra URL de componente”.

Si dice **paso a paso**: un bloque y espera **sigue**.
Si dice **crea un DS** (o pega la URL en vacío): ejecuta el modo que toque, narrando cada bloque.

## Pantallas

Si la petición principal es implementar una pantalla desde un frame, sigue `.agents/workflows/build-from-figma.md`, no este procedimiento de importación. Si el usuario pide «crea un DS» con una URL que resulta ser un frame o pantalla, aplica la tabla del preanálisis: `DS_GAP` sin escribir; no cambies automáticamente al workflow.
