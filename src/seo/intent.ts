/**
 * SERP intent classification — the hard gate a candidate must pass to become a target.
 *
 * This exists because of a specific failure. "technology consultant" showed
 * 390 searches/month and a keyword difficulty of 0: both metrics said target it.
 * The actual SERP was PwC careers, Reddit, Seek, LinkedIn Jobs and Coursera —
 * people who want to BE a technology consultant, not hire one. Ranking #1 would
 * have produced CVs.
 *
 * Worse, the two failures correlate. DataForSEO difficulty is derived from the
 * link profiles of ranking pages, and jobs/informational pages have weak
 * profiles, so wrong intent actively LOOKS easy. Low difficulty plus wrong
 * intent will keep pairing up, which is why this gate runs BEFORE difficulty is
 * considered rather than as one score among several.
 *
 * Deliberately a gate, not a weight: a keyword with no buyers is not a weak
 * target, it is not a target. Scoring would let volume outvote reality.
 *
 * Pure functions only — no network. The caller fetches the SERP.
 */

export type SerpIntent = 'commercial' | 'jobs' | 'informational' | 'navigational' | 'unknown';
export type IntentVerdict = 'accept' | 'supporting' | 'reject';

export interface IntentInput {
    query: string;
    organic: Array<{ position: number; link: string; title?: string; snippet?: string }>;
    /** Local/map pack present. Changes the play entirely for trades. */
    mapPack?: boolean;
    /** AI Overview present. Changes what a click is worth. */
    aiOverview?: boolean;
}

export interface IntentResult {
    query: string;
    intent: SerpIntent;
    verdict: IntentVerdict;
    /** 0-1, share of weighted top-10 signal supporting the classification. */
    confidence: number;
    reason: string;
    /** Per-class weighted tallies, for showing the working. */
    signals: Record<SerpIntent, number>;
    mapPack: boolean;
    aiOverview: boolean;
    notes: string[];
}

const JOB_HOSTS = [
    'seek.com', 'indeed.com', 'jora.com', 'adzuna.', 'glassdoor.', 'ziprecruiter.',
    'careerone.com', 'jobactive.', 'workforceaustralia.', 'brightnetwork.',
    'gradconnection.com', 'prosple.com', 'hays.com', 'roberthalf.', 'michaelpage.',
];
const INFO_HOSTS = [
    'wikipedia.org', 'coursera.org', 'reddit.com', 'quora.com', 'udemy.com',
    'edx.org', 'investopedia.com', 'britannica.com', 'medium.com', 'stackexchange.com',
    'stackoverflow.com', 'youtube.com', 'courses.com.au', 'study.com', 'indeed.com/career',
    'linkedin.com/pulse', 'forbes.com', 'techtarget.com', 'geeksforgeeks.org',
];
/** Directories and listicles: commercial, because the searcher is shopping. */
const DIRECTORY_HOSTS = [
    'clutch.co', 'goodfirms.co', 'sortlist.', 'designrush.com', 'upcity.com',
    'trustpilot.com', 'productreview.com.au', 'yellowpages.com.au', 'truelocal.com.au',
    'hipages.com.au', 'oneflare.com.au', 'serviceseeking.com.au', 'g2.com', 'capterra.',
    'consultancy.com.au', 'themanifest.com',
];

const JOB_PATH = /\/(jobs?|careers?|vacanc|recruit|employment)(\/|$|\?)/i;
const JOB_SUBDOMAIN = /^(jobs|careers|apply|recruiting|talent)[-.]/i;
const JOB_WORDS = /\b(salary|salaries|how to become|career path|job description|what does a .* do|qualifications|pay rate|hiring|apply now|graduate program)\b/i;
const INFO_WORDS = /\b(what is|what are|definition|meaning|guide to|introduction to|explained|vs\.?|difference between|examples of|types of|history of|how does .* work)\b/i;
const COMMERCIAL_WORDS = /\b(services?|solutions?|consultants?|consulting|agency|specialists?|company|contact us|get a quote|free quote|our work|case stud|pricing|hire|book a|near me|best .* (in|for)|top \d+)\b/i;

function host(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}
function rootDomain(h: string): string {
    const parts = h.split('.');
    // Handle .com.au / .co.uk style suffixes.
    if (parts.length > 2 && /^(com|co|net|org|gov|edu)$/.test(parts[parts.length - 2])) {
        return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
}
function matchesAny(h: string, list: string[]): boolean {
    return list.some((p) => h.includes(p));
}

/** Top positions carry more signal than position 10. */
function weightFor(position: number): number {
    if (position <= 3) return 3;
    if (position <= 6) return 2;
    return 1;
}

function classifyResult(r: IntentInput['organic'][number]): SerpIntent {
    const h = host(r.link);
    const path = (() => { try { return new URL(r.link).pathname; } catch { return ''; } })();
    const text = `${r.title ?? ''} ${r.snippet ?? ''}`;

    if (matchesAny(h, JOB_HOSTS) || JOB_PATH.test(path) || JOB_SUBDOMAIN.test(h) || JOB_WORDS.test(text)) {
        return 'jobs';
    }
    if (matchesAny(h, DIRECTORY_HOSTS)) return 'commercial';
    if (matchesAny(h, INFO_HOSTS) || INFO_WORDS.test(text)) return 'informational';
    if (COMMERCIAL_WORDS.test(text)) return 'commercial';
    // A shallow path on an unknown host is usually a business home/service page.
    const depth = path.split('/').filter(Boolean).length;
    if (depth <= 2) return 'commercial';
    return 'unknown';
}

/**
 * Classify a SERP and return a hard accept/supporting/reject verdict.
 */
export function classifySerpIntent(input: IntentInput): IntentResult {
    const organic = (input.organic ?? []).slice(0, 10);
    const signals: Record<SerpIntent, number> = {
        commercial: 0, jobs: 0, informational: 0, navigational: 0, unknown: 0,
    };
    const notes: string[] = [];

    if (!organic.length) {
        return {
            query: input.query, intent: 'unknown', verdict: 'reject', confidence: 0,
            reason: 'No organic results captured, so intent is unproven. A candidate cannot be promoted on missing evidence.',
            signals, mapPack: !!input.mapPack, aiOverview: !!input.aiOverview, notes,
        };
    }

    // Navigational is detected BEFORE per-result classification, because a brand's
    // own pages read as commercial (shallow paths, "pricing", "services") and would
    // otherwise let the brand out-vote its own dominance.
    const roots = organic.map((r) => rootDomain(host(r.link))).filter(Boolean);
    const counts = new Map<string, number>();
    for (const d of roots) counts.set(d, (counts.get(d) ?? 0) + 1);
    const [topDomain, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const navigational = topCount >= Math.max(4, Math.ceil(organic.length * 0.4));

    for (const r of organic) {
        const owned = navigational && rootDomain(host(r.link)) === topDomain;
        signals[owned ? 'navigational' : classifyResult(r)] += weightFor(r.position);
    }

    if (navigational) {
        notes.push(`${topDomain} occupies ${topCount} of the top ${organic.length} results — this is a brand's own SERP, not an open market.`);
    }

    const total = Object.values(signals).reduce((a, b) => a + b, 0) || 1;
    const intent = (Object.entries(signals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown') as SerpIntent;
    const confidence = Number((signals[intent] / total).toFixed(2));

    let verdict: IntentVerdict;
    let reason: string;
    switch (intent) {
        case 'jobs':
            verdict = 'reject';
            reason = 'Job-seeker SERP: these searchers want to BE this, not hire it. Ranking here produces CVs, not enquiries.';
            break;
        case 'navigational':
            verdict = 'reject';
            reason = `Navigational: people are looking for ${topDomain} specifically. There is no share to take.`;
            break;
        case 'informational':
            verdict = 'supporting';
            reason = 'Informational SERP: researchers, not buyers. Worth writing as supporting content that builds topical depth, but not as a target we hold to an enquiry number.';
            break;
        case 'commercial':
            verdict = 'accept';
            reason = 'Commercial SERP: service pages, agencies and directories, so buyers are present.';
            break;
        default:
            verdict = 'reject';
            reason = 'Intent could not be established from the SERP. Unproven is not the same as promising.';
    }

    if (input.mapPack) {
        notes.push(
            'Map pack present — it sits above organic and takes most of the clicks. For a local services business ' +
            'the Business Profile is the primary play here and an organic position alone will under-deliver.'
        );
    }
    if (input.aiOverview) {
        notes.push(
            'AI Overview present — a share of these searches resolve without a click, so discount expected traffic ' +
            'even at position 1.'
        );
    }
    if (verdict === 'accept' && confidence < 0.5) {
        notes.push(`Mixed SERP (confidence ${confidence}) — commercial leads but does not dominate. Treat as provisional and re-check after the page is live.`);
    }

    return { query: input.query, intent, verdict, confidence, reason, signals, mapPack: !!input.mapPack, aiOverview: !!input.aiOverview, notes };
}

/**
 * The gate itself. Difficulty and volume are deliberately not arguments: they
 * must not be able to overturn an intent failure.
 */
export function passesIntentGate(r: IntentResult): boolean {
    return r.verdict === 'accept';
}
