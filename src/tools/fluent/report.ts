import { buildKeywordReport } from '../../seo/aggregate.js';
import { query } from '../../store/db.js';

/**
 * keyword_report: the aggregated candidate list for a site, from every source,
 * for a human to pick targets from.
 */
export async function keywordReportHandler(args: {
    siteUrl: string;
    days?: number;
    minImpressions?: number;
    limit?: number;
    persist?: boolean;
}) {
    const report = await buildKeywordReport({ ...args, persist: args.persist ?? true });
    return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
}

/**
 * keyword_decide: record the decision on candidates — what we are shooting for.
 */
export async function keywordDecideHandler(args: {
    siteUrl: string;
    keywords: string[];
    decision: 'targeted' | 'rejected' | 'pending';
    targetPage?: string;
    targetPosition?: number;
    priority?: number;
    notes?: string;
}) {
    const results: unknown[] = [];
    for (const raw of args.keywords) {
        const keyword = raw.toLowerCase().trim();
        await query(
            `UPDATE keyword_candidate SET status = $3 WHERE site_url = $1 AND keyword = $2`,
            [args.siteUrl, keyword, args.decision]
        );

        if (args.decision === 'targeted') {
            await query(
                `INSERT INTO keyword_target (site_url, keyword, target_page, target_position, priority, notes)
                 VALUES ($1,$2,$3,$4,$5,$6)
                 ON CONFLICT (site_url, keyword) DO UPDATE SET
                   target_page = COALESCE(EXCLUDED.target_page, keyword_target.target_page),
                   target_position = EXCLUDED.target_position,
                   priority = EXCLUDED.priority,
                   notes = COALESCE(EXCLUDED.notes, keyword_target.notes),
                   status = 'active'`,
                [args.siteUrl, keyword, args.targetPage ?? null, args.targetPosition ?? 5,
                 args.priority ?? 3, args.notes ?? null]
            );
        } else {
            await query(`DELETE FROM keyword_target WHERE site_url = $1 AND keyword = $2`, [args.siteUrl, keyword]);
        }
        results.push({ keyword, decision: args.decision });
    }

    // Targeted keywords drive the SERP sync, so keep trackedQueries in step.
    const targets = await query<{ keyword: string }>(
        `SELECT keyword FROM keyword_target WHERE site_url = $1 AND status = 'active' ORDER BY priority, keyword`,
        [args.siteUrl]
    );
    await query(
        `UPDATE site_profile SET tracked_queries = $2::jsonb, updated_at = now() WHERE site_url = $1`,
        [args.siteUrl, JSON.stringify(targets.map((t) => t.keyword))]
    );

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                updated: results,
                activeTargets: targets.length,
                note: 'Targeted keywords are now tracked_queries, so the nightly SERP sync will collect competitor positions for them.',
            }, null, 2),
        }],
    };
}
