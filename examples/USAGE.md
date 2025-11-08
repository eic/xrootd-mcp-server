# Usage Examples

This document provides examples of using the XRootD MCP Server with various MCP clients.

## Tool Reference

### list_directory

List contents of a directory on the XRootD server.

**Input:**
```json
{
  "path": "/store/data/2024"
}
```

**Output:**
```json
[
  {
    "name": "file1.root",
    "isDirectory": false,
    "size": 1048576,
    "modificationTime": "2024-01-15T10:30:00.000Z"
  },
  {
    "name": "subdir",
    "isDirectory": true,
    "size": 4096,
    "modificationTime": "2024-01-14T08:20:00.000Z"
  }
]
```

### get_file_info

Get detailed metadata about a file or directory.

**Input:**
```json
{
  "path": "/store/data/2024/file1.root"
}
```

**Output:**
```json
{
  "path": "/store/data/2024/file1.root",
  "size": 1048576,
  "modificationTime": "2024-01-15T10:30:00.000Z",
  "isDirectory": false
}
```

### read_file

Read contents of a file. Supports byte range reading.

**Full file read:**
```json
{
  "path": "/store/data/config.txt"
}
```

**Partial read (bytes 0-1023):**
```json
{
  "path": "/store/data/large_file.root",
  "start": 0,
  "end": 1023
}
```

### check_file_exists

Check if a file or directory exists.

**Input:**
```json
{
  "path": "/store/data/2024/file1.root"
}
```

**Output:**
```json
{
  "path": "/store/data/2024/file1.root",
  "exists": true
}
```

### get_directory_size

Calculate total size of a directory recursively.

**Input:**
```json
{
  "path": "/store/data/2024"
}
```

**Output:**
```json
{
  "path": "/store/data/2024",
  "size": 104857600,
  "sizeHuman": "100.00 MB"
}
```

## Common Use Cases

### Browse Directory Tree

1. Start at root: `list_directory` with path `/`
2. Explore subdirectories: `list_directory` with each subdirectory path
3. Get file details: `get_file_info` for files of interest

### Check File Before Reading

1. Check existence: `check_file_exists` 
2. Get metadata: `get_file_info` to check size
3. Read file: `read_file` to access content

### Analyze Storage Usage

1. List directory: `list_directory` to see contents
2. Calculate size: `get_directory_size` for each subdirectory
3. Compare sizes to identify large directories

### Read Large Files Efficiently

1. Get file info: `get_file_info` to check total size
2. Read in chunks: Multiple `read_file` calls with different byte ranges
3. Process incrementally without loading entire file

## Integration with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "xrootd": {
      "command": "node",
      "args": [
        "/absolute/path/to/xrootd-mcp-server/build/index.js"
      ],
      "env": {
        "XROOTD_SERVER": "root://dtn-eic.jlab.org"
      }
    }
  }
}
```

Then restart Claude Desktop. You can now ask Claude to:
- "List files in the root directory on the XRootD server"
- "What files are available on the XRootD server?"
- "Check if /path/to/file.root exists on the XRootD server"
- "What's the size of a specific directory?"

## Example Conversation with Claude

**You:** "Can you check what's available on the XRootD server?"

**Claude:** *Uses list_directory tool to browse the directory and presents the results*

**You:** "What's the total size of a specific directory?"

**Claude:** *Uses get_directory_size to calculate and report the size*

**You:** "Can you read a specific file if it exists?"

**Claude:** *Uses read_file to access and display the content*

## Tips

- Always use absolute paths starting with `/`
- For large files, use byte range reading to avoid memory issues
- Check file existence before attempting to read
- Use `get_directory_size` carefully on large directory trees (it can take time)
