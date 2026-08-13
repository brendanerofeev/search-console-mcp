/**
 * Seeds a site_profile row for every Search Console property, linking its GA4
 * property where one matches. Only fills fields it can derive — location, brand
 * terms, competitors and tracked queries are business facts and are left for a
 * human to set via the `site_profile` tool.
 *
 * Idempotent: upsertProfile only overwrites fields it is given.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm tsx scripts/seed-profiles.ts
 */
import { google } from 'googleapis';
import { upsertProfile, listProfiles } from '../src/store/profiles.js';
import { toDomain } from '../src/store/db.js';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the service-account key path.');
    process.exit(1);
}

const auth = new google.auth.GoogleAuth({
    keyFilename: keyPath,
    scopes: [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/webmasters.readonly',
    ],
});
const webmasters = google.webmasters({ version: 'v3', auth });
const admin = google.analyticsadmin({ version: 'v1beta', auth });

// GA4 properties keyed by hostname, resolved from each property's data stream.
const ga4ByHost = new Map<string, { id: string; account: string; name: string }>();
const { data: summaries } = await admin.accountSummaries.list({ pageSize: 200 });
for (const account of summaries.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
        const id = (prop.property ?? '').replace('properties/', '');
        if (!id) continue;
        try {
            const { data: streams } = await admin.properties.dataStreams.list({
                parent: `properties/${id}`,
            });
            for (const s of streams.dataStreams ?? []) {
                const host = s.webStreamData?.defaultUri ? toDomain(s.webStreamData.defaultUri) : null;
                if (host && !ga4ByHost.has(host)) {
                    ga4ByHost.set(host, {
                        id,
                        account: account.displayName ?? '',
                        name: prop.displayName ?? '',
                    });
                }
            }
        } catch {
            /* property without readable streams */
        }
    }
}

const { data: siteList } = await webmasters.sites.list();
const sites = (siteList.siteEntry ?? []).map((s) => s.siteUrl).filter((u): u is string => Boolean(u));

for (const siteUrl of sites) {
    const domain = toDomain(siteUrl);
    const ga4 = ga4ByHost.get(domain);
    const profile = upsertProfile({
        siteUrl,
        domain,
        // The GA4 account name is the closest thing to a customer name we can
        // derive; a human can correct it via the site_profile tool.
        customer: ga4?.account,
        ga4PropertyId: ga4?.id,
    });
    const loc = profile.primaryLocation ?? 'NO LOCATION SET';
    console.log(
        `${siteUrl.padEnd(38)} ga4=${(ga4?.id ?? '-').padEnd(10)} customer=${(profile.customer ?? '-').padEnd(18)} ${loc}`
    );
}

const all = listProfiles(true);
const missingLocation = all.filter((p) => !p.primaryLocation);
console.log(`\n${all.length} site profiles stored.`);
if (missingLocation.length) {
    console.log(`\n${missingLocation.length} need a location before rank tracking is meaningful:`);
    for (const p of missingLocation) console.log(`  - ${p.siteUrl}`);
}
