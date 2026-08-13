/**
 * Per-site (per-customer) profiles.
 *
 * These properties belong to different customers in different markets. Rank is
 * location-dependent, so a single global default silently misreports it — a bare
 * query like "backflow testing" resolves differently for a searcher in Brisbane
 * than one in Perth. Every location/brand/competitor-sensitive setting therefore
 * resolves per site, from here.
 */
import { getDb, nowIso, toDomain } from './db.js';

export interface SiteProfile {
    siteUrl: string;
    customer?: string;
    domain: string;
    ga4PropertyId?: string;
    country: string;
    language: string;
    device: 'mobile' | 'desktop';
    primaryLocation?: string;
    serviceAreas: string[];
    brandTerms: string[];
    competitors: string[];
    trackedQueries: string[];
    notes?: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export type SiteProfileInput = Partial<Omit<SiteProfile, 'siteUrl' | 'createdAt' | 'updatedAt'>> & {
    siteUrl: string;
};

function parseJsonArray(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
    } catch {
        return [];
    }
}

function rowToProfile(row: Record<string, any>): SiteProfile {
    return {
        siteUrl: row.site_url,
        customer: row.customer ?? undefined,
        domain: row.domain,
        ga4PropertyId: row.ga4_property_id ?? undefined,
        country: row.country,
        language: row.language,
        device: row.device === 'desktop' ? 'desktop' : 'mobile',
        primaryLocation: row.primary_location ?? undefined,
        serviceAreas: parseJsonArray(row.service_areas),
        brandTerms: parseJsonArray(row.brand_terms),
        competitors: parseJsonArray(row.competitors),
        trackedQueries: parseJsonArray(row.tracked_queries),
        notes: row.notes ?? undefined,
        active: !!row.active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/** Fetch one profile, or undefined. */
export function getProfile(siteUrl: string): SiteProfile | undefined {
    const row = getDb().prepare('SELECT * FROM site_profile WHERE site_url = ?').get(siteUrl) as
        | Record<string, any>
        | undefined;
    return row ? rowToProfile(row) : undefined;
}

/** All profiles, active first then alphabetical. */
export function listProfiles(includeInactive = false): SiteProfile[] {
    const sql = includeInactive
        ? 'SELECT * FROM site_profile ORDER BY active DESC, customer, site_url'
        : 'SELECT * FROM site_profile WHERE active = 1 ORDER BY customer, site_url';
    return (getDb().prepare(sql).all() as Record<string, any>[]).map(rowToProfile);
}

/**
 * Create or update a profile. Only provided fields are changed, so this is safe
 * to call repeatedly (e.g. from discovery) without clobbering manual edits.
 */
export function upsertProfile(input: SiteProfileInput): SiteProfile {
    const db = getDb();
    const existing = getProfile(input.siteUrl);
    const now = nowIso();

    const merged = {
        site_url: input.siteUrl,
        customer: input.customer ?? existing?.customer ?? null,
        domain: input.domain ?? existing?.domain ?? toDomain(input.siteUrl),
        ga4_property_id: input.ga4PropertyId ?? existing?.ga4PropertyId ?? null,
        country: input.country ?? existing?.country ?? 'au',
        language: input.language ?? existing?.language ?? 'en',
        device: input.device ?? existing?.device ?? 'mobile',
        primary_location: input.primaryLocation ?? existing?.primaryLocation ?? null,
        service_areas: JSON.stringify(input.serviceAreas ?? existing?.serviceAreas ?? []),
        brand_terms: JSON.stringify(input.brandTerms ?? existing?.brandTerms ?? []),
        competitors: JSON.stringify(input.competitors ?? existing?.competitors ?? []),
        tracked_queries: JSON.stringify(input.trackedQueries ?? existing?.trackedQueries ?? []),
        notes: input.notes ?? existing?.notes ?? null,
        active: (input.active ?? existing?.active ?? true) ? 1 : 0,
        created_at: existing?.createdAt ?? now,
        updated_at: now,
    };

    db.prepare(
        `INSERT INTO site_profile (
            site_url, customer, domain, ga4_property_id, country, language, device,
            primary_location, service_areas, brand_terms, competitors, tracked_queries,
            notes, active, created_at, updated_at
         ) VALUES (
            @site_url, @customer, @domain, @ga4_property_id, @country, @language, @device,
            @primary_location, @service_areas, @brand_terms, @competitors, @tracked_queries,
            @notes, @active, @created_at, @updated_at
         )
         ON CONFLICT(site_url) DO UPDATE SET
            customer = excluded.customer,
            domain = excluded.domain,
            ga4_property_id = excluded.ga4_property_id,
            country = excluded.country,
            language = excluded.language,
            device = excluded.device,
            primary_location = excluded.primary_location,
            service_areas = excluded.service_areas,
            brand_terms = excluded.brand_terms,
            competitors = excluded.competitors,
            tracked_queries = excluded.tracked_queries,
            notes = excluded.notes,
            active = excluded.active,
            updated_at = excluded.updated_at`
    ).run(merged);

    return getProfile(input.siteUrl)!;
}

/** Remove a profile entirely. Collected history is left intact. */
export function deleteProfile(siteUrl: string): boolean {
    return getDb().prepare('DELETE FROM site_profile WHERE site_url = ?').run(siteUrl).changes > 0;
}

/**
 * Resolve the SERP settings for a site, applying per-site profile values and
 * letting an explicit per-call override win.
 */
export function resolveSerpSettings(
    siteUrl: string,
    overrides: { location?: string; country?: string; language?: string; device?: 'mobile' | 'desktop' } = {}
): { location?: string; country: string; language: string; device: 'mobile' | 'desktop'; profileFound: boolean } {
    const profile = getProfile(siteUrl);
    return {
        location: overrides.location ?? profile?.primaryLocation,
        country: overrides.country ?? profile?.country ?? 'au',
        language: overrides.language ?? profile?.language ?? 'en',
        device: overrides.device ?? profile?.device ?? 'mobile',
        profileFound: !!profile,
    };
}
