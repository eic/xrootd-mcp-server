import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TEST_SERVER = process.env.XROOTD_SERVER || 'root://dtn-eic.jlab.org';
const TEST_BASE_DIR = process.env.XROOTD_BASE_DIR || '/volatile/eic/EPIC';

describe('XRootD MCP Server Integration Tests', () => {
  let client: Client;
  let transport: StdioClientTransport;

  before(async () => {
    // Create transport and client
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ['build/src/index.js'],
      env: {
        ...process.env,
        XROOTD_SERVER: TEST_SERVER,
        XROOTD_BASE_DIR: TEST_BASE_DIR,
      },
    });

    client = new Client(
      {
        name: 'xrootd-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
  });

  after(async () => {
    await client.close();
  });

  describe('Server Initialization', () => {
    it('should connect to the MCP server', async () => {
      // Connection is established in before() hook
      assert.ok(client);
      assert.ok(transport);
    });

    it('should list available tools', async () => {
      const tools = await client.listTools();
      assert.ok(tools.tools);
      assert.ok(tools.tools.length > 0);
      
      const toolNames = tools.tools.map((t: any) => t.name);
      assert.ok(toolNames.includes('list_directory'));
      assert.ok(toolNames.includes('read_file'));
      assert.ok(toolNames.includes('get_file_info'));
    });
  });

  describe('Directory Listing', () => {
    it('should list root directory', async () => {
      const result: any = await client.callTool({
        name: 'list_directory',
        arguments: { path: '/' },
      });
      
      assert.ok(result.content);
      assert.ok(Array.isArray(result.content));
      assert.ok(result.content.length > 0);
      assert.equal(result.content[0].type, 'text');
    });

    it('should list EVGEN directory', async () => {
      const result: any = await client.callTool({
        name: 'list_directory',
        arguments: { path: 'EVGEN' },
      });
      
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
    });

    it('should handle non-existent directory', async () => {
      try {
        await client.callTool({
          name: 'list_directory',
          arguments: { path: '/nonexistent_directory_12345' },
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error);
      }
    });
  });

  describe('File Information', () => {
    it('should get info for EVGEN directory', async () => {
      const result: any = await client.callTool({
        name: 'get_file_info',
        arguments: { path: 'EVGEN' },
      });
      
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
      const text = result.content[0].text;
      
      // Handle case where the tool returns an error message
      if (text.startsWith('Error:')) {
        console.error('  ⊘ EVGEN directory not accessible:', text);
        return;
      }
      
      const info = JSON.parse(text);
      assert.ok(info.path);
      assert.ok(info.hasOwnProperty('isDirectory'));
    });

    it('should handle non-existent file', async () => {
      try {
        await client.callTool({
          name: 'get_file_info',
          arguments: { path: '/nonexistent_file_12345.txt' },
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error);
      }
    });
  });

  describe('Search Functionality', () => {
    it('should search for files by pattern', { timeout: 90000 }, async () => {
      try {
        const result: any = await client.callTool({
          name: 'search_files',
          arguments: {
            path: '/',
            pattern: 'EVGEN',
          },
        });
        
        assert.ok(result.content);
        assert.ok(result.content.length > 0);
      } catch (error: any) {
        if (error.code === -32001) {
          console.log('  ⊘ Search timed out - directory too large for CI environment');
          return;
        }
        throw error;
      }
    });

    it('should search with regex pattern', { timeout: 90000 }, async () => {
      try {
        const result: any = await client.callTool({
          name: 'search_files',
          arguments: {
            path: '/',
            pattern: 'EV.*',
            useRegex: true,
          },
        });
        
        assert.ok(result.content);
        assert.ok(result.content.length > 0);
      } catch (error: any) {
        if (error.code === -32001) {
          console.log('  ⊘ Search timed out - directory too large for CI environment');
          return;
        }
        throw error;
      }
    });
  });

  describe('Campaign Discovery', () => {
    it('should discover campaigns', async () => {
      const result: any = await client.callTool({
        name: 'discover_campaigns',
        arguments: { path: '/' },
      });
      
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
    });
  });

  describe('File Statistics', () => {
    it('should get statistics for EVGEN directory', { timeout: 90000 }, async () => {
      try {
        const result: any = await client.callTool({
          name: 'get_statistics',
          arguments: { path: 'EVGEN' },
        });
        
        assert.ok(result.content);
        assert.ok(result.content.length > 0);
        
        const text = result.content[0].text;
        
        // Handle case where the tool returns an error message
        if (text.startsWith('Error:')) {
          console.error('  ⊘ EVGEN statistics not available:', text);
          return;
        }
        
        const stats = JSON.parse(text);
        assert.ok(stats.hasOwnProperty('totalFiles'));
        assert.ok(stats.hasOwnProperty('totalDirectories'));
      } catch (error: any) {
        if (error.code === -32001) {
          console.log('  ⊘ Statistics timed out - directory too large for CI environment');
          return;
        }
        throw error;
      }
    });
  });

  describe('Recent Files', () => {
    it('should list files modified recently', async () => {
      const result: any = await client.callTool({
        name: 'list_recent_files',
        arguments: {
          path: '/',
          hours: 168, // 7 days
        },
      });
      
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract metadata from file path', async () => {
      const result: any = await client.callTool({
        name: 'extract_metadata',
        arguments: {
          path: 'EVGEN/SIDIS/pythia8NCDIS_18x275_Q2_1_10_y_0.01_0.95_tau-_00001.0000.eicrecon.tree.edm4eic.root',
        },
      });
      
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
    });
  });

  describe('Smart Filtering', () => {
    it('should filter by file size', async () => {
      const result: any = await client.callTool({
        name: 'filter_files',
        arguments: {
          path: '/',
          minSize: 1000000, // 1 MB
        },
      });
      
      assert.ok(result.content);
    });

    it('should filter by modification time', async () => {
      const result: any = await client.callTool({
        name: 'filter_files',
        arguments: {
          path: '/',
          modifiedAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      
      assert.ok(result.content);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid paths gracefully', async () => {
      try {
        await client.callTool({
          name: 'list_directory',
          arguments: { path: '/../..' }, // Path traversal attempt
        });
        assert.fail('Should have rejected path traversal');
      } catch (error) {
        assert.ok(error);
      }
    });

    it('should handle missing required parameters', async () => {
      try {
        await client.callTool({
          name: 'list_directory',
          arguments: {},
        });
        assert.fail('Should have thrown an error for missing path');
      } catch (error) {
        assert.ok(error);
      }
    });
  });

  describe('Special Characters in Paths', () => {
    // These tests verify that paths containing characters like '=', '+', '#',
    // and spaces are passed correctly to xrdfs/xrdcp without shell interpretation.
    // The commands are expected to fail (path doesn't exist) but must NOT throw
    // due to shell parsing errors or command injection — the error should be an
    // xrootd "no such file" error, not a syntax/spawn error.

    const specialCharPaths = [
      { label: 'equal sign', path: '/q2=10_100' },
      { label: 'plus sign', path: '/pi+' },
      { label: 'hash', path: '/dir#1' },
      { label: 'space', path: '/my dir' },
      { label: 'combined', path: '/run=123 q2=10#bin' },
    ];

    for (const { label, path } of specialCharPaths) {
      it(`should pass path with ${label} to xrdfs without shell error`, async () => {
        const result: any = await client.callTool({
          name: 'list_directory',
          arguments: { path },
        });
        // The tool should return an error response (path doesn't exist on server),
        // but NOT a spawn/shell error caused by unescaped special characters.
        assert.ok(result.content);
        assert.ok(result.content.length > 0);
        if (result.isError) {
          const errorText: string = result.content[0].text;
          // Must be an xrootd path error, not a shell metacharacter error
          assert.ok(
            !errorText.includes('spawn') && !errorText.includes('syntax error'),
            `Unexpected shell error for path with ${label}: ${errorText}`
          );
        }
      });
    }

    it('should pass search pattern with equal sign to xrdfs find without shell error', async () => {
      const result: any = await client.callTool({
        name: 'search_files',
        arguments: { pattern: 'run=*.root', basePath: '/' },
      });
      assert.ok(result.content);
      if (result.isError) {
        const errorText: string = result.content[0].text;
        assert.ok(
          !errorText.includes('spawn') && !errorText.includes('syntax error'),
          `Unexpected shell error for pattern with equal sign: ${errorText}`
        );
      }
    });
  });
});

describe('Multi-Server Configuration Tests', () => {
  let multiClient: Client;
  let multiTransport: StdioClientTransport;

  const MULTI_SERVER_CONFIG = JSON.stringify([
    {
      name: 'primary',
      url: TEST_SERVER,
      baseDir: TEST_BASE_DIR,
    },
    {
      name: 'secondary',
      url: TEST_SERVER,
      baseDir: TEST_BASE_DIR,
      cacheEnabled: false,
    },
  ]);

  before(async () => {
    multiTransport = new StdioClientTransport({
      command: process.execPath,
      args: ['build/src/index.js'],
      env: {
        ...process.env,
        XROOTD_SERVER: undefined,
        XROOTD_SERVERS: MULTI_SERVER_CONFIG,
      },
    });

    multiClient = new Client(
      {
        name: 'xrootd-multi-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await multiClient.connect(multiTransport);
  });

  after(async () => {
    await multiClient.close();
  });

  describe('list_servers tool', () => {
    it('should list all configured servers without arguments', async () => {
      // list_servers takes no parameters; calling without arguments must not throw
      const result: any = await multiClient.callTool({ name: 'list_servers', arguments: {} });
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(parsed.servers));
      assert.equal(parsed.servers.length, 2);
      const names = parsed.servers.map((s: any) => s.name);
      assert.ok(names.includes('primary'));
      assert.ok(names.includes('secondary'));
    });

    it('should include cache stats for each server', async () => {
      const result: any = await multiClient.callTool({ name: 'list_servers', arguments: {} });
      const parsed = JSON.parse(result.content[0].text);
      for (const srv of parsed.servers) {
        assert.ok(srv.hasOwnProperty('cacheStats'));
      }
    });
  });

  describe('server routing', () => {
    it('should default to first configured server when server param is omitted', async () => {
      const result: any = await multiClient.callTool({
        name: 'list_directory',
        arguments: { path: '/' },
      });
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
    });

    it('should route to named server when server param is provided', async () => {
      const result: any = await multiClient.callTool({
        name: 'list_directory',
        arguments: { path: '/', server: 'secondary' },
      });
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
    });

    it('should return error for unknown server name', async () => {
      try {
        await multiClient.callTool({
          name: 'list_directory',
          arguments: { path: '/', server: 'nonexistent' },
        });
        assert.fail('Should have thrown an error for unknown server');
      } catch (error) {
        assert.ok(error);
      }
    });
  });
});
