/**
 * On-page signal extraction for any URL, ours or a competitor's.
 *
 * This is the "why do they outrank us" half of competitive analysis. It needs no
 * API credentials — the pages are public — so it is free to run at any depth.
 */
import * as cheerio from 'cheerio';

export interface PageSignals {
    url: string;
    /** HTTP status; null when the fetch itself failed. */
    status: number | null;
    error?: string;
    title?: string;
    titleLength?: number;
    metaDescription?: string;
    metaDescriptionLength?: number;
    canonical?: string;
    h1: string[];
    h2: string[];
    h3Count: number;
    /** Visible body word count, scripts/styles/nav chrome removed. */
    wordCount: number;
    /** Occurrences of the target term in visible body text. */
    keywordCount?: number;
    /** Where the target term appears. */
    keywordInTitle?: boolean;
    keywordInH1?: boolean;
    keywordInFirst100Words?: boolean;
    internalLinks: number;
    externalLinks: number;
    images: number;
    imagesMissingAlt: number;
    /** @type values of any JSON-LD blocks. */
    schemaTypes: string[];
    hasFaqSchema: boolean;
    /** Bytes of HTML. */
    htmlBytes: number;
}

function countOccurrences(haystack: string, needle: string): number {
    if (!needle.trim()) return 0;
    const escaped = needle.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (haystack.match(new RegExp(escaped, 'gi')) ?? []).length;
}

function collectSchemaTypes(node: unknown, out: Set<string>): void {
    if (!node) return;
    if (Array.isArray(node)) {
        for (const item of node) collectSchemaTypes(item, out);
        return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    if (typeof type === 'string') out.add(type);
    else if (Array.isArray(type)) for (const t of type) if (typeof t === 'string') out.add(t);
    for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
        if (obj[key]) collectSchemaTypes(obj[key], out);
    }
}

/**
 * Fetch a URL and extract comparable on-page signals.
 *
 * @param url - Page to analyse.
 * @param keyword - Optional target term, enabling the keyword placement fields.
 */
export async function analyzePage(url: string, keyword?: string): Promise<PageSignals> {
    const base: PageSignals = {
        url,
        status: null,
        h1: [],
        h2: [],
        h3Count: 0,
        wordCount: 0,
        internalLinks: 0,
        externalLinks: 0,
        images: 0,
        imagesMissingAlt: 0,
        schemaTypes: [],
        hasFaqSchema: false,
        htmlBytes: 0,
    };

    let html: string;
    let status: number;
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (compatible; SearchConsoleMCP/2.0; +https://github.com/brendanerofeev/search-console-mcp)',
                Accept: 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(20_000),
        });
        status = res.status;
        if (!res.ok) return { ...base, status, error: `HTTP ${res.status}` };
        html = await res.text();
    } catch (e) {
        return { ...base, error: (e as Error).message };
    }

    const $ = cheerio.load(html);
    $('script, style, noscript, svg').remove();

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const words = bodyText ? bodyText.split(' ') : [];
    const first100 = words.slice(0, 100).join(' ');

    let host = '';
    try {
        host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
        /* keep empty; all links then count as external */
    }

    let internalLinks = 0;
    let externalLinks = 0;
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        try {
            const linkHost = new URL(href, url).hostname.replace(/^www\./, '');
            if (linkHost === host) internalLinks++;
            else externalLinks++;
        } catch {
            /* unparseable href */
        }
    });

    const schemaTypes = new Set<string>();
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            collectSchemaTypes(JSON.parse($(el).text()), schemaTypes);
        } catch {
            /* malformed JSON-LD */
        }
    });

    const title = $('title').first().text().trim() || undefined;
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || undefined;
    const h1 = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);
    const images = $('img');

    const signals: PageSignals = {
        url,
        status,
        title,
        titleLength: title?.length,
        metaDescription,
        metaDescriptionLength: metaDescription?.length,
        canonical: $('link[rel="canonical"]').attr('href') ?? undefined,
        h1,
        h2: $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean),
        h3Count: $('h3').length,
        wordCount: words.length,
        internalLinks,
        externalLinks,
        images: images.length,
        imagesMissingAlt: images.filter((_, el) => !$(el).attr('alt')?.trim()).length,
        schemaTypes: [...schemaTypes],
        hasFaqSchema: [...schemaTypes].some((t) => /FAQPage|QAPage/i.test(t)),
        htmlBytes: Buffer.byteLength(html, 'utf8'),
    };

    if (keyword) {
        signals.keywordCount = countOccurrences(bodyText, keyword);
        signals.keywordInTitle = countOccurrences(title ?? '', keyword) > 0;
        signals.keywordInH1 = countOccurrences(h1.join(' '), keyword) > 0;
        signals.keywordInFirst100Words = countOccurrences(first100, keyword) > 0;
    }

    return signals;
}
