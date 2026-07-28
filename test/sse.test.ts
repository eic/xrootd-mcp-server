import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// The tool surface is registered without contacting XRootD, so this smoke test
// needs no live store -- only a syntactically valid server URL.
const TEST_SERVER = 'root://sse-smoke-test.invalid';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function waitForListening(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start within 15s')), 15000);
    child.stderr?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('running on SSE')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}`));
    });
  });
}

describe('SSE transport', () => {
  let child: ChildProcess;
  let client: Client;
  let port: number;

  before(async () => {
    port = await freePort();
    child = spawn(process.execPath, ['build/src/index.js'], {
      env: {
        ...process.env,
        MCP_TRANSPORT: 'sse',
        MCP_HOST: '127.0.0.1',
        MCP_PORT: String(port),
        XROOTD_SERVER: TEST_SERVER,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    await waitForListening(child);

    client = new Client({ name: 'sse-test-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(new SSEClientTransport(new URL(`http://127.0.0.1:${port}/sse`)));
  });

  after(async () => {
    await client?.close();
    child?.kill();
  });

  it('should list tools over SSE', async () => {
    const tools = await client.listTools();
    const toolNames = (tools.tools as Tool[]).map((t) => t.name);

    assert.ok(tools.tools.length > 0);
    assert.ok(toolNames.includes('list_directory'));
  });

  it('should serve a second concurrent client', async () => {
    const second = new Client({ name: 'sse-test-client-2', version: '1.0.0' }, { capabilities: {} });
    await second.connect(new SSEClientTransport(new URL(`http://127.0.0.1:${port}/sse`)));

    try {
      const tools = await second.listTools();
      assert.ok(tools.tools.length > 0);
    } finally {
      await second.close();
    }
  });

  it('should reject a POST with an unknown sessionId', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/messages?sessionId=does-not-exist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    assert.strictEqual(response.status, 400);
  });

  it('should return 404 for unknown paths', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/nope`);

    assert.strictEqual(response.status, 404);
  });
});
