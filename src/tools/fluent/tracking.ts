import { getDb } from '../../store/db.js';
import { syncAll, getSyncState } from '../../store/sync.js';

/**
 * sync_run: collect data into the local store. This is what the scheduled job calls.
 */
export async function syncRunHandler(args: {
    siteUrl?: string;
    tasks?: ('rank' | 'sitemap' | 'index' | 'serp')[];
    rankDays?: number;
    inspectionBudget?: number;
}) {
    const results = await syncAll(args);
    const failed = results.filter((r) => !r.ok);
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    {
                        ranAt: new Date().toISOString(),
                        sites: new Set(results.map((r) => r.siteUrl)).size,
                        ok: results.length - failed.length,
                        failed: failed.length,
                        results,
                    },
                    null,
                    2
                ),
            },
        ],
    };
}

/**
 * index_coverage: indexed vs not, answered from the cache rather than by
 * spending URL Inspection quota.
 */
export async function indexCoverageHandler(args: {
    siteUrl: string;
    state?: string;
    listUrls?: boolean;
    limit?: number;
}) {
    const db = getDb();
    const { siteUrl } = args;

    const discovered = (db
        .prepare('SELECT COUNT(*) c FROM url_discovery WHERE site_url = ?')
        .get(siteUrl) as { c: number }).c;
    const inspected = (db
        .prepare('SELECT COUNT(*) c FROM url_status WHERE site_url = ?')
        .get(siteUrl) as { c: number }).c;

    const byState = db
        .prepare(
            `SELECT verdict, coverage_state, COUNT(*) count
               FROM url_status WHERE site_url = ?
              GROUP BY verdict, coverage_state ORDER BY count DESC`
        )
        .all(siteUrl);

    // Discovered but never inspected — unknown, not "not indexed".
    const notInspected = (db
        .prepare(
            `SELECT COUNT(*) c FROM url_discovery d
              WHERE d.site_url = ?
                AND NOT EXISTS (SELECT 1 FROM url_status s WHERE s.site_url = d.site_url AND s.url = d.url)`
        )
        .get(siteUrl) as { c: number }).c;

    const indexed = (db
        .prepare("SELECT COUNT(*) c FROM url_status WHERE site_url = ? AND verdict = 'PASS'")
        .get(siteUrl) as { c: number }).c;

    const payload: Record<string, unknown> = {
        siteUrl,
        discovered,
        inspected,
        notYetInspected: notInspected,
        indexed,
        notIndexed: inspected - indexed,
        byState,
        lastSync: getSyncState(`rank:${siteUrl}`) ?? null,
    };

    if (args.listUrls) {
        const limit = args.limit ?? 100;
        payload.urls = args.state
            ? db
                  .prepare(
                      `SELECT url, verdict, coverage_state, last_crawl_time, inspected_at
                         FROM url_status WHERE site_url = ? AND coverage_state = ?
                        ORDER BY url LIMIT ?`
                  )
                  .all(siteUrl, args.state, limit)
            : db
                  .prepare(
                      `SELECT url, verdict, coverage_state, last_crawl_time, inspected_at
                         FROM url_status WHERE site_url = ? AND verdict IS NOT 'PASS'
                        ORDER BY url LIMIT ?`
                  )
                  .all(siteUrl, limit);
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

/**
 * rank_history: position over time from our own archive, which outlives Google's
 * rolling window. Reports movement between the first and last day in range.
 */
export async function rankHistoryHandler(args: {
    siteUrl: string;
    query?: string;
    page?: string;
    days?: number;
    mode?: 'series' | 'movers';
    limit?: number;
    minImpressions?: number;
}) {
    const db = getDb();
    const days = args.days ?? 90;
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const mode = args.mode ?? (args.query ? 'series' : 'movers');

    if (mode === 'series') {
        if (!args.query) throw new Error("mode 'series' requires a query.");
        const rows = db
            .prepare(
                `SELECT date,
                        SUM(clicks) clicks,
                        SUM(impressions) impressions,
                        -- Impression-weighted so a page with 1 impression cannot
                        -- swing the day's reported position.
                        CASE WHEN SUM(impressions) > 0
                             THEN SUM(position * impressions) / SUM(impressions)
                             ELSE AVG(position) END AS position
                   FROM rank_daily
                  WHERE site_url = @site AND query = @query AND date >= @since
                    ${args.page ? 'AND page = @page' : ''}
                  GROUP BY date ORDER BY date`
            )
            .all({ site: args.siteUrl, query: args.query, since, page: args.page }) as any[];

        const first = rows[0];
        const last = rows[rows.length - 1];
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(
                        {
                            siteUrl: args.siteUrl,
                            query: args.query,
                            days,
                            points: rows.length,
                            // Positions are "lower is better", so improvement is a decrease.
                            movement: first && last ? Number((first.position - last.position).toFixed(2)) : null,
                            from: first ? { date: first.date, position: Number(first.position.toFixed(1)) } : null,
                            to: last ? { date: last.date, position: Number(last.position.toFixed(1)) } : null,
                            series: rows.map((r) => ({
                                date: r.date,
                                position: Number(r.position.toFixed(1)),
                                clicks: r.clicks,
                                impressions: r.impressions,
                            })),
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    // movers: compare the two halves of the window.
    const mid = new Date(Date.now() - (days / 2) * 86_400_000).toISOString().slice(0, 10);
    const rows = db
        .prepare(
            `SELECT query,
                    SUM(CASE WHEN date <  @mid THEN impressions ELSE 0 END) AS impr_before,
                    SUM(CASE WHEN date >= @mid THEN impressions ELSE 0 END) AS impr_after,
                    CASE WHEN SUM(CASE WHEN date <  @mid THEN impressions ELSE 0 END) > 0
                         THEN SUM(CASE WHEN date <  @mid THEN position * impressions ELSE 0 END)
                            / SUM(CASE WHEN date <  @mid THEN impressions ELSE 0 END) END AS pos_before,
                    CASE WHEN SUM(CASE WHEN date >= @mid THEN impressions ELSE 0 END) > 0
                         THEN SUM(CASE WHEN date >= @mid THEN position * impressions ELSE 0 END)
                            / SUM(CASE WHEN date >= @mid THEN impressions ELSE 0 END) END AS pos_after
               FROM rank_daily
              WHERE site_url = @site AND date >= @since
              GROUP BY query
             HAVING pos_before IS NOT NULL AND pos_after IS NOT NULL
                AND (impr_before + impr_after) >= @minImpr
              ORDER BY (pos_before - pos_after) DESC`
        )
        .all({
            site: args.siteUrl,
            since,
            mid,
            minImpr: args.minImpressions ?? 10,
        }) as any[];

    const shape = (r: any) => ({
        query: r.query,
        positionBefore: Number(r.pos_before.toFixed(1)),
        positionAfter: Number(r.pos_after.toFixed(1)),
        movement: Number((r.pos_before - r.pos_after).toFixed(1)),
        impressions: r.impr_before + r.impr_after,
    });
    const limit = args.limit ?? 20;

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    {
                        siteUrl: args.siteUrl,
                        days,
                        comparedAt: mid,
                        note: 'Positive movement = climbing (position number decreased).',
                        climbers: rows.filter((r) => r.pos_before > r.pos_after).slice(0, limit).map(shape),
                        fallers: rows.filter((r) => r.pos_before < r.pos_after).slice(-limit).reverse().map(shape),
                    },
                    null,
                    2
                ),
            },
        ],
    };
}
