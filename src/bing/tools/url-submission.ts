import { getBingClient, BingUrlSubmissionQuota } from '../client.js';
import { resolveSiteProperty, resolveFullWebUrl } from '../../common/auth/resolver.js';

/**
 * Get remaining URL submission quota.
 */
export async function getUrlSubmissionQuota(siteUrl: string): Promise<BingUrlSubmissionQuota> {
    const { siteUrl: targetSiteUrl } = await resolveSiteProperty(siteUrl, 'bing').catch(() => ({ siteUrl }));
    const client = await getBingClient(siteUrl);
    return client.getUrlSubmissionQuota(targetSiteUrl);
}

/**
 * Submit a single URL for indexing.
 */
export async function submitUrl(siteUrl: string, url: string): Promise<string> {
    const { siteUrl: targetSiteUrl } = await resolveSiteProperty(siteUrl, 'bing').catch(() => ({ siteUrl }));
    const fullUrl = resolveFullWebUrl(url);
    const client = await getBingClient(siteUrl);
    await client.submitUrl(targetSiteUrl, fullUrl);
    return `Successfully submitted URL: ${fullUrl}`;
}

/**
 * Submit a batch of URLs for indexing.
 */
export async function submitUrlBatch(siteUrl: string, urlList: string[]): Promise<string> {
    const { siteUrl: targetSiteUrl } = await resolveSiteProperty(siteUrl, 'bing').catch(() => ({ siteUrl }));
    const fullUrlList = urlList.map(resolveFullWebUrl);
    const client = await getBingClient(siteUrl);
    await client.submitUrlBatch(targetSiteUrl, fullUrlList);
    return `Successfully submitted ${fullUrlList.length} URLs in batch.`;
}
