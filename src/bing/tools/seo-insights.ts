import { getQueryStats, getPageStats, getQueryPageStats } from './analytics.js';
import { BingQueryStats, BingPageStats, BingQueryPageStats } from '../client.js';
import { safeTestBatch } from '../../common/utils/regex.js';

export interface BingSEOInsight {
    type: 'opportunity' | 'warning' | 'success';
    category: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    data?: Record<string, unknown>;
}

export interface BingLowHangingFruit {
    query: string;
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
    potentialClicks: number;
}

export interface BingLostQuery {
    query: string;
    previousClicks: number;
    previousImpressions: number;
    previousPosition: number;
    currentClicks: number;
    currentImpressions: number;
    currentPosition: number;
    lostClicks: number;
}

export interface BingBrandVsNonBrandMetrics {
    segment: 'Brand' | 'Non-Brand';
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    queryCount: number;
}

function getPos(row: any): number {
    return typeof row.AvgImpressionPosition === 'number' ? row.AvgImpressionPosition : (typeof row.AvgPosition === 'number' ? row.AvgPosition : (typeof row.position === 'number' ? row.position : 100));
}

function getCTR(row: any): number {
    if (typeof row.CTR === 'number' && row.CTR > 0) return row.CTR;
    if (typeof row.ctr === 'number' && row.ctr > 0) return row.ctr;
    return row.Impressions > 0 ? (row.Clicks / row.Impressions) : 0;
}

/**
 * Find "low-hanging fruit" keywords in Bing.
 */
export async function findLowHangingFruit(
    siteUrl: string,
    options: { minImpressions?: number; limit?: number; queryStats?: BingQueryStats[] } = {}
): Promise<BingLowHangingFruit[]> {
    const { minImpressions = 10, limit = 50, queryStats } = options;

    const rows = queryStats || await getQueryStats(siteUrl);

    // Filter for low-hanging fruit: position 5-20, high impressions
    const candidates = rows
        .filter(row => {
            const position = getPos(row);
            const impressions = row.Impressions ?? 0;
            return position >= 5 && position <= 20 && impressions >= minImpressions;
        })
        .map(row => {
            const position = getPos(row);
            const impressions = row.Impressions ?? 0;
            const clicks = row.Clicks ?? 0;
            const ctr = getCTR(row);

            // Estimate potential clicks if moved to top 3 (conservative 15% CTR)
            const potentialClicks = Math.round(impressions * 0.15) - clicks;

            return {
                query: row.Query,
                impressions,
                clicks,
                ctr,
                position,
                potentialClicks: Math.max(0, potentialClicks)
            };
        })
        .sort((a, b) => b.potentialClicks - a.potentialClicks)
        .slice(0, limit);

    return candidates;
}

/**
 * Find keywords ranking just off page 1 in Bing (positions 8-15).
 */
export async function findStrikingDistance(
    siteUrl: string,
    options: { limit?: number; queryStats?: BingQueryStats[] } = {}
): Promise<BingQueryStats[]> {
    const { limit = 50, queryStats } = options;

    const rows = queryStats || await getQueryStats(siteUrl);

    return rows
        .filter(r => {
            const pos = getPos(r);
            return pos >= 8 && pos <= 15;
        })
        .sort((a, b) => b.Impressions - a.Impressions)
        .slice(0, limit);
}

/**
 * Identify queries where the site ranks well but has low CTR in Bing.
 */
export async function findLowCTROpportunities(
    siteUrl: string,
    options: { minImpressions?: number; limit?: number; queryStats?: BingQueryStats[] } = {}
): Promise<Array<BingQueryStats & { benchmarkCtr: number }>> {
    const { minImpressions = 10, limit = 50, queryStats } = options;

    const rows = queryStats || await getQueryStats(siteUrl);

    // Approximate benchmarks for CTR by position (simplified)
    const benchmarks: Record<number, number> = {
        1: 0.30, 2: 0.15, 3: 0.10, 4: 0.06, 5: 0.04,
        6: 0.03, 7: 0.02, 8: 0.015, 9: 0.01, 10: 0.01
    };

    return rows
        .filter(r => (r.Impressions ?? 0) >= minImpressions && getPos(r) <= 10)
        .map(r => {
            const pos = Math.round(getPos(r));
            const benchmark = benchmarks[pos] || 0.01;
            return {
                ...r,
                benchmarkCtr: benchmark
            };
        })
        .filter(item => getCTR(item) < (item.benchmarkCtr * 0.6))
        .sort((a, b) => b.Impressions - a.Impressions)
        .slice(0, limit);
}

/**
 * Detect keyword cannibalization in Bing where multiple pages compete for the same query.
 */
export async function detectCannibalization(
    siteUrl: string,
    options: { minImpressions?: number; limit?: number; startDate?: string; endDate?: string } = {},
    rows?: BingQueryPageStats[]
): Promise<any[]> {
    const { minImpressions = 50, limit = 30, startDate, endDate } = options;

    const stats = rows || await getQueryPageStats(siteUrl, startDate, endDate);

    // Group by query
    const queryMap = new Map<string, any[]>();

    for (const row of stats) {
        if (row.Impressions < minImpressions) continue;

        if (!queryMap.has(row.Query)) {
            queryMap.set(row.Query, []);
        }

        queryMap.get(row.Query)!.push({
            page: row.Page,
            clicks: row.Clicks,
            impressions: row.Impressions,
            date: row.Date
        });
    }

    const cannibalization: any[] = [];

    for (const [query, pages] of queryMap) {
        if (pages.length >= 2) {
            pages.sort((a, b) => b.clicks - a.clicks);
            const totalClicks = pages.reduce((sum, p) => sum + p.clicks, 0);
            const totalImpressions = pages.reduce((sum, p) => sum + p.impressions, 0);

            // Calculate conflict score
            const shares = pages.map(p => totalClicks > 0 ? p.clicks / totalClicks : 0);
            const hhi = shares.reduce((sum, s) => sum + s * s, 0);
            const conflictScore = 1 - hhi;

            if (conflictScore > 0.1 || pages[1].impressions > (pages[0].impressions * 0.2)) {
                cannibalization.push({
                    query,
                    pages,
                    totalClicks,
                    totalImpressions,
                    clickShareConflict: parseFloat(conflictScore.toFixed(2))
                });
            }
        }
    }

    return cannibalization
        .sort((a, b) => (b.totalClicks * b.clickShareConflict) - (a.totalClicks * a.clickShareConflict))
        .slice(0, limit);
}

/**
 * Identify queries that have lost significant visibility or clicks compared to the previous period.
 */
export async function findLostQueries(
    siteUrl: string,
    options: { days?: number; limit?: number } = {}
): Promise<BingLostQuery[]> {
    const { days = 28, limit = 50 } = options;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2); // Account for data delay
    const midDate = new Date(endDate);
    midDate.setDate(midDate.getDate() - days);
    const startDate = new Date(midDate);
    startDate.setDate(startDate.getDate() - days);

    const [currentStats, previousStats] = await Promise.all([
        getQueryStats(siteUrl, midDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]),
        getQueryStats(siteUrl, startDate.toISOString().split('T')[0], midDate.toISOString().split('T')[0])
    ]);

    const currentMap = new Map<string, BingQueryStats>();
    for (const row of currentStats) {
        currentMap.set(row.Query, row);
    }

    const lostQueries: BingLostQuery[] = [];

    for (const prev of previousStats) {
        if (prev.Clicks < 5) continue; // Ignore low volume noise

        const curr = currentMap.get(prev.Query);
        const currClicks = curr ? curr.Clicks : 0;

        // Definition of lost: >80% drop or zero
        if (currClicks === 0 || (currClicks / prev.Clicks) < 0.2) {
            lostQueries.push({
                query: prev.Query,
                previousClicks: prev.Clicks,
                previousImpressions: prev.Impressions,
                previousPosition: prev.AvgPosition,
                currentClicks: currClicks,
                currentImpressions: curr ? curr.Impressions : 0,
                currentPosition: curr ? curr.AvgPosition : 0,
                lostClicks: prev.Clicks - currClicks
            });
        }
    }

    return lostQueries
        .sort((a, b) => b.lostClicks - a.lostClicks)
        .slice(0, limit);
}

/**
 * Segment search performance into Brand and Non-Brand categories.
 */
export async function analyzeBrandVsNonBrand(
    siteUrl: string,
    brandRegexString: string,
    options: { days?: number } = {}
): Promise<BingBrandVsNonBrandMetrics[]> {
    const { days = 28 } = options;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const rows = await getQueryStats(siteUrl, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);

    const queries = rows.map(r => r.Query);
    const isBrandResults = safeTestBatch(brandRegexString, 'i', queries);

    const brandStats = { clicks: 0, impressions: 0, weightedPos: 0, queryCount: 0 };
    const nonBrandStats = { clicks: 0, impressions: 0, weightedPos: 0, queryCount: 0 };

    rows.forEach((row, index) => {
        const isBrand = isBrandResults[index];
        const stats = isBrand ? brandStats : nonBrandStats;

        stats.clicks += row.Clicks;
        stats.impressions += row.Impressions;
        stats.weightedPos += row.AvgPosition * row.Impressions;
        stats.queryCount++;
    });

    const calc = (stats: typeof brandStats, segment: 'Brand' | 'Non-Brand'): BingBrandVsNonBrandMetrics => ({
        segment,
        clicks: stats.clicks,
        impressions: stats.impressions,
        ctr: stats.impressions > 0 ? stats.clicks / stats.impressions : 0,
        position: stats.impressions > 0 ? stats.weightedPos / stats.impressions : 0,
        queryCount: stats.queryCount
    });

    return [
        calc(brandStats, 'Brand'),
        calc(nonBrandStats, 'Non-Brand')
    ];
}

/**
 * Generate prioritized Bing SEO recommendations.
 */
export async function generateRecommendations(
    siteUrl: string,
    options: { days?: number } = {}
): Promise<BingSEOInsight[]> {
    const { days = 28 } = options;
    const insights: BingSEOInsight[] = [];

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const sDate = startDate.toISOString().split('T')[0];
    const eDate = endDate.toISOString().split('T')[0];

    const [queryStats, queryPageStats] = await Promise.all([
        getQueryStats(siteUrl, sDate, eDate),
        getQueryPageStats(siteUrl, sDate, eDate)
    ]);

    const [lowHangingFruit, strikingDistance, lowCTR, cannibalization] = await Promise.all([
        findLowHangingFruit(siteUrl, { limit: 10, queryStats: queryStats }),
        findStrikingDistance(siteUrl, { limit: 10, queryStats: queryStats }),
        findLowCTROpportunities(siteUrl, { limit: 10, queryStats: queryStats }),
        detectCannibalization(siteUrl, { limit: 10, startDate: sDate, endDate: eDate }, queryPageStats)
    ]);

    if (lowHangingFruit.length > 0) {
        const totalPotential = lowHangingFruit.reduce((sum, l) => sum + l.potentialClicks, 0);
        insights.push({
            type: 'opportunity',
            category: 'Rankings',
            title: `${lowHangingFruit.length} High-Potential Bing Keywords`,
            description: `Keywords ranking 5-20 with high volume. Moving these to top 3 could add ~${totalPotential} clicks.`,
            priority: 'high',
            data: { topKeywords: lowHangingFruit.slice(0, 5).map(l => l.query) }
        });
    }

    if (lowCTR.length > 0) {
        insights.push({
            type: 'opportunity',
            category: 'CTR',
            title: `Low CTR on ${lowCTR.length} Top Bing Rankings`,
            description: `You rank on page 1 but get fewer clicks than expected. Consider improving titles and meta descriptions.`,
            priority: 'medium',
            data: { topQueries: lowCTR.slice(0, 5).map(q => q.Query) }
        });
    }

    if (cannibalization.length > 0) {
        insights.push({
            type: 'warning',
            category: 'Content',
            title: `${cannibalization.length} Bing Cannibalization Issues`,
            description: `Multiple pages are competing for the same keywords in Bing. Consider consolidating content.`,
            priority: 'medium',
            data: { topIssues: cannibalization.slice(0, 3).map(c => c.query) }
        });
    }

    if (strikingDistance.length > 0) {
        insights.push({
            type: 'opportunity',
            category: 'Quick Wins',
            title: `${strikingDistance.length} Keywords near Bing Page 1`,
            description: `Keywords ranking 8-15. A small boost could move these into high-visibility positions.`,
            priority: 'medium',
            data: { queries: strikingDistance.slice(0, 5).map(q => q.Query) }
        });
    }

    const order = { high: 0, medium: 1, low: 2 };
    return insights.sort((a, b) => order[a.priority] - order[b.priority]);
}
