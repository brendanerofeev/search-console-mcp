/**
 * Regression tests for the 2026-08-15 profile wipe.
 *
 * A discovery run emptied a client's confirmed business profile — services,
 * audiences, goals, primary location and tracked queries all reset to defaults
 * on a row that was present throughout. Two independent things had to be true
 * for that to happen, and these tests pin both closed:
 *
 *   1. upsertProfile merged in application code against a read of the row, so a
 *      read that came back empty made a populated row indistinguishable from a
 *      new one. Preservation now happens in SQL.
 *   2. Discovery called upsertProfile for every site Google returned, including
 *      ones that already existed, so provisioning could reach human-authored
 *      rows at all. It is now create-only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const query = vi.fn();
const queryOne = vi.fn();

vi.mock('../src/store/db.js', () => ({
    query: (...args: unknown[]) => query(...args),
    queryOne: (...args: unknown[]) => queryOne(...args),
    toDomain: (url: string) => url.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
}));

import { upsertProfile } from '../src/store/profiles.js';

const STORED_ROW = {
    site_url: 'sc-domain:example.com',
    customer: 'Example Pty Ltd',
    domain: 'example.com',
    ga4_property_id: '123',
    country: 'au',
    language: 'en',
    device: 'mobile',
    primary_location: 'Brisbane, Queensland, Australia',
    service_areas: ['Brisbane'],
    brand_terms: ['example'],
    competitors: ['rival.com'],
    tracked_queries: ['widget repairs brisbane'],
    notes: null,
    active: true,
    description: 'A confirmed description that took a human an afternoon.',
    services: ['Widget repair', 'Widget maintenance'],
    audiences: ['Facilities managers'],
    goals: 'Non-brand discovery.',
    exclusions: ['widget hire'],
    business_terms: ['widget repairs'],
    profile_notes: 'Confirmed with the client.',
    profile_reviewed_at: new Date('2026-08-14T00:00:00Z'),
    created_at: new Date('2026-08-13T11:30:13Z'),
    updated_at: new Date('2026-08-14T00:00:00Z'),
};

beforeEach(() => {
    query.mockReset();
    queryOne.mockReset();
});

describe('upsertProfile preserves stored values in SQL, not in JS', () => {
    it('never reads the row in order to decide what to keep', async () => {
        // The read that used to drive the merge. If the implementation still
        // depends on it, returning nothing here would produce a wiping UPDATE.
        queryOne.mockResolvedValue(undefined);
        query.mockResolvedValue([]);

        await upsertProfile({ siteUrl: 'sc-domain:example.com', ga4PropertyId: '999' }).catch(() => undefined);

        const [sql, params] = query.mock.calls[0] as [string, unknown[]];

        // Every column a human can author must fall back to the stored value.
        for (const column of [
            'customer', 'primary_location', 'service_areas', 'brand_terms',
            'competitors', 'tracked_queries', 'description', 'services',
            'audiences', 'goals', 'exclusions', 'business_terms',
            'profile_notes', 'profile_reviewed_at',
        ]) {
            expect(sql, `${column} must COALESCE onto site_profile.${column}`)
                .toContain(`site_profile.${column}`);
        }

        // Unsupplied fields must arrive as NULL so COALESCE can do its job.
        // '[]' here would overwrite a populated array with an empty one — that
        // is precisely what happened on 15 Aug.
        expect(params.slice(1)).not.toContain('[]');
        expect(params[8], 'serviceAreas was not supplied').toBeNull();
        expect(params[11], 'trackedQueries was not supplied').toBeNull();
        expect(params[15], 'services was not supplied').toBeNull();
    });

    it('still allows an explicit clear', async () => {
        queryOne.mockResolvedValue(STORED_ROW);
        query.mockResolvedValue([]);

        await upsertProfile({ siteUrl: 'sc-domain:example.com', services: [] }).catch(() => undefined);

        const [, params] = query.mock.calls[0] as [string, unknown[]];
        expect(params[15], 'an empty array is a deliberate clear, not an omission').toBe('[]');
    });
});

describe('discovery is create-only', () => {
    it('only writes when the row is new, or to link a missing GA4 id', async () => {
        // Asserted against the source rather than a re-implementation: a test
        // that reproduces the loop would pass regardless of what discover.ts does.
        const source = readFileSync(
            new URL('../src/store/discover.ts', import.meta.url),
            'utf8'
        );
        const loop = source.slice(source.indexOf('const before = existing.get(siteUrl)'));

        expect(loop, 'the existing row must gate the write').toMatch(/if\s*\(\s*!before\s*\)/);
        expect(
            loop.slice(0, loop.indexOf('results.push')),
            'the only write to an existing row may supply ga4PropertyId'
        ).toMatch(/ga4\?\.id\s*&&\s*!before\.ga4PropertyId/);
    });
});
