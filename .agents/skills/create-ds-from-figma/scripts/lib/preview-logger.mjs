// Vite's default info logger writes to stdout, which belongs to the CLI's JSON result.
export function previewLogger(write = message => process.stderr.write(message)) {
  const warned = new Set(), errors = new WeakSet();
  const output = (level, message) => write(`[vite:${level}] ${message}\n`);
  const logger = {
    hasWarned: false,
    info(message) { output('info', message); },
    warn(message) { logger.hasWarned = true; output('warn', message); },
    warnOnce(message) { if (!warned.has(message)) { warned.add(message); logger.warn(message); } },
    error(message, options) {
      logger.hasWarned = true;
      if (options?.error && ['object', 'function'].includes(typeof options.error)) errors.add(options.error);
      output('error', message);
    },
    clearScreen() {},
    hasErrorLogged(error) { return errors.has(error); },
  };
  return logger;
}
