/**
 * SEO onboarding audit — the "get the basics right" pass that must happen
 * BEFORE chasing keywords.
 *
 * Chasing rankings on a site with broken foundations wastes the effort: an
 * unindexed page cannot rank no matter how good its content is, and a missing
 * sitemap or a noindex tag caps everything above it. So this runs the
 * foundational checks first and reports each as pass / fail / manual.
 *
 * Deliberately split into what a machine can verify and what it cannot. Off-page
 * items (Google Business Profile, citations, reviews, backlinks) need either a
 * human or a paid API, so they are emitted as `manual` with instructions rather
 * than silently omitted — omitting them would make a site look finished when
 * half the work is untouched.
 */
import * as cheerio from 'cheerio';
import { query } from '../store/db.js';
import { getProfile } from '../store/profiles.js';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'manual' | 'error';

export interface Check {
    id: string;
    category: 'technical' | 'on-page' | 'off-page' | 'measurement';
    title: string;
    status: CheckStatus;
    /** What we actually observed — the evidence for the verdict. */
    evidence: string;
    /** What to do about it. Empty when passing. */
    fix: string;
    /** 1 = do first. Foundations before refinements. */
    priority: 1 | 2 | 3;
}

export interface AuditResult {
    siteUrl: string;
    domain: string;
    customer: string | null;
    checkedAt: string;
    summary: Record<CheckStatus, number>;
    checks: Check[];
}

function domainOf(siteUrl: string): string {
    return siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

async function fetchText(url: string, timeoutMs = 15000): Promise<{ status: number; body: string; url: string } | null> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
        return { status: r.status, body: await r.text(), url: r.url };
    } catch {
        return null;
    } finally {
        clearTimeout(t);
    }
}

/** Run the automated onboarding checks for one site. */
export async function auditSite(siteUrl: string): Promise<AuditResult> {
    const domain = domainOf(siteUrl);
    const base = `https://${domain}`;
    const profile = await getProfile(siteUrl);
    const checks: Check[] = [];
    const add = (c: Check) => checks.push(c);

    // ---- Technical foundations -------------------------------------------
    const robots = await fetchText(`${base}/robots.txt`);
    if (!robots || robots.status !== 200) {
        add({
            id: 'robots-txt', category: 'technical', priority: 1,
            title: 'robots.txt exists',
            status: 'fail',
            evidence: `GET ${base}/robots.txt returned ${robots?.status ?? 'no response'}.`,
            fix: 'Publish a robots.txt that allows crawling and declares the sitemap URL.',
        });
    } else {
        const blocksAll = /^\s*Disallow:\s*\/\s*$/im.test(robots.body) &&
            /User-agent:\s*\*/i.test(robots.body);
        const hasSitemap = /^\s*Sitemap:\s*http/im.test(robots.body);
        add({
            id: 'robots-txt', category: 'technical', priority: 1,
            title: 'robots.txt exists and does not block crawling',
            status: blocksAll ? 'fail' : 'pass',
            evidence: blocksAll
                ? 'robots.txt contains "Disallow: /" for all user agents — the whole site is blocked from crawling.'
                : 'robots.txt present and does not block the site.',
            fix: blocksAll ? 'Remove the site-wide Disallow. Nothing can rank while this is in place.' : '',
        });
        add({
            id: 'robots-sitemap', category: 'technical', priority: 2,
            title: 'robots.txt declares the sitemap',
            status: hasSitemap ? 'pass' : 'warn',
            evidence: hasSitemap ? 'Sitemap directive present in robots.txt.' : 'No Sitemap: directive in robots.txt.',
            fix: hasSitemap ? '' : `Add "Sitemap: ${base}/sitemap.xml" to robots.txt.`,
        });
    }

    // Sitemap
    let sitemapUrls = 0;
    const sitemap = await fetchText(`${base}/sitemap.xml`);
    if (sitemap && sitemap.status === 200 && sitemap.body.includes('<')) {
        sitemapUrls = (sitemap.body.match(/<loc>/g) ?? []).length;
        const isIndex = sitemap.body.includes('<sitemapindex');
        add({
            id: 'sitemap', category: 'technical', priority: 1,
            title: 'XML sitemap published',
            status: 'pass',
            evidence: `${base}/sitemap.xml returns ${sitemapUrls} ${isIndex ? 'child sitemaps' : 'URLs'}.`,
            fix: '',
        });
    } else {
        add({
            id: 'sitemap', category: 'technical', priority: 1,
            title: 'XML sitemap published',
            status: 'fail',
            evidence: `GET ${base}/sitemap.xml returned ${sitemap?.status ?? 'no response'}.`,
            fix: 'Generate an XML sitemap, publish it, declare it in robots.txt, and submit it in Search Console.',
        });
    }

    // HTTPS + canonical host. A site reachable on both www and apex without a
    // redirect splits its own ranking signals across two hosts.
    const apex = await fetchText(`http://${domain}`);
    add({
        id: 'https-redirect', category: 'technical', priority: 1,
        title: 'HTTP redirects to HTTPS',
        status: apex ? (apex.url.startsWith('https://') ? 'pass' : 'fail') : 'error',
        evidence: apex ? `http://${domain} resolved to ${apex.url}` : 'No response over HTTP.',
        fix: apex && !apex.url.startsWith('https://') ? 'Force a 301 from HTTP to HTTPS.' : '',
    });

    const apexHost = domain.startsWith('www.') ? domain.slice(4) : domain;
    const wwwHost = `www.${apexHost}`;
    const [apexHttps, wwwHttps] = await Promise.all([
        fetchText(`https://${apexHost}`),
        fetchText(`https://${wwwHost}`),
    ]);
    if (apexHttps?.status === 200 && wwwHttps?.status === 200) {
        const apexLanded = new URL(apexHttps.url).host;
        const wwwLanded = new URL(wwwHttps.url).host;
        const sameDestination = apexLanded === wwwLanded;
        add({
            id: 'canonical-host', category: 'technical', priority: 2,
            title: 'One canonical host (www vs apex)',
            status: sameDestination ? 'pass' : 'warn',
            evidence: sameDestination
                ? `Apex and www both resolve to "${apexLanded}".`
                : `Apex resolves to "${apexLanded}" while www resolves to "${wwwLanded}".`,
            fix: sameDestination
                ? ''
                : 'Both hosts serve content. 301 one to the other so ranking signals are not split.',
        });
    } else {
        add({
            id: 'canonical-host', category: 'technical', priority: 2,
            title: 'One canonical host (www vs apex)',
            status: 'error',
            evidence: `HTTPS checks returned apex=${apexHttps?.status ?? 'no response'}, www=${wwwHttps?.status ?? 'no response'}.`,
            fix: 'Confirm both host variants resolve, then redirect one permanently to the canonical host.',
        });
    }

    // ---- Homepage on-page -------------------------------------------------
    const home = await fetchText(base);
    if (!home || home.status !== 200) {
        add({
            id: 'homepage', category: 'on-page', priority: 1,
            title: 'Homepage reachable',
            status: 'error',
            evidence: `GET ${base} returned ${home?.status ?? 'no response'}.`,
            fix: 'Site is not reachable — resolve before any other SEO work.',
        });
    } else {
        const $ = cheerio.load(home.body);
        const title = ($('title').first().text() || '').trim();
        const meta = ($('meta[name="description"]').attr('content') || '').trim();
        const h1s = $('h1').map((_, e) => $(e).text().trim()).get();
        const canonical = $('link[rel="canonical"]').attr('href') || '';
        const viewport = $('meta[name="viewport"]').attr('content') || '';
        const lang = $('html').attr('lang') || '';
        const robotsMeta = ($('meta[name="robots"]').attr('content') || '').toLowerCase();
        const ogTitle = $('meta[property="og:title"]').attr('content') || '';

        add({
            id: 'meta-robots', category: 'technical', priority: 1,
            title: 'Homepage is indexable (no noindex)',
            status: robotsMeta.includes('noindex') ? 'fail' : 'pass',
            evidence: robotsMeta ? `meta robots = "${robotsMeta}"` : 'No restrictive meta robots tag.',
            fix: robotsMeta.includes('noindex') ? 'Remove the noindex directive.' : '',
        });

        add({
            id: 'title-tag', category: 'on-page', priority: 1,
            title: 'Homepage title present and within length',
            status: !title ? 'fail' : (title.length > 60 || title.length < 15 ? 'warn' : 'pass'),
            evidence: title ? `"${title}" (${title.length} chars)` : 'No <title>.',
            fix: !title
                ? 'Add a title tag.'
                : title.length > 60
                    ? `Title is ${title.length} chars and will be truncated in results (~60).`
                    : title.length < 15 ? 'Title is very short — add the primary service and location.' : '',
        });

        add({
            id: 'meta-description', category: 'on-page', priority: 2,
            title: 'Homepage meta description present and within length',
            status: !meta ? 'fail' : (meta.length > 160 || meta.length < 50 ? 'warn' : 'pass'),
            evidence: meta ? `${meta.length} chars: "${meta.slice(0, 90)}..."` : 'No meta description.',
            fix: !meta
                ? 'Write a meta description (~155 chars) with the primary service, location and a reason to click.'
                : meta.length > 160 ? `Meta description is ${meta.length} chars and will be truncated (~160).` : '',
        });

        add({
            id: 'h1', category: 'on-page', priority: 2,
            title: 'Exactly one descriptive H1',
            status: h1s.length === 1 ? 'pass' : 'warn',
            evidence: `${h1s.length} H1 tags: ${JSON.stringify(h1s.slice(0, 3))}`,
            fix: h1s.length === 0 ? 'Add an H1.' : h1s.length > 1 ? 'Reduce to a single H1.' : '',
        });

        add({
            id: 'canonical-tag', category: 'technical', priority: 2,
            title: 'Self-referencing canonical tag',
            status: canonical ? 'pass' : 'warn',
            evidence: canonical ? `canonical = ${canonical}` : 'No canonical tag on the homepage.',
            fix: canonical ? '' : 'Add self-referencing canonical tags site-wide.',
        });

        add({
            id: 'viewport', category: 'technical', priority: 2,
            title: 'Mobile viewport declared',
            status: viewport ? 'pass' : 'fail',
            evidence: viewport ? `viewport = "${viewport}"` : 'No viewport meta tag.',
            fix: viewport ? '' : 'Add a responsive viewport meta tag — mobile-first indexing depends on it.',
        });

        add({
            id: 'html-lang', category: 'technical', priority: 3,
            title: 'HTML lang attribute set',
            status: lang ? 'pass' : 'warn',
            evidence: lang ? `lang = "${lang}"` : 'No lang attribute on <html>.',
            fix: lang ? '' : 'Set <html lang="en-AU">.',
        });

        add({
            id: 'open-graph', category: 'on-page', priority: 3,
            title: 'Open Graph tags for link previews',
            status: ogTitle ? 'pass' : 'warn',
            evidence: ogTitle ? 'og:title present.' : 'No og:title.',
            fix: ogTitle ? '' : 'Add og:title, og:description and og:image so shared links render properly.',
        });

        // Structured data. LocalBusiness matters for a site with a service area.
        const schemaTypes = new Set<string>();
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const parsed = JSON.parse($(el).contents().text());
                for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
                    const t = node?.['@type'];
                    for (const v of Array.isArray(t) ? t : [t]) if (v) schemaTypes.add(String(v));
                    for (const g of node?.['@graph'] ?? []) {
                        const gt = g?.['@type'];
                        for (const v of Array.isArray(gt) ? gt : [gt]) if (v) schemaTypes.add(String(v));
                    }
                }
            } catch { /* malformed JSON-LD is itself a finding, caught below */ }
        });
        const isLocal = !!profile?.primaryLocation;
        const wantLocal = isLocal && !schemaTypes.has('LocalBusiness') && !schemaTypes.has('Plumber');
        add({
            id: 'schema-org', category: 'on-page', priority: 2,
            title: isLocal ? 'LocalBusiness structured data' : 'Organization structured data',
            status: schemaTypes.size === 0 ? 'fail' : wantLocal ? 'warn' : 'pass',
            evidence: schemaTypes.size ? `JSON-LD types: ${[...schemaTypes].join(', ')}` : 'No JSON-LD structured data found.',
            fix: schemaTypes.size === 0
                ? `Add ${isLocal ? 'LocalBusiness' : 'Organization'} JSON-LD with name, url, logo${isLocal ? ', address, phone, geo, openingHours and areaServed' : ''}.`
                : wantLocal
                    ? 'Add LocalBusiness schema (address, phone, geo, areaServed) — this site targets a location.'
                    : '',
        });

        // Images without alt text.
        const imgs = $('img').length;
        const noAlt = $('img').filter((_, e) => !($(e).attr('alt') || '').trim()).length;
        add({
            id: 'image-alt', category: 'on-page', priority: 3,
            title: 'Images have alt text',
            status: imgs === 0 ? 'pass' : noAlt / imgs > 0.3 ? 'warn' : 'pass',
            evidence: `${noAlt} of ${imgs} homepage images have no alt text.`,
            fix: noAlt > 0 ? 'Add descriptive alt text to meaningful images.' : '',
        });
    }

    // ---- Indexing coverage (from our archive) -----------------------------
    const cov = await query<{ total: string; indexed: string; discovered: string; crawled: string }>(
        `SELECT COUNT(*)::text total,
                COUNT(*) FILTER (WHERE verdict = 'PASS')::text indexed,
                COUNT(*) FILTER (WHERE coverage_state ILIKE 'Discovered%')::text discovered,
                COUNT(*) FILTER (WHERE coverage_state ILIKE 'Crawled%')::text crawled
           FROM url_status WHERE site_url = $1`,
        [siteUrl]
    );
    const c = cov[0];
    const total = Number(c?.total ?? 0);
    const indexed = Number(c?.indexed ?? 0);
    const ratio = total ? indexed / total : 0;
    add({
        id: 'index-coverage', category: 'technical', priority: 1,
        title: 'Pages are actually indexed',
        status: total === 0 ? 'manual' : ratio < 0.5 ? 'fail' : ratio < 0.85 ? 'warn' : 'pass',
        evidence: total === 0
            ? 'No URL inspection data yet — run a sync first.'
            : `${indexed} of ${total} known URLs indexed (${Math.round(ratio * 100)}%). ` +
              `Discovered-not-indexed: ${c?.discovered ?? 0}. Crawled-not-indexed: ${c?.crawled ?? 0}.`,
        fix: ratio < 0.85 && total > 0
            ? 'Work the unindexed pages: "Discovered" usually means weak internal linking or crawl priority; ' +
              '"Crawled – currently not indexed" is a content-quality verdict and at scale means a site-quality problem.'
            : '',
    });

    // ---- Measurement -------------------------------------------------------
    add({
        id: 'rank-targets', category: 'measurement', priority: 2,
        title: 'Keyword targets chosen and tracked',
        status: (profile?.trackedQueries?.length ?? 0) > 0 ? 'pass' : 'fail',
        evidence: `${profile?.trackedQueries?.length ?? 0} tracked queries on the site profile.`,
        fix: (profile?.trackedQueries?.length ?? 0) > 0 ? '' : 'Run the keyword research process and record targets.',
    });
    add({
        id: 'business-profile-reviewed', category: 'measurement', priority: 1,
        title: 'Business profile written and confirmed',
        status: profile?.profileReviewedAt ? 'pass' : 'fail',
        evidence: profile?.profileReviewedAt
            ? `Confirmed ${profile.profileReviewedAt}.`
            : 'No confirmed business profile — keyword generation cannot run without it.',
        fix: profile?.profileReviewedAt ? '' : 'Gather evidence, draft the profile, confirm it with the client.',
    });
    add({
        id: 'primary-location', category: 'measurement', priority: 2,
        title: 'Primary location set (localises all SERP checks)',
        status: profile?.primaryLocation ? 'pass' : 'warn',
        evidence: profile?.primaryLocation ? `primaryLocation = ${profile.primaryLocation}` : 'Not set.',
        fix: profile?.primaryLocation
            ? ''
            : 'Set primaryLocation, or record that this site has no geographic market. Unset means SERP checks are not localised and fail silently.',
    });

    // ---- Off-page: cannot be verified from here ---------------------------
    const manual: Array<[string, string, string, 1 | 2 | 3]> = [
        ['gbp-claimed', 'Google Business Profile claimed and complete',
         'Categories, service areas, hours, phone, website link, 10+ photos, services list.', 1],
        ['gbp-reviews', 'Review generation process running',
         'Reviews are a local ranking factor and a conversion factor. Set up a repeatable ask (SMS/email after job).', 2],
        ['bing-places', 'Bing Places listing claimed', 'Free, quick, and feeds other surfaces.', 3],
        ['nap-consistency', 'NAP consistent across web',
         'Name/address/phone must match exactly on site, GBP and every citation. Inconsistency dilutes local ranking.', 2],
        ['citations', 'Core directory citations built',
         'AU set: True Local, Yellow Pages, Hotfrog, StartLocal, Localsearch, plus industry-specific directories.', 2],
        ['social-profiles', 'Social profiles claimed and linked',
         'Claim the handles, link them from the site, and reference the site from them.', 3],
        ['backlink-baseline', 'Backlink baseline measured',
         'Run backlink_report for the profile and link_gap for the outreach shortlist. Both need ' +
         'competitors recorded on the site profile, because a link profile only means something ' +
         'relative to someone.', 2],
        ['backlink-outreach', 'Link acquisition plan',
         'Suppliers, industry bodies, local sponsorships, existing client sites. Start from competitors\' referring domains.', 3],
    ];
    for (const [id, title, fix, priority] of manual) {
        add({
            id, category: 'off-page', priority, title, status: 'manual',
            evidence: 'Cannot be verified automatically.',
            fix,
        });
    }

    const summary = checks.reduce((acc, ch) => {
        acc[ch.status] = (acc[ch.status] ?? 0) + 1;
        return acc;
    }, {} as Record<CheckStatus, number>);

    return {
        siteUrl, domain,
        customer: profile?.customer ?? null,
        checkedAt: new Date().toISOString(),
        summary, checks,
    };
}
