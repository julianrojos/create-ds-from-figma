# Retirada recuperable de un componente

El informe inicial solo inspecciona. El plan, el archivado, la restauración y la
eliminación definitiva del respaldo son acciones separadas. La importación o una
petición genérica de limpieza no autorizan retirar componentes. Antes de archivar,
presenta las operaciones concretas y obtén autorización para ese plan.

Desde la raíz del kit, indica el proyecto y la ficha relativa a él:

```sh
node .agents/skills/create-ds-from-figma/scripts/report-component-removal.mjs ROOT METADATA
```

El proyecto debe tener mapa, estado, inventario y una ficha identificable con
código. El comando lee fuentes y configuración TypeScript, pero no ejecuta la app,
Vite, configuración JavaScript ni navegador. No inspecciona Figma ni modifica Git.
Exit 0 significa informe generado, incluso si `removalAssessment` es `BLOCKED`.
Exit 1 significa que no pudo producirlo; nunca equivale a una eliminación realizada.

## Interpretar el informe

- `analysis.status` es `COMPLETE_WITHIN_SCOPE` o `PARTIAL`, no una prueba de
  ausencia de consumidores. `uncertainties` conserva datos incompletos, refs
  contradictorias, imports no resolubles y atribución desconocida.
- `blockers` lista dependencias identificadas por refs completas, componentes
  resueltos, dependencias alcanzables desde `src/` y composición de pantallas
  del inventario. Un mismo ID de nodo en otro file no identifica al componente.
- `demoReferences` separa referencias desde `src/App.tsx` o `src/App.jsx`: requieren
  un plan de edición expreso. No se presupone que se puedan retirar preservando
  estados, lógica y demás contenido; el informe no propone una edición JSX.
- `files` incluye rutas concretas y hashes, no una orden recursiva sobre carpetas.
  Las rutas declaradas o dependencias locales inspeccionadas son
  `candidate-to-retire`, no propiedad exclusiva demostrada. Otras reclamaciones
  o referencias identifican `shared-identified`; archivos cercanos sin atribución
  son `attribution-unknown`. Compartidos, desconocidos y demás incertidumbres
  bloquean una futura ejecución hasta revisión. Los enlaces no se siguen como
  carpetas retirables. `gitTracking` informa seguimiento, no recuperabilidad de
  los bytes actuales ni existencia de un respaldo.
- `proposedRegistryEdits` enumera cambios previstos en mapa, estado e inventario.
  No modifica registros ni autoriza borrar dependientes en cascada.
- `historicalEvidence` conserva snapshots, mediciones y confirmaciones. Eso no
  mantiene su vigencia. `currentEvidence` comprueba las correspondencias actuales
  del componente, sin publicar ni aprobar nada.
- `projectedEffects.generatedCss` compara en memoria el CSS generado actual con
  el que se obtendría sin las instantáneas externas de la ficha. No borra tokens
  locales, fuentes, recursos ni decisiones de serialización. Si estas decisiones
  quedan incompatibles, o faltan datos, declara la proyección desconocida y el
  bloqueo; no las limpia para conseguir un resultado. CSS actual distinto del
  generador es un problema previo, separado del efecto propuesto. Las advertencias
  de generación se conservan. No se simulan cambios a la demo ni otras fichas.
- El posible efecto sobre confirmaciones de otros componentes se declara
  `NOT DETERMINED`, no se inventa una cifra ni se mide fidelidad. Un cambio del
  CSS compartido puede exigir renovar evidencia. No se ejecutan gates de entrega
  ni se afirma que los consumidores continúen funcionando.

Con bloqueos o incertidumbres, `removalAssessment` es `BLOCKED`. En el resto de
casos es `REQUIRES_EXPLICIT_PLAN_AND_AUTHORIZATION`, nunca permiso de ejecución.
`execution` es `NOT_EXECUTED_READ_ONLY`: el comando de informe no ejecuta cambios.
La ejecución usa exclusivamente el plan revisado del procedimiento siguiente.

## Plan y ejecución

Guarda los planes y respaldos fuera del proyecto activo. Los comandos siguientes
usan el script `.agents/skills/create-ds-from-figma/scripts/component-removal.mjs`.
`ARCHIVE_PARENT` debe ser un directorio existente fuera de `ROOT`.

```sh
node .agents/skills/create-ds-from-figma/scripts/component-removal.mjs plan ROOT METADATA > /tmp/component-removal-plan.json
node .agents/skills/create-ds-from-figma/scripts/component-removal.mjs archive ROOT /tmp/component-removal-plan.json ARCHIVE_PARENT --approve-removal
```

1. El plan simula la retirada en un temporal y repite el análisis de consumidores.
   Bloquea dependencias e incertidumbres sin resolver y nuevos errores estáticos.
   Compara las comprobaciones de DS, props, bindings e imports antes y después;
   conserva los errores previos separados de los introducidos.
2. Revisa `operations`, `keptFiles`, `removedDirectories`, `proposal` y `validation`.
   Cada operación lleva hash y permisos originales; las escrituras incluyen los
   bytes propuestos. El hash del plan identifica su contenido, no una firma de
   autoría ni una garantía de propiedad exclusiva.
3. Los archivos compartidos se conservan. Para atribución desconocida, decide
   archivo por archivo con `--keep PATH` o `--retire PATH`. No se archiva una carpeta
   recursivamente por su nombre; solo se retiran archivos enumerados y directorios
   de componente que queden vacíos. Las fichas y el entrypoint del componente no
   pueden mantenerse activos mientras se quitan sus registros.
   Un barrel local se incorpora como candidato solo si contiene exclusivamente
   reexports relativos cuyos destinos ya pertenecen al grupo propuesto. Un destino
   auxiliar que deba conservarse por otra ficha, un consumidor externo o un `--keep`
   impide esa incorporación automática. Los usos del entrypoint obligatorio se
   conservan en el diagnóstico de dependencias y bloquean la retirada.
   Que un archivo sea alcanzable desde la implementación no prueba que sea suyo;
   tampoco autoriza retirar el barrel que lo reexporta. No se
   ignora un archivo por llamarse `index.ts`. Exports de otros componentes o lógica
   adicional requieren una decisión explícita. Los usos desde fuera del grupo o
   las reclamaciones de otras fichas siguen bloqueando; una referencia desde un
   archivo que se conservará tampoco se trata como interna a la retirada.
   Los bloqueos del plan usan `COMPONENT_REMOVAL_BLOCKED`: `details.dependencies`
   identifica origen y destino, con `sourceRetention` para distinguir un `--keep`
   explícito, una reclamación de otra ficha o un consumidor externo.
   `details.fileConflicts` explica los archivos compartidos cuya retirada se pidió
   y los archivos obligatorios que no pueden conservarse al retirar el componente.
   Estas causas se mantienen aunque la protección de archivos compartidos fuerce
   su conservación. El CLI las devuelve en stderr; el mensaje también las incluye.
   Los `.DS_Store` se ignoran fuera de las carpetas de componentes. Dentro de una
   carpeta que quedaría vacía, se incluyen automáticamente en `filesystemMetadata`
   y `operations`, se respaldan y se retiran con el plan autorizado; restaurar los
   recupera. No requieren `--retire` individual ni se borran durante la planificación.
4. Si hay uso en la demo, aporta `--demo PROPOSAL_JSON` al preparar el plan. Este
   JSON contiene `path` (`src/App.tsx` o `src/App.jsx`) y `text` (el contenido completo
   propuesto). El agente prepara una edición que preserve la lógica ajena, la
   muestra y la incluye en la autorización; el script no transforma JSX por su
   cuenta. Si no se puede preservar esa lógica, detente y pide una decisión.
5. Archivar vuelve a calcular el plan y comprueba el censo de archivos y permisos.
   Cualquier cambio requiere un plan nuevo. Guarda originales, propuestas y un
   manifiesto fuera del árbol activo antes de tocar archivos. No depende de que
   Git permita recuperar el contenido actual.
6. Retira código y ficha enumerados y actualiza mapa, estado e inventario. Conserva
   tokens locales, fuentes, recursos y evidencia histórica. Regenera `tokens.css`:
   puede cambiar al dejar de incluir instantáneas externas del componente.
7. Ejecuta comprobaciones estáticas y el gate real `verify:imports`. Nuevos errores
   estáticos provocan recuperación; evidencia caducada, un gate fallido o no
   ejecutado dejan `delivery: PENDING_VERIFICATION` con el archivo recuperable.
   `AUTOMATED_CHECKS_PASSED` solo describe esos checks: no demuestra fidelidad de
   consumidores ni crea confirmaciones nuevas. Comprueba la UI afectada según
   `.agents/skills/validate-ds/SKILL.md` antes de declarar la entrega terminada.

### Limpieza opcional

Las decisiones de serialización externa se conservan por defecto. Si una decisión
FLOAT exclusiva del componente impediría regenerar CSS, el plan se bloquea. Tras
revisarla, puede prepararse otro plan con `--retire-serialization ID` (repetible).
Solo admite decisiones externas del componente sin consumidores identificados en
las otras fichas; la generación posterior debe pasar. La eliminación exacta queda
en el estado respaldado y se deshace al restaurar. No elimina tokens locales ni
recursos compartidos. La ausencia de consumidores identificados no prueba que no
haya usos fuera del alcance del análisis. No hay limpieza automática de huérfanos.

## Restaurar y recuperar

`ARCHIVE` es la carpeta devuelta por el archivado, con `plan.json`, `manifest.json`,
`originals/` y `proposed/`. Conserva todo su contenido hasta decidir que ya no se
necesita recuperación.

```sh
node .agents/skills/create-ds-from-figma/scripts/component-removal.mjs restore ROOT ARCHIVE --approve-restore
node .agents/skills/create-ds-from-figma/scripts/component-removal.mjs recover ROOT ARCHIVE --approve-recover --confirm-operation-stopped
```

Restaurar comprueba todos los hashes del respaldo y que el proyecto aún coincide
con el resultado archivado en las rutas que va a escribir. Rechaza cambios
posteriores, archivos recreados, enlaces y directorios incompatibles. Recupera
bytes y permisos y ejecuta los checks; no aprueba evidencia histórica.

Una importación posterior suele modificar mapa, estado, inventario o `tokens.css`.
Si cambió cualquiera de esos archivos incluido en las operaciones del archivo,
la restauración automática se rechaza antes de escribir. No fusiona registros ni
deshace la importación posterior. Conserva el respaldo para una recuperación
asistida con comparación de originales, propuestas y estado actual; no fuerces
los hashes ni sustituyas registros completos para superar el conflicto.

Una interrupción recuperable intenta deshacer solo sus propias operaciones. Si
encuentra cambios concurrentes, los conserva, registra `RECOVERY_REQUIRED` y deja
el bloqueo `.component-removal.lock`. No lo borres ni fuerces la restauración:
inspecciona los conflictos, conserva el trabajo posterior y resuélvelos explícitamente.
Antes de `recover`, comprueba que la operación original se detuvo; un PID no lo
demuestra. La recuperación puede dejar conflictos o restaurar los originales,
pero no ejecuta el gate: vuelve a validar. Un respaldo interrumpido en `PREPARING`
solo se abandona si el proyecto coincide íntegramente con el origen del plan.

Para borrar definitivamente **solo el respaldo**, con autorización específica:

```sh
node .agents/skills/create-ds-from-figma/scripts/component-removal.mjs purge ROOT ARCHIVE --approve-purge --confirm-backup-not-needed
```

Es irreversible. Rechaza operaciones activas, respaldos corruptos y archivos o
directorios añadidos al archivo, incluso vacíos; no borra evidencia ni recursos
del proyecto. No equivale a
limpiar huérfanos. El CLI devuelve exit 1 ante conflictos o verificación pendiente;
en ese caso el archivado puede haberse completado: lee `status`, `archive` y
`validation` antes de reintentar.

## Límites

La búsqueda no demuestra una lista completa de consumidores: clases CSS escritas
a mano, referencias en tiempo de ejecución, paquetes externos y archivos fuera
de `src/` pueden quedar fuera. Los imports literales usan el resolvedor existente;
los no literales o no resueltos son incertidumbres. La búsqueda reutiliza el cierre
de dependencias existente: puede incluir rutas transitivas por barrels o por la
demo, no solo imports directos. Una ruta identificada no demuestra qué archivo
hay que editar. Tras proponer una edición de la demo hay que repetir el análisis;
no se presupone que desaparezcan todos sus dependientes ni se proponen cambios
en cascada. El informe no modifica el motor ni la versión del comparador.

`fingerprintedInputs` contiene hashes leídos por el informe, no un manifiesto
completo de todos los inputs internos de verificadores y resolvedores. El plan
añade un censo de archivos y permisos del ámbito de análisis. Se copia a un temporal
`src/` y `design-system/` completos, manifiestos/locks de paquetes, configuraciones
TypeScript raíz y heredadas, archivos declarados por esas configuraciones
(incluidas declaraciones fuera de `src/`, `typeRoots`, `types` y declaraciones
transitivas resueltas por el compilador),
entradas, fuentes y recursos declarados por las fichas, dependencias locales alcanzables y
el vocabulario de props. Esto incluye los recursos y snapshots de esos árboles:
todavía puede ser costoso en un DS grande, pero no copia el repositorio entero.
Se excluyen `.env` y `.env.*`, Git, `node_modules`, carpetas ajenas y el resto de la
infraestructura del kit. Una dependencia explícita de un archivo de entorno se
rechaza en vez de copiarlo. Las configuraciones TypeScript se leen, no se ejecutan;
el programa del compilador se construye solo para resolver sus entradas, sin emitir
código ni ejecutar el proyecto. Las dependencias instaladas y las bibliotecas de
TypeScript se reutilizan; otras entradas fuera del proyecto requieren revisión.
Los directorios del temporal mantienen permisos suficientes para copiar, simular
y limpiar. Los permisos originales quedan en el manifiesto y se usan en el proyecto
activo y en la restauración; los permisos temporales no prueban que una escritura
esté permitida en el sistema de archivos del proyecto.
No prueba que las dependencias instaladas o el entorno sean idénticos. Un cambio
fuera de ese ámbito no invalida el plan; nuevos consumidores en `src/` sí lo hacen.
Los enlaces ajenos al ámbito no se inspeccionan ni bloquean; los enlaces dentro de
los árboles analizados o de dependencias/configuraciones requeridas se rechazan.
`node_modules` solo se reutiliza para resolver dependencias, incluidas referencias
explícitas de declaraciones TypeScript; no se añade a la cola de archivos locales
ni se copia al temporal. No edites el proyecto
ni el respaldo durante una operación: el lock
solo coordina estos comandos, no bloquea editores ni otros procesos. Hay reemplazos
atómicos por archivo y recuperación con hashes, no una transacción global ni una
garantía frente a cualquier fallo de disco o corte de energía.

Los tests usan fixtures: prueban plan sin escrituras, archivado/restauración,
permisos, conflictos, respaldos, interrupción de proceso y recuperación. El perfil
Chromium ejecuta el gate real; no compara visualmente una retirada de un DS real
ni demuestra el enrutamiento del agente.
