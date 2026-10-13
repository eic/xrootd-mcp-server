#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'node:module';
import {
  XRootDClient,
  DEFAULT_TOOL_TIMEOUT_SECONDS,
  MAX_LIST_ENTRIES,
  MAX_READ_BYTES,
  truncateArrays,
  withTimeout,
} from './xrootd.js';
import { ROOTAnalyzer } from './root-analysis.js';

interface ServerConfig {
  name: string;
  url: string;
  baseDir?: string;
  cacheTTL?: number;
  cacheMaxSize?: number;
  cacheEnabled?: boolean;
}

interface ServerEntry {
  client: XRootDClient;
  rootAnalyzer: ROOTAnalyzer;
}

// Safe XRootD URL pattern: root://host[:port][/] with no whitespace or shell metacharacters
// Supports IPv4 hostnames and IPv6 addresses in brackets (e.g., root://[::1]:1094)
const SAFE_XROOTD_URL_RE = /^root:\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9._\-]+)(:\d+)?\/?$/;

function validateServerUrl(url: string, serverName: string): void {
  if (!SAFE_XROOTD_URL_RE.test(url)) {
    console.error(
      `Error: Server "${serverName}" has an invalid or unsafe URL "${url}". ` +
      `URL must match root://host[:port] with no whitespace or shell metacharacters.`
    );
    process.exit(1);
  }
}

function normalizeCacheEnabled(rawValue: unknown, defaultValue: boolean): boolean {
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }
  if (typeof rawValue === 'string') {
    const v = rawValue.trim().toLowerCase();
    if (v === 'false' || v === '0' || v === 'no' || v === 'off' || v === '') {
      return false;
    }
    if (v === 'true' || v === '1' || v === 'yes' || v === 'on') {
      return true;
    }
    return defaultValue;
  }
  if (typeof rawValue === 'number') {
    return rawValue !== 0;
  }
  if (rawValue == null) {
    return defaultValue;
  }
  return defaultValue;
}

function normalizeNonNegativeInt(
  rawValue: unknown,
  defaultValue: number,
  fieldName: string,
  serverName: string
): number {
  let num: number | undefined;
  if (typeof rawValue === 'number') {
    if (Number.isInteger(rawValue)) {
      num = rawValue;
    }
  } else if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed !== '' && /^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isInteger(parsed)) {
        num = parsed;
      }
    }
  }

  if (num == null || !Number.isFinite(num) || Number.isNaN(num) || num < 0) {
    if (rawValue !== undefined && rawValue !== null) {
      console.warn(
        `Warning: invalid value for ${fieldName} on server "${serverName}", using default ${defaultValue}`
      );
    }
    return defaultValue;
  }

  return num;
}

function buildServerConfigs(): ServerConfig[] {
  const XROOTD_SERVERS = process.env.XROOTD_SERVERS;
  const XROOTD_SERVER = process.env.XROOTD_SERVER;

  if (XROOTD_SERVERS) {
    try {
      const configs = JSON.parse(XROOTD_SERVERS) as unknown[];
      if (!Array.isArray(configs) || configs.length === 0) {
        console.error('Error: XROOTD_SERVERS must be a non-empty JSON array');
        process.exit(1);
      }
      const seenNames = new Set<string>();
      configs.forEach((config, index) => {
        if (config === null || typeof config !== 'object') {
          console.error(`Error: XROOTD_SERVERS[${index}] must be an object`);
          process.exit(1);
        }
        const rawName = (config as ServerConfig).name;
        const url = (config as ServerConfig).url;
        if (typeof rawName !== 'string' || rawName.trim().length === 0) {
          console.error(`Error: XROOTD_SERVERS[${index}].name must be a non-empty string`);
          process.exit(1);
        }
        const name = rawName.trim();
        (config as ServerConfig).name = name;
        if (typeof url !== 'string' || url.trim().length === 0) {
          console.error(`Error: XROOTD_SERVERS[${index}].url must be a non-empty string`);
          process.exit(1);
        }
        if (seenNames.has(name)) {
          console.error(`Error: Duplicate server name '${name}' found in XROOTD_SERVERS at index ${index}`);
          process.exit(1);
        }
        seenNames.add(name);
      });
      return configs as ServerConfig[];
    } catch (e) {
      console.error('Error: XROOTD_SERVERS is not valid JSON:', e);
      process.exit(1);
    }
  }

  if (XROOTD_SERVER) {
    return [
      {
        name: 'default',
        url: XROOTD_SERVER,
        baseDir: process.env.XROOTD_BASE_DIR || '/',
        cacheEnabled: process.env.XROOTD_CACHE_ENABLED !== 'false',
        cacheTTL: parseInt(process.env.XROOTD_CACHE_TTL || '60', 10),
        cacheMaxSize: parseInt(process.env.XROOTD_CACHE_MAX_SIZE || '1000', 10),
      },
    ];
  }

  console.error('Error: XROOTD_SERVERS or XROOTD_SERVER environment variable is required');
  process.exit(1);
}

const serverConfigs = buildServerConfigs();

const servers = new Map<string, ServerEntry>();
for (const cfg of serverConfigs) {
  validateServerUrl(cfg.url, cfg.name);
  const anyCfg = cfg as any;
  const cacheEnabled = normalizeCacheEnabled(anyCfg.cacheEnabled, true);
  const cacheTTL = normalizeNonNegativeInt(anyCfg.cacheTTL, 60, 'cacheTTL', cfg.name);
  const cacheMaxSize = normalizeNonNegativeInt(anyCfg.cacheMaxSize, 1000, 'cacheMaxSize', cfg.name);
  const rawBaseDir = anyCfg.baseDir;
  let baseDir: string;
  if (rawBaseDir === undefined || rawBaseDir === null) {
    baseDir = '/';
  } else if (typeof rawBaseDir === 'string') {
    baseDir = rawBaseDir;
  } else {
    console.error(
      `Error: Invalid baseDir for server "${cfg.name}": expected string or undefined, got ${typeof rawBaseDir}`
    );
    process.exit(1);
    baseDir = '/'; // unreachable; satisfies TypeScript control-flow analysis
  }
  const client = new XRootDClient(
    cfg.url,
    baseDir,
    cacheEnabled,
    cacheTTL,
    cacheMaxSize
  );
  servers.set(cfg.name, { client, rootAnalyzer: new ROOTAnalyzer(client) });
}

function getClient(serverName?: string): ServerEntry {
  if (serverName) {
    const entry = servers.get(serverName);
    if (!entry) {
      throw new Error(`Unknown server: "${serverName}". Available servers: ${Array.from(servers.keys()).join(', ')}`);
    }
    return entry;
  }
  return servers.values().next().value as ServerEntry;
}

// The MCP Server is created per connection in createServer() (see below),
// so concurrent SSE clients each get their own Server instance.

// Name and version come from the manifest so they live in one place only.
// This file builds to build/src/, so the manifest is two levels up.
const pkg = createRequire(import.meta.url)('../../package.json') as {
  name: string;
  version: string;
};

// Log server info for debugging
console.error('Capabilities: tools');

const tools: Tool[] = [
  {
    name: 'list_servers',
    description: 'List all configured XRootD servers',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_directory',
    description: 'List contents of a directory on an XRootD server',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory to list',
        },
        limit: {
          type: 'number',
          description: `Maximum number of entries per page (default and maximum: ${MAX_LIST_ENTRIES}). Use with offset for pagination through large directories.`,
        },
        offset: {
          type: 'number',
          description: 'Starting index for pagination (default: 0). Use with limit to retrieve subsequent pages.',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_file_info',
    description: 'Get detailed metadata about a file or directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file or directory',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description: 'Read contents of a file from an XRootD server (supports byte ranges)',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read',
        },
        start: {
          type: 'number',
          description: `Optional: Start byte position for partial read (at most ${MAX_READ_BYTES} bytes are returned per call)`,
        },
        end: {
          type: 'number',
          description: 'Optional: End byte position for partial read',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'check_file_exists',
    description: 'Check if a file or directory exists on an XRootD server',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to check',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_directory_size',
    description: 'Calculate total size of a directory (recursively)',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files by pattern (glob or regex)',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Search pattern (glob like "*.root" or regex if useRegex=true)',
        },
        basePath: {
          type: 'string',
          description: 'Base path to search from (default: current directory)',
        },
        recursive: {
          type: 'boolean',
          description: 'Search recursively (default: true)',
        },
        useRegex: {
          type: 'boolean',
          description: 'Treat pattern as regex instead of glob (default: false)',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'get_statistics',
    description: 'Get comprehensive statistics about files in a directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to analyze',
        },
        recursive: {
          type: 'boolean',
          description: 'Include subdirectories (default: true)',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory_filtered',
    description: 'List directory with advanced filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path',
        },
        extension: {
          type: 'string',
          description: 'Filter by file extension (e.g., ".root")',
        },
        minSize: {
          type: 'number',
          description: 'Minimum file size in bytes',
        },
        maxSize: {
          type: 'number',
          description: 'Maximum file size in bytes',
        },
        modifiedAfter: {
          type: 'string',
          description: 'ISO date string - only files modified after this date',
        },
        modifiedBefore: {
          type: 'string',
          description: 'ISO date string - only files modified before this date',
        },
        namePattern: {
          type: 'string',
          description: 'Glob pattern for filename (e.g., "DEMP*")',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'find_recent_files',
    description: 'Find files modified within a time period',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to search',
        },
        hours: {
          type: 'number',
          description: 'Number of hours to look back (default: 24)',
        },
        recursive: {
          type: 'boolean',
          description: 'Search recursively (default: true)',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_campaigns',
    description: 'List available production campaigns',
    inputSchema: {
      type: 'object',
      properties: {
        recoPath: {
          type: 'string',
          description: 'Path to RECO directory (default: "RECO")',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
    },
  },
  {
    name: 'list_datasets',
    description: 'List datasets within a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign: {
          type: 'string',
          description: 'Campaign name (e.g., "25.10.2")',
        },
        recoPath: {
          type: 'string',
          description: 'Path to RECO directory (default: "RECO")',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['campaign'],
    },
  },
  {
    name: 'summarize_recent_changes',
    description: 'Summarize files added in a time period with statistics',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to analyze',
        },
        hours: {
          type: 'number',
          description: 'Number of hours to look back (default: 24)',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'analyze_root_file',
    description: 'Analyze ROOT file structure, trees, and branches. Prefers HTTP-based access; if unavailable, set allow_copy: true to fall back to xrdcp.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to ROOT file',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
        allow_copy: {
          type: 'boolean',
          description: 'Fall back to a full xrdcp file copy if HTTP access fails (default: false).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'extract_podio_metadata',
    description: 'Extract metadata from podio_metadata tree in ROOT file. Prefers HTTP-based access; if unavailable, set allow_copy: true to fall back to xrdcp.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to ROOT file',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
        allow_copy: {
          type: 'boolean',
          description: 'Fall back to a full xrdcp file copy if HTTP access fails (default: false).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_event_statistics',
    description: 'Get event statistics and collection info from ROOT file. Prefers HTTP-based access; if unavailable, set allow_copy: true to fall back to xrdcp.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to ROOT file',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
        allow_copy: {
          type: 'boolean',
          description: 'Fall back to a full xrdcp file copy if HTTP access fails (default: false).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_dataset_event_statistics',
    description: 'Aggregate event statistics across all ROOT files in a dataset. Prefers HTTP-based access; if unavailable, set allow_copy: true to fall back to xrdcp.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to dataset directory',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
        allow_copy: {
          type: 'boolean',
          description: 'Fall back to full xrdcp file copies if HTTP access fails (default: false).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_branch_histogram',
    description: 'Fill a histogram of a TTree branch and return bin edges and counts. Prefers HTTP-based access; if unavailable, set allow_copy: true to fall back to xrdcp.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to ROOT file',
        },
        branch: {
          type: 'string',
          description: 'Branch name (or expression) to histogram, e.g. "ReconstructedParticles.momentum.x"',
        },
        tree: {
          type: 'string',
          description: 'TTree name to read from (default: "events")',
        },
        bins: {
          type: 'integer',
          description: 'Number of histogram bins (default: 100)',
        },
        xmin: {
          type: 'number',
          description: 'Lower bound of histogram range (auto-detected if omitted, requires xmax)',
        },
        xmax: {
          type: 'number',
          description: 'Upper bound of histogram range (auto-detected if omitted, requires xmin)',
        },
        cut: {
          type: 'string',
          description: 'Optional selection criterion applied per event, e.g. "ReconstructedParticles.momentum.z > 0"',
        },
        server: {
          type: 'string',
          description: 'Name of the XRootD server to use (default: first configured server)',
        },
        allow_copy: {
          type: 'boolean',
          description: 'Fall back to a full xrdcp file copy if HTTP access fails (default: false).',
        },
      },
      required: ['path', 'branch'],
    },
  },
];

// Every tool that contacts the server takes a wall-clock limit.
for (const tool of tools) {
  if (tool.name !== 'list_servers') {
    tool.inputSchema.properties!.timeout = {
      type: 'number',
      description: `Seconds before the call returns a timeout message (default: ${DEFAULT_TOOL_TIMEOUT_SECONDS})`,
    };
  }
}

// How to shrink each tool's result when an array in it was cut.
const NARROWING_HINTS: Record<string, string> = {
  list_directory: 'use limit and offset to page',
  search_files: 'use a deeper basePath, a stricter pattern or recursive: false',
  get_statistics: 'use a deeper path or recursive: false',
  list_directory_filtered: 'add a namePattern, extension or size filter',
  find_recent_files: 'use fewer hours, a deeper path or recursive: false',
  list_campaigns: 'point recoPath at one campaign series',
  list_datasets: 'use list_directory with limit and offset on the campaign path',
  summarize_recent_changes: 'use fewer hours or a deeper path',
  analyze_root_file: 'use get_event_statistics for the events tree only',
  extract_podio_metadata: 'no narrower call exists; the branch list is cut',
  get_event_statistics: 'use get_branch_histogram for one collection',
  get_dataset_event_statistics: 'point path at one sub-directory',
  get_branch_histogram: 'use fewer bins',
};

function jsonText(toolName: string, value: unknown): string {
  const hint = NARROWING_HINTS[toolName] ?? 'narrow the call';
  return JSON.stringify(truncateArrays(value, MAX_LIST_ENTRIES, hint), null, 2);
}

// Add what to do next to the xrootd errors an agent meets most often.
function explainError(message: string): string {
  if (message.includes('[3011]')) {
    return `${message} The path does not exist on the server; list_directory on its parent shows what does.`;
  }
  if (message.includes('ENOENT') && message.includes('xrd')) {
    return `${message} The xrootd client (xrdfs/xrdcp) is not installed on the MCP server host.`;
  }
  return message;
}

const SERVER_INSTRUCTIONS = [
  'Read-only access to XRootD servers for EIC data. Results are JSON text; a failure is a text',
  "starting with 'Error:' that says what to try next, with isError set.",
  'Tools:',
  '- list_servers: the configured servers and their cache statistics.',
  '- list_directory: entries of one directory, paged with limit and offset.',
  '- get_file_info: size, modification time and type of one path.',
  `- read_file: file content as text, optionally a byte range; at most ${MAX_READ_BYTES} bytes per call.`,
  '- check_file_exists: whether a path exists.',
  '- get_directory_size: total size of a directory tree.',
  '- search_files: files matching a glob or regex under a path.',
  '- get_statistics: counts, sizes and extremes of the files under a path.',
  '- list_directory_filtered: one directory filtered by extension, size, date or name pattern.',
  '- find_recent_files: files modified within the last hours.',
  '- list_campaigns / list_datasets: production campaigns and the datasets of one campaign.',
  '- summarize_recent_changes: files added in the last hours, grouped by extension and directory.',
  '- analyze_root_file / extract_podio_metadata / get_event_statistics: structure, podio metadata and per-collection sizes of one ROOT file.',
  '- get_dataset_event_statistics: event statistics summed over the ROOT files of a directory.',
  '- get_branch_histogram: histogram of one TTree branch.',
  `Timeouts: every tool takes 'timeout' in seconds (default ${DEFAULT_TOOL_TIMEOUT_SECONDS}); on expiry it`,
  'returns an error naming the tool and the limit; the xrootd command keeps running, so narrow the',
  'call or retry once later.',
  `Truncation: any list in a result stops at ${MAX_LIST_ENTRIES} entries and a sibling '<key>Truncated' field`,
  "reads 'truncated: N of M entries; <how to narrow the call>'; read_file appends a '[truncated: N of M bytes ...]' line.",
].join('\n');

function createServer(): Server {
  const server = new Server(
    { name: pkg.name, version: pkg.version },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  // list_servers takes no parameters so clients may omit arguments; default to {}
  const args = request.params.arguments ?? {};
  const timeoutSeconds = args.timeout !== undefined ? Number(args.timeout) : DEFAULT_TOOL_TIMEOUT_SECONDS;

  const runTool = async (): Promise<CallToolResult> => {
    switch (name) {
      case 'list_servers': {
        const serverList = Array.from(servers.entries()).map(([srvName, { client }]) => ({
          name: srvName,
          cacheStats: client.getCacheStats(),
        }));
        return {
          content: [{ type: 'text', text: jsonText(name, { servers: serverList }) }],
        };
      }

      case 'list_directory': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const requestedLimit = args.limit !== undefined ? Number(args.limit) : MAX_LIST_ENTRIES;
        const offset = args.offset !== undefined ? Number(args.offset) : 0;

        if (!Number.isFinite(requestedLimit) || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
          throw new Error('Invalid "limit" parameter: must be a positive integer.');
        }
        const limit = Math.min(requestedLimit, MAX_LIST_ENTRIES);
        if (!Number.isFinite(offset) || !Number.isInteger(offset) || offset < 0) {
          throw new Error('Invalid "offset" parameter: must be a non-negative integer.');
        }

        const allEntries = await client.listDirectory(path);
        const page = allEntries.slice(offset, offset + limit);
        const hasMore = offset + page.length < allEntries.length;

        const responseBody: Record<string, unknown> = {
          totalEntries: allEntries.length,
          offset,
          limit,
          returnedEntries: page.length,
          hasMore,
          entries: page,
        };
        if (hasMore) {
          responseBody.nextOffset = offset + page.length;
          responseBody.note = `Showing entries ${offset}–${offset + page.length - 1} of ${allEntries.length}. Use offset=${offset + page.length} to retrieve the next page.`;
        }

        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, responseBody),
            },
          ],
        };
      }

      case 'get_file_info': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const info = await client.getFileInfo(path);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, info),
            },
          ],
        };
      }

      case 'read_file': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const start = args.start !== undefined ? Number(args.start) : undefined;
        const end = args.end !== undefined ? Number(args.end) : undefined;
        
        const content = await client.readFile(path, start, end);
        let text = content.subarray(0, MAX_READ_BYTES).toString('utf-8');
        if (content.length > MAX_READ_BYTES) {
          text += `\n[truncated: ${MAX_READ_BYTES} of ${content.length} bytes; pass start and end for a byte range]`;
        }

        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
        };
      }

      case 'check_file_exists': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const exists = await client.fileExists(path);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, { path, exists }),
            },
          ],
        };
      }

      case 'get_directory_size': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const size = await client.getDirectorySize(path);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, { path, size, sizeHuman: formatBytes(size) }),
            },
          ],
        };
      }

      case 'search_files': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const pattern = String(args.pattern);
        const basePath = args.basePath ? String(args.basePath) : '.';
        const recursive = args.recursive !== undefined ? Boolean(args.recursive) : true;
        const useRegex = args.useRegex !== undefined ? Boolean(args.useRegex) : false;
        
        const results = await client.searchFiles(pattern, basePath, recursive, useRegex);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                pattern,
                matchCount: results.length,
                results: results.map(r => ({
                  path: r.path,
                  size: r.size,
                  sizeHuman: formatBytes(r.size),
                  modificationTime: r.modificationTime,
                })),
              }),
            },
          ],
        };
      }

      case 'get_statistics': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const recursive = args.recursive !== undefined ? Boolean(args.recursive) : true;
        
        const stats = await client.getStatistics(path, recursive);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                ...stats,
                totalSizeHuman: formatBytes(stats.totalSize),
                sizeByExtension: Object.fromEntries(
                  Object.entries(stats.sizeByExtension).map(([ext, data]) => [
                    ext,
                    { ...data, sizeHuman: formatBytes(data.size) },
                  ])
                ),
              }),
            },
          ],
        };
      }

      case 'list_directory_filtered': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const filter: any = {};
        
        if (args.extension) filter.extension = String(args.extension);
        if (args.minSize !== undefined) filter.minSize = Number(args.minSize);
        if (args.maxSize !== undefined) filter.maxSize = Number(args.maxSize);
        if (args.modifiedAfter) filter.modifiedAfter = new Date(String(args.modifiedAfter));
        if (args.modifiedBefore) filter.modifiedBefore = new Date(String(args.modifiedBefore));
        if (args.namePattern) filter.namePattern = String(args.namePattern);
        
        const entries = await client.listDirectoryFiltered(path, filter);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                path,
                filter,
                matchCount: entries.length,
                entries,
              }),
            },
          ],
        };
      }

      case 'find_recent_files': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const hours = args.hours !== undefined ? Number(args.hours) : 24;
        const recursive = args.recursive !== undefined ? Boolean(args.recursive) : true;
        
        const results = await client.findRecentFiles(path, hours, recursive);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                path,
                hours,
                fileCount: results.length,
                results: results.map(r => ({
                  path: r.path,
                  size: r.size,
                  sizeHuman: formatBytes(r.size),
                  modificationTime: r.modificationTime,
                })),
              }),
            },
          ],
        };
      }

      case 'list_campaigns': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const recoPath = args.recoPath ? String(args.recoPath) : 'RECO';
        const campaigns = await client.listCampaigns(recoPath);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                campaignCount: campaigns.length,
                campaigns,
              }),
            },
          ],
        };
      }

      case 'list_datasets': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const campaign = String(args.campaign);
        const recoPath = args.recoPath ? String(args.recoPath) : 'RECO';
        
        const datasets = await client.listDatasets(campaign, recoPath);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                campaign,
                datasetCount: datasets.length,
                datasets,
              }),
            },
          ],
        };
      }

      case 'summarize_recent_changes': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const hours = args.hours !== undefined ? Number(args.hours) : 24;
        
        const summary = await client.summarizeRecentChanges(path, hours);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                path,
                period: `${hours} hours`,
                totalFilesAdded: summary.totalFilesAdded,
                totalSizeAdded: summary.totalSizeAdded,
                totalSizeAddedHuman: formatBytes(summary.totalSizeAdded),
                filesByExtension: summary.filesByExtension,
                sizeByExtension: Object.fromEntries(
                  Object.entries(summary.sizeByExtension).map(([ext, size]) => [
                    ext,
                    formatBytes(size),
                  ])
                ),
                topDirectories: Object.entries(summary.filesByDirectory)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([dir, count]) => ({ directory: dir, fileCount: count })),
                sampleFiles: summary.recentFiles.slice(0, 20).map(f => ({
                  path: f.path,
                  size: formatBytes(f.size),
                  modificationTime: f.modificationTime,
                })),
              }),
            },
          ],
        };
      }

      case 'analyze_root_file': {
        const { rootAnalyzer: ra } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const allowCopy = args.allow_copy === true;
        const structure = await ra.analyzeFile(path, allowCopy);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                ...structure,
                sizeHuman: formatBytes(structure.size),
                trees: structure.trees.map(tree => ({
                  ...tree,
                  totalSizeHuman: formatBytes(tree.totalSize),
                  zipBytesHuman: formatBytes(tree.zipBytes),
                  compressionFactor: tree.zipBytes > 0 ? tree.totalSize / tree.zipBytes : 1.0,
                  branches: tree.branches.map(branch => ({
                    ...branch,
                    totalSizeHuman: formatBytes(branch.totalSize),
                    zipBytesHuman: formatBytes(branch.zipBytes),
                  })),
                })),
              }),
            },
          ],
        };
      }

      case 'extract_podio_metadata': {
        const { rootAnalyzer: ra } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const allowCopy = args.allow_copy === true;
        const metadata = await ra.extractPodioMetadata(path, allowCopy);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, metadata),
            },
          ],
        };
      }

      case 'get_event_statistics': {
        const { rootAnalyzer: ra } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const allowCopy = args.allow_copy === true;
        const stats = await ra.getEventStatistics(path, allowCopy);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                totalEvents: stats.totalEvents,
                collectionCount: Object.keys(stats.collectionStats).length,
                collections: Object.entries(stats.collectionStats).map(([collName, coll]) => ({
                  name: collName,
                  entries: coll.entries,
                  totalSize: coll.totalSize,
                  totalSizeHuman: formatBytes(coll.totalSize),
                  zipBytes: coll.zipBytes,
                  zipBytesHuman: formatBytes(coll.zipBytes),
                  compressionFactor: coll.compressionFactor.toFixed(2),
                  averageSizePerEvent: coll.averageSizePerEvent,
                  averageSizePerEventHuman: formatBytes(coll.averageSizePerEvent),
                })).sort((a, b) => b.totalSize - a.totalSize),
              }),
            },
          ],
        };
      }

      case 'get_dataset_event_statistics': {
        const { rootAnalyzer: ra } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const allowCopy = args.allow_copy === true;
        const stats = await ra.getDatasetEventStatistics(path, allowCopy);
        
        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, {
                datasetPath: stats.datasetPath,
                fileCount: stats.files.length,
                totalEvents: stats.totalEvents,
                totalSize: stats.totalSize,
                totalSizeHuman: formatBytes(stats.totalSize),
                totalZipBytes: stats.totalZipBytes,
                totalZipBytesHuman: formatBytes(stats.totalZipBytes),
                overallCompressionFactor: stats.totalZipBytes > 0 
                  ? (stats.totalSize / stats.totalZipBytes).toFixed(2) 
                  : '1.00',
                averageEventsPerFile: Math.round(stats.averageEventsPerFile),
                collectionAggregates: Object.entries(stats.collectionAggregates).map(([collName, agg]) => ({
                  name: collName,
                  totalEntries: agg.totalEntries,
                  totalSize: agg.totalSize,
                  totalSizeHuman: formatBytes(agg.totalSize),
                  totalZipBytes: agg.totalZipBytes,
                  totalZipBytesHuman: formatBytes(agg.totalZipBytes),
                  averageCompressionFactor: agg.averageCompressionFactor.toFixed(2),
                  filesContaining: agg.filesContaining,
                  percentOfFiles: ((agg.filesContaining / stats.files.length) * 100).toFixed(1) + '%',
                })).sort((a, b) => b.totalSize - a.totalSize),
                files: stats.files.map(f => ({
                  path: f.path,
                  events: f.events,
                  size: f.size,
                  sizeHuman: formatBytes(f.size),
                  zipBytes: f.zipBytes,
                  zipBytesHuman: formatBytes(f.zipBytes),
                  compressionFactor: f.zipBytes > 0 ? (f.size / f.zipBytes).toFixed(2) : '1.00',
                  collectionCount: Object.keys(f.collections).length,
                })),
              }),
            },
          ],
        };
      }

      case 'get_branch_histogram': {
        const { rootAnalyzer: ra } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const branch = String(args.branch);
        const tree = args.tree ? String(args.tree) : 'events';
        const rawBins = args.bins !== undefined ? Number(args.bins) : 100;
        const bins = Math.round(rawBins);
        if (!Number.isFinite(bins) || bins < 1) {
          throw new Error('Invalid "bins" parameter: must be a finite integer >= 1.');
        }
        const hasXmin = args.xmin !== undefined;
        const hasXmax = args.xmax !== undefined;

        if (hasXmin !== hasXmax) {
          throw new Error('Both xmin and xmax must be provided together or both omitted.');
        }

        const xmin = hasXmin ? Number(args.xmin) : undefined;
        const xmax = hasXmax ? Number(args.xmax) : undefined;

        if (xmin !== undefined && xmax !== undefined && xmin >= xmax) {
          throw new Error('Invalid range: xmin must be less than xmax.');
        }
        const cut = args.cut ? String(args.cut) : undefined;
        const allowCopy = args.allow_copy === true;
        const hist = await ra.histogramBranch(path, branch, tree, bins, xmin, xmax, cut, allowCopy);

        return {
          content: [
            {
              type: 'text',
              text: jsonText(name, hist),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };

  try {
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error('Invalid "timeout" parameter: must be a positive number of seconds.');
    }
    return await withTimeout(runTool(), timeoutSeconds, name);
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${explainError(error.message)}`,
        },
      ],
      isError: true,
    };
  }
});

  return server;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function logServerSummary() {
  console.error(`Configured servers: ${Array.from(servers.keys()).join(', ')}`);
  for (const [srvName, { client }] of servers.entries()) {
    const stats = client.getCacheStats();
    console.error(`  [${srvName}] cache entries: ${stats.size}`);
  }
}

async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('XRootD MCP Server running on stdio');
  logServerSummary();
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function readHttpEndpoint(defaultPort: number): { host: string; port: number } {
  const host = process.env.MCP_HOST || '127.0.0.1';
  const portEnv = process.env.MCP_PORT?.trim();
  const port = portEnv ? Number(portEnv) : defaultPort;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`MCP_PORT must be an integer between 1 and 65535, got '${portEnv}'`);
  }
  return { host, port };
}

function warnIfExposed(host: string): void {
  if (!LOOPBACK_HOSTS.has(host)) {
    console.error(
      `WARNING: MCP_HOST=${host} exposes the full tool surface on a non-loopback ` +
        'interface with no authentication. Bind to 127.0.0.1 and use a tunnel or an ' +
        'authenticating proxy for remote access.'
    );
  }
}

async function runSse() {
  const { host, port } = readHttpEndpoint(9102);

  // Active SSE sessions keyed by transport.sessionId.
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    // A fixed base keeps parsing independent of the bind address (IPv6 hosts
    // would need brackets) and of malformed request targets.
    let url: URL;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/sse') {
      const transport = new SSEServerTransport('/messages', res);
      const server = createServer();
      transports.set(transport.sessionId, transport);
      res.on('close', () => {
        transports.delete(transport.sessionId);
      });
      try {
        await server.connect(transport);
      } catch (error: any) {
        console.error('Error establishing SSE connection:', error?.message ?? error);
        transports.delete(transport.sessionId);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId');
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('No transport found for sessionId');
        return;
      }
      try {
        await transport.handlePostMessage(req, res);
      } catch (error: any) {
        console.error('Error handling message:', error?.message ?? error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        if (!res.writableEnded) {
          res.end('Internal server error');
        }
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });

  console.error(`XRootD MCP Server running on SSE at http://${host}:${port}/sse`);
  warnIfExposed(host);
  logServerSummary();
}

const MCP_PATH = '/mcp';

// Stateless streamable HTTP: a fresh Server + transport per request.  All tool
// state (servers, caches) is module-level, so sessions would add only
// bookkeeping and "session not found" failures after a restart.
async function runStreamableHttp() {
  const { host, port } = readHttpEndpoint(9102);

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    let url: URL;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
      return;
    }

    // Accept /mcp and /mcp/ alike — clients differ.
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path !== MCP_PATH) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // handleRequest resolves once the response is fully written; 'close' only
    // covers an early abort, so both run and must be idempotent.
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    };
    res.on('close', dispose);

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error: any) {
      console.error('Error handling MCP request:', error?.message ?? error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      if (!res.writableEnded) {
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          })
        );
      }
    } finally {
      dispose();
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });

  console.error(
    `XRootD MCP Server running on streamable HTTP at http://${host}:${port}${MCP_PATH}`
  );
  warnIfExposed(host);
  logServerSummary();
}

async function main() {
  const transportMode = (process.env.MCP_TRANSPORT || 'stdio').trim().toLowerCase();

  switch (transportMode) {
    case 'http':
    case 'streamable-http':
    case 'streamablehttp':
      await runStreamableHttp();
      break;
    case 'sse':
      await runSse();
      break;
    case 'stdio':
    case '':
      await runStdio();
      break;
    default:
      throw new Error(`Unknown MCP_TRANSPORT '${transportMode}' (use: stdio | http | sse)`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
