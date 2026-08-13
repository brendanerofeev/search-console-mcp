/**
 * Registers GA4 properties as accounts in the encrypted config, using a single
 * service-account key. Discovers every property the service account can see via
 * the Analytics Admin API, so it stays correct as properties are added/removed.
 *
 * Each GA4 property is associated with its Search Console property by resolving
 * the property's web data stream URL (its real hostname) and matching that
 * against the sites actually visible in Search Console. Display names are not
 * reliable for this — they are free text (e.g. "Impact Maintenance").
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm tsx scripts/register-ga4-accounts.ts
 */
import { google } from 'googleapis';
import { updateAccount, loadConfig, type AccountConfig } from '../src/common/auth/config.js';

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
const admin = google.analyticsadmin({ version: 'v1beta', auth });
const webmasters = google.webmasters({ version: 'v3', auth });

/** Normalise any URL/host to a bare registrable host, minus www. */
function toHost(value: string | null | undefined): string | null {
    if (!value) return null;
    const host = value
        .replace(/^sc-domain:/, '')
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .trim()
        .toLowerCase()
        .replace(/^www\./, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

// 1. What Search Console actually exposes to this service account.
const { data: siteList } = await webmasters.sites.list();
const gscSites = (siteList.siteEntry ?? [])
    .map((s) => s.siteUrl)
    .filter((u): u is string => Boolean(u));

const gscByHost = new Map<string, string[]>();
for (const siteUrl of gscSites) {
    const host = toHost(siteUrl);
    if (!host) continue;
    gscByHost.set(host, [...(gscByHost.get(host) ?? []), siteUrl]);
}

// 2. Every GA4 property visible to this service account.
const { data } = await admin.accountSummaries.list({ pageSize: 200 });
const summaries = data.accountSummaries ?? [];
if (summaries.length === 0) {
    console.error('No GA4 accounts visible to this service account.');
    process.exit(1);
}

const unmatched: string[] = [];
let count = 0;

for (const account of summaries) {
    for (const prop of account.propertySummaries ?? []) {
        const propertyId = (prop.property ?? '').replace('properties/', '');
        if (!propertyId) continue;

        // Candidate hostnames, best-effort first: the web data stream's URL, then
        // the display name. A stream URL can be stale or wrong (it does not affect
        // collection, which is keyed on the measurement ID), so prefer whichever
        // candidate actually matches a Search Console property.
        const candidates: string[] = [];
        try {
            const { data: streams } = await admin.properties.dataStreams.list({
                parent: `properties/${propertyId}`,
            });
            for (const s of streams.dataStreams ?? []) {
                const h = toHost(s.webStreamData?.defaultUri);
                if (h) candidates.push(h);
            }
        } catch {
            /* fall through to display-name guess */
        }
        const displayHost = toHost(prop.displayName);
        if (displayHost) candidates.push(displayHost);

        const host = candidates.find((h) => gscByHost.has(h)) ?? candidates[0] ?? null;
        const websites = host ? (gscByHost.get(host) ?? []) : [];
        const alias = `${account.displayName} / ${prop.displayName}`;

        const entry: AccountConfig = {
            id: `ga4_${propertyId}`,
            engine: 'ga4',
            alias,
            ga4PropertyId: propertyId,
            serviceAccountPath: keyPath,
            websites,
        };
        await updateAccount(entry);

        const link = websites.length ? websites.join(', ') : 'NO SEARCH CONSOLE PROPERTY';
        if (!websites.length) unmatched.push(`${alias} (${host ?? 'unknown host'})`);
        console.log(`${entry.id.padEnd(16)} ${(host ?? '?').padEnd(28)} -> ${link}`);
        count++;
    }
}

const config = await loadConfig();
const ga4 = Object.values(config.accounts).filter((a) => a.engine === 'ga4');
console.log(`\n${count} GA4 properties registered; ${ga4.length} GA4 accounts in config.`);
console.log(`${gscSites.length} Search Console properties visible.`);

if (unmatched.length) {
    console.log('\nGA4 properties with no matching Search Console property:');
    for (const u of unmatched) console.log(`  - ${u}`);
}
