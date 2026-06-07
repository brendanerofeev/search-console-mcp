import { describe, it, expect, vi } from 'vitest';
import { safeTest, safeTestBatch } from '../src/common/utils/regex.js';

describe('Regex Utils', () => {
    describe('safeTest', () => {
        it('should return true for matching regex', () => {
            expect(safeTest('hello', 'i', 'Hello World')).toBe(true);
        });

        it('should return false for non-matching regex', () => {
            expect(safeTest('foo', '', 'bar')).toBe(false);
        });

        it('should handle invalid regex pattern gracefully', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            // Unclosed group is invalid
            expect(safeTest('(', '', 'foo')).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Regex evaluation failed'));
        });
    });

    describe('safeTestBatch', () => {
        it('should test multiple strings', () => {
            const results = safeTestBatch('a', '', ['apple', 'banana', 'cherry']);
            expect(results).toEqual([true, true, false]);
        });

        it('should return empty array for empty input', () => {
            expect(safeTestBatch('a', '', [])).toEqual([]);
        });

        it('should handle invalid regex pattern gracefully', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const texts = ['a', 'b'];
            const results = safeTestBatch('(', '', texts);

            expect(results).toEqual([false, false]);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Batch regex evaluation failed'));
        });

        it('should block nested quantifiers for safety', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(safeTest('(a+)+$', '', 'aaaa')).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Regex rejected for safety'));
        });

        it('should block standalone wildcard for safety', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(safeTest('.*', '', 'anything')).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Regex rejected for safety'));
        });

        it('should block standalone .+ wildcard for safety', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(safeTest('.+', '', 'anything')).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Regex rejected for safety'));
        });

        it('should block standalone ^.*$ wildcard for safety', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(safeTest('^.*$', '', 'anything')).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Regex rejected for safety'));
        });

        it('should allow .* when used inside a meaningful pattern', () => {
            // Brand regex patterns like "acme.*corp" are common and safe
            expect(safeTest('acme.*corp', 'i', 'acme international corp')).toBe(true);
            expect(safeTest('acme.*corp', 'i', 'hello world')).toBe(false);
        });

        it('should allow alternation patterns with .*', () => {
            // Real-world brand regex: "acme|acme.*corp|acme\\s+inc"
            expect(safeTest('acme|acme.*corp', 'i', 'ACME International Corp')).toBe(true);
            expect(safeTest('acme|acme.*corp', 'i', 'unrelated query')).toBe(false);
        });

        it('should handle brand regex in batch mode', () => {
            const brandRegex = 'acme|acme.*corp|acme\\s+inc';
            const queries = ['acme shoes', 'acme international corp', 'best shoes online', 'acme inc deals'];
            const results = safeTestBatch(brandRegex, 'i', queries);
            expect(results).toEqual([true, true, false, true]);
        });

        it('should block alternation bombs', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            // Excessive alternation in a quantified group
            expect(safeTest('(a|b|c|d|e)+', '', 'abcde')).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Regex rejected for safety'));
        });

        it('should block unsafe batch patterns and return false for all', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const results = safeTestBatch('(a+)+$', '', ['aaaa', 'bbbb']);
            expect(results).toEqual([false, false]);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Batch regex rejected for safety'));
        });

        it('should block backreferences', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(safeTest('(a)\\1', '', 'aa')).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Regex rejected for safety'));
        });

        it('should block patterns exceeding max length', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const longPattern = 'a'.repeat(513);
            expect(safeTest(longPattern, '', 'a')).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Regex rejected for safety'));
        });

        it('should strip the g flag to prevent stateful lastIndex issues', () => {
            // With 'g' flag, consecutive .test() calls can give different results
            // Our normalization should strip it, so both calls return true
            const result1 = safeTest('a', 'gi', 'a');
            const result2 = safeTest('a', 'gi', 'a');
            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });
    });
});
