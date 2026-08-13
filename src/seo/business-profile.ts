/**
 * Evidence gathering for a business profile.
 *
 * Writing up what each business does is the tedious prerequisite to keyword
 * selection, so this reads the site and returns STRUCTURED EVIDENCE — nav
 * labels, service page titles, headings, the words the business uses about
 * itself.
 *
 * It deliberately does not fabricate a finished profile. Services, audiences and
 * goals are commercial facts; a plausible-looking guess that nobody checks is
 * worse than a blank field, because every downstream keyword decision inherits
 * it. A human confirms, then `business_profile --action=set` records it.
 */
import * as cheerio from 'cheerio';
import { limitConcurrency } from '../common/concurrency.js';

export interface PageEvidence {
    url: string;
    title?: string;
    metaDescription?: string;
    h1: string[];
    h2: string[];
}

export interface ProfileEvidence {
    domain: string;
    homepage: PageEvidence | null;
    /** Nav/menu labels — usually the cleanest statement of what is on offer. */
    navLabels: string[];
    /** Internal URLs that look like service/product pages. */
    servicePages: { url: string; label: string }[];
    /** Evidence from the service pages themselves. */
    sampled: PageEvidence[];
    /** Locations mentioned, e.g. from service-area pages. */
    locationHints: string[];
    /** Terms that recur across headings — candidate service vocabulary. */
    recurringTerms: { term: string; count: number }[];
    notes: string[];
}

const SERVICE_HINT = /(service|solution|product|what-we|our-|capabilit|expertise|industr|sector|for-)/i;
const LOCATION_HINT = /(service-area|areas|locations?|suburb|region)/i;
const STOPWORDS = new Set([
    'the', 'and', 'for', 'you', 'your', 'our', 'with', 'that', 'this', 'from', 'are', 'has',
    'have', 'will', 'can', 'all', 'more', 'get', 'why', 'how', 'what', 'who', 'when', 'about',
    'we', 'us', 'a', 'an', 'to', 'of', 'in', 'on', 'is', 'it', 'at', 'be', 'by', 'or', 'as',
    'best', 'top', 'new', 'now', 'home', 'contact', 'read', 'learn', 'view', 'see', 'call',
]);

async function fetchPage(url: string): Promise<{ $: cheerio.CheerioAPI; html: string } | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'SearchConsoleMCP/2.0 (+profile-evidence)' },
            redirect: 'follow',
            signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) return null;
        const html = await res.text();
        return { $: cheerio.load(html), html };
    } catch {
        return null;
    }
}

function extract($: cheerio.CheerioAPI, url: string): PageEvidence {
    const clone = $.root().clone();
    clone.find('script, style, noscript').remove();
    return {
        url,
        title: $('title').first().text().trim() || undefined,
        metaDescription: $('meta[name="description"]').attr('content')?.trim() || undefined,
        h1: $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 10),
        h2: $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 30),
    };
}

/**
 * Read a site and return evidence for writing its business profile.
 *
 * @param domain - Bare host or full URL.
 * @param maxPages - Service pages to sample beyond the homepage.
 */
export async function gatherProfileEvidence(domain: string, maxPages = 8): Promise<ProfileEvidence> {
    const host = domain.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').split('/')[0];
    const base = `https://${host}`;
    const notes: string[] = [];

    const home = (await fetchPage(base)) ?? (await fetchPage(`https://www.${host}`));
    if (!home) {
        return {
            domain: host, homepage: null, navLabels: [], servicePages: [], sampled: [],
            locationHints: [], recurringTerms: [],
            notes: [`Could not fetch ${base} — check the site is reachable.`],
        };
    }

    const { $ } = home;
    const homepage = extract($, base);

    // Nav labels: the business's own summary of what it offers.
    const navLabels: string[] = [];
    const servicePages = new Map<string, string>();
    const locationHints = new Set<string>();

    $('nav a, header a, [class*="menu"] a, [class*="nav"] a').each((_, el) => {
        const label = $(el).text().replace(/\s+/g, ' ').trim();
        const href = $(el).attr('href') ?? '';
        if (label && label.length < 60 && !navLabels.includes(label)) navLabels.push(label);
        try {
            const abs = new URL(href, base);
            if (abs.hostname.replace(/^www\./, '') !== host.replace(/^www\./, '')) return;
            if (SERVICE_HINT.test(abs.pathname) && label) servicePages.set(abs.toString(), label);
            if (LOCATION_HINT.test(abs.pathname) && label) locationHints.add(label);
        } catch {
            /* unparseable href */
        }
    });

    // Fall back to all internal links when the nav is JS-rendered.
    if (servicePages.size === 0) {
        $('a[href]').each((_, el) => {
            const label = $(el).text().replace(/\s+/g, ' ').trim();
            try {
                const abs = new URL($(el).attr('href') ?? '', base);
                if (abs.hostname.replace(/^www\./, '') !== host.replace(/^www\./, '')) return;
                if (SERVICE_HINT.test(abs.pathname) && label) servicePages.set(abs.toString(), label);
            } catch {
                /* ignore */
            }
        });
        if (servicePages.size) notes.push('Nav had no service links; fell back to scanning all internal links.');
    }

    // Nav usually links to /services and /service-areas index pages rather than
    // the individual services. Expand one level from those, or the evidence is
    // just the word "Services" — which tells us nothing we can build keywords on.
    const indexPages = [...servicePages.keys()].filter((u) => /\/(services?|service-areas?|areas)\/?$/i.test(u));
    for (const indexUrl of indexPages.slice(0, 3)) {
        const page = await fetchPage(indexUrl);
        if (!page) continue;
        const prefix = new URL(indexUrl).pathname.replace(/\/$/, '');
        page.$('a[href]').each((_, el) => {
            const label = page.$(el).text().replace(/\s+/g, ' ').trim();
            try {
                const abs = new URL(page.$(el).attr('href') ?? '', base);
                if (abs.hostname.replace(/^www\./, '') !== host.replace(/^www\./, '')) return;
                // Children of the index, not the index itself.
                if (!abs.pathname.startsWith(`${prefix}/`) || abs.pathname === indexUrl) return;
                if (!label) return;
                if (LOCATION_HINT.test(prefix)) locationHints.add(label);
                else servicePages.set(abs.toString(), label);
            } catch {
                /* ignore */
            }
        });
    }

    // Prefer leaf pages over index pages when choosing what to sample.
    const targets = [...servicePages.entries()]
        .sort((a, b) => (b[0].split('/').length - a[0].split('/').length))
        .slice(0, maxPages);
    const sampled = (
        await limitConcurrency(targets, 4, async ([url]) => {
            const page = await fetchPage(url);
            return page ? extract(page.$, url) : null;
        })
    ).filter((p): p is PageEvidence => p !== null);

    // Recurring vocabulary across headings — the words the business uses itself.
    const counts = new Map<string, number>();
    const headings = [homepage, ...sampled].flatMap((p) => [...p.h1, ...p.h2, p.title ?? '']);
    for (const heading of headings) {
        for (const word of heading.toLowerCase().split(/[^a-z0-9']+/)) {
            if (word.length < 4 || STOPWORDS.has(word)) continue;
            counts.set(word, (counts.get(word) ?? 0) + 1);
        }
    }
    const recurringTerms = [...counts.entries()]
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([term, count]) => ({ term, count }));

    if (!sampled.length) notes.push('No service pages sampled — the profile will need writing from scratch.');
    notes.push(
        'This is evidence, not a profile. Services, audiences and goals are commercial facts — ' +
        'confirm them with the client before recording, since every keyword decision inherits them.'
    );

    return {
        domain: host,
        homepage,
        navLabels: navLabels.slice(0, 40),
        servicePages: [...servicePages.entries()].map(([url, label]) => ({ url, label })).slice(0, 30),
        sampled,
        locationHints: [...locationHints].slice(0, 30),
        recurringTerms,
        notes,
    };
}
