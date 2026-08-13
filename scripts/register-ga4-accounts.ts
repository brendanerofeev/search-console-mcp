/**
 * Registers GA4 properties as accounts in the encrypted config, using a single
 * service-account key. Discovers every property the service account can see via
 * the Analytics Admin API, so it stays correct as properties are added/removed.
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

/** GSC site URLs are sc-domain:<host>; map GA4 properties onto them for auto-resolution. */
function siteCandidates(displayName: string): string[] {
    const host = displayName
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .trim()
        .toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return [];
    return [`sc-domain:${host}`, `https://${host}/`];
}

const auth = new google.auth.GoogleAuth({
    keyFilename: keyPath,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
});
const admin = google.analyticsadmin({ version: 'v1beta', auth });

const { data } = await admin.accountSummaries.list({ pageSize: 200 });
const summaries = data.accountSummaries ?? [];
if (summaries.length === 0) {
    console.error('No GA4 accounts visible to this service account.');
    process.exit(1);
}

let count = 0;
for (const account of summaries) {
    for (const prop of account.propertySummaries ?? []) {
        const propertyId = (prop.property ?? '').replace('properties/', '');
        if (!propertyId) continue;

        const alias = `${account.displayName} / ${prop.displayName}`;
        const entry: AccountConfig = {
            id: `ga4_${propertyId}`,
            engine: 'ga4',
            alias,
            ga4PropertyId: propertyId,
            serviceAccountPath: keyPath,
            websites: siteCandidates(prop.displayName ?? ''),
        };
        await updateAccount(entry);
        console.log(`registered ${entry.id.padEnd(16)} ${alias}`);
        count++;
    }
}

const config = await loadConfig();
const ga4 = Object.values(config.accounts).filter((a) => a.engine === 'ga4');
console.log(`\n${count} GA4 properties registered; ${ga4.length} GA4 accounts now in config.`);
