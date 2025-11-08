# Docker Usage Guide

This guide covers running the XRootD MCP Server using Docker.

## Quick Start

### Pull and Run

```bash
docker run -i --rm \
  -e XROOTD_SERVER="root://dtn-eic.jlab.org" \
  -e XROOTD_BASE_DIR="/volatile/eic/EPIC" \
  ghcr.io/wdconinc/xrootd-mcp-server:latest
```

### With Claude Desktop

Update your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "xrootd": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "XROOTD_SERVER=root://dtn-eic.jlab.org",
        "-e", "XROOTD_BASE_DIR=/volatile/eic/EPIC",
        "-e", "XROOTD_CACHE_TTL=60",
        "ghcr.io/wdconinc/xrootd-mcp-server:latest"
      ]
    }
  }
}
```

## Environment Variables

### Required

- `XROOTD_SERVER` - XRootD server URL (e.g., `root://dtn-eic.jlab.org`)

### Optional

- `XROOTD_BASE_DIR` - Base directory for access control (default: `/`)
- `XROOTD_CACHE_ENABLED` - Enable caching (default: `true`)
- `XROOTD_CACHE_TTL` - Cache TTL in minutes (default: `60`)
- `XROOTD_CACHE_MAX_SIZE` - Maximum cached entries (default: `1000`)

## Using Docker Compose

Create a `.env` file:

```bash
XROOTD_SERVER=root://dtn-eic.jlab.org
XROOTD_BASE_DIR=/volatile/eic/EPIC
XROOTD_CACHE_TTL=60
```

Run with docker-compose:

```bash
docker-compose up -d
```

## Authentication

If you need XRootD authentication (grid certificates):

```bash
docker run -i --rm \
  -e XROOTD_SERVER="root://dtn-eic.jlab.org" \
  -v ~/.globus:/home/xrootd/.globus:ro \
  -v ~/.x509:/home/xrootd/.x509:ro \
  ghcr.io/wdconinc/xrootd-mcp-server:latest
```

## Building Locally

### Build Image

```bash
docker build -t xrootd-mcp-server .
```

### Build with Specific Version

```bash
docker build -t xrootd-mcp-server:1.0.0 .
```

### Multi-platform Build

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t xrootd-mcp-server .
```

## Image Tags

Available on GitHub Container Registry:

- `latest` - Latest stable release from main branch
- `edge` - Latest development build from main branch
- `v1.0.0` - Specific version tags
- `1.0` - Minor version (tracks latest patch)
- `1` - Major version (tracks latest minor)

### Examples

```bash
# Latest stable
docker pull ghcr.io/wdconinc/xrootd-mcp-server:latest

# Specific version
docker pull ghcr.io/wdconinc/xrootd-mcp-server:1.0.0

# Latest v1.x
docker pull ghcr.io/wdconinc/xrootd-mcp-server:1

# Development edge
docker pull ghcr.io/wdconinc/xrootd-mcp-server:edge
```

## Container Details

### Base Image

- `node:20-alpine` - Small, secure Node.js runtime
- Alpine Linux with XRootD client tools

### Security

- Runs as non-root user (`xrootd:xrootd`)
- UID/GID: 1000
- Minimal attack surface (Alpine)
- No unnecessary packages

### Size

- Approximately 150-200MB
- Optimized multi-stage build
- Production dependencies only

### Health Check

The container includes a health check:

```bash
docker ps  # Shows health status
```

## Advanced Usage

### Interactive Shell

```bash
docker run -it --rm --entrypoint /bin/sh \
  ghcr.io/wdconinc/xrootd-mcp-server:latest
```

### Test XRootD Connection

```bash
docker run -it --rm \
  -e XROOTD_SERVER="root://dtn-eic.jlab.org" \
  --entrypoint xrdfs \
  ghcr.io/wdconinc/xrootd-mcp-server:latest \
  root://dtn-eic.jlab.org ls /volatile/eic/EPIC
```

### Override Command

```bash
docker run -i --rm \
  -e XROOTD_SERVER="root://dtn-eic.jlab.org" \
  ghcr.io/wdconinc/xrootd-mcp-server:latest \
  node --version
```

## Kubernetes Deployment

Example Kubernetes deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xrootd-mcp-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: xrootd-mcp-server
  template:
    metadata:
      labels:
        app: xrootd-mcp-server
    spec:
      containers:
      - name: xrootd-mcp-server
        image: ghcr.io/wdconinc/xrootd-mcp-server:latest
        stdin: true
        tty: true
        env:
        - name: XROOTD_SERVER
          value: "root://dtn-eic.jlab.org"
        - name: XROOTD_BASE_DIR
          value: "/volatile/eic/EPIC"
        - name: XROOTD_CACHE_TTL
          value: "60"
        resources:
          limits:
            cpu: "1"
            memory: "512Mi"
          requests:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          exec:
            command:
            - node
            - -e
            - console.log('healthy')
          initialDelaySeconds: 5
          periodSeconds: 30
```

## Troubleshooting

### Container Exits Immediately

MCP servers use stdin/stdout, so they exit when stdin closes:

```bash
# Bad: exits immediately
docker run ghcr.io/wdconinc/xrootd-mcp-server:latest

# Good: keeps stdin open
docker run -i ghcr.io/wdconinc/xrootd-mcp-server:latest
```

### Permission Denied

If mounting volumes for credentials:

```bash
# Ensure proper permissions
chmod 600 ~/.globus/usercert.pem
chmod 400 ~/.globus/userkey.pem
```

### XRootD Connection Fails

Test connection manually:

```bash
docker run -it --rm \
  -e XROOTD_SERVER="root://your-server" \
  --entrypoint xrdfs \
  ghcr.io/wdconinc/xrootd-mcp-server:latest \
  root://your-server ls /
```

### Cache Not Working

Check environment variables:

```bash
docker run -i --rm \
  -e XROOTD_SERVER="root://dtn-eic.jlab.org" \
  -e XROOTD_CACHE_ENABLED=true \
  --entrypoint env \
  ghcr.io/wdconinc/xrootd-mcp-server:latest
```

## Performance Tips

1. **Use cached builds**: Docker BuildKit caching speeds up builds
2. **Pin versions**: Use specific version tags in production
3. **Resource limits**: Set appropriate CPU/memory limits
4. **Health checks**: Monitor container health
5. **Logging**: Use `docker logs` to debug issues

## Security Best Practices

1. **Don't run as root**: Container uses non-root user
2. **Read-only volumes**: Mount credentials read-only (`:ro`)
3. **Network isolation**: Use Docker networks
4. **Scan images**: Use `docker scan` or similar tools
5. **Update regularly**: Pull latest images for security fixes

## Registry Information

Images are published to GitHub Container Registry (ghcr.io):

- **Repository**: `ghcr.io/wdconinc/xrootd-mcp-server`
- **Public**: Yes (requires GitHub login for private repos)
- **Architectures**: linux/amd64, linux/arm64
- **Automatic builds**: On every push to main and on releases

## Further Reading

- [Dockerfile Reference](../Dockerfile)
- [Docker Compose File](../docker-compose.yml)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
