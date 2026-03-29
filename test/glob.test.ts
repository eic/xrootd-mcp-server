import { describe, it } from 'node:test';
import assert from 'node:assert';
import { globToRegex } from '../src/xrootd.js';

describe('globToRegex', () => {
  describe('glob wildcards', () => {
    it('* matches any sequence of characters', () => {
      const re = globToRegex('*.root');
      assert.ok(re.test('file.root'));
      assert.ok(re.test('a.b.c.root'));
      assert.ok(re.test('.root'));
      assert.ok(!re.test('file.root.extra'));
    });

    it('? matches exactly one character', () => {
      const re = globToRegex('file?.txt');
      assert.ok(re.test('fileA.txt'));
      assert.ok(re.test('file1.txt'));
      assert.ok(!re.test('file.txt'));
      assert.ok(!re.test('fileAB.txt'));
    });

    it('* and ? can be combined', () => {
      const re = globToRegex('run?_*.root');
      assert.ok(re.test('runA_output.root'));
      assert.ok(re.test('run1_long.name.root'));
      assert.ok(!re.test('run_output.root'));
    });
  });

  describe('literal dot handling', () => {
    it('. in glob is treated as a literal dot, not a regex wildcard', () => {
      const re = globToRegex('file.root');
      assert.ok(re.test('file.root'));
      assert.ok(!re.test('fileXroot'));
      assert.ok(!re.test('file_root'));
    });
  });

  describe('regex metacharacters are treated as literals', () => {
    it('+ is treated as a literal plus sign', () => {
      const re = globToRegex('pi+');
      assert.ok(re.test('pi+'));
      assert.ok(!re.test('pi'));
      assert.ok(!re.test('pii'));
    });

    it('( and ) are treated as literals', () => {
      const re = globToRegex('(file)');
      assert.ok(re.test('(file)'));
      assert.ok(!re.test('file'));
    });

    it('| is treated as a literal pipe, not alternation', () => {
      const re = globToRegex('a|b');
      assert.ok(re.test('a|b'));
      assert.ok(!re.test('a'));
      assert.ok(!re.test('b'));
    });

    it('$ is treated as a literal dollar sign', () => {
      const re = globToRegex('price$10');
      assert.ok(re.test('price$10'));
      assert.ok(!re.test('price10'));
    });

    it('^ is treated as a literal caret', () => {
      const re = globToRegex('^start');
      assert.ok(re.test('^start'));
      assert.ok(!re.test('start'));
    });

    it('{ and } are treated as literals', () => {
      const re = globToRegex('{a,b}');
      assert.ok(re.test('{a,b}'));
      assert.ok(!re.test('a'));
      assert.ok(!re.test('b'));
    });

    it('[ and ] are treated as literals, not a character class', () => {
      const re = globToRegex('[abc]');
      assert.ok(re.test('[abc]'));
      assert.ok(!re.test('a'));
      assert.ok(!re.test('b'));
      assert.ok(!re.test('c'));
    });

    it('\\ is treated as a literal backslash', () => {
      const re = globToRegex('path\\file');
      assert.ok(re.test('path\\file'));
      assert.ok(!re.test('pathfile'));
    });
  });

  describe('EIC-style filename patterns', () => {
    it('matches files with = in names using *', () => {
      const re = globToRegex('run=*.root');
      assert.ok(re.test('run=123.root'));
      assert.ok(re.test('run=abc_long.root'));
      assert.ok(!re.test('run.root'));
    });

    it('matches files with + literally (e.g. pi+ particle)', () => {
      const re = globToRegex('pi+_*.root');
      assert.ok(re.test('pi+_output.root'));
      assert.ok(!re.test('pi_output.root'));
      assert.ok(!re.test('pii_output.root'));
    });

    it('full glob pattern with multiple metacharacters', () => {
      const re = globToRegex('q2_10$20_*.hepmc3.tree.root');
      assert.ok(re.test('q2_10$20_00001.hepmc3.tree.root'));
      // '$' must be literal — strings without it must not match
      assert.ok(!re.test('q2_1020_00001.hepmc3.tree.root'));
      assert.ok(!re.test('q2_10X20_00001.hepmc3.tree.root'));
    });
  });

  describe('anchoring', () => {
    it('pattern is anchored to match the full string', () => {
      const re = globToRegex('*.root');
      assert.ok(re.test('file.root'));
      assert.ok(!re.test('file.root.extra'));
      assert.ok(!re.test('file.root_suffix'));
    });

    it('empty pattern matches only empty string', () => {
      const re = globToRegex('');
      assert.ok(re.test(''));
      assert.ok(!re.test('a'));
    });
  });
});
