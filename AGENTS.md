# AI Agent Instructions for XRootD MCP Server

This document provides guidance for AI agents (GitHub Copilot, Claude, ChatGPT, etc.) working on this repository.

## Project Overview

**XRootD MCP Server** - A Model Context Protocol server that provides LLMs access to XRootD file systems for the EIC (Electron-Ion Collider) project.

- **Language**: TypeScript (Node.js)
- **MCP SDK**: `@modelcontextprotocol/sdk` v0.5.0
- **Purpose**: File access, search, analysis, and ROOT file metadata extraction for scientific computing
- **Target**: HEP (High Energy Physics) / Nuclear Physics data analysis workflows

## Architecture

```
src/
├── index.ts        # MCP server implementation, tool definitions
├── xrootd.ts       # XRootD client wrapper, core functionality
└── cache.ts        # Directory listing cache (TTL-based)

build/              # Compiled JavaScript (generated, do not edit)
docs/               # Documentation
examples/           # Usage examples and configuration
```

## Key Principles

### 1. Security First
- **Base directory restriction**: All paths must be within `XROOTD_BASE_DIR`
- **Path resolution**: Use `resolvePath()` to validate and normalize paths
- **No write operations**: Read-only access to XRootD server
- **Input validation**: Validate all user inputs before passing to shell commands

### 2. XRootD Integration
- **Commands**: Use `xrdfs` for metadata, `xrdcp` for file content
- **Shell escaping**: Always properly escape paths in commands
- **Buffer sizes**: Use 50MB maxBuffer for large directory listings
- **Error handling**: Catch and wrap xrootd errors with descriptive messages

### 3. MCP Protocol Standards
- **Tool schemas**: Define clear JSON schemas for all parameters
- **Response format**: Return `{ content: [{ type: 'text', text: JSON.stringify(...) }] }`
- **Error responses**: Include `isError: true` for failures
- **Capabilities**: Declare only implemented capabilities (currently: tools)

### 4. Performance & Caching
- **Cache strategy**: Time-based TTL (default 60 minutes)
- **Cache bypass**: Provide `useCache` parameter where appropriate
- **Recursive operations**: Be mindful of performance on large directory trees
- **Lazy loading**: Don't fetch data until needed

### 5. TypeScript Best Practices
- **Strict mode**: Project uses strict TypeScript settings
- **Type safety**: Always define interfaces for data structures
- **Null checks**: Handle undefined/null cases explicitly
- **ES2022/Node16**: Use modern JavaScript features, ESM modules

## Common Tasks

### Adding a New Tool

1. **Define the interface** in `src/xrootd.ts`:
```typescript
export interface NewFeatureResult {
  // Define return type
}
```

2. **Implement the method** in `XRootDClient` class:
```typescript
async newFeature(param: string): Promise<NewFeatureResult> {
  const resolvedPath = this.resolvePath(param);
  // Implementation
  return result;
}
```

3. **Add tool definition** in `src/index.ts` tools array:
```typescript
{
  name: 'new_feature',
  description: 'Clear description for LLM',
  inputSchema: {
    type: 'object',
    properties: {
      param: {
        type: 'string',
        description: 'Parameter description',
      },
    },
    required: ['param'],
  },
}
```

4. **Add handler** in `CallToolRequestSchema` switch statement:
```typescript
case 'new_feature': {
  const param = String(args.param);
  const result = await xrootdClient.newFeature(param);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
```

5. **Update documentation**: Add to README.md and create examples

### Modifying XRootD Operations

When adding/modifying xrootd commands:

```typescript
// ✅ GOOD: Proper error handling and buffer size
try {
  const { stdout } = await execAsync(`xrdfs ${this.serverUrl} command ${resolvedPath}`, {
    maxBuffer: 50 * 1024 * 1024
  });
  // Process output
} catch (error: any) {
  throw new Error(`Failed to perform operation: ${error.message}`);
}

// ❌ BAD: No buffer limit, poor error handling
const { stdout } = await execAsync(`xrdfs ${this.serverUrl} command ${path}`);
```

### Working with File Metadata

**xrdfs ls -l format:**
```
drwxrwxr-x owner group size YYYY-MM-DD HH:MM:SS /full/path
```

**Parsing pattern:**
```typescript
const match = line.match(/^([-d])([rwx-]{9})\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/);
if (match) {
  const [, type, perms, owner, group, size, dateStr, fullPath] = match;
  const name = fullPath.trim().split('/').pop() || fullPath.trim();
  // Use parsed data
}
```

### Testing Changes

```bash
# Build
npm run build

# Test a specific feature
node -e "
import { XRootDClient } from './build/xrootd.js';
const client = new XRootDClient('root://server', '/base', false);
const result = await client.yourMethod('test');
console.log(result);
"
```

## Code Style Guidelines

### File Organization
- Keep interfaces at the top of files
- Group related methods together
- Private methods after public methods
- Helper methods at the bottom

### Naming Conventions
- **Classes**: PascalCase (`XRootDClient`)
- **Methods**: camelCase (`listDirectory`)
- **Interfaces**: PascalCase (`DirectoryEntry`)
- **Constants**: UPPER_SNAKE_CASE (`XROOTD_SERVER`)
- **Private methods**: Start with underscore if needed, but prefer access modifiers

### Comments
- Use JSDoc for public methods
- Explain *why*, not *what* (code should be self-explanatory)
- Document complex algorithms
- Mark TODOs with `// TODO: description`

### Error Messages
```typescript
// ✅ GOOD: Descriptive, includes context
throw new Error(`Failed to list directory ${path}: ${error.message}`);

// ❌ BAD: Generic, no context
throw new Error('Operation failed');
```

## EIC-Specific Knowledge

### Directory Structure
```
/volatile/eic/EPIC/
├── RECO/                    # Reconstructed data
│   ├── 25.10.2/            # Campaign version
│   │   ├── epic_craterlake/ # Detector configuration
│   │   │   ├── EXCLUSIVE/   # Physics process type
│   │   │   │   ├── DEMP/    # Specific process
│   │   │   │   │   ├── DEMPgen-1.2.4/ # Generator version
│   │   │   │   │   │   ├── 10x130/      # Beam configuration
│   │   │   │   │   │   │   ├── q2_10_20/ # Kinematic bin
│   │   │   │   │   │   │   │   ├── pi+/   # Particle type
│   │   │   │   │   │   │   │   │   └── *.root files
├── EVGEN/                  # Event generation
└── FULL/                   # Full simulation
```

### File Naming Patterns
- **Reconstructed**: `{generator}_{beam}_{particle}_{kinematics}_{number}.eicrecon.edm4eic.root`
- **Generated**: `{generator}_{configuration}_{number}.hepmc3.tree.root`

### Common Campaigns
- `25.10.x` - Current production series
- `24.x.x` - Previous year productions
- Earlier versions for historical data

## Debugging Tips

### Common Issues

1. **"Path outside base directory"**
   - Check path resolution logic
   - Ensure relative paths are handled correctly
   - Verify `resolvePath()` normalization

2. **"maxBuffer exceeded"**
   - Increase buffer size in execAsync
   - Consider pagination for very large directories
   - Use recursive=false when appropriate

3. **"Failed to list directory"**
   - Verify xrdfs command syntax
   - Check path exists and is accessible
   - Test manually: `xrdfs root://server ls -l /path`

4. **Date parsing fails**
   - XRootD returns format: `YYYY-MM-DD HH:MM:SS`
   - JavaScript can parse this directly
   - Always handle parse failures gracefully

### Testing XRootD Access

```bash
# List directory
xrdfs root://dtn-eic.jlab.org ls -l /volatile/eic/EPIC/RECO

# Get file info
xrdfs root://dtn-eic.jlab.org stat /volatile/eic/EPIC/RECO/25.10.2

# Search for files
xrdfs root://dtn-eic.jlab.org find /volatile/eic/EPIC/RECO -name "*.root"
```

## Configuration

### Environment Variables
```bash
XROOTD_SERVER="root://dtn-eic.jlab.org"  # Required
XROOTD_BASE_DIR="/volatile/eic/EPIC"     # Optional, default: /
XROOTD_CACHE_ENABLED="true"              # Optional, default: true
XROOTD_CACHE_TTL="60"                    # Optional, minutes, default: 60
XROOTD_CACHE_MAX_SIZE="1000"             # Optional, max entries, default: 1000
```

### MCP Client Configuration
```json
{
  "mcpServers": {
    "xrootd": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "XROOTD_SERVER": "root://dtn-eic.jlab.org",
        "XROOTD_BASE_DIR": "/volatile/eic/EPIC",
        "XROOTD_CACHE_TTL": "60"
      }
    }
  }
}
```

## Future Development

### Planned Features
1. **ROOT file analysis** - Extract tree/branch metadata using ROOT
2. **Batch operations** - Process multiple files efficiently
3. **Checksums** - File integrity verification
4. **Access logs** - Track usage patterns
5. **Metrics** - Performance monitoring

### Extension Points
- Add new search filters in `listDirectoryFiltered()`
- Implement campaign-specific parsers in `listDatasets()`
- Add custom statistics in `getStatistics()`
- Create specialized tools for specific physics analyses

## Resources

- **MCP Specification**: https://modelcontextprotocol.io/
- **XRootD Documentation**: https://xrootd.slac.stanford.edu/
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **EIC Software**: https://eic.github.io/

## Questions?

For questions about:
- **MCP protocol**: Check MCP SDK docs and examples
- **XRootD usage**: Test commands manually, check xrootd docs
- **EIC structure**: Review campaign organization in RECO directory
- **TypeScript**: Refer to existing code patterns in this repo

## Version History

- **v0.1.0** (2025-11-08): Initial release with 12 tools
  - Basic file operations (5 tools)
  - Advanced search & analysis (4 tools)
  - Campaign/dataset discovery (3 tools)

---

*This document should be kept up-to-date as the project evolves. Update it when adding new features, changing architecture, or discovering new best practices.*
