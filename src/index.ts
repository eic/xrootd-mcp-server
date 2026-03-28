#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { XRootDClient } from './xrootd.js';
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

// Safe XRootD URL pattern: root://host[:port] with no whitespace or shell metacharacters
// Supports IPv4 hostnames and IPv6 addresses in brackets (e.g., root://[::1]:1094)
const SAFE_XROOTD_URL_RE = /^root:\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9._\-]+)(:\d+)?$/;

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
    num = rawValue;
  } else if (typeof rawValue === 'string' && rawValue.trim() !== '') {
    const parsed = parseInt(rawValue, 10);
    if (!Number.isNaN(parsed)) {
      num = parsed;
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
        const name = (config as ServerConfig).name;
        const url = (config as ServerConfig).url;
        if (typeof name !== 'string' || name.trim().length === 0) {
          console.error(`Error: XROOTD_SERVERS[${index}].name must be a non-empty string`);
          process.exit(1);
        }
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
  const client = new XRootDClient(
    cfg.url,
    cfg.baseDir ?? '/',
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

const server = new Server(
  {
    name: 'xrootd-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Log server info for debugging
console.error(`Server: xrootd-mcp-server v0.1.0`);
console.error(`Capabilities: tools (17 available)`);

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
          description: 'Optional: Start byte position for partial read',
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
    description: 'Analyze ROOT file structure, trees, and branches',
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
      },
      required: ['path'],
    },
  },
  {
    name: 'extract_podio_metadata',
    description: 'Extract metadata from podio_metadata tree in ROOT file',
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
      },
      required: ['path'],
    },
  },
  {
    name: 'get_event_statistics',
    description: 'Get event statistics and collection info from ROOT file',
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
      },
      required: ['path'],
    },
  },
  {
    name: 'get_dataset_event_statistics',
    description: 'Aggregate event statistics across all ROOT files in a dataset',
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
      },
      required: ['path'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // list_servers takes no parameters; allow missing arguments for it
  if (!args && name !== 'list_servers') {
    throw new Error('Missing arguments');
  }

  try {
    switch (name) {
      case 'list_servers': {
        const serverList = Array.from(servers.entries()).map(([srvName, { client }]) => ({
          name: srvName,
          cacheStats: client.getCacheStats(),
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify({ servers: serverList }, null, 2) }],
        };
      }

      case 'list_directory': {
        const { client } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const entries = await client.listDirectory(path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(entries, null, 2),
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
              text: JSON.stringify(info, null, 2),
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
        
        return {
          content: [
            {
              type: 'text',
              text: content.toString('utf-8'),
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
              text: JSON.stringify({ path, exists }, null, 2),
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
              text: JSON.stringify({ path, size, sizeHuman: formatBytes(size) }, null, 2),
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
              text: JSON.stringify({
                pattern,
                matchCount: results.length,
                results: results.map(r => ({
                  path: r.path,
                  size: r.size,
                  sizeHuman: formatBytes(r.size),
                  modificationTime: r.modificationTime,
                })),
              }, null, 2),
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
              text: JSON.stringify({
                ...stats,
                totalSizeHuman: formatBytes(stats.totalSize),
                sizeByExtension: Object.fromEntries(
                  Object.entries(stats.sizeByExtension).map(([ext, data]) => [
                    ext,
                    { ...data, sizeHuman: formatBytes(data.size) },
                  ])
                ),
              }, null, 2),
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
              text: JSON.stringify({
                path,
                filter,
                matchCount: entries.length,
                entries,
              }, null, 2),
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
              text: JSON.stringify({
                path,
                hours,
                fileCount: results.length,
                results: results.map(r => ({
                  path: r.path,
                  size: r.size,
                  sizeHuman: formatBytes(r.size),
                  modificationTime: r.modificationTime,
                })),
              }, null, 2),
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
              text: JSON.stringify({
                campaignCount: campaigns.length,
                campaigns,
              }, null, 2),
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
              text: JSON.stringify({
                campaign,
                datasetCount: datasets.length,
                datasets,
              }, null, 2),
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
              text: JSON.stringify({
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
              }, null, 2),
            },
          ],
        };
      }

      case 'analyze_root_file': {
        const { rootAnalyzer: ra } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const structure = await ra.analyzeFile(path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
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
              }, null, 2),
            },
          ],
        };
      }

      case 'extract_podio_metadata': {
        const { rootAnalyzer: ra } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const metadata = await ra.extractPodioMetadata(path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(metadata, null, 2),
            },
          ],
        };
      }

      case 'get_event_statistics': {
        const { rootAnalyzer: ra } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const stats = await ra.getEventStatistics(path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
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
              }, null, 2),
            },
          ],
        };
      }

      case 'get_dataset_event_statistics': {
        const { rootAnalyzer: ra } = getClient(args.server ? String(args.server) : undefined);
        const path = String(args.path);
        const stats = await ra.getDatasetEventStatistics(path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
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
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('XRootD MCP Server running on stdio');
  console.error(`Configured servers: ${Array.from(servers.keys()).join(', ')}`);
  for (const [srvName, { client }] of servers.entries()) {
    const stats = client.getCacheStats();
    console.error(`  [${srvName}] cache entries: ${stats.size}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
