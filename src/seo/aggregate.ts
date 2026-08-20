/**
 * Aggregate keyword candidates from every source into one reviewable report.
 *
 * The point of keeping provenance is that agreement between independent sources
 * is itself evidence. A term the business genuinely offers (profile) AND that
 * Google already shows us for (Search Console) is a far safer bet than either
 * signal alone: one proves relevance, the other proves demand exists.
 */
import { query } from '../store/db.js';
import { getProfile, type SiteProfile } from '../store/profiles.js';
import { mineCandidates, archiveSpan, archiveNotes, type ArchiveSpan, type Candidate } from './candidates.js';
import { generateFromProfile, type ProfileKeyword } from './profile-keywords.js';

export type Source = 'gsc' | 'profile' | 'serper' | 'ads' | 'manual';

export interface AggregatedKeyword {
    keyword: string;
    sources: Source[];
    /** Combined 0-100. Corroboration across sources is rewarded. */
    score: number;
    /** Measured, from Search Console. Null when we have never appeared. */
    impressions: number | null;
    position: number | null;
    clickUpside: number | null;
    opportunity: string | null;
    /** Structural, from the business profile. */
    pattern: string | null;
    service: string | null;
    location: string | null;
    intent: string | null;
    /** Page Google currently associates with the term, if any. */
    page: string | null;
    status: string;
    rationale: string;
}

export interface ReportOptions {
    siteUrl: string;
    days?: number;
    minImpressions?: number;
    limit?: number;
    /** Persist candidates so decisions can be recorded against them. */
    persist?: boolean;
}

export interface KeywordReport {
    siteUrl: string;
    customer: string | null;
    profileReviewed: boolean;
    archive: ArchiveSpan;
    counts: Record<string, number>;
    keywords: AggregatedKeyword[];
    gaps: string[];
    notes: string[];
}

function norm(keyword: string): string {
    return keyword.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Build the aggregated candidate report for a site.
 */
export async function buildKeywordReport(opts: ReportOptions): Promise<KeywordReport> {
    const profile = await getProfile(opts.siteUrl);
    if (!profile) throw new Error(`No site profile for ${opts.siteUrl}.`);

    const notes: string[] = [];
    const days = opts.days ?? 90;

    const [measured, span] = await Promise.all([
        mineCandidates({ siteUrl: opts.siteUrl, days, minImpressions: opts.minImpressions ?? 5, limit: 500 }),
        archiveSpan(opts.siteUrl),
    ]);

    notes.push(...archiveNotes(span, days));

    let structural: ProfileKeyword[] = [];
    if (profile.profileReviewedAt) {
        structural = generateFromProfile(profile);
    } else {
        notes.push(
            'Business profile is not reviewed, so no profile-derived candidates were generated. ' +
            'Only terms the site already appears for are listed — which cannot surface a service ' +
            'it sells but has never ranked for.'
        );
    }

    const byKeyword = new Map<string, AggregatedKeyword>();

    for (const c of measured) {
        byKeyword.set(norm(c.query), {
            keyword: norm(c.query),
            sources: ['gsc'],
            score: c.score,
            impressions: c.impressions,
            position: c.position,
            clickUpside: c.clickUpside,
            opportunity: c.opportunity,
            pattern: null, service: null, location: null, intent: null,
            page: c.page,
            status: 'pending',
            rationale: c.reason,
        });
    }

    for (const p of structural) {
        const key = norm(p.keyword);
        const existing = byKeyword.get(key);
        if (existing) {
            // Corroborated: the business offers it AND Google already shows us.
            existing.sources.push('profile');
            existing.pattern = p.pattern;
            existing.service = p.service ?? null;
            existing.location = p.location ?? null;
            existing.intent = p.intent;
            existing.score = Math.min(100, existing.score + 15);
            existing.rationale +=
                ` Corroborated: this is a service the business actually offers (${p.pattern}), so relevance is not in doubt.`;
        } else {
            byKeyword.set(key, {
                keyword: key,
                sources: ['profile'],
                // Structural confidence is worth less than measured demand,
                // because nothing here proves anyone searches for it.
                score: Math.round(p.confidence * 0.6),
                impressions: null, position: null, clickUpside: null, opportunity: null,
                pattern: p.pattern,
                service: p.service ?? null,
                location: p.location ?? null,
                intent: p.intent,
                page: null,
                status: 'pending',
                rationale:
                    `Offered by the business (${p.pattern}) but no Search Console impressions in the last ${days} days — ` +
                    'either nobody searches it, or we are invisible for it. Needs volume data or a SERP check to tell those apart.',
            });
        }
    }

    const keywords = [...byKeyword.values()]
        .sort((a, b) =>
            b.sources.length - a.sources.length ||
            b.score - a.score ||
            (b.clickUpside ?? 0) - (a.clickUpside ?? 0))
        .slice(0, opts.limit ?? 150);

    if (opts.persist) {
        for (const k of keywords) {
            for (const source of k.sources) {
                await query(
                    `INSERT INTO keyword_candidate
                       (site_url, keyword, source, opportunity, impressions, position,
                        score, click_upside, rationale, last_seen)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
                     ON CONFLICT (site_url, keyword, source) DO UPDATE SET
                       opportunity = EXCLUDED.opportunity,
                       impressions = EXCLUDED.impressions,
                       position = EXCLUDED.position,
                       score = EXCLUDED.score,
                       click_upside = EXCLUDED.click_upside,
                       rationale = EXCLUDED.rationale,
                       last_seen = now()`,
                    [opts.siteUrl, k.keyword, source, k.opportunity, k.impressions,
                     k.position, k.score, k.clickUpside, k.rationale]
                );
            }
        }
        // Carry forward any decision already recorded.
        const decided = await query<{ keyword: string; status: string }>(
            `SELECT DISTINCT keyword, status FROM keyword_candidate
              WHERE site_url = $1 AND status <> 'pending'`,
            [opts.siteUrl]
        );
        const statuses = new Map(decided.map((d) => [d.keyword, d.status]));
        for (const k of keywords) k.status = statuses.get(k.keyword) ?? 'pending';
    }

    // Coverage gaps: services with no measured demand at all.
    const gaps: string[] = [];
    for (const service of profile.services) {
        const words = service.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const hit = measured.some((m) => words.some((w) => m.query.toLowerCase().includes(w)));
        if (!hit) gaps.push(service);
    }

    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
        notes.push(
            'No Google Ads volume: profile-derived terms carry no demand estimate, so they cannot ' +
            'be ranked against measured ones. Treat their order as structural confidence only.'
        );
    }

    const counts: Record<string, number> = {
        total: keywords.length,
        measured: keywords.filter((k) => k.sources.includes('gsc')).length,
        structural: keywords.filter((k) => k.sources.includes('profile')).length,
        corroborated: keywords.filter((k) => k.sources.length > 1).length,
    };

    return {
        siteUrl: opts.siteUrl,
        customer: profile.customer ?? null,
        profileReviewed: !!profile.profileReviewedAt,
        archive: span,
        counts,
        keywords,
        gaps,
        notes,
    };
}

export type { Candidate, SiteProfile };
