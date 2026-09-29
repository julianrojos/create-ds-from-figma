# Tabs usage

## Use

Usa `Tabs` para agrupar pestanas `Tab` en una fila. Pasa `items` con identificadores unicos y una etiqueta accesible para el grupo. La primera pestana queda seleccionada por defecto; usa `value` y `onValueChange` para controlar la seleccion desde fuera, o `defaultValue` para fijar la inicial.

`id` identifica la seleccion dentro del grupo, no el elemento del DOM: dos grupos pueden usar los mismos valores. Si hay paneles, asigna a cada item un `panelId` y un `tabId`, y renderiza fuera de este componente el `tabpanel` correspondiente con `aria-labelledby` apuntando a ese `tabId`; ambos deben ser unicos en la pagina. `Tabs` gestiona el clic y las teclas Izquierda, Derecha, Inicio y Fin; el contenido y el estado de los paneles siguen siendo responsabilidad del contenedor.

## Do not

- No uses `Tabs` para navegar entre paginas.
- No dupliques los estilos ni el comportamiento visual de `Tab` dentro del grupo.
- No repitas los id de los items ni selecciones varias pestanas a la vez.
