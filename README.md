# XRootD MCP Server

A Model Context Protocol (MCP) server that provides access to XRootD file systems. This server allows LLMs to interact with XRootD servers to list directories, read file metadata, access file contents, and more.

## Features

- **List directories**: Browse XRootD file system hierarchy
- **File metadata**: Get detailed information about files (size, modification time, permissions)
- **Read file contents**: Access file data from XRootD servers
- **File operations**: Check file existence, get statistics
- **Protocol support**: Connect to XRootD servers via root:// protocol

## Installation

### Using Docker (Recommended)

```bash
docker pull ghcr.io/wdconinc/xrootd-mcp-server:latest

docker run -i --rm \
  -e XROOTD_SERVER="root://dtn-eic.jlab.org" \
  -e XROOTD_BASE_DIR="/volatile/eic/EPIC" \
  ghcr.io/wdconinc/xrootd-mcp-server:latest
```

See [Docker Usage Guide](docs/DOCKER.md) for detailed instructions.

### From Source

```bash
npm install
npm run build
```

## Configuration

Set the XRootD server URL using the `XROOTD_SERVER` environment variable:

```bash
export XROOTD_SERVER="root://dtn-eic.jlab.org"
```

Optionally, set a base directory to restrict access and simplify paths:

```bash
export XROOTD_BASE_DIR="/volatile/eic/EPIC"
```

When `XROOTD_BASE_DIR` is set:
- Relative paths are resolved relative to the base directory
- Absolute paths must be within the base directory (access control)
- For example, with base `/volatile/eic/EPIC`, the path `EVGEN` refers to `/volatile/eic/EPIC/EVGEN`

### Caching

Directory listing results are cached for improved performance:

```bash
export XROOTD_CACHE_ENABLED=true    # default: true
export XROOTD_CACHE_TTL=60          # minutes, default: 60
```

The cache uses a time-based expiration strategy (TTL):
- Directory listings are cached in memory
- Cache entries expire after the configured TTL
- Automatic cleanup removes expired entries every 15 minutes
- LRU eviction when cache size exceeds 1000 entries

**Note:** Cached data may be up to TTL minutes old. For production data that changes infrequently, a 60-minute TTL provides good performance with acceptable staleness.

## Usage

### With MCP Client

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "xrootd": {
      "command": "node",
      "args": ["/path/to/xrootd-mcp-server/build/index.js"],
      "env": {
        "XROOTD_SERVER": "root://dtn-eic.jlab.org",
        "XROOTD_BASE_DIR": "/volatile/eic/EPIC",
        "XROOTD_CACHE_ENABLED": "true",
        "XROOTD_CACHE_TTL": "60"
      }
    }
  }
}
```

### Available Tools

**Basic File Operations:**
- `list_directory`: List contents of an XRootD directory
- `get_file_info`: Get detailed metadata about a file
- `read_file`: Read contents of a file (with optional byte range)
- `check_file_exists`: Check if a file or directory exists
- `get_directory_size`: Calculate total size of a directory

**Advanced Search & Analysis:**
- `search_files`: Search for files by glob pattern or regex
- `list_directory_filtered`: List directory with advanced filtering (size, date, extension, pattern)
- `find_recent_files`: Find files modified within a time period
- `get_statistics`: Get comprehensive statistics about files in a directory

**Campaign & Dataset Discovery:**
- `list_campaigns`: List available production campaigns
- `list_datasets`: List datasets within a specific campaign
- `summarize_recent_changes`: Summarize files added in a time period with detailed statistics

## Development

```bash
# Build
npm run build

# Watch mode
npm run watch
```

## Requirements

- Node.js 18 or higher
- Access to an XRootD server
- xrdfs command-line tool installed (from xrootd-client package)

## License

MIT
