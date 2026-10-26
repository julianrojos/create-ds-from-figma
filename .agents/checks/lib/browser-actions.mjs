export function browserActionsProblem(actions) {
  if (actions === undefined) return null;
  if (!Array.isArray(actions) || actions.length > 32) return 'actions must be an array of at most 32 explicit browser actions';
  for (const action of actions) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return 'Each browser action must be an object';
    if (['hover', 'click'].includes(action.kind)) {
      if (Object.keys(action).some(k => !['kind', 'selector'].includes(k)) || typeof action.selector !== 'string' || !action.selector.trim() || action.selector.length > 256) return 'hover/click actions require only kind and a scoped selector';
    } else if (action.kind === 'press') {
      if (Object.keys(action).some(k => !['kind', 'key'].includes(k)) || !['Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape'].includes(action.key)) return 'press actions require only kind and a supported navigation key';
    } else return 'Unsupported browser action; only hover, click and press are allowed';
  }
  return null;
}
