import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// The tool surface is registered without contacting XRootD, so this smoke test
// needs no live store -- only a syntactically valid server URL.
const TEST_SERVER = 'root://http-smoke-test.invalid';

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
      if (chunk.toString().includes('running on streamable HTTP')) {
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

describe('Streamable HTTP transport', () => {
  let child: ChildProcess;
  let port: number;

  before(async () => {
    port = await freePort();
    child = spawn(process.execPath, ['build/src/index.js'], {
      env: {
        ...process.env,
        MCP_TRANSPORT: 'http',
        MCP_HOST: '127.0.0.1',
        MCP_PORT: String(port),
        XROOTD_SERVER: TEST_SERVER,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    await waitForListening(child);
  });

  after(async () => {
    child?.kill();
  });

  async function connectClient(name: string): Promise<Client> {
    const client = new Client({ name, version: '1.0.0' }, { capabilities: {} });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
    );
    return client;
  }

  it('should list tools over streamable HTTP', async () => {
    const client = await connectClient('http-test-client');
    try {
      const tools = await client.listTools();
      const toolNames = (tools.tools as Tool[]).map((t) => t.name);

      assert.ok(tools.tools.length > 0);
      assert.ok(toolNames.includes('list_directory'));
    } finally {
      await client.close();
    }
  });

  it('should serve sequential clients with no session state', async () => {
    // Stateless mode: each client works standalone; a second one must not
    // depend on (or be broken by) anything the first one did.
    const first = await connectClient('http-test-client-1');
    const firstTools = await first.listTools();
    await first.close();

    const second = await connectClient('http-test-client-2');
    try {
      const secondTools = await second.listTools();
      assert.strictEqual(secondTools.tools.length, firstTools.tools.length);
    } finally {
      await second.close();
    }
  });

  it('should return 404 for unknown paths', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/nope`);

    assert.strictEqual(response.status, 404);
  });

  it('should accept a trailing slash on /mcp', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/mcp/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'fetch', version: '0' },
        },
      }),
    });

    assert.notStrictEqual(response.status, 404);
  });
});
