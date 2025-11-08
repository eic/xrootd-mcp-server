# Contributing to XRootD MCP Server

Thank you for your interest in contributing to the XRootD MCP Server!

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/xrootd-mcp-server.git
cd xrootd-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Set up environment:
```bash
export XROOTD_SERVER="root://dtn-eic.jlab.org"
```

## Development Workflow

1. Make your changes in the `src/` directory
2. Build with `npm run build` or use watch mode: `npm run watch`
3. Test your changes with an MCP client
4. Ensure code builds without errors

## Code Structure

- `src/index.ts` - Main MCP server implementation
- `src/xrootd.ts` - XRootD client wrapper
- `build/` - Compiled JavaScript output

## Adding New Tools

To add a new tool:

1. Define the tool in the `tools` array in `src/index.ts`
2. Add a case handler in the `CallToolRequestSchema` handler
3. Implement the functionality in `src/xrootd.ts` if needed
4. Update README.md with the new tool documentation

## Testing

Before submitting changes:
- Ensure the code compiles with `npm run build`
- Test with a real XRootD server if possible
- Update documentation as needed

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request with a clear description

## Questions?

Open an issue for any questions or concerns.
