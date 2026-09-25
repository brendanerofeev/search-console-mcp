import { describe, expect, it, vi } from 'vitest';
import { runBusinessProfileSync } from '../../../src/sync/run-business-profile-sync.js';
import type { SourceProfile } from '../../../src/sync/business-profile-sync.js';
import type { TtsDataClient } from '../../../src/sync/tts-data-client.js';

function profile(overrides: Partial<SourceProfile> = {}): SourceProfile {
	return {
		siteUrl: 'sc-domain:example.com',
		active: true,
		description: 'What the business does.',
		services: ['dock leveller repair'],
		audiences: [],
		goals: undefined,
		exclusions: [],
		businessTerms: [],
		profileReviewedAt: '2026-09-16T00:00:00.000Z',
		...overrides
	};
}

/** A fake shaped exactly like TtsDataClient's public surface, no HTTP. */
function fakeClient(opts: {
	sites?: { id: string; gsc_property: string | null }[];
	existingBusinessProfileSiteIds?: string[];
	failPatchFor?: string;
}) {
	const patched: { query: Record<string, string>; values: unknown }[] = [];
	const inserted: unknown[] = [];

	const select = vi.fn(async (table: string, query: Record<string, string>) => {
		if (table === 'site') return opts.sites ?? [];
		if (table === 'business_profile') {
			const siteId = query.site_id?.replace('eq.', '');
			const exists = (opts.existingBusinessProfileSiteIds ?? []).includes(siteId ?? '');
			return exists ? [{ site_id: siteId }] : [];
		}
		throw new Error(`unexpected select on ${table}`);
	});

	const patch = vi.fn(async (table: string, query: Record<string, string>, values: unknown) => {
		if (table !== 'business_profile') throw new Error(`unexpected patch on ${table}`);
		const siteId = query.site_id?.replace('eq.', '');
		if (siteId === opts.failPatchFor) throw new Error('tts-data postgrest 500: simulated failure');
		patched.push({ query, values });
		return true;
	});

	const insert = vi.fn(async (table: string, row: unknown) => {
		if (table !== 'business_profile') throw new Error(`unexpected insert on ${table}`);
		inserted.push(row);
	});

	return { client: { select, patch, insert } as unknown as TtsDataClient, patched, inserted };
}

describe('runBusinessProfileSync', () => {
	it('patches an existing business_profile row for a matched, confirmed site', async () => {
		const { client, patched, inserted } = fakeClient({
			sites: [{ id: 'site-1', gsc_property: 'sc-domain:example.com' }],
			existingBusinessProfileSiteIds: ['site-1']
		});

		const summary = await runBusinessProfileSync(
			client,
			() => new Date('2026-09-25T00:00:00.000Z'),
			async () => [profile()]
		);

		expect(summary.synced).toEqual(['sc-domain:example.com']);
		expect(summary.failed).toEqual([]);
		expect(inserted).toEqual([]);
		expect(patched).toHaveLength(1);
		expect(patched[0].query).toEqual({ site_id: 'eq.site-1' });
		expect((patched[0].values as { summary: string }).summary).toBe('What the business does.');
	});

	it('inserts a new business_profile row when the site has never been synced before', async () => {
		const { client, inserted, patched } = fakeClient({
			sites: [{ id: 'site-1', gsc_property: 'sc-domain:example.com' }],
			existingBusinessProfileSiteIds: []
		});

		const summary = await runBusinessProfileSync(
			client,
			() => new Date('2026-09-25T00:00:00.000Z'),
			async () => [profile()]
		);

		expect(summary.synced).toEqual(['sc-domain:example.com']);
		expect(patched).toEqual([]);
		expect(inserted).toHaveLength(1);
		expect((inserted[0] as { site_id: string }).site_id).toBe('site-1');
	});

	it('maps siteUrl to site id via gsc_property, matched exactly', async () => {
		const { client, inserted } = fakeClient({
			sites: [
				{ id: 'other-site', gsc_property: 'sc-domain:other.com' },
				{ id: 'site-1', gsc_property: 'sc-domain:example.com' }
			],
			existingBusinessProfileSiteIds: []
		});

		await runBusinessProfileSync(client, () => new Date('2026-09-25T00:00:00.000Z'), async () => [profile()]);

		expect((inserted[0] as { site_id: string }).site_id).toBe('site-1');
	});

	it('one site failing to write does not stop the others, and is reported', async () => {
		const { client } = fakeClient({
			sites: [
				{ id: 'site-1', gsc_property: 'sc-domain:a.com' },
				{ id: 'site-2', gsc_property: 'sc-domain:b.com' }
			],
			existingBusinessProfileSiteIds: ['site-1', 'site-2'],
			failPatchFor: 'site-1'
		});

		const summary = await runBusinessProfileSync(
			client,
			() => new Date('2026-09-25T00:00:00.000Z'),
			async () => [profile({ siteUrl: 'sc-domain:a.com' }), profile({ siteUrl: 'sc-domain:b.com' })]
		);

		expect(summary.synced).toEqual(['sc-domain:b.com']);
		expect(summary.failed).toEqual([
			{ siteUrl: 'sc-domain:a.com', error: 'tts-data postgrest 500: simulated failure' }
		]);
	});

	it('reports inactive, unconfirmed and unmatched profiles in the summary without writing', async () => {
		const { client, patched, inserted } = fakeClient({
			sites: [{ id: 'site-1', gsc_property: 'sc-domain:matched.com' }]
		});

		const summary = await runBusinessProfileSync(
			client,
			() => new Date('2026-09-25T00:00:00.000Z'),
			async () => [
				profile({ siteUrl: 'sc-domain:inactive.com', active: false }),
				profile({ siteUrl: 'sc-domain:draft.com', profileReviewedAt: undefined }),
				profile({ siteUrl: 'sc-domain:nomatch.com' })
			]
		);

		expect(summary.synced).toEqual([]);
		expect(summary.skippedInactive).toEqual(['sc-domain:inactive.com']);
		expect(summary.skippedUnconfirmed).toEqual(['sc-domain:draft.com']);
		expect(summary.skippedUnmatched).toEqual(['sc-domain:nomatch.com']);
		expect(patched).toEqual([]);
		expect(inserted).toEqual([]);
	});

	it('running twice with the same source data produces the same writes both times (idempotent)', async () => {
		const { client: client1, inserted: inserted1 } = fakeClient({
			sites: [{ id: 'site-1', gsc_property: 'sc-domain:example.com' }],
			existingBusinessProfileSiteIds: []
		});
		await runBusinessProfileSync(client1, () => new Date('2026-09-25T00:00:00.000Z'), async () => [profile()]);

		// Second run sees the row the first run just created.
		const { client: client2, inserted: inserted2, patched: patched2 } = fakeClient({
			sites: [{ id: 'site-1', gsc_property: 'sc-domain:example.com' }],
			existingBusinessProfileSiteIds: ['site-1']
		});
		await runBusinessProfileSync(client2, () => new Date('2026-09-26T00:00:00.000Z'), async () => [profile()]);

		expect(inserted1).toHaveLength(1);
		expect(inserted2).toEqual([]);
		expect(patched2).toHaveLength(1);
	});
});
