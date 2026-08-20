import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * These tools wrap a PREPAID, metered API. The behaviour worth protecting is
 * not the happy path (DataForSEO returns what it returns) but the guard: a
 * link gap with no comparison set must not reach the network, because an empty
 * result would be indistinguishable from "no opportunities found" while still
 * costing money.
 */

const linkGap = vi.fn();
const backlinkReport = vi.fn();
const getProfile = vi.fn();

vi.mock('../src/dataforseo/backlinks.js', () => ({
    linkGap: (...args: unknown[]) => linkGap(...args),
    backlinkReport: (...args: unknown[]) => backlinkReport(...args),
}));
vi.mock('../src/store/profiles.js', () => ({
    getProfile: (...args: unknown[]) => getProfile(...args),
}));

const { linkGapHandler, backlinkReportHandler } = await import('../src/tools/fluent/backlinks.js');

const parse = (res: { content: Array<{ text: string }> }) => JSON.parse(res.content[0].text);

beforeEach(() => {
    linkGap.mockReset();
    backlinkReport.mockReset();
    getProfile.mockReset();
});

describe('link_gap competitor resolution', () => {
    it('does not call the paid API when no competitors are supplied or recorded', async () => {
        getProfile.mockResolvedValue({ competitors: [] });

        const out = parse(await linkGapHandler({ siteUrl: 'sc-domain:example.com' }));

        expect(linkGap).not.toHaveBeenCalled();
        expect(out.total).toBe(0);
        expect(out.note).toMatch(/nothing was charged/i);
    });

    it('does not call the paid API when the site has no profile at all', async () => {
        getProfile.mockResolvedValue(null);

        await linkGapHandler({ siteUrl: 'sc-domain:example.com' });

        expect(linkGap).not.toHaveBeenCalled();
    });

    it('falls back to competitors recorded on the site profile', async () => {
        getProfile.mockResolvedValue({ competitors: ['rival-one.com.au', 'rival-two.com.au'] });
        linkGap.mockResolvedValue({ siteUrl: 'sc-domain:example.com', total: 0, domains: [], note: '' });

        await linkGapHandler({ siteUrl: 'sc-domain:example.com' });

        expect(linkGap).toHaveBeenCalledWith(
            'sc-domain:example.com',
            ['rival-one.com.au', 'rival-two.com.au'],
            40
        );
    });

    it('prefers explicit competitors over the profile and never reads it', async () => {
        linkGap.mockResolvedValue({ siteUrl: 'sc-domain:example.com', total: 0, domains: [], note: '' });

        await linkGapHandler({ siteUrl: 'sc-domain:example.com', competitors: ['explicit.com.au'] });

        expect(getProfile).not.toHaveBeenCalled();
        expect(linkGap).toHaveBeenCalledWith('sc-domain:example.com', ['explicit.com.au'], 40);
    });

    it('passes a caller-supplied limit through', async () => {
        linkGap.mockResolvedValue({ siteUrl: 'sc-domain:example.com', total: 0, domains: [], note: '' });

        await linkGapHandler({ siteUrl: 'sc-domain:example.com', competitors: ['a.com'], limit: 5 });

        expect(linkGap).toHaveBeenCalledWith('sc-domain:example.com', ['a.com'], 5);
    });

    it('returns an empty gap as a finding, not an error', async () => {
        linkGap.mockResolvedValue({
            siteUrl: 'sc-domain:example.com',
            total: 0,
            domains: [],
            note: 'No shared referring domains across these competitors.',
        });

        const out = parse(await linkGapHandler({ siteUrl: 'sc-domain:example.com', competitors: ['a.com'] }));

        expect(out.domains).toEqual([]);
        expect(out.note).toBeTruthy();
    });
});

describe('backlink_report', () => {
    it('passes extra competitors through to the report', async () => {
        backlinkReport.mockResolvedValue({ siteUrl: 'sc-domain:example.com', competitors: [] });

        await backlinkReportHandler({ siteUrl: 'sc-domain:example.com', competitors: ['rival.com.au'] });

        expect(backlinkReport).toHaveBeenCalledWith('sc-domain:example.com', ['rival.com.au']);
    });

    it('defaults extra competitors to an empty list so the profile drives the set', async () => {
        backlinkReport.mockResolvedValue({ siteUrl: 'sc-domain:example.com', competitors: [] });

        await backlinkReportHandler({ siteUrl: 'sc-domain:example.com' });

        expect(backlinkReport).toHaveBeenCalledWith('sc-domain:example.com', []);
    });

    it('surfaces the verdict rather than raw numbers alone', async () => {
        backlinkReport.mockResolvedValue({
            siteUrl: 'sc-domain:example.com',
            site: { target: 'example.com', referringMainDomains: 2 },
            competitors: [{ target: 'rival.com.au', referringMainDomains: 48 }],
            domainGap: -46,
            verdict: 'Behind by 46 referring domains',
            notes: [],
        });

        const out = parse(await backlinkReportHandler({ siteUrl: 'sc-domain:example.com' }));

        expect(out.domainGap).toBe(-46);
        expect(out.verdict).toMatch(/behind/i);
    });
});
