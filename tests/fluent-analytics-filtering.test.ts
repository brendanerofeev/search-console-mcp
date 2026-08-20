import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/google/tools/analytics.js', () => ({
    queryAnalytics: vi.fn().mockResolvedValue([{ keys: ['subbie support'], impressions: 10 }]),
}));

vi.mock('../src/bing/tools/analytics.js', () => ({
    getQueryStats: vi.fn().mockResolvedValue([
        { Query: 'subbie support', Impressions: 10 },
        { Query: 'unrelated term', Impressions: 20 },
        { Query: 'subbie mcp', Impressions: 5 },
    ]),
}));

vi.mock('../src/ga4/tools/analytics.js', () => ({}));
vi.mock('../src/ga4/tools/realtime.js', () => ({}));
vi.mock('../src/ga4/tools/behavior.js', () => ({}));

import * as googleAnalytics from '../src/google/tools/analytics.js';
import * as bingAnalytics from '../src/bing/tools/analytics.js';
import { analyticsQueryHandler } from '../src/tools/fluent/analytics.js';

describe('analytics_query filtering', () => {
    beforeEach(() => vi.clearAllMocks());

    it('honours search and limit for every requested engine', async () => {
        const result = await analyticsQueryHandler({
            siteUrl: 'sc-domain:example.com',
            startDate: '2026-08-01',
            endDate: '2026-08-15',
            dimensions: ['query'],
            search: 'subbie',
            limit: 1,
            engine: 'all',
        });

        expect(googleAnalytics.queryAnalytics).toHaveBeenCalledWith({
            siteUrl: 'sc-domain:example.com',
            startDate: '2026-08-01',
            endDate: '2026-08-15',
            dimensions: ['query'],
            filters: [{ dimension: 'query', operator: 'contains', expression: 'subbie' }],
            limit: 1,
        });
        expect(bingAnalytics.getQueryStats).toHaveBeenCalledWith(
            'sc-domain:example.com',
            '2026-08-01',
            '2026-08-15',
        );

        const body = JSON.parse(result.content[0].text);
        expect(body.bing).toEqual([{ Query: 'subbie support', Impressions: 10 }]);
    });

    it('keeps rowLimit as a backwards-compatible alias', async () => {
        await analyticsQueryHandler({
            siteUrl: 'sc-domain:example.com',
            rowLimit: 7,
            engine: 'google',
        });

        expect(googleAnalytics.queryAnalytics).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 7 }),
        );
    });
});
