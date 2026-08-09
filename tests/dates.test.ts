import { describe, it, expect } from 'vitest';
import { parseMicrosoftDate } from '../src/common/utils/dates.js';

describe('Date Utilities (parseMicrosoftDate)', () => {
    it('should parse Microsoft JSON dates with timezone offsets (/Date(ms-offset)/)', () => {
        const msDate = '/Date(1731225600000-0800)/';
        const parsed = parseMicrosoftDate(msDate);
        expect(parsed).toBeInstanceOf(Date);
        expect(parsed.getTime()).toBe(1731225600000);
    });

    it('should parse Microsoft JSON dates without timezone offsets (/Date(ms)/)', () => {
        const msDate = '/Date(1786249419000)/';
        const parsed = parseMicrosoftDate(msDate);
        expect(parsed).toBeInstanceOf(Date);
        expect(parsed.getTime()).toBe(1786249419000);
    });

    it('should handle negative/epoch 0 Microsoft JSON dates (/Date(-11644473600000)/) gracefully', () => {
        const msDate = '/Date(-11644473600000)/';
        const parsed = parseMicrosoftDate(msDate);
        expect(parsed).toBeInstanceOf(Date);
        expect(isNaN(parsed.getTime())).toBe(false);
    });

    it('should parse standard YYYY-MM-DD date strings', () => {
        const isoDate = '2026-08-09';
        const parsed = parseMicrosoftDate(isoDate);
        expect(parsed).toBeInstanceOf(Date);
        expect(parsed.toISOString()).toContain('2026-08-09');
    });

    it('should parse ISO 8601 timestamp strings', () => {
        const timestamp = '2026-08-09T10:00:00.000Z';
        const parsed = parseMicrosoftDate(timestamp);
        expect(parsed).toBeInstanceOf(Date);
        expect(parsed.toISOString()).toBe('2026-08-09T10:00:00.000Z');
    });
});
