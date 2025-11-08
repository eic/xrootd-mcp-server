# XRootD MCP Server Tests

This directory contains the test suite for the XRootD MCP Server.

## Test Types

### Integration Tests (`xrootd.test.ts`)

Tests the full server functionality against a real XRootD server:

- **Server Initialization**: Connection and tool listing
- **Directory Operations**: Listing, navigation, error handling
- **File Operations**: Reading, info retrieval, existence checks
- **Search**: Pattern matching and regex search
- **Campaign Discovery**: Finding and analyzing campaigns
- **Statistics**: File counts, sizes, distributions
- **Recent Files**: Time-based filtering
- **Metadata Extraction**: Parsing file paths
- **Smart Filtering**: Size, time, pattern filters
- **Error Handling**: Invalid paths, missing parameters
- **Security**: Path traversal protection

### Unit Tests (`cache.test.ts`)

Tests the caching implementation:

- **Basic Operations**: Set, get, update
- **Size Limits**: LRU eviction
- **TTL**: Time-based expiration
- **Performance**: Efficiency benchmarks

## Running Tests

### Prerequisites

1. Install XRootD client:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install xrootd-client
   
   # macOS
   brew install xrootd
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

### Run All Tests

```bash
npm test
```

### Run Integration Tests Only

```bash
npm run test:integration
```

### Run with Custom Server

```bash
XROOTD_SERVER=root://your-server.edu XROOTD_BASE_DIR=/your/path npm test
```

## Test Configuration

Tests use environment variables:

- `XROOTD_SERVER`: XRootD server URL (default: `root://dtn-eic.jlab.org`)
- `XROOTD_BASE_DIR`: Base directory path (default: `/volatile/eic/EPIC`)

## CI/CD Integration

Tests run automatically on:
- Push to `main` branch
- Pull requests
- Manual workflow dispatch

The GitHub Actions workflow:
1. Installs XRootD client
2. Installs Node.js dependencies
3. Builds the TypeScript code
4. Runs all tests against `dtn-eic.jlab.org`

## Writing New Tests

### Integration Test Template

```typescript
describe('New Feature', () => {
  it('should do something', async () => {
    const result = await client.callTool({
      name: 'tool_name',
      arguments: { param: 'value' },
    });
    
    assert.ok(result.content);
    assert.ok(result.content.length > 0);
  });
});
```

### Unit Test Template

```typescript
describe('Component Tests', () => {
  it('should behave correctly', () => {
    const component = new Component();
    const result = component.method();
    assert.equal(result, expected);
  });
});
```

## Test Coverage

Current test coverage:

- ✅ Directory listing (root, nested, non-existent)
- ✅ File information (exists, non-existent)
- ✅ Search (glob patterns, regex)
- ✅ Campaign discovery
- ✅ Statistics collection
- ✅ Recent files filtering
- ✅ Metadata extraction
- ✅ Smart filtering (size, time, pattern)
- ✅ Error handling
- ✅ Security (path traversal)
- ✅ Cache operations
- ✅ Cache performance

## Troubleshooting

### Connection Errors

If tests fail with connection errors:

1. Check server availability:
   ```bash
   xrdfs root://dtn-eic.jlab.org ls /volatile/eic/EPIC
   ```

2. Verify network connectivity
3. Check firewall settings

### Timeout Errors

If tests timeout:

1. Increase timeout in workflow (default: 10 minutes)
2. Check server load
3. Verify directory sizes aren't too large

### Permission Errors

If tests fail with permission errors:

1. Verify base directory is readable
2. Check XRootD server permissions
3. Ensure test paths exist

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Tests should not leave side effects
3. **Assertions**: Always verify results with assertions
4. **Error Testing**: Test both success and failure cases
5. **Performance**: Keep tests fast (< 10 seconds each)
6. **Documentation**: Comment complex test logic

## Future Improvements

- [ ] Add mock XRootD server for unit tests
- [ ] Increase test coverage to 90%+
- [ ] Add performance benchmarks
- [ ] Add stress tests
- [ ] Add security penetration tests
- [ ] Add compatibility tests for different XRootD versions
