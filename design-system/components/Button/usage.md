# Button usage

## Use

Usa `Button` para una accion. `label` proporciona el texto visible y el nombre accesible. `variant` admite `Primary`, `Neutral` o `Subtle`; `size` admite `Medium` o `Small`. Ambos son opcionales y por defecto son `Primary` y `Medium`.

El hover responde al puntero; `disabled` usa el estado nativo del boton. `hasIconStart` muestra `Star` y `hasIconEnd` muestra `X`. Para cambiar uno, pasa `iconStart` o `iconEnd` junto con el `hasIcon...` correspondiente. Los iconos son decorativos: el nombre accesible procede de `label`.

## Do not

- No uses `Button` para navegar a otra pagina; usa un enlace.
- No representes Hover con una prop ni solo con cambios de color sin semantica.
- No anides controles interactivos en `iconStart` o `iconEnd`.
- No uses una etiqueta vacia; el boton debe conservar un nombre accesible.
