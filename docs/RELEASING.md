# Release Process

This document describes how to create a new release of the XRootD MCP Server.

## Overview

Releases are automated through GitHub Actions. When you create a new tag, the following happens automatically:

1. **Release workflow** creates a GitHub release with changelog
2. **Docker workflow** builds and publishes container images
3. **Verification workflow** ensures images are available

## Creating a Release

### Prerequisites

- Clean git working directory
- All changes merged to `main` branch
- CI passing on main

### Steps

#### 1. Determine Version Number

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes (e.g., `2.0.0`)
- **MINOR**: New features, backward compatible (e.g., `1.1.0`)
- **PATCH**: Bug fixes, backward compatible (e.g., `1.0.1`)

Pre-release suffixes:
- `alpha`: Early testing (e.g., `1.0.0-alpha.1`)
- `beta`: Feature complete, testing (e.g., `1.0.0-beta.1`)
- `rc`: Release candidate (e.g., `1.0.0-rc.1`)

#### 2. Create and Push Tag

```bash
# Make sure you're on main and up to date
git checkout main
git pull origin main

# Create annotated tag
VERSION="v1.0.0"
git tag -a $VERSION -m "Release $VERSION"

# Push tag to GitHub
git push origin $VERSION
```

#### 3. Wait for Automation

The workflows will automatically:

1. **Create GitHub Release** (~1-2 minutes)
   - Generate changelog from commits
   - Create release notes
   - Upload source tarball

2. **Build Docker Images** (~5-10 minutes)
   - Multi-platform build (amd64, arm64)
   - Push to GitHub Container Registry
   - Tag with version numbers

3. **Verify Release** (~2-3 minutes)
   - Pull and test Docker image
   - Verify functionality
   - Check metadata

**Total time:** ~10-15 minutes

#### 4. Review and Edit Release

1. Go to [Releases](https://github.com/eic/xrootd-mcp-server/releases)
2. Find your release
3. Edit if needed:
   - Improve changelog
   - Add highlights
   - Update documentation links

## Docker Image Tags

For version `v1.2.3`, the following tags are created:

### Stable Releases

- `1.2.3` - Exact version
- `1.2` - Latest patch for minor version
- `1` - Latest minor for major version
- `latest` - Latest stable release
- `main-<sha>` - Commit SHA

### Pre-releases

Pre-release versions (alpha, beta, rc) **do NOT** update `latest`:

- `1.0.0-beta.1` - Exact version only
- `main-<sha>` - Commit SHA

### Development

- `edge` - Latest from main branch (not releases)
- `main-<sha>` - Specific commit

## Verification

### Check Docker Image

```bash
# Pull the image
docker pull ghcr.io/eic/xrootd-mcp-server:1.0.0

# Verify version
docker run --rm ghcr.io/eic/xrootd-mcp-server:1.0.0 node --version

# Test XRootD client
docker run --rm --entrypoint xrdfs ghcr.io/eic/xrootd-mcp-server:1.0.0 --version

# Test functionality
docker run -i --rm \
  -e XROOTD_SERVER="root://dtn-eic.jlab.org" \
  -e XROOTD_BASE_DIR="/volatile/eic/EPIC" \
  ghcr.io/eic/xrootd-mcp-server:1.0.0
```

### Check GitHub Actions

1. Go to [Actions](https://github.com/eic/xrootd-mcp-server/actions)
2. Verify all workflows succeeded:
   - ✅ Release
   - ✅ Build and Publish Docker Image
   - ✅ Verify Release

### Check GitHub Packages

1. Go to [Packages](https://github.com/eic/xrootd-mcp-server/pkgs/container/xrootd-mcp-server)
2. Verify tags exist:
   - Version tag (e.g., `1.0.0`)
   - Major.minor tag (e.g., `1.0`)
   - Major tag (e.g., `1`)
   - `latest` (for stable releases)

## Troubleshooting

### Tag Already Exists

```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push --delete origin v1.0.0

# Create new tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### Docker Build Failed

1. Check [Docker workflow](https://github.com/eic/xrootd-mcp-server/actions/workflows/docker.yml)
2. Review build logs
3. If needed, manually trigger:
   - Go to Actions → Build and Publish Docker Image
   - Click "Run workflow"
   - Select tag

### Verification Failed

The verify-release workflow may fail if:
- Docker build is slow (timing issue)
- Registry is temporarily unavailable
- Multi-platform build still processing

**Solution:** Re-run the workflow after a few minutes.

### Release Notes Missing

The release workflow generates notes from commits. For better notes:

1. Edit the release on GitHub
2. Add highlights and breaking changes
3. Update documentation links

## Manual Release (Emergency)

If automation fails completely:

### 1. Create Release Manually

```bash
gh release create v1.0.0 \
  --title "Release v1.0.0" \
  --notes "Emergency release" \
  --verify-tag
```

### 2. Build and Push Docker Image

```bash
# Build
docker build -t ghcr.io/eic/xrootd-mcp-server:1.0.0 .

# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Push
docker push ghcr.io/eic/xrootd-mcp-server:1.0.0

# Tag and push additional tags
docker tag ghcr.io/eic/xrootd-mcp-server:1.0.0 \
  ghcr.io/eic/xrootd-mcp-server:1.0
docker push ghcr.io/eic/xrootd-mcp-server:1.0

docker tag ghcr.io/eic/xrootd-mcp-server:1.0.0 \
  ghcr.io/eic/xrootd-mcp-server:1
docker push ghcr.io/eic/xrootd-mcp-server:1

docker tag ghcr.io/eic/xrootd-mcp-server:1.0.0 \
  ghcr.io/eic/xrootd-mcp-server:latest
docker push ghcr.io/eic/xrootd-mcp-server:latest
```

## Post-Release

### Update Documentation

If the release includes significant changes:

1. Update README.md examples
2. Update QUICKSTART.md
3. Update docs/DOCKER.md
4. Announce in relevant channels

### Monitor

After release, monitor:
- GitHub Issues for bugs
- GitHub Discussions for questions
- Container Registry for pull metrics

## Release Checklist

- [ ] All tests passing on main
- [ ] Version number chosen
- [ ] Tag created and pushed
- [ ] Release workflow succeeded
- [ ] Docker workflow succeeded
- [ ] Verification workflow succeeded
- [ ] Docker images available
- [ ] Release notes reviewed/edited
- [ ] Documentation updated (if needed)
- [ ] Announcement made (if significant)

## Version History

See [Releases](https://github.com/eic/xrootd-mcp-server/releases) for full history.

### Example Versions

- `v1.0.0` - First stable release
- `v1.1.0` - Added new features
- `v1.1.1` - Bug fixes
- `v2.0.0` - Breaking changes
- `v2.0.0-beta.1` - Beta testing for v2.0.0
