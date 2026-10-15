import { canonicalJson } from './figma-evidence.mjs';

const rect = r => r && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k])) && r.width >= 0 && r.height >= 0;
const context = c => Object.fromEntries(['figmaRef', 'modes', 'viewport', 'environment', 'states'].map(k => [k, c?.[k] ?? null]));

export function compareBehavior(metadata, configuration, measurement, baselineMeasurement, tolerance, add) {
  const expectations = configuration.expectations || [];
  if (!expectations.length) { add('behavior:coverage', 'NOT COMPARABLE', 'No explicit behavior invariant was declared.'); return; }
  const base = metadata.verification?.cases?.find(c => c.id === configuration.baseline && c.kind === 'fidelity');
  const keys = Object.entries(metadata.parts?.root?.nodes || {}).filter(([, ref]) => ref === configuration.figmaRef).map(([key]) => key);
  const readPart = (name, body, c, allowAffineCenter = false) => {
    const refs = [...new Set(keys.map(key => metadata.parts?.[name]?.nodes?.[key]).filter(Boolean))];
    if (refs.length !== 1) return { status: 'NOT COMPARABLE', reason: 'Invariant needs an unambiguous mapped part.' };
    const part = body?.parts?.[name];
    if (!part || !Array.isArray(part.elements) || part.count !== part.elements.length) return { status: 'NOT RUN', reason: 'Invariant part measurement is missing or malformed.' };
    if (part.count !== 1) return { status: part.count === 0 ? 'FAIL' : 'NOT COMPARABLE', reason: 'Invariant requires one visible element for this part.' };
    const element = part.elements[0];
    if (element.geometry?.visible !== true || element.geometry?.laidOut !== true) return { status: 'FAIL', reason: 'Invariant part must be visibly laid out.' };
    if (element.geometry?.axisAligned !== true && !(allowAffineCenter && element.geometry?.affine2d === true && body.parts?.root?.elements?.[0]?.geometry?.axisAligned === true)) return { status: 'NOT COMPARABLE', reason: 'Invariant does not support transformed layout boxes.' };
    if (!rect(element.rect)) return { status: 'NOT RUN', reason: 'Invariant needs readable layout bounds.' };
    if (c.content?.[refs[0]] !== undefined && c.content[refs[0]] !== element.text) return { status: 'FAIL', reason: 'Behavior content in the DOM differs from the declared configuration.' };
    return { element };
  };
  const distances = (box, container) => ({ left: box.x - container.x, right: container.x + container.width - box.x - box.width,
    top: box.y - container.y, bottom: container.y + container.height - box.y - box.height });
  for (const [index, expectation] of expectations.entries()) {
    const id = `behavior:${index}:${expectation?.kind}`;
    if (!measurement) { add(id, 'NOT RUN', 'No behavior measurement.'); continue; }
    if (!base || canonicalJson(context(base)) !== canonicalJson(context(configuration))) { add(id, 'NOT COMPARABLE', 'Behavior needs a fidelity baseline with the same source and environment.'); continue; }
    const actual = readPart(expectation?.part, measurement, configuration, expectation?.kind === 'centered');
    if (!actual.element) { add(id, actual.status, actual.reason); continue; }
    const box = actual.element.rect;
    if (expectation.kind === 'contained') {
      const container = readPart(expectation.container, measurement, configuration), inset = expectation.inset ?? 0;
      if (!container.element) { add(id, container.status, container.reason); continue; }
      if (expectation.part === expectation.container || !Number.isFinite(inset) || inset < 0) { add(id, 'NOT COMPARABLE', 'Containment requires a distinct container and a nonnegative explicit inset.'); continue; }
      const measured = distances(box, container.element.rect);
      add(id, Object.values(measured).every(v => v >= inset - tolerance) ? 'PASS' : 'FAIL', 'Declared containment against the container border-box, not an inferred padding rule.', { expected: { minimumInset: inset }, measured, tolerance });
      continue;
    }
    if (expectation.kind === 'intrinsic-size' && !expectation.relation) { add(id, 'NOT COMPARABLE', 'Content-dependent sizing does not imply a change in every dimension; declare a justified relation.'); continue; }
    if (expectation.kind === 'centered' && expectation.relation === 'center') {
      const container = readPart(expectation.container, measurement, configuration);
      if (!container.element) { add(id, container.status, container.reason); continue; }
      if (expectation.part === expectation.container || !['x', 'y'].includes(expectation.axis)) { add(id, 'NOT COMPARABLE', 'Centering needs distinct parts and an explicit axis.'); continue; }
      const size = expectation.axis === 'x' ? 'width' : 'height';
      const measured = box[expectation.axis] + box[size] / 2 - container.element.rect[expectation.axis] - container.element.rect[size] / 2;
      add(id, Math.abs(measured) <= tolerance ? 'PASS' : 'FAIL', 'Declared centers must coincide on the selected axis.', { axis: expectation.axis, relation: 'center', expected: 0, measured, delta: measured, tolerance });
      continue;
    }
    if (!['anchored', 'centered', 'intrinsic-size'].includes(expectation.kind)) { add(id, 'NOT COMPARABLE', 'Unsupported explicit behavior invariant.'); continue; }
    if (!baselineMeasurement) { add(id, 'NOT RUN', 'This invariant requires a separate baseline measurement.'); continue; }
    if (canonicalJson(baselineMeasurement.configuration ?? null) !== canonicalJson(base) || baselineMeasurement.snapshotHash !== measurement.snapshotHash) { add(id, 'NOT COMPARABLE', 'Baseline measurement does not identify the same snapshot and declared baseline.'); continue; }
    const prior = readPart(expectation.part, baselineMeasurement, base, expectation.kind === 'centered');
    if (!prior.element) { add(id, 'NOT COMPARABLE', `Baseline part cannot establish the relation: ${prior.reason}`); continue; }
    if (['anchored', 'centered'].includes(expectation.kind)) {
      const container = readPart(expectation.container, measurement, configuration), previousContainer = readPart(expectation.container, baselineMeasurement, base);
      if (!container.element) { add(id, container.status, container.reason); continue; }
      if (!previousContainer.element) { add(id, 'NOT COMPARABLE', 'Baseline container is not comparable.'); continue; }
      const centered = expectation.kind === 'centered';
      if (expectation.part === expectation.container || (centered ? !['x', 'y'].includes(expectation.axis) || expectation.relation !== 'preserve-offset' : !['left', 'right', 'top', 'bottom'].includes(expectation.edge))) { add(id, 'NOT COMPARABLE', 'Anchor/center relation needs distinct parts and an explicit supported edge or axis/relation.'); continue; }
      const offset = (child, parent) => {
        const size = expectation.axis === 'x' ? 'width' : 'height';
        return child[expectation.axis] + child[size] / 2 - parent[expectation.axis] - parent[size] / 2;
      };
      const expected = centered ? offset(prior.element.rect, previousContainer.element.rect) : distances(prior.element.rect, previousContainer.element.rect)[expectation.edge];
      const measured = centered ? offset(box, container.element.rect) : distances(box, container.element.rect)[expectation.edge], delta = measured - expected;
      add(id, Math.abs(delta) <= tolerance ? 'PASS' : 'FAIL', 'Declared signed offset must remain equal to the measured baseline.', { ...(centered ? { axis: expectation.axis, relation: expectation.relation } : { edge: expectation.edge }), expected, measured, delta, tolerance });
    } else {
      const axis = expectation.axis, relation = expectation.relation;
      if (!['width', 'height'].includes(axis) || !['grow', 'shrink', 'equal', 'change'].includes(relation)) { add(id, 'NOT COMPARABLE', 'Intrinsic sizing requires an explicit axis and supported dimensional relation.'); continue; }
      const expected = prior.element.rect[axis], measured = box[axis], delta = measured - expected;
      const pass = relation === 'grow' ? delta > tolerance : relation === 'shrink' ? delta < -tolerance : relation === 'equal' ? Math.abs(delta) <= tolerance : Math.abs(delta) > tolerance;
      add(id, pass ? 'PASS' : 'FAIL', 'Explicit dimensional relation against the measured baseline, not copied source dimensions.', { relation, axis, expected, measured, delta, tolerance });
    }
  }
}
