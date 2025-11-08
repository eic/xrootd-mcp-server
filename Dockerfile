# syntax=docker/dockerfile:1

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

# Install XRootD client tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    xrootd-client \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --production --ignore-scripts && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/build ./build

# Use existing node user (UID 1000)
RUN chown -R node:node /app

USER node

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Environment variables with defaults
ENV NODE_ENV=production \
    XROOTD_BASE_DIR=/ \
    XROOTD_CACHE_ENABLED=true \
    XROOTD_CACHE_TTL=60 \
    XROOTD_CACHE_MAX_SIZE=1000

# Labels
LABEL org.opencontainers.image.title="XRootD MCP Server" \
      org.opencontainers.image.description="Model Context Protocol server for XRootD file system access" \
      org.opencontainers.image.vendor="EIC" \
      org.opencontainers.image.source="https://github.com/wdconinc/xrootd-mcp-server" \
      org.opencontainers.image.licenses="MIT"

# Run the application
CMD ["node", "build/index.js"]
