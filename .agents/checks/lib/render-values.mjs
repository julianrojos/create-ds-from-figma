// Independent raw-value conversions. Unsupported or contextual values stay unresolved.
export function renderedExpectation(field, value, { fontSize } = {}) {
  const name = field.replace(/^segments\[\d+\]\./, '');
  if (name === 'lineHeight') {
    if (value?.unit === 'PIXELS' && Number.isFinite(value.value)) return { css: `${value.value}px`, comparable: true };
    if (value?.unit === 'PERCENT' && Number.isFinite(value.value) && Number.isFinite(fontSize) && fontSize > 0) return { css: `${fontSize * value.value / 100}px`, comparable: true };
    return { comparable: false, reason: 'Line height needs an independently observed same-range font size or contextual comparison.' };
  }
  if (name === 'letterSpacing') {
    if (value?.unit === 'PIXELS' && Number.isFinite(value.value)) return { css: `${value.value}px`, comparable: true };
    if (value?.unit === 'PERCENT' && Number.isFinite(value.value) && Number.isFinite(fontSize) && fontSize > 0) return { css: `${fontSize * value.value / 100}px`, comparable: true };
  }
  if (name === 'fontSize' && Number.isFinite(value) && value > 0) return { css: `${value}px`, comparable: true };
  if (name === 'fontWeight' && Number.isFinite(value) && value >= 1 && value <= 1000) return { css: String(value), comparable: true };
  if (name === 'color' && value && ['r', 'g', 'b'].every(k => Number.isFinite(value[k]) && value[k] >= 0 && value[k] <= 1) && (value.a === undefined || Number.isFinite(value.a) && value.a >= 0 && value.a <= 1)) {
    return { css: `rgba(${['r', 'g', 'b'].map(k => Math.round(value[k] * 255)).join(', ')}, ${value.a ?? 1})`, comparable: true };
  }
  return { comparable: false, reason: 'No independent conversion rule is defined for this field.' };
}
