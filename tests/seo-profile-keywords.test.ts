import { describe, expect, it } from 'vitest';
import { generateFromProfile } from '../src/seo/profile-keywords.js';
import type { SiteProfile } from '../src/store/profiles.js';

function profile(services: string[]): SiteProfile {
    return {
        siteUrl: 'sc-domain:example.com',
        domain: 'example.com',
        country: 'AU',
        language: 'en-AU',
        device: 'mobile',
        primaryLocation: 'Brisbane, QLD',
        serviceAreas: [],
        brandTerms: [],
        competitors: [],
        trackedQueries: [],
        services,
        audiences: [],
        exclusions: [],
        businessTerms: [],
        profileReviewedAt: '2026-08-18T00:00:00.000Z',
        active: true,
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
    };
}

function bareServices(service: string): string[] {
    return generateFromProfile(profile([service]))
        .filter((candidate) => candidate.pattern === 'service')
        .map((candidate) => candidate.keyword);
}

describe('profile service candidate phrasing', () => {
    it.each([
        ['Reporting, dashboards and business insights', ['business reporting', 'business dashboards', 'business insights']],
        ['Quote, proposal and tender automation', ['quote automation', 'proposal automation', 'tender automation']],
        ['Software and systems integration', ['software systems integration']],
        ['AI adoption and advisory for business', ['ai adoption', 'ai advisory for business']],
        ['Software licensing and spend review', ['software licensing', 'software spend review']],
    ])('turns compound label %s into complete search phrases', (service, expected) => {
        expect(bareServices(service)).toEqual(expected);
    });

    it('preserves independent multi-word alternatives', () => {
        expect(bareServices('Blocked Drains & Drain Cleaning')).toEqual([
            'blocked drains',
            'drain cleaning',
        ]);
    });

    it('drops a stranded single-word modifier', () => {
        expect(bareServices('Burst and leaking pipes')).toEqual(['leaking pipes']);
    });
});
