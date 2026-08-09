import { AccountConfig, loadConfig, EngineType } from './config.js';

export interface ResolutionError extends Error {
    code: 'FORBIDDEN' | 'AMBIGUOUS' | 'NOT_FOUND';
    resolution?: {
        command: string;
    };
}

const PROTOCOL_REGEX = /^https?:\/\//i;
const websiteNormCache = new Map<string, { type: 'domain' | 'url-prefix'; value: string }>();

/**
 * Extracts normalized hostname from any domain, URL prefix, or sc-domain: string.
 */
export function extractHost(site: string): string {
    if (!site) return '';
    let clean = site.trim().toLowerCase();
    if (clean.startsWith('sc-domain:')) {
        clean = clean.substring(10);
    }
    clean = clean.replace(PROTOCOL_REGEX, '');
    const slashIdx = clean.indexOf('/');
    if (slashIdx !== -1) {
        clean = clean.substring(0, slashIdx);
    }
    const colonIdx = clean.indexOf(':');
    if (colonIdx !== -1) {
        clean = clean.substring(0, colonIdx);
    }
    return clean;
}

/**
 * Normalizes a website or domain string for comparison.
 */
export function normalizeWebsite(site: string): { type: 'domain' | 'url-prefix'; value: string } {
    let cached = websiteNormCache.get(site);
    if (cached) return cached;

    let value = site.toLowerCase().trim();

    // Strip common protocols for normalization
    const isUrlPrefix = PROTOCOL_REGEX.test(value) || value.includes('/');

    // Handle trailing slashes
    if (value.endsWith('/')) {
        value = value.slice(0, -1);
    }

    if (!isUrlPrefix && !value.startsWith('sc-domain:')) {
        // It's a domain
        cached = { type: 'domain', value: value.replace(PROTOCOL_REGEX, '') };
    } else {
        cached = { type: 'url-prefix', value };
    }

    if (websiteNormCache.size < 500) {
        websiteNormCache.set(site, cached);
    }
    return cached;
}

/**
 * Resolves the best account for a given siteUrl and engine.
 */
export async function resolveAccount(siteUrl: string, engine: EngineType): Promise<AccountConfig> {
    const config = await loadConfig();
    const accounts = Object.values(config.accounts).filter(a => a.engine === engine);

    if (accounts.length === 0) {
        const error = new Error(`No ${engine} accounts found. Please run setup.`) as ResolutionError;
        error.code = 'NOT_FOUND';
        error.resolution = { command: `search-console-mcp setup --engine=${engine}` };
        throw error;
    }

    const normalizedTarget = normalizeWebsite(siteUrl);

    // 1. Exact Match
    const exactMatch = accounts.find(a =>
        a.websites?.some(w => normalizeWebsite(w).value === normalizedTarget.value)
    );
    if (exactMatch) return exactMatch;

    // 2. Host / Domain Match (Matches any domain, URL prefix, or sc-domain: format)
    const targetHost = extractHost(siteUrl);
    if (targetHost) {
        const domainMatch = accounts.find(a =>
            a.websites?.some(w => {
                const wHost = extractHost(w);
                return wHost && (targetHost === wHost || targetHost.endsWith('.' + wHost) || wHost.endsWith('.' + targetHost));
            })
        );
        if (domainMatch) return domainMatch;
    }

    // 3. Global Accounts (Empty websites list)
    const globalAccounts = accounts.filter(a => !a.websites || a.websites.length === 0);

    if (globalAccounts.length === 1) {
        return globalAccounts[0];
    }

    // Single account fallback: If no siteUrl requested and only one account exists, use it.
    if (!siteUrl && accounts.length === 1) {
        return accounts[0];
    }

    if (globalAccounts.length > 1) {
        const error = new Error(`Multiple ${engine} accounts found. Please specify an account boundary or remove unused accounts.`) as ResolutionError;
        error.code = 'AMBIGUOUS';
        error.resolution = { command: `search-console-mcp accounts list` };
        throw error;
    }

    // 4. Forbidden
    const error = new Error(`Access restricted. Site '${siteUrl}' is not in the authorized list for any ${engine} account.`) as ResolutionError;
    error.code = 'FORBIDDEN';
    error.resolution = {
        command: `search-console-mcp accounts add-site --site=${siteUrl}`
    };
    throw error;
}

const gscSitesCache = new Map<string, { sites: string[]; timestamp: number }>();

async function getGoogleAuthorizedSites(accountId?: string): Promise<string[]> {
    const key = accountId || 'default';
    const cached = gscSitesCache.get(key);
    if (cached && Date.now() - cached.timestamp < 300000) {
        return cached.sites;
    }
    try {
        const { listSites } = await import('../../google/tools/sites.js');
        const siteEntries = await listSites(accountId);
        const sites = siteEntries.map(s => s.siteUrl).filter(Boolean) as string[];
        gscSitesCache.set(key, { sites, timestamp: Date.now() });
        return sites;
    } catch {
        return [];
    }
}

/**
 * Result of resolving an account and its engine-specific site property identifier.
 */
export interface ResolvedSiteProperty {
    account: AccountConfig;
    siteUrl: string;
}

/**
 * Resolves both the AccountConfig AND the engine-specific registered property identifier.
 *
 * For example:
 * Input "example.com" for Google  -> { account, siteUrl: "sc-domain:example.com" }
 * Input "sc-domain:example.com" for Bing -> { account, siteUrl: "https://example.com/" }
 */
export async function resolveSiteProperty(siteUrl: string, engine: EngineType): Promise<ResolvedSiteProperty> {
    const account = await resolveAccount(siteUrl, engine);
    if (!siteUrl) {
        return { account, siteUrl };
    }

    const targetHost = extractHost(siteUrl);

    // 1. Look for exact registered property string in account.websites
    if (account.websites && account.websites.length > 0 && targetHost) {
        const matchingWebsite = account.websites.find(w => {
            const wHost = extractHost(w);
            return wHost && (targetHost === wHost || targetHost.endsWith('.' + wHost) || wHost.endsWith('.' + targetHost));
        });

        if (matchingWebsite) {
            let finalUrl = matchingWebsite;
            if (engine === 'bing' && finalUrl.startsWith('sc-domain:')) {
                finalUrl = 'https://' + finalUrl.substring(10) + '/';
            }
            return { account, siteUrl: finalUrl };
        }
    }

    // 2. Dynamic GSC site listing lookup for Google if not in account.websites list
    if (engine === 'google' && targetHost) {
        const authorizedSites = await getGoogleAuthorizedSites(account.id);
        if (authorizedSites.length > 0) {
            const matchedSite = authorizedSites.find(s => {
                const sHost = extractHost(s);
                return sHost && (targetHost === sHost || targetHost.endsWith('.' + sHost) || sHost.endsWith('.' + targetHost));
            });
            if (matchedSite) {
                return { account, siteUrl: matchedSite };
            }
        }

        // Default domain format fallback for Google if bare domain passed
        if (!siteUrl.startsWith('sc-domain:') && !siteUrl.includes('://')) {
            return { account, siteUrl: `sc-domain:${targetHost}` };
        }
    }

    // 3. Fallback normalization if not directly matched
    let fallbackUrl = siteUrl;
    if (engine === 'bing' && fallbackUrl.startsWith('sc-domain:')) {
        fallbackUrl = 'https://' + fallbackUrl.substring(10) + '/';
    }

    return { account, siteUrl: fallbackUrl };
}

/**
 * Resolves a given URL into a valid public HTTPS web URL.
 *
 * For example:
 * "sc-domain:example.com/blog/page-1" -> "https://example.com/blog/page-1"
 * "example.com/blog"                  -> "https://example.com/blog"
 * "https://example.com/blog"          -> "https://example.com/blog"
 */
export function resolveFullWebUrl(url: string): string {
    if (!url) return '';
    let clean = url.trim();
    if (clean.startsWith('sc-domain:')) {
        clean = clean.substring(10);
    }
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = 'https://' + clean;
    }
    return clean;
}
