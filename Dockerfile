# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

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
FROM node:20-alpine

# Install XRootD client tools
RUN apk add --no-cache \
    xrootd-client \
    ca-certificates

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --production --ignore-scripts && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/build ./build

# Create non-root user
RUN addgroup -g 1000 xrootd && \
    adduser -D -u 1000 -G xrootd xrootd && \
    chown -R xrootd:xrootd /app

USER xrootd

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
