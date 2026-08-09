import { getBingClient, BingQueryStats, BingPageStats, BingQueryPageStats, BingRankAndTrafficStats } from '../client.js';
import { parseMicrosoftDate, startOfDay, endOfDay } from '../../common/utils/dates.js';
import { limitConcurrency } from '../../common/concurrency.js';

/**
 * Get query performance stats for a Bing site with optional date filtering.
 */
export async function getQueryStats(
    siteUrl: string,
    startDate?: string,
    endDate?: string
): Promise<BingQueryStats[]> {
    const client = await getBingClient(siteUrl);
    const stats = await client.getQueryStats(siteUrl);

    if (!startDate && !endDate) return stats;

    const start = startDate ? startOfDay(new Date(startDate)) : new Date(0);
    const end = endDate ? endOfDay(new Date(endDate)) : new Date();

    return stats.filter(row => {
        const d = parseMicrosoftDate(row.Date);
        return d >= start && d <= end;
    });
}

/**
 * Get page performance stats (top pages) for a Bing site with optional date filtering.
 */
export async function getPageStats(
    siteUrl: string,
    startDate?: string,
    endDate?: string
): Promise<BingPageStats[]> {
    const client = await getBingClient(siteUrl);
    const stats = await client.getPageStats(siteUrl);

    if (!startDate && !endDate) return stats;

    const start = startDate ? startOfDay(new Date(startDate)) : new Date(0);
    const end = endDate ? endOfDay(new Date(endDate)) : new Date();

    return stats.filter(row => {
        const d = parseMicrosoftDate(row.Date);
        return d >= start && d <= end;
    });
}

/**
 * Get query stats for a specific page on a Bing site with optional date filtering.
 */
export async function getPageQueryStats(
    siteUrl: string,
    pageUrl: string,
    startDate?: string,
    endDate?: string
): Promise<BingQueryStats[]> {
    const client = await getBingClient(siteUrl);
    const stats = await client.getPageQueryStats(siteUrl, pageUrl);

    if (!startDate && !endDate) return stats;

    const start = startDate ? startOfDay(new Date(startDate)) : new Date(0);
    const end = endDate ? endOfDay(new Date(endDate)) : new Date();

    return stats.filter(row => {
        const d = parseMicrosoftDate(row.Date);
        return d >= start && d <= end;
    });
}

/**
 * Get combined query and page performance stats with optional date filtering.
 */
export async function getQueryPageStats(
    siteUrl: string,
    startDate?: string,
    endDate?: string
): Promise<BingQueryPageStats[]> {
    const client = await getBingClient(siteUrl);
    let stats = await client.getQueryPageStats(siteUrl).catch(() => []);

    // Fallback: If site-level GetQueryPageStats returns 0 items, aggregate top pages via getPageStats + getPageQueryStats
    if (stats.length === 0) {
        const topPages = await client.getPageStats(siteUrl).catch(() => []);
        const fallbackStats: BingQueryPageStats[] = [];
        const pagesToFetch = topPages.slice(0, 15);
        await limitConcurrency(pagesToFetch, 5, async (pRow: any) => {
            const pageUrl = pRow.Query || pRow.Page || pRow.url || pRow.Url;
            if (!pageUrl) return;
            try {
                const qStats = await client.getPageQueryStats(siteUrl, pageUrl);
                for (const q of qStats) {
                    fallbackStats.push({
                        Query: q.Query,
                        Page: pageUrl,
                        Clicks: q.Clicks,
                        Impressions: q.Impressions,
                        Date: q.Date,
                        AvgPosition: q.AvgPosition
                    } as any);
                }
            } catch {
                // Ignore individual page query errors
            }
        });
        stats = fallbackStats;
    }

    if (!startDate && !endDate) return stats;

    const start = startDate ? startOfDay(new Date(startDate)) : new Date(0);
    const end = endDate ? endOfDay(new Date(endDate)) : new Date();

    return stats.filter(row => {
        if (!row.Date) return true;
        const d = parseMicrosoftDate(row.Date);
        return d >= start && d <= end;
    });
}

/**
 * Get historical rank and traffic statistics for a site.
 */
export async function getRankAndTrafficStats(siteUrl: string): Promise<BingRankAndTrafficStats[]> {
    const client = await getBingClient(siteUrl);
    return client.getRankAndTrafficStats(siteUrl);
}

/**
 * Aggregate performance metrics for a specific site and period.
 */
export interface PerformanceSummary {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    startDate: string;
    endDate: string;
}

/**
 * Result of comparing performance between two date ranges.
 */
export interface PeriodComparison {
    period1: PerformanceSummary;
    period2: PerformanceSummary;
    changes: {
        clicks: number;
        clicksPercent: number;
        impressions: number;
        impressionsPercent: number;
        ctr: number;
        ctrPercent: number;
        position: number;
        positionPercent: number;
    };
}

/**
 * Compare performance between two date ranges.
 */
export async function comparePeriods(
    siteUrl: string,
    startDate1: string,
    endDate1: string,
    startDate2: string,
    endDate2: string
): Promise<PeriodComparison> {
    const stats = await getRankAndTrafficStats(siteUrl);

    const getSummary = (start: string, end: string): PerformanceSummary => {
        const s = startOfDay(new Date(start));
        const e = endOfDay(new Date(end));
        const filtered = stats.filter((row: BingRankAndTrafficStats) => {
            const d = parseMicrosoftDate(row.Date);
            return d >= s && d <= e;
        });

        const clicks = filtered.reduce((acc: number, row: BingRankAndTrafficStats) => acc + row.Clicks, 0);
        const impressions = filtered.reduce((acc: number, row: BingRankAndTrafficStats) => acc + row.Impressions, 0);
        const weightedPosSum = filtered.reduce((acc: number, row: BingRankAndTrafficStats) => acc + (row.AvgPosition * row.Impressions), 0);
        const avgPos = impressions > 0 ? weightedPosSum / impressions : 0;

        return {
            clicks,
            impressions,
            ctr: impressions > 0 ? clicks / impressions : 0,
            position: parseFloat(avgPos.toFixed(2)),
            startDate: start,
            endDate: end
        };
    };

    const p1 = getSummary(startDate1, endDate1);
    const p2 = getSummary(startDate2, endDate2);

    const calcChange = (current: number, previous: number) => ({
        diff: current - previous,
        percent: previous > 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0)
    });

    const clickChange = calcChange(p1.clicks, p2.clicks);
    const impChange = calcChange(p1.impressions, p2.impressions);
    const ctrChange = calcChange(p1.ctr, p2.ctr);
    const posChange = {
        diff: p1.position - p2.position,
        percent: p2.position > 0 ? ((p1.position - p2.position) / p2.position) * 100 : 0
    };

    return {
        period1: p1,
        period2: p2,
        changes: {
            clicks: clickChange.diff,
            clicksPercent: clickChange.percent,
            impressions: impChange.diff,
            impressionsPercent: impChange.percent,
            ctr: ctrChange.diff,
            ctrPercent: ctrChange.percent,
            position: posChange.diff,
            positionPercent: posChange.percent
        }
    };
}

export interface BingAnomaly {
    date: string;
    type: 'drop' | 'spike';
    metric: 'clicks';
    value: number;
    previousValue: number;
    changePercent: number;
}

/**
 * Detect performance anomalies (sharp drops or spikes).
 */
export async function detectAnomalies(
    siteUrl: string,
    options: { days?: number; threshold?: number } = {}
): Promise<BingAnomaly[]> {
    const days = options.days || 14;
    const threshold = options.threshold || 1.5;
    const stats = await getRankAndTrafficStats(siteUrl);

    // Sort by date ascending
    const sorted = [...stats].sort((a, b) => parseMicrosoftDate(a.Date).getTime() - parseMicrosoftDate(b.Date).getTime());
    if (sorted.length < 5) return [];

    const anomalies: BingAnomaly[] = [];
    const recent = sorted.slice(-days);

    for (let i = 1; i < recent.length; i++) {
        const prev = recent[i - 1];
        const curr = recent[i];

        if (prev.Clicks > 10) {
            const drop = (curr.Clicks - prev.Clicks) / prev.Clicks;
            if (drop <= -threshold / 10 || drop >= threshold / 10) {
                anomalies.push({
                    date: curr.Date,
                    type: drop < 0 ? 'drop' : 'spike',
                    metric: 'clicks',
                    value: curr.Clicks,
                    previousValue: prev.Clicks,
                    changePercent: drop * 100
                });
            }
        }
    }

    return anomalies;
}

/**
 * Get aggregate performance summary for a Bing site for the last N days.
 */
export async function getPerformanceSummary(siteUrl: string, days = 28): Promise<PerformanceSummary> {
    const stats = await getRankAndTrafficStats(siteUrl);

    // Bing typically has historical data; filter for last N days
    const endDate = endOfDay(new Date());
    const startDate = startOfDay(new Date());
    startDate.setDate(endDate.getDate() - days);

    const filtered = stats.filter((row: BingRankAndTrafficStats) => {
        const d = parseMicrosoftDate(row.Date);
        return d >= startDate && d <= endDate;
    });

    const clicks = filtered.reduce((acc: number, row: BingRankAndTrafficStats) => acc + row.Clicks, 0);
    const impressions = filtered.reduce((acc: number, row: BingRankAndTrafficStats) => acc + row.Impressions, 0);
    const weightedPosSum = filtered.reduce((acc: number, row: BingRankAndTrafficStats) => acc + (row.AvgPosition * row.Impressions), 0);
    const avgPos = impressions > 0 ? weightedPosSum / impressions : 0;

    return {
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position: parseFloat(avgPos.toFixed(2)),
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
    };
}

export interface BingTrendItem {
    key: string;
    metric: 'clicks' | 'impressions';
    change: number;
    changePercent: number;
    trend: 'rising' | 'declining';
    currentValue: number;
    previousValue: number;
}

/**
 * Detect rising or declining trends in Bing query performance.
 *
 * @param siteUrl - The URL of the site to analyze.
 * @param options - Configuration including lookback period and click thresholds.
 * @returns A list of queries showing significant momentum.
 */
export async function detectTrends(
    siteUrl: string,
    options: {
        days?: number;
        threshold?: number;
        minClicks?: number;
        limit?: number;
    } = {}
): Promise<BingTrendItem[]> {
    const days = options.days || 28;
    const threshold = options.threshold || 10;
    const minClicks = options.minClicks || 100;
    const limit = options.limit || 20;

    const midPoint = Math.floor(days / 2);

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2); // Data delay

    const currentEndDate = new Date(endDate);

    const currentStartDate = new Date(currentEndDate);
    currentStartDate.setDate(currentStartDate.getDate() - midPoint + 1);

    const previousEndDate = new Date(currentStartDate);
    previousEndDate.setDate(previousEndDate.getDate() - 1);

    const previousStartDate = new Date(previousEndDate);
    previousStartDate.setDate(previousStartDate.getDate() - midPoint + 1);

    const allStats = await getQueryStats(siteUrl);

    const filterStats = (start: Date, end: Date) => {
        const map = new Map<string, number>();
        allStats.forEach(stat => {
            const d = parseMicrosoftDate(stat.Date);
            if (d >= start && d <= end) {
                map.set(stat.Query, (map.get(stat.Query) || 0) + stat.Clicks);
            }
        });
        return map;
    };

    const currentMap = filterStats(currentStartDate, currentEndDate);
    const previousMap = filterStats(previousStartDate, previousEndDate);

    const trends: BingTrendItem[] = [];

    for (const [query, currClicks] of currentMap.entries()) {
        const prevClicks = previousMap.get(query) || 0;

        if (currClicks < minClicks && prevClicks < minClicks) continue;

        if (prevClicks > 0) {
            const change = currClicks - prevClicks;
            const percent = (change / prevClicks) * 100;

            if (Math.abs(percent) >= threshold) {
                trends.push({
                    key: query,
                    metric: 'clicks',
                    change,
                    changePercent: parseFloat(percent.toFixed(2)),
                    trend: percent > 0 ? 'rising' : 'declining',
                    currentValue: currClicks,
                    previousValue: prevClicks
                });
            }
        } else if (currClicks >= minClicks) {
            // Zero to Hero
            trends.push({
                key: query,
                metric: 'clicks',
                change: currClicks,
                changePercent: 100,
                trend: 'rising',
                currentValue: currClicks,
                previousValue: 0
            });
        }
    }

    // Also check for queries that dropped to zero
    for (const [query, prevClicks] of previousMap.entries()) {
        if (!currentMap.has(query) && prevClicks >= minClicks) {
            trends.push({
                key: query,
                metric: 'clicks',
                change: -prevClicks,
                changePercent: -100,
                trend: 'declining',
                currentValue: 0,
                previousValue: prevClicks
            });
        }
    }

    return trends
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        .slice(0, limit);
}
