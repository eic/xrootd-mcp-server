#!/usr/bin/env node
// Health check script for the XRootD MCP Server.
// Verifies that the required environment variable is set and that the XRootD
// server is reachable before reporting the container as healthy.

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const server = process.env.XROOTD_SERVER;
if (!server) {
  console.error('XROOTD_SERVER environment variable is not set');
  process.exit(1);
}

try {
  await execFileAsync('xrdfs', [server, 'ping'], { timeout: 10000 });
  process.exit(0);
} catch (error) {
  console.error(`XRootD health check failed for ${server}: ${error.message}`);
  process.exit(1);
}
