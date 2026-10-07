// Shared decision about whether a project is a new design system or already has published names.
// Each tool reads its own evidence and passes it in, so the verdict and message are identical.

import postcss from "postcss";
import { isValidTokenPrefix } from "./css-name.mjs";

export const MISSING_PREFIX_MESSAGE =
  "figma-state.json does not declare tokenPrefix, but tokens or imported components already exist. " +
  "The state is inconsistent: repair it explicitly by setting tokenPrefix to the convention the existing " +
  "cssName values already use, then rerun. The preflight does not adopt an existing design system.";

// Only declaration nodes count; strings, comments and var() references do not.
export function customPropertyDeclarations(css) {
  const names = new Set();
  const root = typeof css === "string" ? postcss.parse(css) : css;
  root.walkDecls((decl) => {
    if (decl.prop.startsWith("--")) names.add(decl.prop);
  });
  return [...names].sort();
}

/**
 * evidence: { tokenPrefix, collectionIds, tokenFiles, declaredCustomProperties, importedComponents }
 * Returns { status: "fixed" | "new" | "invalid" | "missing", message?, published? }
 */
export function assessTokenPrefix(evidence = {}) {
  const { tokenPrefix = null } = evidence;
  if (tokenPrefix !== null) {
    return isValidTokenPrefix(tokenPrefix)
      ? { status: "fixed" }
      : { status: "invalid", message: `tokenPrefix ${JSON.stringify(tokenPrefix)} is not a valid prefix (lowercase ASCII letters, digits and single hyphens, starting with a letter, at most 20 characters)` };
  }
  const published = {
    collections: [...(evidence.collectionIds || [])],
    tokenFiles: [...(evidence.tokenFiles || [])],
    customProperties: [...(evidence.declaredCustomProperties || [])],
    components: [...(evidence.importedComponents || [])],
  };
  return Object.values(published).some((list) => list.length > 0)
    ? { status: "missing", message: MISSING_PREFIX_MESSAGE, published }
    : { status: "new" };
}
