import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, rmSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { captureFromMcp, mcpConfiguration } from '../../skills/create-ds-from-figma/scripts/lib/capture-mcp.mjs';
import { assembleChunks, persistCapture } from '../../skills/create-ds-from-figma/scripts/figma-capture.mjs';
import { captureServer } from './fixtures/capture-mcp-server.mjs';
import { captureProblems } from '../lib/figma-evidence.mjs';

const fixture = path.resolve('.agents/checks/tests/fixtures/capture-mcp-server.mjs');
const config = mode => ({ transport: { type: 'stdio', command: process.execPath, args: [fixture, mode || 'normal'] },
  tool: { name: 'execute_design', codeArgument: 'javascript', fileKeyArgument: 'designFile' } });

test('portable CLI transfers a full capture through an actual stdio MCP server in one call', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mcp-cli-test-'));
  let session;
  try {
    const file = path.join(directory, 'connection.json'); writeFileSync(file, JSON.stringify(config()));
    const r = spawnSync(process.execPath, [path.resolve('.agents/skills/create-ds-from-figma/scripts/figma-capture.mjs'), 'capture', 'FILE', '1:1', file, '--approve-connection'], { encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout); session = result.directory;
    assert.equal(result.chunks, 1); assert.ok(result.total > 12000);
    assert.equal(result.persistedInProject, false);
    const capture = assembleChunks([JSON.parse(readFileSync(path.join(session, '0.json'), 'utf8'))]);
    assert.deepEqual(captureProblems(capture), []);
    assert.ok(capture.nodes[1].properties.characters.includes('$(exit 99)'));
    assert.equal(persistCapture(directory, capture).hash, result.hash);
  } finally { if (session) rmSync(session, { recursive: true, force: true }); rmSync(directory, { recursive: true, force: true }); }
});

test('portable MCP fails closed on unavailable tools, tool errors, truncation and changing chunked reads', async () => {
  for (const mode of ['missing', 'error', 'corrupt', 'changing']) {
    await assert.rejects(captureFromMcp({ ...config(mode), chunkSize: 12000 }, 'FILE', '1:1', { approvedConnection: true }), error => {
      if (error.session) assert.equal(existsSync(error.session.directory), false);
      assert.doesNotMatch(error.message, /failed session:/);
      assert.match(error.message, /MCP capture failed/); return true;
    });
  }
});

test('figma_execute captures are explicitly decoded and preserve full MCP responses in temporary sessions', async () => {
  for (const chunkSize of [null, 12000]) {
    const connection = { ...config('wrapped-large'), chunkSize,
      tool: { name: 'figma_execute', codeArgument: 'code', fileKeyArgument: 'fileKey', responseFormat: 'figma-execute' } };
    const result = await captureFromMcp(connection, 'FILE', '1:1', { approvedConnection: true });
    try {
      assert.ok(result.total > 259236);
      assert.equal(result.chunks === 1, chunkSize === null);
      const first = JSON.parse(readFileSync(path.join(result.directory, '0.json'), 'utf8'));
      const raw = JSON.parse(readFileSync(path.join(result.directory, 'response-0.json'), 'utf8'));
      const wrapped = JSON.parse(raw.content[0].text);
      assert.equal(wrapped.success, true); assert.deepEqual(wrapped.result, first);
      if (chunkSize === null) {
        assert.equal(first.payload.length, result.total);
        assert.deepEqual(captureProblems(assembleChunks([first])), []);
      }
      assert.equal(result.persistedInProject, false);
    } finally { rmSync(result.directory, { recursive: true, force: true }); }
  }
  for (const mode of ['wrapped-error', 'wrapped-wrong-file']) {
    await assert.rejects(captureFromMcp({ ...config(mode), tool: { name: 'figma_execute', responseFormat: 'figma-execute' } }, 'FILE', '1:1', { approvedConnection: true }), error => {
      assert.match(error.message, mode === 'wrapped-error' ? /did not report success/ : /file context differs/);
      assert.equal(existsSync(error.session.directory), false); return true;
    });
  }
  await assert.rejects(captureFromMcp({ ...config('wrapped'), tool: { name: 'figma_execute' } }, 'FILE', '1:1', { approvedConnection: true }), /tool.responseFormat/);
});

test('portable HTTP MCP transport captures without editor globals and closes its connections', async () => {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true });
  const mcp = captureServer(); await mcp.connect(transport);
  const http = createServer(async (req, res) => {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const request = new Request(`http://127.0.0.1:${http.address().port}${req.url}`, { method: req.method, headers: req.headers, ...(body ? { body } : {}) });
      const response = await transport.handleRequest(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  let session;
  try {
    const result = await captureFromMcp({ ...config(), transport: { type: 'http', url: `http://127.0.0.1:${http.address().port}/mcp` } }, 'FILE', '1:1', { approvedConnection: true });
    session = result.directory; assert.equal(result.chunks, 1); assert.equal(result.nodes, 2);
  } finally {
    if (session) rmSync(session, { recursive: true, force: true });
    await mcp.close(); await transport.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve));
  }
});

test('inventory, PNG and vector CLIs share the explicit figma_execute response adapter', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mcp-wrapped-cli-'));
  try {
    for (const [mode, name, arguments_, field, expected] of [
      ['wrapped-inventory', 'figma-inventory', ['FILE'], 'variables', 5],
      ['wrapped-reference', 'figma-reference', ['FILE', '1:1', '1'], 'width', 2],
      ['wrapped-vectors', 'figma-vectors', ['FILE', '1:1'], 'vectors', 1],
    ]) {
      const connection = path.join(root, `${name}.json`);
      writeFileSync(connection, JSON.stringify({ ...config(mode), tool: { name: 'figma_execute', responseFormat: 'figma-execute' } }));
      const cli = path.resolve(`.agents/skills/create-ds-from-figma/scripts/${name}.mjs`);
      const run = spawnSync(process.execPath, [cli, 'capture', ...arguments_, connection, '--approve-connection'], { encoding: 'utf8', timeout: 15000 });
      assert.equal(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout);
      try { assert.equal(result[field], expected); assert.ok(existsSync(path.join(result.directory, 'response-0.json'))); }
      finally { rmSync(result.directory, { recursive: true, force: true }); }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed figma_execute responses remain auditable only when the caller explicitly retains the session', async () => {
  await assert.rejects(captureFromMcp({ ...config('wrapped-error'), tool: { name: 'figma_execute', responseFormat: 'figma-execute' } }, 'FILE', '1:1', { approvedConnection: true, keepFailed: true }), error => {
    const dir = error.session.directory;
    try {
      assert.equal(error.session.retained, true);
      const raw = JSON.parse(readFileSync(path.join(dir, 'response-0.json'), 'utf8'));
      assert.equal(JSON.parse(raw.content[0].text).success, false);
      assert.equal(existsSync(path.join(dir, '0.json')), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    return true;
  });
});

test('MCP config validates secret references and rejects insecure remote URLs and invalid mappings', () => {
  const c = config();
  assert.throws(() => mcpConfiguration({ ...c, transport: { type: 'http', url: 'http://example.com/mcp' } }), /HTTPS/);
  assert.throws(() => mcpConfiguration({ ...c, transport: { type: 'http', url: 'https://token@example.com/mcp' } }), /credentials/);
  assert.throws(() => mcpConfiguration({ ...c, timeoutMs: 1 }), /timeoutMs/);
  assert.throws(() => mcpConfiguration({ ...c, chunkSize: 13000 }), /chunkSize/);
  for (const responseFormat of [null, '', 'auto', 'result', false]) assert.throws(() => mcpConfiguration({ ...c, tool: { ...c.tool, responseFormat } }), /responseFormat/);
  assert.equal(mcpConfiguration(c).responseFormat, 'transport-v1');
  assert.equal(mcpConfiguration({ ...c, tool: { ...c.tool, responseFormat: 'figma-execute' } }).responseFormat, 'figma-execute');
  assert.throws(() => mcpConfiguration({ ...c, transport: { ...c.transport, envFrom: ['MISSING'] } }, {}), /unavailable/);
  const o = mcpConfiguration({ ...c, transport: { type: 'http', url: 'https://example.com/mcp', headersFromEnv: { Authorization: 'AUTH' } } }, { AUTH: 'Bearer test' });
  assert.equal(o.headers.Authorization, 'Bearer test');
  assert.equal(mcpConfiguration({ ...c, tool: { ...c.tool, fileKeyArgument: null } }).fileKeyArgument, null);
  for (const fileKeyArgument of ['', false, 0]) assert.throws(() => mcpConfiguration({ ...c, tool: { ...c.tool, fileKeyArgument } }), /mapping/);
});

test('MCP capture requires explicit approval before starting a configured command', async () => {
  await assert.rejects(captureFromMcp(config(), 'FILE', '1:1'), /explicit approval/);
  const cli = spawnSync(process.execPath, [path.resolve('.agents/skills/create-ds-from-figma/scripts/figma-capture.mjs'), 'capture', 'FILE', '1:1', '/nonexistent/connection.json'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /authorize CONFIG/);
  assert.doesNotMatch(cli.stderr, /ENOENT/);
});

test('code-only MCP tools require a verifiable matching active Figma file', async () => {
  for (const mode of ['code-only', 'wrong-file', 'unknown-file']) {
    const c = config(mode); c.tool.fileKeyArgument = null;
    if (mode === 'code-only') {
      const result = await captureFromMcp(c, 'FILE', '1:1', { approvedConnection: true });
      try { assert.equal(result.nodes, 2); } finally { rmSync(result.directory, { recursive: true, force: true }); }
    } else {
      await assert.rejects(captureFromMcp(c, 'FILE', '1:1', { approvedConnection: true }), error => {
        assert.match(error.message, /cannot be verified/);
        assert.equal(existsSync(error.session.directory), false);
        return true;
      });
    }
  }
  await assert.rejects(captureFromMcp(config('code-only'), 'FILE', '1:1', { approvedConnection: true }), /mapped arguments/);
});

test('failed MCP sessions are retained only on explicit request', async () => {
  await assert.rejects(captureFromMcp(config('corrupt'), 'FILE', '1:1', { approvedConnection: true, keepFailed: true }), error => {
    try {
      assert.equal(error.session.retained, true);
      assert.equal(existsSync(error.session.directory), true);
      assert.match(error.message, /failed session:/);
    } finally { rmSync(error.session.directory, { recursive: true, force: true }); }
    return true;
  });
});
