# Star usage

## Use

Usa `Star` como icono decorativo junto a una etiqueta. Si el icono aparece solo y comunica informacion, proporciona `label`. En un control sin texto visible, da el nombre accesible al control y deja el icono decorativo.

Su color por defecto usa `Icon/Default/Default`. Para heredar el color de un control, pasa `className={styles.controlIcon}` al icono y define esta clase en el CSS del componente que lo contiene:

```css
.control .controlIcon {
  color: inherit;
}
```

## Do not

- No uses el icono por si solo como control interactivo.
- No repitas en `label` el texto visible que lo acompana.
