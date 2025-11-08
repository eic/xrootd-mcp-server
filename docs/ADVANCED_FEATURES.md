# Advanced Features Guide

This guide covers the advanced file search, analysis, and discovery features added to the XRootD MCP Server.

## Search & Discovery

### search_files

Search for files matching a pattern (glob or regex).

**Examples:**

```javascript
// Find all ROOT files
search_files({ pattern: "*.root", basePath: "RECO/25.10.2", recursive: true })

// Find DEMP files with regex
search_files({ 
  pattern: "DEMP.*pi\\+.*\\.root$", 
  basePath: "RECO/25.10.2",
  useRegex: true,
  recursive: true
})

// Search in specific directory only (non-recursive)
search_files({ pattern: "*.edm4eic.root", basePath: "path/to/dir", recursive: false })
```

**Output:** List of matching files with paths, sizes, and modification times.

### list_directory_filtered

Advanced filtering of directory contents.

**Examples:**

```javascript
// Files larger than 1GB
list_directory_filtered({ 
  path: "RECO/25.10.2/epic_craterlake/EXCLUSIVE/DEMP",
  minSize: 1073741824  // 1GB in bytes
})

// Files modified in last week
list_directory_filtered({ 
  path: "RECO/25.10.2",
  modifiedAfter: "2025-11-01T00:00:00Z"
})

// ROOT files matching pattern
list_directory_filtered({ 
  path: "RECO/25.10.2",
  extension: ".root",
  namePattern: "*DEMP*"
})

// Combine multiple filters
list_directory_filtered({ 
  path: "RECO/25.10.2",
  extension: ".root",
  minSize: 104857600,  // 100MB
  maxSize: 1073741824, // 1GB
  modifiedAfter: "2025-11-01T00:00:00Z"
})
```

### find_recent_files

Find files modified within a time period.

**Examples:**

```javascript
// Files from last 24 hours (default)
find_recent_files({ path: "RECO/25.10.2" })

// Files from last week
find_recent_files({ path: "RECO/25.10.2", hours: 168 })

// Recent files in specific directory only
find_recent_files({ 
  path: "RECO/25.10.2/epic_craterlake/EXCLUSIVE/DEMP",
  hours: 48,
  recursive: false
})
```

**Use Cases:**
- Monitor production progress
- Find newly added files
- Track recent changes
- Production pipeline monitoring

## Statistics & Analysis

### get_statistics

Get comprehensive statistics about directory contents.

**Example:**

```javascript
get_statistics({ 
  path: "RECO/25.10.2/epic_craterlake/EXCLUSIVE/DEMP",
  recursive: true
})
```

**Returns:**
- Total file count
- Total directory count
- Total size (with human-readable format)
- Breakdown by file extension (count + size)
- Oldest file (path + modification time)
- Newest file (path + modification time)
- Largest file (path + size)

**Use Cases:**
- Understand storage usage
- Identify file type distribution
- Find oldest/newest data
- Capacity planning

### summarize_recent_changes

Comprehensive summary of files added in a time period.

**Example:**

```javascript
summarize_recent_changes({ 
  path: "RECO/25.10.2",
  hours: 24
})
```

**Returns:**
- Total files added
- Total size added
- Files by extension (count)
- Size by extension
- Top directories by file count
- Sample of most recent files (up to 20)

**Use Cases:**
- Daily production reports
- Monitor campaign progress
- Identify active production areas
- Track data generation rate

## Campaign & Dataset Discovery

### list_campaigns

List all available production campaigns.

**Example:**

```javascript
// List campaigns from RECO directory
list_campaigns({ recoPath: "RECO" })

// With base directory set to /volatile/eic/EPIC
list_campaigns()  // Looks in base/RECO
```

**Returns:** Array of campaigns with:
- Campaign name (e.g., "25.10.2")
- Full path
- Modification time

**Output Example:**
```json
{
  "campaignCount": 47,
  "campaigns": [
    {
      "name": "25.10.2",
      "path": "/volatile/eic/EPIC/RECO/25.10.2",
      "modificationTime": "2025-11-06T23:11:52Z"
    },
    ...
  ]
}
```

### list_datasets

List datasets within a campaign.

**Example:**

```javascript
list_datasets({ campaign: "25.10.2" })
list_datasets({ campaign: "25.10.2", recoPath: "RECO" })
```

**Returns:** Array of datasets following EIC structure:
- Dataset name (detector/processType/process)
- Full path

**EIC Directory Structure:**
```
RECO/
  └── 25.10.2/              (campaign)
      └── epic_craterlake/  (detector)
          └── EXCLUSIVE/     (process type)
              ├── DEMP/      (process)
              ├── DVCS/
              └── ...
```

## Real-World Examples

### Example 1: Production Monitoring

"What was added to the 25.10.2 campaign in the last 24 hours?"

```javascript
summarize_recent_changes({ 
  path: "RECO/25.10.2",
  hours: 24
})
```

### Example 2: Find Specific Files

"Find all DEMP pi+ ROOT files in the 10x130 configuration"

```javascript
search_files({ 
  pattern: "DEMP*10x130*pi+*.root",
  basePath: "RECO/25.10.2",
  recursive: true
})
```

### Example 3: Storage Analysis

"How much storage is used by each campaign?"

```javascript
// For each campaign:
get_statistics({ path: "RECO/25.10.2", recursive: true })
get_statistics({ path: "RECO/25.10.1", recursive: true })
// ...
```

### Example 4: Quality Check

"Find large files added today that might be corrupt"

```javascript
find_recent_files({ path: "RECO/25.10.2", hours: 24 })
// Then filter client-side for unusual sizes
```

### Example 5: Dataset Discovery

"What datasets are available in campaign 25.10.2?"

```javascript
list_datasets({ campaign: "25.10.2" })
// Returns: epic_craterlake/EXCLUSIVE/DEMP, etc.
```

## Performance Tips

1. **Use recursive=false** when you only need top-level files
2. **Cache is active** - repeated queries are fast
3. **Start with smaller scopes** - narrow path before going recursive
4. **Combine filters** - more specific = faster results
5. **Large campaigns** - use hours parameter to limit scope

## Error Handling

All tools return descriptive errors:
- Path not found
- Access denied (outside base directory)
- xrdfs command failures
- Buffer size exceeded (very large directories)

## Integration with LLMs

These tools are designed for natural language queries:

**User:** "Show me what physics processes are available in the latest campaign"
**LLM:** Uses `list_campaigns()` then `list_datasets()`

**User:** "How many DEMP files were added yesterday?"
**LLM:** Uses `find_recent_files()` with filtered path

**User:** "Find all ROOT files larger than 500MB"
**LLM:** Uses `list_directory_filtered()` with minSize

The tools automatically handle path resolution, formatting, and error cases.
