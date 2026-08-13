import { query } from '../../store/db.js';
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
    const { siteUrl } = args;

    const [totals] = await query<{
        discovered: string;
        inspected: string;
        indexed: string;
        not_inspected: string;
    }>(
        `SELECT
           (SELECT COUNT(*) FROM url_discovery WHERE site_url = $1) AS discovered,
           (SELECT COUNT(*) FROM url_status    WHERE site_url = $1) AS inspected,
           (SELECT COUNT(*) FROM url_status    WHERE site_url = $1 AND verdict = 'PASS') AS indexed,
           -- Discovered but never inspected is "unknown", not "not indexed".
           (SELECT COUNT(*) FROM url_discovery d
             WHERE d.site_url = $1
               AND NOT EXISTS (SELECT 1 FROM url_status s WHERE s.site_url = d.site_url AND s.url = d.url)
           ) AS not_inspected`,
        [siteUrl]
    );

    const byState = await query(
        `SELECT verdict, coverage_state, COUNT(*)::int AS count
           FROM url_status WHERE site_url = $1
          GROUP BY verdict, coverage_state ORDER BY count DESC`,
        [siteUrl]
    );

    const inspected = Number(totals?.inspected ?? 0);
    const indexed = Number(totals?.indexed ?? 0);

    const payload: Record<string, unknown> = {
        siteUrl,
        discovered: Number(totals?.discovered ?? 0),
        inspected,
        notYetInspected: Number(totals?.not_inspected ?? 0),
        indexed,
        notIndexed: inspected - indexed,
        byState,
        lastSync: (await getSyncState(`rank:${siteUrl}`)) ?? null,
    };

    if (args.listUrls) {
        const limit = args.limit ?? 100;
        payload.urls = args.state
            ? await query(
                  `SELECT url, verdict, coverage_state, last_crawl_time, inspected_at
                     FROM url_status WHERE site_url = $1 AND coverage_state = $2
                    ORDER BY url LIMIT $3`,
                  [siteUrl, args.state, limit]
              )
            : await query(
                  `SELECT url, verdict, coverage_state, last_crawl_time, inspected_at
                     FROM url_status WHERE site_url = $1 AND verdict IS DISTINCT FROM 'PASS'
                    ORDER BY url LIMIT $2`,
                  [siteUrl, limit]
              );
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
    const days = args.days ?? 90;
    const mode = args.mode ?? (args.query ? 'series' : 'movers');

    if (mode === 'series') {
        if (!args.query) throw new Error("mode 'series' requires a query.");
        const rows = await query<{ date: Date; clicks: number; impressions: number; position: number }>(
            `SELECT date,
                    SUM(clicks)      AS clicks,
                    SUM(impressions) AS impressions,
                    -- Impression-weighted so a page with 1 impression cannot
                    -- swing the day's reported position.
                    CASE WHEN SUM(impressions) > 0
                         THEN SUM(position * impressions) / SUM(impressions)
                         ELSE AVG(position) END AS position
               FROM rank_daily
              WHERE site_url = $1 AND query = $2
                AND date >= (CURRENT_DATE - ($3 || ' days')::interval)
                ${args.page ? 'AND page = $4' : ''}
              GROUP BY date ORDER BY date`,
            args.page
                ? [args.siteUrl, args.query, String(days), args.page]
                : [args.siteUrl, args.query, String(days)]
        );

        const shape = (r: (typeof rows)[number]) => ({
            date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
            position: Number(Number(r.position).toFixed(1)),
            clicks: Number(r.clicks),
            impressions: Number(r.impressions),
        });
        const series = rows.map(shape);
        const first = series[0];
        const last = series[series.length - 1];

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(
                        {
                            siteUrl: args.siteUrl,
                            query: args.query,
                            days,
                            points: series.length,
                            // Positions are "lower is better", so improvement is a decrease.
                            movement: first && last ? Number((first.position - last.position).toFixed(2)) : null,
                            from: first ?? null,
                            to: last ?? null,
                            series,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    // movers: compare the two halves of the window.
    const rows = await query<{
        query: string;
        impr_before: number;
        impr_after: number;
        pos_before: number;
        pos_after: number;
    }>(
        // The midpoint is derived from the data actually present rather than the
        // requested window: splitting a 90-day window at day 45 when the archive
        // only holds 11 days puts every row on one side, so nothing ever moves.
        `WITH bounds AS (
           SELECT (CURRENT_DATE - ($2 || ' days')::interval)::date AS since,
                  (SELECT MIN(date) + ((MAX(date) - MIN(date)) / 2)
                     FROM rank_daily
                    WHERE site_url = $1
                      AND date >= (CURRENT_DATE - ($2 || ' days')::interval)::date)::date AS mid
         )
         SELECT query,
                SUM(CASE WHEN date <  b.mid THEN impressions ELSE 0 END) AS impr_before,
                SUM(CASE WHEN date >= b.mid THEN impressions ELSE 0 END) AS impr_after,
                CASE WHEN SUM(CASE WHEN date <  b.mid THEN impressions ELSE 0 END) > 0
                     THEN SUM(CASE WHEN date <  b.mid THEN position * impressions ELSE 0 END)
                        / SUM(CASE WHEN date <  b.mid THEN impressions ELSE 0 END) END AS pos_before,
                CASE WHEN SUM(CASE WHEN date >= b.mid THEN impressions ELSE 0 END) > 0
                     THEN SUM(CASE WHEN date >= b.mid THEN position * impressions ELSE 0 END)
                        / SUM(CASE WHEN date >= b.mid THEN impressions ELSE 0 END) END AS pos_after
           FROM rank_daily, bounds b
          WHERE site_url = $1 AND date >= b.since
          GROUP BY query
         HAVING SUM(CASE WHEN date <  b.mid THEN impressions ELSE 0 END) > 0
            AND SUM(CASE WHEN date >= b.mid THEN impressions ELSE 0 END) > 0
            AND SUM(impressions) >= $3`,
        [args.siteUrl, String(days), args.minImpressions ?? 10]
    );

    const shape = (r: (typeof rows)[number]) => ({
        query: r.query,
        positionBefore: Number(Number(r.pos_before).toFixed(1)),
        positionAfter: Number(Number(r.pos_after).toFixed(1)),
        movement: Number((Number(r.pos_before) - Number(r.pos_after)).toFixed(1)),
        impressions: Number(r.impr_before) + Number(r.impr_after),
    });

    const shaped = rows.map(shape).sort((a, b) => b.movement - a.movement);
    const limit = args.limit ?? 20;

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    {
                        siteUrl: args.siteUrl,
                        days,
                        note: 'Positive movement = climbing (position number decreased).',
                        climbers: shaped.filter((r) => r.movement > 0).slice(0, limit),
                        fallers: shaped.filter((r) => r.movement < 0).slice(-limit).reverse(),
                    },
                    null,
                    2
                ),
            },
        ],
    };
}
