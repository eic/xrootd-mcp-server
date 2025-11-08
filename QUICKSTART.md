# Quick Start Guide

Get up and running with XRootD MCP Server in minutes!

## Prerequisites

- Node.js 18 or higher
- XRootD client tools (`xrdfs`, `xrdcp`) installed
- Access to an XRootD server

### Installing XRootD Client Tools

**On Ubuntu/Debian:**
```bash
sudo apt-get install xrootd-client
```

**On RHEL/CentOS/Fedora:**
```bash
sudo yum install xrootd-client
```

**On macOS:**
```bash
brew install xrootd
```

## Installation

1. **Clone or install the repository:**
```bash
git clone <repository-url>
cd xrootd-mcp-server
```

2. **Install dependencies:**
```bash
npm install
```

3. **Build the project:**
```bash
npm run build
```

## Testing the Connection

Test your XRootD connection manually first:
```bash
export XROOTD_SERVER="root://dtn-eic.jlab.org"
xrdfs $XROOTD_SERVER ls /
```

## Running the Server

### Standalone Mode
```bash
XROOTD_SERVER="root://dtn-eic.jlab.org" XROOTD_BASE_DIR="/volatile/eic/EPIC" node build/index.js
```

### With Claude Desktop

1. **Locate your Claude config file:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add the server configuration:**
```json
{
  "mcpServers": {
    "xrootd": {
      "command": "node",
      "args": [
        "/absolute/path/to/xrootd-mcp-server/build/index.js"
      ],
      "env": {
        "XROOTD_SERVER": "root://dtn-eic.jlab.org",
        "XROOTD_BASE_DIR": "/volatile/eic/EPIC"
      }
    }
  }
}
```

3. **Restart Claude Desktop**

4. **Test it out!** Try asking Claude:
   - "What's in the root directory of the XRootD server?" (lists base directory)
   - "List files in the EVGEN directory" (relative path)
   - "List files available on the XRootD server"

## Example XRootD Servers

### Default Server
- **JLab EIC**: `root://dtn-eic.jlab.org`

### Other Servers
You can also use other XRootD servers by changing the `XROOTD_SERVER` environment variable:
```bash
root://eospublic.cern.ch  # CERN Open Data
root://xrootd.example.org  # Your institution's server
root://xrd.yourdomain.edu:1094  # Custom port
```

## Base Directory Feature

The `XROOTD_BASE_DIR` environment variable provides two benefits:

1. **Simplified paths**: Use relative paths like `EVGEN/file.root` instead of `/volatile/eic/EPIC/EVGEN/file.root`
2. **Access control**: Prevents access outside the base directory for security

Example:
```bash
# Without base directory
XROOTD_BASE_DIR="/"  # Can access any path

# With base directory
XROOTD_BASE_DIR="/volatile/eic/EPIC"  # Can only access paths under /volatile/eic/EPIC
```

## Troubleshooting

### "xrdfs: command not found"
Install XRootD client tools (see Prerequisites above).

### "Failed to list directory"
- Check that `XROOTD_SERVER` is set correctly
- Verify you have access permissions
- Test manually with: `xrdfs $XROOTD_SERVER ls /`

### "Error: XROOTD_SERVER environment variable is required"
Make sure the environment variable is set in your MCP client configuration.

### "Access denied: Path ... is outside base directory"
You're trying to access a path outside `XROOTD_BASE_DIR`. Either:
- Use a path within the base directory
- Change `XROOTD_BASE_DIR` to a higher-level directory
- Remove `XROOTD_BASE_DIR` to allow access to all paths

### Claude doesn't see the tools
- Ensure the path to `build/index.js` is absolute
- Check Claude's developer console for errors
- Restart Claude Desktop after config changes

## Next Steps

- Read [USAGE.md](examples/USAGE.md) for detailed tool documentation
- Check [README.md](README.md) for full feature list
- See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute

## Getting Help

If you encounter issues:
1. Check the troubleshooting section above
2. Verify XRootD client tools work standalone
3. Check Claude Desktop's MCP logs
4. Open an issue on GitHub
