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

const XROOTD_SERVER = process.env.XROOTD_SERVER;
const XROOTD_BASE_DIR = process.env.XROOTD_BASE_DIR || '/';
const XROOTD_CACHE_ENABLED = process.env.XROOTD_CACHE_ENABLED !== 'false';
const XROOTD_CACHE_TTL = parseInt(process.env.XROOTD_CACHE_TTL || '60', 10);
const XROOTD_CACHE_MAX_SIZE = parseInt(process.env.XROOTD_CACHE_MAX_SIZE || '1000', 10);

if (!XROOTD_SERVER) {
  console.error('Error: XROOTD_SERVER environment variable is required');
  process.exit(1);
}

const xrootdClient = new XRootDClient(XROOTD_SERVER, XROOTD_BASE_DIR, XROOTD_CACHE_ENABLED, XROOTD_CACHE_TTL, XROOTD_CACHE_MAX_SIZE);
const rootAnalyzer = new ROOTAnalyzer(xrootdClient);

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
console.error(`Capabilities: tools (16 available)`);

const tools: Tool[] = [
  {
    name: 'list_directory',
    description: 'List contents of a directory on the XRootD server',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory to list',
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
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description: 'Read contents of a file from the XRootD server (supports byte ranges)',
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
      },
      required: ['path'],
    },
  },
  {
    name: 'check_file_exists',
    description: 'Check if a file or directory exists on the XRootD server',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to check',
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

  if (!args) {
    throw new Error('Missing arguments');
  }

  try {
    switch (name) {
      case 'list_directory': {
        const path = String(args.path);
        const entries = await xrootdClient.listDirectory(path);
        
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
        const path = String(args.path);
        const info = await xrootdClient.getFileInfo(path);
        
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
        const path = String(args.path);
        const start = args.start !== undefined ? Number(args.start) : undefined;
        const end = args.end !== undefined ? Number(args.end) : undefined;
        
        const content = await xrootdClient.readFile(path, start, end);
        
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
        const path = String(args.path);
        const exists = await xrootdClient.fileExists(path);
        
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
        const path = String(args.path);
        const size = await xrootdClient.getDirectorySize(path);
        
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
        const pattern = String(args.pattern);
        const basePath = args.basePath ? String(args.basePath) : '.';
        const recursive = args.recursive !== undefined ? Boolean(args.recursive) : true;
        const useRegex = args.useRegex !== undefined ? Boolean(args.useRegex) : false;
        
        const results = await xrootdClient.searchFiles(pattern, basePath, recursive, useRegex);
        
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
        const path = String(args.path);
        const recursive = args.recursive !== undefined ? Boolean(args.recursive) : true;
        
        const stats = await xrootdClient.getStatistics(path, recursive);
        
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
        const path = String(args.path);
        const filter: any = {};
        
        if (args.extension) filter.extension = String(args.extension);
        if (args.minSize !== undefined) filter.minSize = Number(args.minSize);
        if (args.maxSize !== undefined) filter.maxSize = Number(args.maxSize);
        if (args.modifiedAfter) filter.modifiedAfter = new Date(String(args.modifiedAfter));
        if (args.modifiedBefore) filter.modifiedBefore = new Date(String(args.modifiedBefore));
        if (args.namePattern) filter.namePattern = String(args.namePattern);
        
        const entries = await xrootdClient.listDirectoryFiltered(path, filter);
        
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
        const path = String(args.path);
        const hours = args.hours !== undefined ? Number(args.hours) : 24;
        const recursive = args.recursive !== undefined ? Boolean(args.recursive) : true;
        
        const results = await xrootdClient.findRecentFiles(path, hours, recursive);
        
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
        const recoPath = args.recoPath ? String(args.recoPath) : 'RECO';
        const campaigns = await xrootdClient.listCampaigns(recoPath);
        
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
        const campaign = String(args.campaign);
        const recoPath = args.recoPath ? String(args.recoPath) : 'RECO';
        
        const datasets = await xrootdClient.listDatasets(campaign, recoPath);
        
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
        const path = String(args.path);
        const hours = args.hours !== undefined ? Number(args.hours) : 24;
        
        const summary = await xrootdClient.summarizeRecentChanges(path, hours);
        
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
        const path = String(args.path);
        const structure = await rootAnalyzer.analyzeFile(path);
        
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
        const path = String(args.path);
        const metadata = await rootAnalyzer.extractPodioMetadata(path);
        
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
        const path = String(args.path);
        const stats = await rootAnalyzer.getEventStatistics(path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                totalEvents: stats.totalEvents,
                collectionCount: Object.keys(stats.collectionStats).length,
                collections: Object.entries(stats.collectionStats).map(([name, coll]) => ({
                  name,
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
        const path = String(args.path);
        const stats = await rootAnalyzer.getDatasetEventStatistics(path);
        
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
                collectionAggregates: Object.entries(stats.collectionAggregates).map(([name, agg]) => ({
                  name,
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
  console.error(`Connected to XRootD server: ${XROOTD_SERVER}`);
  console.error(`Base directory: ${XROOTD_BASE_DIR}`);
  console.error(`Caching: ${XROOTD_CACHE_ENABLED ? `enabled (TTL: ${XROOTD_CACHE_TTL}m)` : 'disabled'}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
