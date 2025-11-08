# Caching Strategy

## Overview

The XRootD MCP Server implements a time-based caching strategy for directory listings to improve performance when accessing remote filesystems.

## Why Caching is Needed

Directory listings on XRootD servers can be slow, especially for:
- Large directories with thousands of files
- Remote servers with high latency
- Recursive operations

Since directory modification times (`mtime`) don't reliably indicate content changes (files can be modified without updating parent directory mtime), we use a simple time-based approach.

## Implementation

### Strategy: Time-Based Expiration (TTL)

- **Cache Type**: In-memory, per-directory
- **Key**: Full resolved path
- **Value**: Array of directory entries + timestamp
- **TTL**: Configurable (default: 60 minutes)
- **Eviction**: LRU when cache exceeds 1000 entries
- **Cleanup**: Automatic every 15 minutes

### Configuration

```bash
# Enable/disable caching
XROOTD_CACHE_ENABLED=true    # default: true

# Cache time-to-live in minutes
XROOTD_CACHE_TTL=60          # default: 60 minutes
```

### Behavior

1. **Cache Hit**: Returns cached data immediately (< 1ms)
2. **Cache Miss**: Fetches from XRootD server, stores in cache
3. **Cache Expiration**: After TTL expires, next request refetches
4. **Cache Cleanup**: Background task removes expired entries every 15 minutes

## Performance Impact

### Without Cache
- First request: ~500ms - 2s (depending on directory size and network)
- Subsequent requests: ~500ms - 2s (same)

### With Cache (60-minute TTL)
- First request: ~500ms - 2s (cache miss)
- Subsequent requests: < 1ms (cache hit)
- **Improvement**: 500-2000x faster

## Trade-offs

### Advantages
✅ Dramatically faster response times  
✅ Reduced load on XRootD server  
✅ Better user experience (LLM gets faster responses)  
✅ Simple implementation (no external dependencies)  

### Limitations
⚠️ Data may be stale (up to TTL minutes)  
⚠️ Memory usage grows with unique directory accesses  
⚠️ No immediate notification of changes  

## Use Case Fit

This caching strategy is ideal for:
- **Read-mostly workloads** (typical for scientific data)
- **Batch production systems** (files added in large batches)
- **Infrequent changes** (production campaigns run periodically)
- **User tolerance** (queries can tolerate staleness)

## Testing Cache Behavior

You can verify cache behavior by checking server logs:

```bash
# First request - cache miss (slow)
time xrdfs root://dtn-eic.jlab.org ls /volatile/eic/EPIC/RECO/25.10.2

# Immediate second request - cache hit (fast)
time xrdfs root://dtn-eic.jlab.org ls /volatile/eic/EPIC/RECO/25.10.2

# After 60 minutes - cache expired (slow again)
```

## Future Enhancements

Possible improvements for future versions:

1. **Cache warming**: Pre-populate cache for known important directories
2. **Smart invalidation**: Watch for filesystem events (if available)
3. **Hierarchical caching**: Cache parent-child relationships
4. **Persistent cache**: Store to disk across restarts
5. **Cache statistics**: Expose hit/miss ratios via MCP tools

## Debugging

Set environment variables to adjust cache behavior:

```bash
# Disable cache for testing
XROOTD_CACHE_ENABLED=false

# Shorter TTL for rapidly changing data
XROOTD_CACHE_TTL=5

# Longer TTL for stable production data
XROOTD_CACHE_TTL=120
```

Monitor cache effectiveness through server logs which show cache status on startup.
