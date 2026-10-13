import { describe, it } from 'node:test';
import assert from 'node:assert';
import { timeoutMessage, withTimeout } from '../src/xrootd.js';

describe('withTimeout', () => {
  it('passes a result through when the work finishes in time', async () => {
    assert.strictEqual(await withTimeout(Promise.resolve(42), 1, 'list_directory'), 42);
  });

  it('rejects with a message naming the tool and the limit when the work is late', async () => {
    const never = new Promise<void>(() => {});
    await assert.rejects(
      () => withTimeout(never, 0.01, 'search_files'),
      (error: Error) => {
        assert.strictEqual(error.message, timeoutMessage('search_files', 0.01));
        assert.ok(error.message.startsWith('search_files did not finish within 0.01 s.'));
        assert.ok(error.message.includes('retry once later'));
        return true;
      }
    );
  });
});
