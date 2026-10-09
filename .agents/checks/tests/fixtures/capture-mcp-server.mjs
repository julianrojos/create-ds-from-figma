import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export function captureServer(mode = 'normal') {
  const codeOnly = ['code-only', 'wrong-file', 'unknown-file'].includes(mode);
  const server = new Server({ name: 'capture-test-server', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mode === 'missing' ? [] : [{ name: 'execute_design', inputSchema: {
    type: 'object', properties: { javascript: { type: 'string' }, ...(codeOnly ? {} : { designFile: { type: 'string' } }) }, required: codeOnly ? ['javascript'] : ['javascript', 'designFile'] } }] }));
  let calls = 0;
  server.setRequestHandler(CallToolRequestSchema, async request => {
    if (mode === 'error') return { isError: true, content: [{ type: 'text', text: 'Tool unavailable' }] };
    if (codeOnly && 'designFile' in request.params.arguments) throw new Error('Unexpected file argument');
    const root = { id: '1:1', type: 'COMPONENT', name: 'Example', children: [], componentPropertyDefinitions: {} };
    const text = { id: '1:2', type: 'TEXT', name: 'Text', parent: root, characters: "Quotes '\"; $(exit 99)\\n".repeat(2000),
      getStyledTextSegments: () => [] };
    root.children.push(text);
    const figma = { skipInvisibleInstanceChildren: true, fileKey: mode === 'wrong-file' ? 'OTHER' : mode === 'unknown-file' ? undefined : 'FILE', getNodeByIdAsync: async id => id === root.id ? root : text,
      variables: { getLocalVariableCollectionsAsync: async () => [] } };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const result = await new AsyncFunction('figma', request.params.arguments.javascript)(figma);
    if (mode === 'changing' && calls++) result.checksum = 'changed';
    return { content: [{ type: 'text', text: mode === 'corrupt' ? 'truncated {' : JSON.stringify(result) }] };
  });
  return server;
}

if (process.argv[1]?.endsWith('capture-mcp-server.mjs')) await captureServer(process.argv[2]).connect(new StdioServerTransport());
