import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureCode, assembleChunks } from './capture-code.mjs';
import { captureViaBridge } from './capture-bridge.mjs';
import { sealCapture } from '../../../../checks/lib/figma-evidence.mjs';

export function mcpConfiguration(config, env = process.env) {
  if (!config || !['stdio', 'http'].includes(config.transport?.type) || !config.tool?.name) throw new Error('MCP config requires transport.type and tool.name');
  const timeout = config.timeoutMs ?? 60000;
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 300000) throw new Error('MCP timeoutMs must be between 1000 and 300000');
  const chunkSize = config.chunkSize ?? null;
  if (chunkSize !== null && (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 12000)) throw new Error('Invalid MCP chunkSize');
  const environment = { ...getDefaultEnvironment() };
  for (const name of config.transport.envFrom || []) {
    if (typeof name !== 'string' || !env[name]) throw new Error('A configured MCP environment variable is unavailable');
    environment[name] = env[name];
  }
  const headers = {};
  for (const [header, name] of Object.entries(config.transport.headersFromEnv || {})) {
    if (typeof name !== 'string' || !env[name]) throw new Error('A configured MCP header environment variable is unavailable');
    headers[header] = env[name];
  }
  const t = config.transport;
  if (t.type === 'stdio' && (typeof t.command !== 'string' || !t.command || !Array.isArray(t.args || []) || (t.args || []).some(a => typeof a !== 'string'))) throw new Error('Invalid MCP stdio command');
  if (t.type === 'http') {
    const url = new URL(t.url);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('MCP requires HTTPS or loopback HTTP without URL credentials');
  }
  const codeArgument = config.tool.codeArgument ?? 'code';
  const fileKeyArgument = config.tool.fileKeyArgument === undefined ? 'fileKey' : config.tool.fileKeyArgument;
  if (codeArgument === fileKeyArgument || [codeArgument, ...(fileKeyArgument === null ? [] : [fileKeyArgument])].some(n => typeof n !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(n))) throw new Error('Invalid MCP argument mapping');
  return { timeout, chunkSize, environment, headers, codeArgument, fileKeyArgument };
}

// No editor globals: the official SDK owns MCP framing, lifecycle and authentication errors.
export async function captureFromMcp(config, fileKey, nodeId, { approvedConnection = false, keepFailed = false } = {}) {
  if (approvedConnection !== true) throw new Error('MCP connection requires explicit approval before executing a command or contacting a server');
  const options = mcpConfiguration(config);
  captureCode(fileKey, nodeId, 0, options.chunkSize);
  const client = new Client({ name: 'figma-evidence-capture', version: '1.0.0' });
  const transport = config.transport.type === 'stdio'
    ? new StdioClientTransport({ command: config.transport.command, args: config.transport.args || [], env: options.environment, stderr: 'pipe' })
    : new StreamableHTTPClientTransport(new URL(config.transport.url), { requestInit: { headers: options.headers }, reconnectionOptions: { maxRetries: 0, maxReconnectionDelay: 1000, initialReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 } });
  if (transport.stderr) transport.stderr.resume();
  let directory;
  try {
    await client.connect(transport, { timeout: options.timeout });
    let cursor, tool;
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, { timeout: options.timeout });
      tool = page.tools.find(t => t.name === config.tool.name) || tool;
      cursor = page.nextCursor;
    } while (cursor && !tool);
    if (!tool) throw new Error('Configured Figma execution tool is not available on this MCP server');
    for (const field of [options.codeArgument, options.fileKeyArgument].filter(n => n !== null)) if (!tool.inputSchema?.properties?.[field]) throw new Error('Configured Figma tool does not expose the required mapped arguments');
    directory = mkdtempSync(path.join(os.tmpdir(), 'figma-capture-mcp-'));
    const result = await captureViaBridge({ fileKey, nodeId,
      getCode: async offset => (options.fileKeyArgument === null
        ? `if (figma.fileKey !== ${JSON.stringify(fileKey)}) throw new Error('Active Figma file cannot be verified or differs from the requested file');\n` : '') + captureCode(fileKey, nodeId, offset, options.chunkSize),
      runFigma: code => client.callTool({ name: config.tool.name, arguments: { ...config.tool.arguments,
        [options.codeArgument]: code, ...(options.fileKeyArgument === null ? {} : { [options.fileKeyArgument]: fileKey }) } }, undefined, { timeout: options.timeout }),
      stage: async chunk => writeFileSync(path.join(directory, `${chunk.offset}.json`), JSON.stringify(chunk) + '\n', { flag: 'wx' }),
    });
    const snapshot = sealCapture(assembleChunks(result.chunks));
    return { directory, chunks: result.chunks.length, total: result.total, hash: snapshot.hash,
      nodes: snapshot.capture.nodes.length, issues: snapshot.capture.coverage.issues.length, persistedInProject: false };
  } catch (error) {
    if (directory && !keepFailed) rmSync(directory, { recursive: true, force: true });
    const failure = new Error(`MCP capture failed${directory && keepFailed ? `; failed session: ${directory}` : ''}. Check connection, credentials and configured tool. ${error.message}`);
    if (directory) failure.session = { directory, retained: keepFailed };
    throw failure;
  } finally { await client.close(); await transport.close(); }
}
