import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';

describe('stdio transport', () => {
  it('exits when stdin closes', async () => {
    const child = spawn(process.execPath, ['build/src/index.js'], {
      env: { ...process.env, MCP_TRANSPORT: 'stdio', XROOTD_SERVER: 'root://localhost:1094' },
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    child.stdin.end();
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('still running 10 s after stdin closed')); }, 10000);
      child.on('exit', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
    });
    assert.strictEqual(code, 0);
  });
});
