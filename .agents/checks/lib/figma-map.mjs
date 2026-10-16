const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const refList = value => Array.isArray(value) ? value.filter(ref => typeof ref === 'string') : [];

// Instance mains often identify a variant, not its component set.
export function entryRefs(key, entry) {
  const variants = object(entry?.figma?.variants) ? Object.values(entry.figma.variants) : [];
  return [...new Set([key, ...refList(entry?.figma?.refs), ...variants.flatMap(variant => refList(variant?.refs))])];
}
