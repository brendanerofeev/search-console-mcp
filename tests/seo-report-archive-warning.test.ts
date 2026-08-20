import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/db.js', () => ({ query: vi.fn().mockResolvedValue([]) }));

vi.mock('../src/store/profiles.js', () => ({
    getProfile: vi.fn().mockResolvedValue({
        siteUrl: 'sc-domain:thetechyside.com.au',
        customer: 'The Techy Side',
        services: [],
        audiences: [],
        exclusions: [],
        businessTerms: [],
        brandTerms: [],
        serviceAreas: [],
        profileReviewedAt: '2026-08-18T00:00:00.000Z',
    }),
}));

// archiveNotes stays real — the wording it produces is what this test is about.
vi.mock(import('../src/seo/candidates.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    mineCandidates: vi.fn().mockResolvedValue([]),
    archiveSpan: vi.fn(),
}));

import { archiveSpan } from '../src/seo/candidates.js';
import { buildKeywordReport } from '../src/seo/aggregate.js';

const mockedSpan = vi.mocked(archiveSpan);

describe('keyword report archive honesty', () => {
    beforeEach(() => vi.clearAllMocks());

    it('warns when the requested window is far deeper than the archive', async () => {
        mockedSpan.mockResolvedValue({
            daysHeld: 15, spanDays: 15, gapDays: 0, from: '2026-08-01', to: '2026-08-15',
        });

        const report = await buildKeywordReport({ siteUrl: 'sc-domain:thetechyside.com.au', days: 90 });

        expect(report.archive).toMatchObject({ daysHeld: 15, spanDays: 15, gapDays: 0 });
        const warning = report.notes.find((n) => n.includes('rank_backfill'));
        expect(warning).toBeDefined();
        expect(warning).toContain('15 days');
        expect(warning).toContain('90 days');
    });

    it('warns when the archive has gaps inside its span', async () => {
        mockedSpan.mockResolvedValue({
            daysHeld: 2, spanDays: 5, gapDays: 3, from: '2026-08-01', to: '2026-08-05',
        });

        const report = await buildKeywordReport({ siteUrl: 'sc-domain:thetechyside.com.au', days: 5 });

        expect(report.notes.some((n) => n.includes('3 day'))).toBe(true);
    });

    it('stays quiet when the archive covers the requested window', async () => {
        mockedSpan.mockResolvedValue({
            daysHeld: 90, spanDays: 90, gapDays: 0, from: '2026-05-20', to: '2026-08-17',
        });

        const report = await buildKeywordReport({ siteUrl: 'sc-domain:thetechyside.com.au', days: 90 });

        expect(report.notes.some((n) => n.includes('rank_backfill'))).toBe(false);
    });
});
