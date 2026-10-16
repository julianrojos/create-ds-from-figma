// A recorded resource is requested at one weight; only the available @font-face may declare a range.
export function concreteFontWeight(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (value === 'normal') return 400;
  if (value === 'bold') return 700;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return number >= 1 && number <= 1000 ? number : null;
}
