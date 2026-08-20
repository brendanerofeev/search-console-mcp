import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/db.js', () => ({ query: vi.fn() }));

import { query } from '../src/store/db.js';
import { archiveSpan } from '../src/seo/candidates.js';

const mockedQuery = vi.mocked(query);

describe('archiveSpan', () => {
    beforeEach(() => vi.clearAllMocks());

    it('separates days actually held from the calendar span', async () => {
        mockedQuery.mockResolvedValue([
            { lo: '2026-08-01', hi: '2026-08-05', span: '5', held: '2' },
        ] as any);

        await expect(archiveSpan('sc-domain:knightlabs.co')).resolves.toEqual({
            daysHeld: 2,
            spanDays: 5,
            gapDays: 3,
            from: '2026-08-01',
            to: '2026-08-05',
        });
    });

    it('reports no gap when every day in the span carries data', async () => {
        mockedQuery.mockResolvedValue([
            { lo: '2026-06-19', hi: '2026-08-17', span: '60', held: '60' },
        ] as any);

        await expect(archiveSpan('sc-domain:thetechyside.com.au')).resolves.toEqual({
            daysHeld: 60,
            spanDays: 60,
            gapDays: 0,
            from: '2026-06-19',
            to: '2026-08-17',
        });
    });

    it('reports an empty archive as zero rather than throwing', async () => {
        mockedQuery.mockResolvedValue([] as any);

        await expect(archiveSpan('sc-domain:new-site.com')).resolves.toEqual({
            daysHeld: 0,
            spanDays: 0,
            gapDays: 0,
            from: null,
            to: null,
        });
    });
});
