/**
 * Serper.dev SERP client.
 *
 * Google Search Console only ever returns your OWN data — it cannot tell you who
 * outranks you. This module supplies the missing half: the actual result page for
 * a query, so a position can be attributed to specific competing URLs.
 */

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

export interface SerpOptions {
    /** Query string. */
    query: string;
    /** Country code, e.g. 'au'. Defaults to SERPER_DEFAULT_GL or 'au'. */
    country?: string;
    /** Language code, e.g. 'en'. Defaults to SERPER_DEFAULT_HL or 'en'. */
    language?: string;
    /**
     * Location string, e.g. 'Brisbane, Queensland, Australia'.
     * Local-intent queries ("plumber brisbane") return materially different
     * results by location, so leaving this unset can misreport rank badly.
     */
    location?: string;
    /** Number of organic results to request (Serper pages in 10s, max 100). */
    num?: number;
    /** Result page (1-based). */
    page?: number;
    /** 'desktop' | 'mobile'. Google indexes mobile-first; default mobile. */
    device?: 'desktop' | 'mobile';
}

export interface OrganicResult {
    position: number;
    title: string;
    link: string;
    snippet?: string;
    date?: string;
    sitelinks?: { title: string; link: string }[];
}

export interface SerpResponse {
    query: string;
    organic: OrganicResult[];
    peopleAlsoAsk: { question: string; snippet?: string; link?: string }[];
    relatedSearches: string[];
    answerBox?: { title?: string; answer?: string; snippet?: string; link?: string };
    knowledgeGraph?: { title?: string; type?: string; website?: string };
    /**
     * Local/map pack. Sits above organic and takes most of the clicks, so for a
     * local services business it changes which lever matters: Business Profile
     * first, organic second. Previously dropped on the floor.
     */
    places: { title: string; address?: string; rating?: number; ratingCount?: number; website?: string }[];
    /** AI Overview present — a share of these searches resolve without any click. */
    aiOverview: boolean;
    /** Serper credits consumed by this call. */
    credits?: number;
    searchParameters: Record<string, unknown>;
}

export class SerperError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = 'SerperError';
    }
}

function getApiKey(): string {
    const key = process.env.SERPER_API_KEY;
    if (!key) {
        // Names the likeliest cause rather than only the symptom: the key lives in
            // sops, and an interactive session only receives it after /sync. Deleting an
            // inline copy from a client config is correct, but without /sync the value is
            // simply absent and the failure reads like the deletion broke something.
        throw new SerperError(
            'SERPER_API_KEY is not set, so competitor/SERP tools are unavailable. ' +
            'If the key is stored in sops, run /sync in this session to load it into the ' +
            'environment (an interactive session does not get sops values automatically; ' +
            'the workflow engine does, at boot). Otherwise set SERPER_API_KEY in .env, or ' +
            'get a key at https://serper.dev.'
        );
    }
    return key;
}

/**
 * Fetch one Google result page via Serper.
 *
 * Serper bills per call regardless of `num`, so request the full depth you need
 * in one go rather than paging.
 */
export async function fetchSerp(options: SerpOptions): Promise<SerpResponse> {
    const apiKey = getApiKey();

    const body: Record<string, unknown> = {
        q: options.query,
        gl: options.country ?? process.env.SERPER_DEFAULT_GL ?? 'au',
        hl: options.language ?? process.env.SERPER_DEFAULT_HL ?? 'en',
        num: Math.min(Math.max(options.num ?? 20, 10), 100),
        page: options.page ?? 1,
        device: options.device ?? 'mobile',
    };

    const location = options.location ?? process.env.SERPER_DEFAULT_LOCATION;
    if (location) body.location = location;

    let response: Response;
    try {
        response = await fetch(SERPER_ENDPOINT, {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });
    } catch (e) {
        throw new SerperError(`Serper request failed: ${(e as Error).message}`);
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
            throw new SerperError(`Serper rejected the API key (${response.status}). ${text}`, response.status);
        }
        if (response.status === 429) {
            throw new SerperError(`Serper rate limit / out of credits (429). ${text}`, 429);
        }
        throw new SerperError(`Serper returned ${response.status}. ${text}`, response.status);
    }

    const data = (await response.json()) as any;

    return {
        query: options.query,
        organic: (data.organic ?? []).map((r: any) => ({
            position: r.position,
            title: r.title,
            link: r.link,
            snippet: r.snippet,
            date: r.date,
            sitelinks: r.sitelinks,
        })),
        peopleAlsoAsk: (data.peopleAlsoAsk ?? []).map((p: any) => ({
            question: p.question,
            snippet: p.snippet,
            link: p.link,
        })),
        relatedSearches: (data.relatedSearches ?? [])
            .map((r: any) => (typeof r === 'string' ? r : r.query))
            .filter(Boolean),
        answerBox: data.answerBox,
        knowledgeGraph: data.knowledgeGraph,
        places: (data.places ?? []).map((p: any) => ({
            title: p.title,
            address: p.address,
            rating: p.rating,
            ratingCount: p.ratingCount,
            website: p.website,
        })),
        aiOverview: Boolean(data.aiOverview ?? false),
        credits: data.credits,
        searchParameters: data.searchParameters ?? body,
    };
}

/** True when `link` belongs to the host represented by a GSC property string. */
export function isOwnResult(link: string, siteUrl: string): boolean {
    const target = siteUrl
        .replace(/^sc-domain:/, '')
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .toLowerCase()
        .replace(/^www\./, '');
    try {
        const host = new URL(link).hostname.toLowerCase().replace(/^www\./, '');
        return host === target || host.endsWith(`.${target}`);
    } catch {
        return false;
    }
}
