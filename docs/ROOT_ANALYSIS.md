# ROOT File Analysis

The XRootD MCP Server includes comprehensive ROOT file analysis capabilities using [jsroot](https://github.com/root-project/jsroot), a JavaScript implementation of ROOT I/O.

## Overview

The ROOT analysis module provides tools to:
- Inspect ROOT file structure (trees, branches, keys)
- Extract metadata from `podio_metadata` tree
- Analyze event statistics and collection sizes
- Aggregate statistics across datasets

## Implementation

### Dependencies

The implementation uses `jsroot` as the sole dependency for ROOT file analysis:
- **Package**: `jsroot` (~2-3MB)
- **Type**: Pure JavaScript, no native bindings
- **Compatibility**: Works in Node.js environment
- **Docker impact**: Minimal (~3MB increase to container size)

### Architecture

```
XRootDClient (src/xrootd.ts)
    ↓
    ├─ readFile() - Retrieves file data
    ↓
ROOTAnalyzer (src/root-analysis.ts)
    ↓
    ├─ analyzeFile() - Structure inspection
    ├─ extractPodioMetadata() - Metadata extraction
    ├─ getEventStatistics() - Single file analysis
    └─ getDatasetEventStatistics() - Multi-file aggregation
```

## Available Tools

### 1. analyze_root_file

Analyzes the complete structure of a ROOT file.

**Returns:**
- File size (bytes and human-readable)
- All ROOT keys (TTree, TDirectory, TH1, etc.)
- Tree information:
  - Entry count
  - Branch details (name, size, entries)
  - Compression statistics
- Directory structure

**Example:**
```javascript
{
  "path": "/path/to/file.root",
  "size": 52428800,
  "sizeHuman": "50.00 MB",
  "keys": [
    {
      "name": "events",
      "className": "TTree",
      "cycle": 1,
      "title": "Event data"
    },
    {
      "name": "podio_metadata",
      "className": "TTree",
      "cycle": 1,
      "title": ""
    }
  ],
  "trees": [
    {
      "name": "events",
      "entries": 10000,
      "totalSize": 42991616,
      "totalSizeHuman": "41.00 MB",
      "zipBytes": 17825792,
      "zipBytesHuman": "17.00 MB",
      "compressionFactor": 2.41,
      "branches": [...]
    }
  ],
  "directories": []
}
```

### 2. extract_podio_metadata

Extracts metadata from the `podio_metadata` tree.

The `podio_metadata` tree is commonly used in EIC simulation and reconstruction files to store:
- Data model versions
- Software versions
- Configuration parameters
- Processing metadata

**Returns:**
```javascript
{
  "CollectionIDs": {
    "entries": 1,
    "type": "vector<string>"
  },
  "CollectionTypeInfo": {
    "entries": 1,
    "type": "vector<tuple<string,string>>"
  },
  "BuildVersion": {
    "entries": 1,
    "type": "string"
  }
}
```

### 3. get_event_statistics

Analyzes events and collections from the `events` tree in a single ROOT file.

**Returns:**
- Total event count
- Collection count
- Per-collection statistics:
  - Name
  - Entry count (may differ from events if collection is sparse)
  - Total size (uncompressed)
  - Compressed size
  - Compression factor
  - Average size per event

Collections are sorted by size (largest first).

**Example:**
```javascript
{
  "totalEvents": 10000,
  "collectionCount": 45,
  "collections": [
    {
      "name": "ReconstructedChargedParticles",
      "entries": 125000,
      "totalSize": 12582912,
      "totalSizeHuman": "12.00 MB",
      "zipBytes": 5242880,
      "zipBytesHuman": "5.00 MB",
      "compressionFactor": "2.40",
      "averageSizePerEvent": 1258.29,
      "averageSizePerEventHuman": "1.23 KB"
    },
    {
      "name": "MCParticles",
      "entries": 450000,
      "totalSize": 8388608,
      "totalSizeHuman": "8.00 MB",
      "zipBytes": 3145728,
      "zipBytesHuman": "3.00 MB",
      "compressionFactor": "2.67",
      "averageSizePerEvent": 838.86,
      "averageSizePerEventHuman": "839 Bytes"
    }
  ]
}
```

### 4. get_dataset_event_statistics

Aggregates event statistics across all ROOT files in a dataset directory.

**Returns:**
- File count
- Total events across all files
- Total size (uncompressed and compressed)
- Overall compression factor
- Average events per file
- Aggregated collection statistics:
  - Total entries across all files
  - Total size
  - Average compression factor
  - Number of files containing collection
  - Percentage of files with collection
- Per-file breakdown

**Example:**
```javascript
{
  "datasetPath": "RECO/25.10.2/epic_craterlake/DIS/NC/18x275/q2_0.001_1.0",
  "fileCount": 50,
  "totalEvents": 500000,
  "totalSize": 2147483648,
  "totalSizeHuman": "2.00 GB",
  "totalZipBytes": 858993459,
  "totalZipBytesHuman": "819.20 MB",
  "overallCompressionFactor": "2.50",
  "averageEventsPerFile": 10000,
  "collectionAggregates": [
    {
      "name": "ReconstructedChargedParticles",
      "totalEntries": 6250000,
      "totalSize": 629145600,
      "totalSizeHuman": "600.00 MB",
      "totalZipBytes": 262144000,
      "totalZipBytesHuman": "250.00 MB",
      "averageCompressionFactor": "2.40",
      "filesContaining": 50,
      "percentOfFiles": "100.0%"
    }
  ],
  "files": [
    {
      "path": "/path/to/file1.root",
      "events": 10000,
      "size": 42991616,
      "sizeHuman": "41.00 MB",
      "zipBytes": 17825792,
      "zipBytesHuman": "17.00 MB",
      "compressionFactor": "2.41",
      "collectionCount": 45
    }
  ]
}
```

## Use Cases

### 1. File Validation

Verify that ROOT files have expected structure:
```javascript
analyze_root_file({ path: "path/to/file.root" })
// Check that 'events' tree exists
// Verify expected branches are present
```

### 2. Storage Analysis

Understand storage usage and identify large collections:
```javascript
get_event_statistics({ path: "path/to/file.root" })
// Identify which collections use most space
// Calculate storage efficiency via compression factors
```

### 3. Dataset Comparison

Compare different datasets or campaigns:
```javascript
get_dataset_event_statistics({ path: "RECO/25.10.2/dataset1" })
get_dataset_event_statistics({ path: "RECO/25.10.1/dataset1" })
// Compare event counts, sizes, collections
```

### 4. Production Monitoring

Track which collections are present across files:
```javascript
get_dataset_event_statistics({ path: "RECO/25.10.2/dataset" })
// Check filesContaining for each collection
// Identify missing collections (percentOfFiles < 100%)
```

### 5. Metadata Extraction

Extract processing information:
```javascript
extract_podio_metadata({ path: "path/to/file.root" })
// Get software versions, configurations
// Verify data provenance
```

## Performance Considerations

### Memory Usage

ROOT files are read entirely into memory for analysis. Considerations:
- Small files (<100MB): No issues
- Medium files (100MB-1GB): Acceptable
- Large files (>1GB): May cause memory pressure

For large files, consider analyzing a sample file from the dataset rather than all files.

### Network Transfer

Files are transferred from XRootD server to analysis server:
- Cached by XRootD client where possible
- Use byte-range reads for partial file access
- Dataset analysis processes files sequentially

### Optimization Tips

1. **Analyze representative samples**: For datasets with many identical files, analyze a subset
2. **Use specific paths**: Narrow dataset path to specific run/configuration
3. **Cache results**: Store analysis results for frequently-queried datasets
4. **Parallel analysis**: When analyzing multiple independent files, use parallel tool calls

## Limitations

1. **jsroot compatibility**: Some ROOT features may not be fully supported
   - Most common ROOT objects work (TTree, TH1, TDirectory)
   - Complex custom classes may not be readable

2. **Memory constraints**: Very large files (>2GB) may cause issues
   - Consider using ROOT's hadd to merge/sample files

3. **Network dependency**: Requires stable connection to XRootD server
   - Large file transfers may timeout
   - Use local XRootD cache if available

4. **Processing time**: Large datasets with many files take time
   - Each file requires download + analysis
   - Consider implementing progress tracking for UX

## Future Enhancements

Potential additions for ROOT analysis:

1. **Histogram analysis**: Extract and analyze TH1/TH2 histograms
2. **TTree entry reading**: Read actual event data, not just metadata
3. **Conditional analysis**: Filter events based on branch values
4. **Comparison tools**: Built-in dataset comparison and diffing
5. **Caching**: Cache analysis results to avoid re-processing
6. **Sampling**: Analyze subset of entries for faster results
7. **Parallel processing**: Analyze multiple files concurrently

## Technical Details

### File Reading

Files are read using XRootDClient.readFile():
```typescript
const fileData = await this.xrootdClient.readFile(remotePath);
const blob = new Blob([new Uint8Array(fileData)]);
const file = await openFile(blob);
```

### Branch Iteration

Branches are accessed via jsroot's TTree interface:
```typescript
const ttree = tree as any;
for (let i = 0; i < ttree.fBranches.arr.length; i++) {
  const branch = ttree.fBranches.arr[i];
  // Access branch properties: fName, fEntries, fTotBytes, fZipBytes
}
```

### Compression Factor

Calculated as the ratio of uncompressed to compressed size:
```typescript
const compressionFactor = zipBytes > 0 ? totalSize / zipBytes : 1.0;
```

## Examples

See [ADVANCED_FEATURES.md](ADVANCED_FEATURES.md) for detailed examples and integration patterns.
