# GitHub Copilot Instructions

For detailed instructions on working with this repository, please refer to:

**[AGENTS.md](../AGENTS.md)** - Single source of truth for AI agent guidance

## Quick Reference

This is the **XRootD MCP Server** project:
- TypeScript/Node.js MCP server for XRootD file system access
- Target: EIC (Electron-Ion Collider) scientific data analysis
- Read AGENTS.md for architecture, conventions, and development guidelines

## Key Points

1. **Security**: All paths must be within `XROOTD_BASE_DIR` - use `resolvePath()`
2. **XRootD**: Use `xrdfs` for metadata, `xrdcp` for file content
3. **MCP Protocol**: Follow tool schema conventions in existing tools
4. **Performance**: 50MB maxBuffer for xrdfs, respect cache settings
5. **Testing**: Always test with `npm run build` and manual verification

## Common Tasks

See AGENTS.md for:
- Adding new tools (step-by-step guide)
- Modifying XRootD operations
- Working with file metadata
- Testing changes
- Code style guidelines
- EIC-specific directory structure

## Architecture

```
src/index.ts   - MCP server, tool definitions
src/xrootd.ts  - XRootD client, core functionality  
src/cache.ts   - Directory caching
```

## Documentation

- **AGENTS.md** - Complete AI agent instructions (read this first!)
- **README.md** - User-facing documentation
- **CONTRIBUTING.md** - Development guidelines
- **docs/CACHING.md** - Caching strategy details
- **docs/ADVANCED_FEATURES.md** - Tool usage guide

---

**Always consult AGENTS.md before making significant changes to ensure consistency with project standards and conventions.**
