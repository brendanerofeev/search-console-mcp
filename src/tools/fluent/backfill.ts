import { backfillRankHistory } from '../../store/backfill.js';

/** rank_backfill: recover a property's full available Search Console history. */
export async function rankBackfillHandler(args: {
    siteUrl: string;
    chunkDays?: number;
    force?: boolean;
    maxDays?: number;
}) {
    const r = await backfillRankHistory(args.siteUrl, args);
    return { content: [{ type: 'text' as const, text: JSON.stringify(r, null, 2) }] };
}
