# Controlled Paint Alpha Observation

On 2026-10-26, an authorized temporary experiment used the official Figma
`use_figma` Plugin API (apiVersion `1.0.0`) in a Design file. No component
was modified. A temporary frame, five green rectangles, one local collection
and two COLOR variables were created and exported as SVG. The frame was also
rendered over white. All temporary nodes, variables and the collection were
removed; a subsequent read confirmed their absence.

This is an experiment record, not a sealed component capture, an authenticated
revision, or an automated test against live Figma. It contains no imported
component assets. The observations do not establish every possible Figma
paint, mode, group-opacity or blending configuration.

| Assignment | Initial paint opacity | Variable alpha | Stored paint opacity | SVG fill-opacity |
| --- | --- | --- | --- | --- |
| Literal green | 0.5 | none | 0.5 | 0.5 |
| Bound green | 1 | 0.5 | 0.5 | 0.5 |
| Bound green | 0.5 | 1 | 1 | omitted (opaque) |
| Bound green | 0.5 | 0.5 | 0.5 | 0.5 |
| Bound green, opacity set to 0.25 before assignment | 1 | 0.5 | 0.5 | 0.5 |

All stored colors were `{r:0,g:1,b:0}`. Binding was performed with
`figma.variables.setBoundVariableForPaint(paint, 'color', variable)`, followed
by assigning the returned paint to `rectangle.fills`. The helper's return
value still held the initial opacity; reading the assigned `rectangle.fills`
produced the resolved opacity in the table. Exporting the assigned rectangle
produced the same single alpha, not a product of the initial paint opacity
and the variable alpha.

Minimal reproduction within an authorized Figma session:

```js
const collection = figma.variables.createVariableCollection('__alpha_probe__');
let variable, rectangle;
try {
  variable = figma.variables.createVariable('green', collection, 'COLOR');
  variable.scopes = ['SHAPE_FILL'];
  variable.setValueForMode(collection.defaultModeId, { r: 0, g: 1, b: 0, a: 0.5 });
  rectangle = figma.createRectangle();
  rectangle.resize(24, 24);
  rectangle.fills = [figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0, g: 1, b: 0 }, opacity: 0.5 }, 'color', variable
  )];
  return { paint: rectangle.fills[0], svg: await rectangle.exportAsync({ format: 'SVG_STRING' }) };
} finally {
  if (rectangle) await rectangle.remove();
  if (variable) await variable.remove();
  await collection.remove();
}
```

The comparator deliberately supports less than a general compositor:
only a readable binding whose assigned paint RGB/opacity mirrors its resolved
variable, and a mapped CSS element with original computed opacity equal to one
(also fill-opacity/stroke-opacity when comparing SVG fill/stroke).
It compares the declared CSS color, not ancestor opacity, mask loading or
visible pixels. A different mode that changes the reflected paint, separate
CSS opacity, or a transparent literal still needs explicit resolution/review.
