import { getBingClient, BingCrawlIssue, BingCrawlStats } from '../client.js';
import { resolveSiteProperty } from '../../common/auth/resolver.js';

/**
 * Get crawl issues for a site.
 */
export async function getCrawlIssues(siteUrl: string): Promise<BingCrawlIssue[]> {
    const { siteUrl: targetSiteUrl } = await resolveSiteProperty(siteUrl, 'bing').catch(() => ({ siteUrl }));
    const client = await getBingClient(siteUrl);
    return client.getCrawlIssues(targetSiteUrl);
}

/**
 * Get crawl statistics for a site.
 */
export async function getCrawlStats(siteUrl: string): Promise<BingCrawlStats[]> {
    const { siteUrl: targetSiteUrl } = await resolveSiteProperty(siteUrl, 'bing').catch(() => ({ siteUrl }));
    const client = await getBingClient(siteUrl);
    return client.getCrawlStats(targetSiteUrl);
}
