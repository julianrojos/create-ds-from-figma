# Tab usage

## Use

Usa `Tab` como pestana individual dentro de un grupo `tablist`. El contenedor controla cuál está activa, la navegación entre pestanas y los paneles asociados. Pasa `aria-controls` e `id` cuando haya un panel correspondiente.

## Do not

- No uses `Tab` como enlace de navegacion entre paginas.
- No marques varias pestanas del mismo grupo como activas.
- No recrees el estado Hover con una prop: el componente lo muestra al pasar el puntero.
