/**
 * Discover site profiles from live Google data.
 *
 * Onboarding a new customer should not require a developer machine or a
 * checkout, so this lives in the app (and is exposed as a tool action) rather
 * than in scripts/.
 */
import { google } from 'googleapis';
import { upsertProfile, listProfiles, type SiteProfile } from './profiles.js';
import { toDomain } from './db.js';

export interface DiscoverResult {
    siteUrl: string;
    domain: string;
    ga4PropertyId?: string;
    customer?: string;
    created: boolean;
    hasLocation: boolean;
}

/**
 * Create or refresh a profile for every Search Console property the credentials
 * can see, linking the matching GA4 property.
 *
 * Only derivable fields are written. Location, brand terms, competitors and
 * tracked queries are business facts and are never invented here — they must be
 * set explicitly via `site_profile --action=set`.
 */
export async function discoverProfiles(): Promise<DiscoverResult[]> {
    const auth = new google.auth.GoogleAuth({
        scopes: [
            'https://www.googleapis.com/auth/analytics.readonly',
            'https://www.googleapis.com/auth/webmasters.readonly',
        ],
    });
    const webmasters = google.webmasters({ version: 'v3', auth });
    const admin = google.analyticsadmin({ version: 'v1beta', auth });

    // GA4 properties keyed by hostname, resolved from each property's data
    // stream. Display names are free text and unreliable for matching.
    const ga4ByHost = new Map<string, { id: string; account: string }>();
    try {
        const { data: summaries } = await admin.accountSummaries.list({ pageSize: 200 });
        for (const account of summaries.accountSummaries ?? []) {
            for (const prop of account.propertySummaries ?? []) {
                const id = (prop.property ?? '').replace('properties/', '');
                if (!id) continue;
                const candidates: string[] = [];
                try {
                    const { data: streams } = await admin.properties.dataStreams.list({
                        parent: `properties/${id}`,
                    });
                    for (const s of streams.dataStreams ?? []) {
                        if (s.webStreamData?.defaultUri) candidates.push(toDomain(s.webStreamData.defaultUri));
                    }
                } catch {
                    /* property without readable streams */
                }
                // A stream URL can be stale; fall back to the display name.
                if (prop.displayName) candidates.push(toDomain(prop.displayName));
                for (const host of candidates) {
                    if (host && !ga4ByHost.has(host)) {
                        ga4ByHost.set(host, { id, account: account.displayName ?? '' });
                    }
                }
            }
        }
    } catch {
        /* GA4 unreadable; Search Console profiles are still worth creating */
    }

    const existing = new Map((await listProfiles(true)).map((p: SiteProfile) => [p.siteUrl, p]));

    const { data: siteList } = await webmasters.sites.list();
    const sites = (siteList.siteEntry ?? [])
        .map((s) => s.siteUrl)
        .filter((u): u is string => Boolean(u));

    const results: DiscoverResult[] = [];
    for (const siteUrl of sites) {
        const domain = toDomain(siteUrl);
        const ga4 = ga4ByHost.get(domain);
        const before = existing.get(siteUrl);

        // Discovery is create-only. It runs whenever a property is verified, and
        // it has no information a human-authored profile would want: everything
        // it knows (domain, customer, GA4 id) is either already there or derivable.
        // On 2026-08-15 a run of this loop emptied a client's confirmed profile,
        // and while the direct cause was upstream (see upsertProfile), the reason
        // it could reach that row at all is that provisioning wrote to rows it had
        // no business touching. Not writing is the guarantee; the SQL merge is the
        // backstop.
        let profile = before;
        if (!before) {
            profile = await upsertProfile({
                siteUrl,
                domain,
                customer: ga4?.account,
                ga4PropertyId: ga4?.id,
            });
        } else if (ga4?.id && !before.ga4PropertyId) {
            // The one exception: linking a newly-available GA4 property to a site
            // that has none. Only that column is supplied, so nothing else moves.
            profile = await upsertProfile({ siteUrl, ga4PropertyId: ga4.id });
        }

        results.push({
            siteUrl,
            domain,
            ga4PropertyId: profile!.ga4PropertyId,
            customer: profile!.customer,
            created: !before,
            hasLocation: !!profile!.primaryLocation,
        });
    }
    return results;
}
