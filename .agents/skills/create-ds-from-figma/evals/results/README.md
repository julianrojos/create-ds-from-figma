# Exploraciones Históricas

`tooltip-inter-calibration.json` no es un fixture autosuficiente ni un cierre confirmado. Sus 14 entradas coinciden byte a byte con los blobs del commit `31b869be49ae142bd82d52ab34331b6e4d149fa3`, que pertenecía a `test/15_octubre_2`. La rama puede avanzar; el commit y los hashes son la referencia. No hubo modificaciones de esas entradas: las fuentes se inyectaron solo en el navegador.

Para reconstruir las entradas sin cambiar la rama ni crear un worktree:

```sh
git cat-file -e 31b869be49ae142bd82d52ab34331b6e4d149fa3^{commit}
REPLAY=$(mktemp -d)
git archive 31b869be49ae142bd82d52ab34331b6e4d149fa3 | tar -x -C "$REPLAY"
npm ci --prefix "$REPLAY"
```

Si falta el objeto Git, hace falta recuperar ese commit desde su repositorio de origen; no sustituirlo por la punta actual de la rama. Antes de medir, compara cada archivo `inputs[*].path` reconstruido con su SHA-256 registrado.

Prepara un manifiesto de fuentes con rutas absolutas a `inter-latin-400-normal.woff2` e `inter-latin-600-normal.woff2` de `@fontsource/inter@5.3.0` (el runtime de pruebas del kit incluye el paquete). Declara familia Inter, pesos 400/600 y estilo normal; verifica los hashes de ambos archivos contra el informe. Usa el comando `verification-browser.mjs calibrate` del kit actual con la copia temporal, su metadata de Tooltip, ese manifiesto, un módulo Playwright explícito y un binario autorizado. Guarda un resultado nuevo, sin sobrescribir el histórico.

El informe histórico usó Chrome 155.0.8059.40. No registra la versión del driver ni todos los detalles del sistema, por lo que reconstruir entradas no garantiza repetir exactamente sus métricas. Un navegador distinto permite repetir el experimento, no validar retrospectivamente todos los bytes obtenidos. La regresión actual obligatoria usa su propio Chromium fijado y un corpus sintético independiente; esta exploración no determina tolerancias universales ni acredita que el Tooltip real haya superado el cierre actual.
