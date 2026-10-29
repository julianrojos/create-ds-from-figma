import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { inventoryMock } from './variable-inventory.mjs';
import { PNG } from 'pngjs';

export function captureServer(mode = 'normal') {
  const codeOnly = ['code-only', 'wrong-file', 'unknown-file'].includes(mode);
  const wrapped = mode.startsWith('wrapped');
  const codeArgument = wrapped ? 'code' : 'javascript', fileArgument = wrapped ? 'fileKey' : 'designFile';
  const server = new Server({ name: 'capture-test-server', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mode === 'missing' ? [] : [{ name: wrapped ? 'figma_execute' : 'execute_design', inputSchema: {
    type: 'object', properties: { [codeArgument]: { type: 'string' }, ...(codeOnly ? {} : { [fileArgument]: { type: 'string' } }) }, required: codeOnly ? [codeArgument] : [codeArgument, fileArgument] } }] }));
  let calls = 0;
  server.setRequestHandler(CallToolRequestSchema, async request => {
    if (mode === 'error') return { isError: true, content: [{ type: 'text', text: 'Tool unavailable' }] };
    if (codeOnly && 'designFile' in request.params.arguments) throw new Error('Unexpected file argument');
    const root = { id: '1:1', type: 'COMPONENT', name: 'Example', children: [], componentPropertyDefinitions: {} };
    const text = { id: '1:2', type: 'TEXT', name: 'Text', parent: root, characters: "Quotes '\"; $(exit 99)\\n".repeat(mode === 'huge' ? 40000 : mode === 'wrapped-large' ? 12000 : 2000),
      getStyledTextSegments: () => [] };
    root.children.push(text);
    const figma = { skipInvisibleInstanceChildren: true, fileKey: mode === 'wrong-file' ? 'OTHER' : mode === 'unknown-file' ? undefined : 'FILE', getNodeByIdAsync: async id => id === root.id ? root : text,
      variables: { getLocalVariableCollectionsAsync: async () => [] } };
    if (mode === 'inventory' || mode === 'wrapped-inventory') Object.assign(figma, inventoryMock());
    if (mode === 'wrapped-images') {
      const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(27000, 5)]);
      figma.getImageByHash = () => ({ getBytesAsync: async () => new Uint8Array(bytes) });
      figma.base64Encode = bytes => Buffer.from(bytes).toString('base64');
    }
    if (mode === 'reference' || mode === 'wrapped-reference') {
      const png = new PNG({ width: 2, height: 3 }); png.data.fill(255);
      figma.getNodeByIdAsync = async () => ({ width: 2, height: 3, exportAsync: async () => PNG.sync.write(png) });
      figma.base64Encode = bytes => Buffer.from(bytes).toString('base64');
    }
    if (mode === 'wrapped-vectors') root.children.push({ id: '1:3', type: 'VECTOR', name: 'Icon', width: 8, height: 8,
      exportAsync: async () => '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><path d="M0 0L8 8" stroke="#000"/></svg>' });
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const result = await new AsyncFunction('figma', request.params.arguments[codeArgument])(figma);
    if (mode === 'changing' && calls++) result.checksum = 'changed';
    if (wrapped) return { content: [{ type: 'text', text: JSON.stringify({
      _mcp: 'figma-console-mcp', success: mode !== 'wrapped-error', result, error: mode === 'wrapped-error' ? 'Plugin execution failed' : null,
      fileContext: { fileKey: mode === 'wrapped-wrong-file' ? 'OTHER' : 'FILE' }, timestamp: Date.now(),
    }) }] };
    return { content: [{ type: 'text', text: mode === 'corrupt' ? 'truncated {' : JSON.stringify(result) }] };
  });
  return server;
}

if (process.argv[1]?.endsWith('capture-mcp-server.mjs')) await captureServer(process.argv[2]).connect(new StdioServerTransport());
