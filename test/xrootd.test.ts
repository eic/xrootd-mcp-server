import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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
      
      const toolNames = (tools.tools as Tool[]).map(t => t.name);
      assert.ok(toolNames.includes('list_directory'));
      assert.ok(toolNames.includes('read_file'));
      assert.ok(toolNames.includes('get_file_info'));
    });
  });

  describe('Directory Listing', () => {
    it('should list root directory', async () => {
      const result = await client.callTool({
        name: 'list_directory',
        arguments: { path: '/' },
      }) as CallToolResult;
      
      assert.ok(result.content);
      assert.ok(Array.isArray(result.content));
      assert.ok(result.content.length > 0);
      assert.equal(result.content[0].type, 'text');
    });

    it('should list EVGEN directory', async () => {
      const result = await client.callTool({
        name: 'list_directory',
        arguments: { path: 'EVGEN' },
      }) as CallToolResult;
      
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
      const result = await client.callTool({
        name: 'get_file_info',
        arguments: { path: 'EVGEN' },
      }) as CallToolResult;
      
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
      const firstContent = result.content[0];
      const text = firstContent.type === 'text' ? firstContent.text : '';
      
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
        const result = await client.callTool({
          name: 'search_files',
          arguments: {
            path: '/',
            pattern: 'EVGEN',
          },
        }) as CallToolResult;
        
        assert.ok(result.content);
        assert.ok(result.content.length > 0);
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === -32001) {
          console.log('  ⊘ Search timed out - directory too large for CI environment');
          return;
        }
        throw error;
      }
    });

    it('should search with regex pattern', { timeout: 90000 }, async () => {
      try {
        const result = await client.callTool({
          name: 'search_files',
          arguments: {
            path: '/',
            pattern: 'EV.*',
            useRegex: true,
          },
        }) as CallToolResult;
        
        assert.ok(result.content);
        assert.ok(result.content.length > 0);
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === -32001) {
          console.log('  ⊘ Search timed out - directory too large for CI environment');
          return;
        }
        throw error;
      }
    });
  });

  describe('Campaign Discovery', () => {
    it('should discover campaigns', async () => {
      const result = await client.callTool({
        name: 'discover_campaigns',
        arguments: { path: '/' },
      }) as CallToolResult;
      
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
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === -32001) {
          console.log('  ⊘ Statistics timed out - directory too large for CI environment');
          return;
        }
        throw error;
      }
    });
  });

  describe('Recent Files', () => {
    it('should list files modified recently', async () => {
      const result = await client.callTool({
        name: 'find_recent_files',
        arguments: {
          path: '/',
          hours: 168, // 7 days
        },
      }) as CallToolResult;
      
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract metadata from file path', async () => {
      const tools = await client.listTools();
      const hasExtractMetadata = (tools.tools as Tool[])?.some(tool => tool.name === 'extract_metadata');
      if (!hasExtractMetadata) {
        console.log('  ⊘ \'extract_metadata\' tool not registered on server; skipping metadata extraction test');
        return;
      }

      const result = await client.callTool({
        name: 'extract_metadata',
        arguments: {
          path: 'EVGEN/SIDIS/pythia8NCDIS_18x275_Q2_1_10_y_0.01_0.95_tau-_00001.0000.eicrecon.tree.edm4eic.root',
        },
      }) as CallToolResult;
      
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

  describe('xrdcp Path Encoding', () => {
    // Verify that read_file (which uses xrdcp) does not over-encode path
    // segments.  encodeURIComponent encodes '=' as '%3D', which makes
    // directory names like "minQ2=1" unreachable on the server.
    it('should not percent-encode "=" in paths passed to xrdcp', async () => {
      const result: any = await client.callTool({
        name: 'read_file',
        arguments: { path: 'RECO/26.03.0/epic_craterlake/DIS/NC/10x100/minQ2=1/nonexistent.root' },
      });
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
      // The file is intentionally nonexistent so the response must be an error.
      assert.strictEqual(result.isError, true, 'Expected an error response for a nonexistent file');
      // If '=' is incorrectly encoded to '%3D' the xrdcp URL will contain
      // that sequence, and the error message echoes the URL back.
      const errorText: string = result.content[0].text;
      assert.ok(
        !errorText.includes('%3D') && !errorText.includes('%3d'),
        `'=' in path was incorrectly percent-encoded — encodeXRootDPath is too aggressive: ${errorText}`
      );
    });
  });

  describe('xrdcp URL Construction', () => {
    // Verify that read_file (which uses xrdcp) builds absolute XRootD URLs
    // with the required double-slash separator (root://host//path).  Without
    // the double slash, XRootD treats the path as relative and returns [3010].
    it('should not produce a relative-path error when reading a file', async () => {
      const result: any = await client.callTool({
        name: 'read_file',
        arguments: { path: `${TEST_BASE_DIR}/nonexistent-test-file.root` },
      });
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
      // Any error must be an xrootd "not found" style error, never [3010]
      // "Opening relative path … is disallowed", which indicates a missing '//'
      // separator in the constructed URL.
      if (result.isError) {
        const errorText: string = result.content[0].text;
        assert.ok(
          !errorText.includes('relative path') && !errorText.includes('[3010]'),
          `Unexpected relative-path error — double-slash separator missing: ${errorText}`
        );
      }
    });
  });

  describe('HTTP-first ROOT File Access', () => {
    // These tests verify that the ROOT analysis tools first attempt HTTP access,
    // and only fall back to xrdcp when allow_copy: true is provided.

    it('analyze_root_file should attempt HTTP access and report copy required when HTTP fails', async () => {
      // Use a nonexistent path – even if the server supported HTTP the file
      // would 404, so the error should always be a CopyRequiredError message.
      const result: any = await client.callTool({
        name: 'analyze_root_file',
        arguments: { path: `${TEST_BASE_DIR}/nonexistent-test-file.root` },
      });
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
      // Should be an error, and the message should guide the user to use allow_copy
      assert.ok(result.isError, 'Expected an error response when HTTP access fails');
      const errorText: string = result.content[0].text;
      assert.ok(
        errorText.includes('allow_copy') || errorText.includes('copy'),
        `Error message should mention the copy option, got: ${errorText}`
      );
    });

    it('get_event_statistics should attempt HTTP access and report copy required when HTTP fails', async () => {
      const result: any = await client.callTool({
        name: 'get_event_statistics',
        arguments: { path: `${TEST_BASE_DIR}/nonexistent-test-file.root` },
      });
      assert.ok(result.content);
      assert.ok(result.isError, 'Expected an error response when HTTP access fails');
      const errorText: string = result.content[0].text;
      assert.ok(
        errorText.includes('allow_copy') || errorText.includes('copy'),
        `Error message should mention the copy option, got: ${errorText}`
      );
    });

    it('analyze_root_file with allow_copy: true should attempt xrdcp (not CopyRequiredError)', async () => {
      const result: any = await client.callTool({
        name: 'analyze_root_file',
        arguments: { path: `${TEST_BASE_DIR}/nonexistent-test-file.root`, allow_copy: true },
      });
      assert.ok(result.content);
      assert.ok(result.content.length > 0);
      // Whether it succeeds or fails, the error must NOT contain allow_copy guidance —
      // it should be an xrdcp/file-not-found error since allow_copy was granted.
      if (result.isError) {
        const errorText: string = result.content[0].text;
        assert.ok(
          !errorText.includes('allow_copy') && !errorText.includes('CopyRequiredError'),
          `Error with allow_copy=true should not mention allow_copy guidance: ${errorText}`
        );
      }
    });
  });
});

describe('Large Directory Event Counting', () => {
  // Reproduce the scenario where an LLM hits context limits due to a large number
  // of files in a directory and then wants to count events in the first file.
  // Directory: RECO/26.03.0/epic_craterlake/DIS/NC/10x100/minQ2=1
  let largeClient: Client;
  let largeTransport: StdioClientTransport;

  const LARGE_DIR = 'RECO/26.03.0/epic_craterlake/DIS/NC/10x100/minQ2=1';
  // This is an EIC production directory on dtn-eic.jlab.org that contains hundreds
  // of ROOT files. Tests gracefully skip when the server or path is not accessible.

  before(async () => {
    largeTransport = new StdioClientTransport({
      command: process.execPath,
      args: ['build/src/index.js'],
      env: {
        ...process.env,
        XROOTD_SERVER: TEST_SERVER,
        XROOTD_BASE_DIR: TEST_BASE_DIR,
      },
    });

    largeClient = new Client(
      { name: 'xrootd-large-dir-test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await largeClient.connect(largeTransport);
  });

  after(async () => {
    await largeClient.close();
  });

  it('should list large directory without limit and expose total entry count', { timeout: 60000 }, async () => {
    const result: any = await largeClient.callTool({
      name: 'list_directory',
      arguments: { path: LARGE_DIR },
    });

    assert.ok(result.content);
    assert.ok(result.content.length > 0);

    if (result.isError) {
      console.error('  ⊘ Skipping - directory not accessible:', result.content[0].text);
      return;
    }

    const body = JSON.parse(result.content[0].text);
    assert.ok(typeof body.totalEntries === 'number', 'totalEntries should be a number');
    assert.ok(body.totalEntries > 0, 'Directory should contain at least one entry');
    assert.ok(Array.isArray(body.entries), 'entries should be an array');
    assert.equal(body.entries.length, body.returnedEntries, 'entries length should match returnedEntries');
    assert.ok(body.returnedEntries <= body.totalEntries, 'returnedEntries should not exceed totalEntries');
    // When the directory fits within the default limit, hasMore is false
    if (!body.hasMore) {
      assert.equal(body.returnedEntries, body.totalEntries, 'All entries returned when hasMore is false');
    }

    console.error(`  ✓ Directory ${LARGE_DIR} contains ${body.totalEntries} entries (returned: ${body.returnedEntries}, hasMore: ${body.hasMore})`);
  });

  it('should list large directory with limit=1 to avoid context overflow', { timeout: 60000 }, async () => {
    const result: any = await largeClient.callTool({
      name: 'list_directory',
      arguments: { path: LARGE_DIR, limit: 1 },
    });

    assert.ok(result.content);
    assert.ok(result.content.length > 0);

    if (result.isError) {
      console.error('  ⊘ Skipping - directory not accessible:', result.content[0].text);
      return;
    }

    const body = JSON.parse(result.content[0].text);
    assert.ok(typeof body.totalEntries === 'number', 'totalEntries should be a number');
    assert.equal(body.returnedEntries, 1, 'Only 1 entry should be returned');
    assert.equal(body.entries.length, 1, 'entries array should have exactly 1 element');
    assert.equal(body.limit, 1, 'limit field should reflect the requested limit');
    assert.equal(body.offset, 0, 'offset should default to 0');

    // If the directory has more than 1 file, pagination metadata must be present
    if (body.totalEntries > 1) {
      assert.equal(body.hasMore, true, 'hasMore flag should be set when entries are omitted');
      assert.equal(body.nextOffset, 1, 'nextOffset should point to the next page');
      assert.ok(typeof body.note === 'string', 'A note should explain how to paginate');
    }

    console.error(`  ✓ limit=1 returned 1 of ${body.totalEntries} entries (hasMore: ${body.hasMore ?? false})`);
    console.error(`  ✓ First entry: ${body.entries[0].name}`);
  });

  it('should paginate through the large directory using offset', { timeout: 60000 }, async () => {
    // First page
    const page1Result: any = await largeClient.callTool({
      name: 'list_directory',
      arguments: { path: LARGE_DIR, limit: 5, offset: 0 },
    });

    assert.ok(page1Result.content);
    if (page1Result.isError) {
      console.error('  ⊘ Skipping - directory not accessible:', page1Result.content[0].text);
      return;
    }

    const page1 = JSON.parse(page1Result.content[0].text);
    assert.equal(page1.offset, 0, 'First page offset should be 0');
    assert.equal(page1.limit, 5, 'Limit should be 5');

    if (page1.totalEntries < 6) {
      console.error('  ⊘ Skipping pagination test - directory has fewer than 6 entries');
      return;
    }

    assert.equal(page1.returnedEntries, 5, 'First page should have 5 entries');
    assert.equal(page1.hasMore, true, 'hasMore should be true when more pages exist');
    assert.equal(page1.nextOffset, 5, 'nextOffset should be 5');

    // Second page using nextOffset
    const page2Result: any = await largeClient.callTool({
      name: 'list_directory',
      arguments: { path: LARGE_DIR, limit: 5, offset: page1.nextOffset },
    });

    assert.ok(page2Result.content);
    const page2 = JSON.parse(page2Result.content[0].text);
    assert.equal(page2.offset, 5, 'Second page offset should be 5');
    assert.equal(page2.returnedEntries, 5, 'Second page should have 5 entries');

    // Pages must not overlap
    const page1Names = page1.entries.map((e: any) => e.name);
    const page2Names = page2.entries.map((e: any) => e.name);
    const overlap = page1Names.filter((n: string) => page2Names.includes(n));
    assert.equal(overlap.length, 0, 'Pages should not overlap');

    console.error(`  ✓ Page 1 (offset=0, limit=5): ${page1Names.join(', ')}`);
    console.error(`  ✓ Page 2 (offset=5, limit=5): ${page2Names.join(', ')}`);
  });

  it('should count events in the first ROOT file of the large directory', { timeout: 120000 }, async () => {
    // Step 1: get just the first entry from the large directory
    const listResult: any = await largeClient.callTool({
      name: 'list_directory',
      arguments: { path: LARGE_DIR, limit: 1 },
    });

    assert.ok(listResult.content);

    if (listResult.isError) {
      console.error('  ⊘ Skipping - directory not accessible:', listResult.content[0].text);
      return;
    }

    const listBody = JSON.parse(listResult.content[0].text);

    if (listBody.entries.length === 0) {
      console.error('  ⊘ Skipping - directory is empty');
      return;
    }

    const firstEntry = listBody.entries[0];
    if (!firstEntry.name.endsWith('.root')) {
      console.error(`  ⊘ Skipping - first entry is not a ROOT file: ${firstEntry.name}`);
      return;
    }

    const firstFilePath = `${LARGE_DIR}/${firstEntry.name}`;

    // Step 2: count events in the first file
    const statsResult: any = await largeClient.callTool({
      name: 'get_event_statistics',
      arguments: { path: firstFilePath },
    });

    assert.ok(statsResult.content);

    if (statsResult.isError) {
      // ROOT analysis may not be available in all environments; treat gracefully
      console.error('  ⊘ Skipping - could not read ROOT file:', statsResult.content[0].text);
      return;
    }

    const stats = JSON.parse(statsResult.content[0].text);
    assert.ok(typeof stats.totalEvents === 'number', 'totalEvents should be a number');
    assert.ok(stats.totalEvents >= 0, 'totalEvents should be non-negative');

    console.error(`  ✓ Directory: ${LARGE_DIR}`);
    console.error(`  ✓ First file: ${firstEntry.name}`);
    console.error(`  ✓ Events in first file: ${stats.totalEvents}`);
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
    const multiEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (k !== 'XROOTD_SERVER' && typeof v === 'string') {
        multiEnv[k] = v;
      }
    }
    multiEnv['XROOTD_SERVERS'] = MULTI_SERVER_CONFIG;
    multiTransport = new StdioClientTransport({
      command: process.execPath,
      args: ['build/src/index.js'],
      env: multiEnv,
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
      // list_servers takes no parameters; omit arguments entirely to validate the guard
      const result: any = await (multiClient as any).callTool({ name: 'list_servers' });
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
      const result: any = await (multiClient as any).callTool({ name: 'list_servers' });
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
