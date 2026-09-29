# X usage

## Use

Usa `X` como icono decorativo junto a una etiqueta o dentro de un control con nombre accesible. En un boton de cierre sin texto visible, da el nombre accesible al boton y deja el icono decorativo. Reserva `label` para un icono informativo fuera de un control.

Su color por defecto usa `Icon/Default/Default`. Para heredar el color de un control, pasa `className={styles.controlIcon}` al icono y define esta clase en el CSS del componente que lo contiene:

```css
.control .controlIcon {
  color: inherit;
}
```

## Do not

- No uses el icono por si solo como boton de cierre.
- No repitas en `label` el nombre accesible del control que lo contiene.
