// Inject tool adapters so the same bridge runs in a tool orchestrator and in tests.
export async function captureViaBridge({ fileKey, nodeId, runFigma, getCode, stage, maxChunks = 128 }) {
  const chunks = [];
  let offset = 0, total, checksum;
  for (let count = 0; count < maxChunks; count++) {
    const result = await runFigma(await getCode(offset));
    if (result.isError) throw new Error('Figma capture tool failed');
    const texts = result.content?.filter(c => c.type === 'text') || [];
    if (texts.length !== 1) throw new Error('Expected one structured Figma response');
    const chunk = JSON.parse(texts[0].text);
    if (chunk.transportVersion !== 1 || chunk.offset !== offset || !Number.isSafeInteger(chunk.total) || chunk.total < 1 ||
        typeof chunk.checksum !== 'string' || typeof chunk.payload !== 'string' || !chunk.payload.length ||
        offset + chunk.payload.length > chunk.total) throw new Error('Invalid or truncated Figma response');
    if (count && (chunk.total !== total || chunk.checksum !== checksum)) throw new Error('Capture changed: retry with a NEW temporary session');
    total = chunk.total; checksum = chunk.checksum;
    await stage(chunk);
    chunks.push(chunk);
    offset += chunk.payload.length;
    if (offset === total) return { fileKey, nodeId, chunks, total, checksum };
  }
  throw new Error('Capture chunk limit exceeded; use another transport, not manual transcription');
}

export function shellQuote(value) {
  return "'" + String(value).replaceAll("'", "'\\''") + "'";
}

export function bridgeCode(script, fileKey, nodeId) {
  return `const quote = ${shellQuote.toString()};
const captureViaBridge = ${captureViaBridge.toString()};
const script = ${JSON.stringify(script)};
const run = async cmd => {
  const result = await tools.exec_command({cmd, max_output_tokens: 16000});
  if (result.session_id || result.exit_code !== 0) throw new Error(result.output || 'Capture command did not complete');
  return result.output.trim();
};
const directory = await run('node ' + quote(script) + ' session');
try {
const result = await captureViaBridge({
  fileKey: ${JSON.stringify(fileKey)}, nodeId: ${JSON.stringify(nodeId)},
  getCode: offset => run('node ' + quote(script) + ' code ' + quote(${JSON.stringify(fileKey)}) + ' ' + quote(${JSON.stringify(nodeId)}) + ' ' + offset),
  runFigma: code => tools.mcp__codex_apps__figma_use_figma({fileKey: ${JSON.stringify(fileKey)}, code, description: 'Read-only auditable component capture', skillNames: 'figma-use'}),
  stage: chunk => run("printf '%s' " + quote(JSON.stringify(chunk)) + ' | node ' + quote(script) + ' stage ' + quote(directory))
});
await run('node ' + quote(script) + ' validate-session ' + quote(directory));
text({directory, chunks: result.chunks.length, total: result.total, checksum: result.checksum, persistedInProject: false});
} catch (error) {
  text({failedSession: directory, error: error.message, retry: 'Run bridge again to create a new session'});
  throw error;
}`;
}
