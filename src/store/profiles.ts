/**
 * Per-site (per-customer) profiles.
 *
 * These properties belong to different customers in different markets. Rank is
 * location-dependent, so a single global default silently misreports it — a bare
 * query like "backflow testing" resolves differently for a searcher in Brisbane
 * than one in Perth. Every location/brand/competitor-sensitive setting therefore
 * resolves per site, from here.
 */
import { query, queryOne, toDomain } from './db.js';

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
    /** What the business does — the half of keyword relevance GSC cannot supply. */
    description?: string;
    services: string[];
    audiences: string[];
    goals?: string;
    /** Terms that must never become targets. */
    exclusions: string[];
    /** What a customer calls this kind of provider when searching. */
    businessTerms: string[];
    profileNotes?: string;
    profileReviewedAt?: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export type SiteProfileInput = Partial<Omit<SiteProfile, 'siteUrl' | 'createdAt' | 'updatedAt'>> & {
    siteUrl: string;
};

/** jsonb comes back parsed; tolerate a string for hand-edited rows. */
function toArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
        } catch {
            return [];
        }
    }
    return [];
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
        serviceAreas: toArray(row.service_areas),
        brandTerms: toArray(row.brand_terms),
        competitors: toArray(row.competitors),
        trackedQueries: toArray(row.tracked_queries),
        notes: row.notes ?? undefined,
        description: row.description ?? undefined,
        services: toArray(row.services),
        audiences: toArray(row.audiences),
        goals: row.goals ?? undefined,
        exclusions: toArray(row.exclusions),
        businessTerms: toArray(row.business_terms),
        profileNotes: row.profile_notes ?? undefined,
        profileReviewedAt: row.profile_reviewed_at
            ? (row.profile_reviewed_at instanceof Date
                ? row.profile_reviewed_at.toISOString()
                : String(row.profile_reviewed_at))
            : undefined,
        active: !!row.active,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
}

/** Fetch one profile, or undefined. */
export async function getProfile(siteUrl: string): Promise<SiteProfile | undefined> {
    const row = await queryOne('SELECT * FROM site_profile WHERE site_url = $1', [siteUrl]);
    return row ? rowToProfile(row) : undefined;
}

/** All profiles, active first then alphabetical. */
export async function listProfiles(includeInactive = false): Promise<SiteProfile[]> {
    const rows = includeInactive
        ? await query('SELECT * FROM site_profile ORDER BY active DESC, customer, site_url')
        : await query('SELECT * FROM site_profile WHERE active ORDER BY customer, site_url');
    return rows.map(rowToProfile);
}

/**
 * Create or update a profile. Only provided fields are changed, so this is safe
 * to call repeatedly (e.g. from discovery) without clobbering manual edits.
 */
export async function upsertProfile(input: SiteProfileInput): Promise<SiteProfile> {
    const existing = await getProfile(input.siteUrl);

    const merged = [
        input.siteUrl,
        input.customer ?? existing?.customer ?? null,
        input.domain ?? existing?.domain ?? toDomain(input.siteUrl),
        input.ga4PropertyId ?? existing?.ga4PropertyId ?? null,
        input.country ?? existing?.country ?? 'au',
        input.language ?? existing?.language ?? 'en',
        input.device ?? existing?.device ?? 'mobile',
        input.primaryLocation ?? existing?.primaryLocation ?? null,
        JSON.stringify(input.serviceAreas ?? existing?.serviceAreas ?? []),
        JSON.stringify(input.brandTerms ?? existing?.brandTerms ?? []),
        JSON.stringify(input.competitors ?? existing?.competitors ?? []),
        JSON.stringify(input.trackedQueries ?? existing?.trackedQueries ?? []),
        input.notes ?? existing?.notes ?? null,
        input.active ?? existing?.active ?? true,
        input.description ?? existing?.description ?? null,
        JSON.stringify(input.services ?? existing?.services ?? []),
        JSON.stringify(input.audiences ?? existing?.audiences ?? []),
        input.goals ?? existing?.goals ?? null,
        JSON.stringify(input.exclusions ?? existing?.exclusions ?? []),
        JSON.stringify(input.businessTerms ?? existing?.businessTerms ?? []),
        input.profileNotes ?? existing?.profileNotes ?? null,
        input.profileReviewedAt ?? existing?.profileReviewedAt ?? null,
    ];

    await query(
        `INSERT INTO site_profile (
            site_url, customer, domain, ga4_property_id, country, language, device,
            primary_location, service_areas, brand_terms, competitors, tracked_queries,
            notes, active, description, services, audiences, goals, exclusions,
            business_terms, profile_notes, profile_reviewed_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,
                   $15,$16::jsonb,$17::jsonb,$18,$19::jsonb,$20::jsonb,$21,$22::timestamptz, now())
         ON CONFLICT (site_url) DO UPDATE SET
            customer = EXCLUDED.customer,
            domain = EXCLUDED.domain,
            ga4_property_id = EXCLUDED.ga4_property_id,
            country = EXCLUDED.country,
            language = EXCLUDED.language,
            device = EXCLUDED.device,
            primary_location = EXCLUDED.primary_location,
            service_areas = EXCLUDED.service_areas,
            brand_terms = EXCLUDED.brand_terms,
            competitors = EXCLUDED.competitors,
            tracked_queries = EXCLUDED.tracked_queries,
            notes = EXCLUDED.notes,
            active = EXCLUDED.active,
            description = EXCLUDED.description,
            services = EXCLUDED.services,
            audiences = EXCLUDED.audiences,
            goals = EXCLUDED.goals,
            exclusions = EXCLUDED.exclusions,
            business_terms = EXCLUDED.business_terms,
            profile_notes = EXCLUDED.profile_notes,
            profile_reviewed_at = EXCLUDED.profile_reviewed_at,
            updated_at = now()`,
        merged
    );

    return (await getProfile(input.siteUrl))!;
}

/** Remove a profile entirely. Collected history is left intact. */
export async function deleteProfile(siteUrl: string): Promise<boolean> {
    const rows = await query('DELETE FROM site_profile WHERE site_url = $1 RETURNING site_url', [siteUrl]);
    return rows.length > 0;
}

/**
 * Resolve the SERP settings for a site, applying per-site profile values and
 * letting an explicit per-call override win.
 */
export async function resolveSerpSettings(
    siteUrl: string,
    overrides: { location?: string; country?: string; language?: string; device?: 'mobile' | 'desktop' } = {}
): Promise<{
    location?: string;
    country: string;
    language: string;
    device: 'mobile' | 'desktop';
    profileFound: boolean;
}> {
    const profile = await getProfile(siteUrl).catch(() => undefined);
    return {
        location: overrides.location ?? profile?.primaryLocation,
        country: overrides.country ?? profile?.country ?? 'au',
        language: overrides.language ?? profile?.language ?? 'en',
        device: overrides.device ?? profile?.device ?? 'mobile',
        profileFound: !!profile,
    };
}
