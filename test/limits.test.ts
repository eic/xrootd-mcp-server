import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MAX_LIST_ENTRIES, timeoutMessage, truncateArrays, withTimeout } from '../src/xrootd.js';

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

describe('truncateArrays', () => {
  it('leaves short arrays and scalars untouched', () => {
    const value = { count: 2, entries: ['a', 'b'], when: new Date(0) };
    assert.deepStrictEqual(truncateArrays(value, MAX_LIST_ENTRIES, 'narrow'), value);
  });

  it('cuts long arrays and adds a sibling note', () => {
    const value = { nested: { items: [1, 2, 3, 4, 5] } };
    const result = truncateArrays(value, 2, 'use limit and offset to page') as any;
    assert.deepStrictEqual(result.nested.items, [1, 2]);
    assert.strictEqual(
      result.nested.itemsTruncated,
      'truncated: 2 of 5 entries; use limit and offset to page'
    );
  });

  it('cuts arrays inside array elements', () => {
    const value = { trees: [{ branches: ['a', 'b', 'c'] }] };
    const result = truncateArrays(value, 2, 'narrow') as any;
    assert.deepStrictEqual(result.trees[0].branches, ['a', 'b']);
    assert.strictEqual(result.trees[0].branchesTruncated, 'truncated: 2 of 3 entries; narrow');
  });
});
