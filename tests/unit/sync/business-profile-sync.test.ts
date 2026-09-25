import { describe, expect, it } from 'vitest';
import { mapLookup, planBusinessProfileSync, type SourceProfile } from '../../../src/sync/business-profile-sync.js';

const SYNCED_AT = '2026-09-25T00:00:00.000Z';

function profile(overrides: Partial<SourceProfile> = {}): SourceProfile {
	return {
		siteUrl: 'sc-domain:example.com',
		active: true,
		description: 'What the business does.',
		services: ['dock leveller repair'],
		audiences: ['Warehouse managers'],
		goals: 'Win more PPM work',
		exclusions: [],
		businessTerms: ['dock leveller repair'],
		profileReviewedAt: '2026-09-16T00:00:00.000Z',
		...overrides
	};
}

describe('planBusinessProfileSync', () => {
	it('syncs an active, confirmed, matched profile with the exact tts-data field mapping', () => {
		const lookup = mapLookup({ 'sc-domain:example.com': 'site-1' });

		const [entry] = planBusinessProfileSync([profile()], lookup, SYNCED_AT);

		expect(entry).toEqual({
			kind: 'sync',
			siteUrl: 'sc-domain:example.com',
			siteId: 'site-1',
			fields: {
				summary: 'What the business does.',
				services: ['dock leveller repair'],
				reviewed_at: '2026-09-16T00:00:00.000Z',
				audiences: ['Warehouse managers'],
				goals: 'Win more PPM work',
				exclusions: [],
				business_terms: ['dock leveller repair'],
				synced_at: SYNCED_AT
			}
		});
	});

	it('carries reviewed_at from the source verbatim, never the sync clock', () => {
		const lookup = mapLookup({ 'sc-domain:example.com': 'site-1' });
		const [entry] = planBusinessProfileSync(
			[profile({ profileReviewedAt: '2026-01-01T00:00:00.000Z' })],
			lookup,
			SYNCED_AT
		);
		expect(entry.kind).toBe('sync');
		if (entry.kind === 'sync') {
			expect(entry.fields.reviewed_at).toBe('2026-01-01T00:00:00.000Z');
			expect(entry.fields.reviewed_at).not.toBe(SYNCED_AT);
			expect(entry.fields.synced_at).toBe(SYNCED_AT);
		}
	});

	it('writes a genuinely-empty array as [], not as a skip — empty overwrites', () => {
		const lookup = mapLookup({ 'sc-domain:example.com': 'site-1' });
		const [entry] = planBusinessProfileSync(
			[profile({ audiences: [], exclusions: [], businessTerms: [], goals: undefined })],
			lookup,
			SYNCED_AT
		);
		expect(entry.kind).toBe('sync');
		if (entry.kind === 'sync') {
			expect(entry.fields.audiences).toEqual([]);
			expect(entry.fields.exclusions).toEqual([]);
			expect(entry.fields.business_terms).toEqual([]);
			expect(entry.fields.goals).toBeNull();
		}
	});

	it('skips an inactive profile without matching or planning a sync', () => {
		const lookup = mapLookup({ 'sc-domain:example.com': 'site-1' });
		const [entry] = planBusinessProfileSync([profile({ active: false })], lookup, SYNCED_AT);
		expect(entry).toEqual({ kind: 'skip-inactive', siteUrl: 'sc-domain:example.com' });
	});

	it('skips an unconfirmed draft (no profileReviewedAt)', () => {
		const lookup = mapLookup({ 'sc-domain:example.com': 'site-1' });
		const [entry] = planBusinessProfileSync(
			[profile({ profileReviewedAt: undefined })],
			lookup,
			SYNCED_AT
		);
		expect(entry).toEqual({ kind: 'skip-unconfirmed', siteUrl: 'sc-domain:example.com' });
	});

	it('skips a confirmed profile with no matching tts-data site', () => {
		const lookup = mapLookup({});
		const [entry] = planBusinessProfileSync([profile()], lookup, SYNCED_AT);
		expect(entry).toEqual({ kind: 'skip-unmatched', siteUrl: 'sc-domain:example.com' });
	});

	it('is a pure function: identical input produces identical output on repeat calls', () => {
		const lookup = mapLookup({ 'sc-domain:example.com': 'site-1' });
		const first = planBusinessProfileSync([profile()], lookup, SYNCED_AT);
		const second = planBusinessProfileSync([profile()], lookup, SYNCED_AT);
		expect(second).toEqual(first);
	});

	it('plans each profile independently in the given order', () => {
		const lookup = mapLookup({ 'sc-domain:a.com': 'site-a', 'sc-domain:c.com': 'site-c' });
		const plan = planBusinessProfileSync(
			[
				profile({ siteUrl: 'sc-domain:a.com' }),
				profile({ siteUrl: 'sc-domain:b.com', active: false }),
				profile({ siteUrl: 'sc-domain:c.com', profileReviewedAt: undefined })
			],
			lookup,
			SYNCED_AT
		);
		expect(plan.map((e) => e.kind)).toEqual(['sync', 'skip-inactive', 'skip-unconfirmed']);
	});
});
