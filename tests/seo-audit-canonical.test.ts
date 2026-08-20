import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/profiles.js', () => ({
    getProfile: vi.fn().mockResolvedValue({
        customer: 'Example',
        primaryLocation: undefined,
        trackedQueries: [],
        profileReviewedAt: undefined,
    }),
}));

vi.mock('../src/store/db.js', () => ({
    query: vi.fn().mockResolvedValue([{ total: '0', indexed: '0', discovered: '0', crawled: '0' }]),
}));

import { auditSite } from '../src/seo/audit.js';

const homepage = '<html lang="en-AU"><head><title>Example business homepage</title><meta name="description" content="A sufficiently long example description for the audit test homepage."><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@type":"Organization"}</script></head><body><h1>Example</h1></body></html>';

function response(status: number, url: string, body = homepage) {
    return { status, url, text: vi.fn().mockResolvedValue(body) } as any;
}

function installFetch(hostDestinations: { apex: string; www: string }) {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('/robots.txt')) {
            return response(200, url, 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml');
        }
        if (url.endsWith('/sitemap.xml')) {
            return response(200, url, '<urlset><url><loc>https://example.com/</loc></url></urlset>');
        }
        if (url === 'http://example.com') {
            return response(200, `https://${hostDestinations.apex}/`);
        }
        if (url === 'https://example.com') {
            return response(200, `https://${hostDestinations.apex}/`);
        }
        if (url === 'https://www.example.com') {
            return response(200, `https://${hostDestinations.www}/`);
        }
        throw new Error(`Unexpected URL: ${url}`);
    }));
}

afterEach(() => vi.unstubAllGlobals());

describe('canonical host audit', () => {
    it('passes when apex redirects to www', async () => {
        installFetch({ apex: 'www.example.com', www: 'www.example.com' });

        const result = await auditSite('sc-domain:example.com');
        const check = result.checks.find((item) => item.id === 'canonical-host');

        expect(check).toMatchObject({ status: 'pass', fix: '' });
        expect(check?.evidence).toContain('both resolve to "www.example.com"');
    });

    it('warns when apex and www independently serve content', async () => {
        installFetch({ apex: 'example.com', www: 'www.example.com' });

        const result = await auditSite('sc-domain:example.com');
        const check = result.checks.find((item) => item.id === 'canonical-host');

        expect(check).toMatchObject({ status: 'warn' });
        expect(check?.fix).toContain('Both hosts serve content');
    });
});
