// Blank code and comments while preserving line numbers; examples may contain template-like text.
export function markdownProse(markdown, { keepInlineCode = false } = {}) {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, "")).split("\n");
  let fence = null;
  let previousBlankOrCode = true;
  return lines.map((line) => {
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      previousBlankOrCode = true;
      return "";
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) {
      fence = open[1];
      previousBlankOrCode = true;
      return "";
    }
    if (/^(?: {4}|\t)/.test(line) && previousBlankOrCode && line.trim()) return "";
    previousBlankOrCode = !line.trim();
    return keepInlineCode ? line : line.replace(/(`+)(?:(?!\1).)+?\1/g, "");
  });
}
