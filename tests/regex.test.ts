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

        it('should block open-ended wildcard for safety', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(safeTest('.*', '', 'anything')).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Regex rejected for safety'));
        });

        it('should block unsafe batch patterns and return false for all', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const results = safeTestBatch('(a+)+$', '', ['aaaa', 'bbbb']);
            expect(results).toEqual([false, false]);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Batch regex rejected for safety'));
        });
    });
});
