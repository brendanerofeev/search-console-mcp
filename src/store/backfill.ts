/**
 * One-off historical backfill of rank_daily from Search Console.
 *
 * The nightly sync only ever pulls a short rolling window, which is right for
 * keeping up but means everything before we started collecting was never
 * archived — even though Google still holds it. GSC keeps roughly 16 months and
 * that window slides, so unarchived history is on a timer: what is retrievable
 * today is gone in a year.
 *
 * Chunked by month rather than requested as one span, because:
 *  - a single request caps out (25k rows/page) and a busy property over a year
 *    is far more than that, so one span means deep pagination with no progress
 *    visible and nothing salvaged if it fails halfway;
 *  - chunks make it resumable — a chunk already fully present is skipped, so
 *    re-running after a failure costs only the missing months.
 *
 * Writes are idempotent (upsert on the natural key), so overlapping runs and
 * re-runs converge rather than duplicate.
 */
import { queryAnalytics } from '../google/tools/analytics.js';
import { query, withTransaction } from './db.js';

const PAGE = 25000;
/** GSC finalises with a 2-3 day lag; asking for "today" returns empty days. */
const FINALISE_LAG_DAYS = 2;

export interface BackfillChunk {
    from: string;
    to: string;
    rows: number;
    skipped: boolean;
}

export interface BackfillResult {
    siteUrl: string;
    earliest: string | null;
    latest: string | null;
    chunks: BackfillChunk[];
    rowsWritten: number;
    daysCovered: number;
    note?: string;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Find the oldest date Search Console will still return for a property.
 *
 * Cheaper and more honest than assuming 16 months: a property created last
 * month has no data before it existed, and asking anyway just wastes calls.
 */
async function findEarliest(siteUrl: string, end: Date): Promise<string | null> {
    const probeStart = new Date(end);
    probeStart.setDate(probeStart.getDate() - 500);
    const rows = await queryAnalytics({
        siteUrl,
        startDate: fmt(probeStart),
        endDate: fmt(end),
        dimensions: ['date'],
        limit: 500,
    });
    if (!rows.length) return null;
    return rows.map((r) => r.keys?.[0]).filter(Boolean).sort()[0] as string;
}

/** Dates already in the archive for a span, so full chunks can be skipped. */
async function existingDays(siteUrl: string, from: string, to: string): Promise<number> {
    const r = await query<{ n: string }>(
        `SELECT COUNT(DISTINCT date)::text n FROM rank_daily
          WHERE site_url = $1 AND date >= $2 AND date <= $3`,
        [siteUrl, from, to]
    );
    return Number(r[0]?.n ?? 0);
}

/**
 * Backfill a property's full available Search Console history.
 *
 * @param chunkDays - Days per request window. Smaller is slower but safer on
 *   properties with heavy query/page cardinality.
 * @param force - Re-fetch chunks that already look complete.
 */
export async function backfillRankHistory(
    siteUrl: string,
    opts: { chunkDays?: number; force?: boolean; maxDays?: number } = {}
): Promise<BackfillResult> {
    const chunkDays = opts.chunkDays ?? 30;
    const end = new Date();
    end.setDate(end.getDate() - FINALISE_LAG_DAYS);

    const earliest = await findEarliest(siteUrl, end);
    if (!earliest) {
        return {
            siteUrl, earliest: null, latest: null, chunks: [], rowsWritten: 0, daysCovered: 0,
            note: 'Search Console returned no data for this property at all — nothing to backfill. ' +
                  'Expected for a property created in the last few days.',
        };
    }

    let cursor = new Date(earliest);
    if (opts.maxDays) {
        const limit = new Date(end);
        limit.setDate(limit.getDate() - opts.maxDays);
        if (limit > cursor) cursor = limit;
    }

    const chunks: BackfillChunk[] = [];
    let rowsWritten = 0;

    while (cursor <= end) {
        const chunkEnd = new Date(cursor);
        chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
        if (chunkEnd > end) chunkEnd.setTime(end.getTime());

        const from = fmt(cursor);
        const to = fmt(chunkEnd);
        const span = Math.round((chunkEnd.getTime() - cursor.getTime()) / 86400000) + 1;

        if (!opts.force) {
            const have = await existingDays(siteUrl, from, to);
            // A chunk is "done" when every day in it already has rows. Days with
            // genuinely no impressions never appear, so this can re-fetch a quiet
            // chunk — cheap, and safer than assuming a gap means complete.
            if (have >= span) {
                chunks.push({ from, to, rows: 0, skipped: true });
                cursor = new Date(chunkEnd);
                cursor.setDate(cursor.getDate() + 1);
                continue;
            }
        }

        let startRow = 0;
        let chunkRows = 0;
        for (;;) {
            const rows = await queryAnalytics({
                siteUrl,
                startDate: from,
                endDate: to,
                dimensions: ['date', 'query', 'page'],
                limit: PAGE,
                startRow,
            });
            if (!rows.length) break;

            await withTransaction(async (client) => {
                for (const r of rows) {
                    const [date, q, page] = r.keys ?? [];
                    if (!date || !q) continue;
                    await client.query(
                        `INSERT INTO rank_daily (site_url, date, query, page, clicks, impressions, ctr, position)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                         ON CONFLICT (site_url, date, query, page) DO UPDATE SET
                           clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
                           ctr = EXCLUDED.ctr, position = EXCLUDED.position`,
                        [
                            siteUrl, date, q, page ?? '',
                            Number(r.clicks ?? 0), Number(r.impressions ?? 0),
                            Number(r.ctr ?? 0), Number(r.position ?? 0),
                        ]
                    );
                    chunkRows++;
                }
            });

            if (rows.length < PAGE) break;
            startRow += PAGE;
        }

        rowsWritten += chunkRows;
        chunks.push({ from, to, rows: chunkRows, skipped: false });

        cursor = new Date(chunkEnd);
        cursor.setDate(cursor.getDate() + 1);
    }

    // `from`/`to` are reserved words; alias them to something quotable-free.
    const span = await query<{ days: string; first_day: string; last_day: string }>(
        `SELECT COUNT(DISTINCT date)::text days,
                MIN(date)::text first_day, MAX(date)::text last_day
           FROM rank_daily WHERE site_url = $1`,
        [siteUrl]
    );

    return {
        siteUrl,
        earliest,
        latest: fmt(end),
        chunks,
        rowsWritten,
        daysCovered: Number(span[0]?.days ?? 0),
        note:
            'Backfill only recovers what Search Console still holds (~16 months, and never ' +
            'before the property was created). Days with no impressions do not exist in the ' +
            'API and so will never appear in the archive.',
    };
}
