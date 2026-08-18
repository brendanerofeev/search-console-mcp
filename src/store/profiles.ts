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

/** `undefined` means "leave alone"; an empty array is an explicit clear. */
function provided(value: string[] | undefined): string | null {
    return value === undefined ? null : JSON.stringify(value);
}

/**
 * Create or update a profile. Only provided fields are changed, so this is safe
 * to call repeatedly (e.g. from discovery) without clobbering manual edits.
 *
 * Preservation is done by Postgres (`COALESCE(EXCLUDED.x, site_profile.x)`) and
 * NOT by reading the row into JS and merging. That distinction is load-bearing.
 *
 * On 2026-08-15 a discovery run emptied a client's confirmed profile - services,
 * audiences, goals, primary location, tracked queries - on a row that was present
 * throughout (`created_at` survived, so it was updated in place). The merge logic
 * was correct. What failed was upstream of it: the read came back empty, every
 * `?? existing?.x` fell through to its default, and the UPDATE faithfully wrote
 * those defaults over real data.
 *
 * A read that silently returns nothing is indistinguishable from a genuinely
 * empty row once the merge happens in application code. Doing it in SQL removes
 * the failure mode: an unsupplied value keeps whatever is stored, because the
 * database supplies it and never had to be read.
 *
 * Omitting a key (or passing undefined) keeps the stored value; passing `[]` or
 * `''` clears it - the same semantics as before, since `??` already treated null
 * and undefined as "keep".
 */
export async function upsertProfile(input: SiteProfileInput): Promise<SiteProfile> {
    const values = [
        input.siteUrl,
        input.customer ?? null,
        input.domain ?? toDomain(input.siteUrl),
        input.ga4PropertyId ?? null,
        input.country ?? null,
        input.language ?? null,
        input.device ?? null,
        input.primaryLocation ?? null,
        provided(input.serviceAreas),
        provided(input.brandTerms),
        provided(input.competitors),
        provided(input.trackedQueries),
        input.notes ?? null,
        input.active ?? null,
        input.description ?? null,
        provided(input.services),
        provided(input.audiences),
        input.goals ?? null,
        provided(input.exclusions),
        provided(input.businessTerms),
        input.profileNotes ?? null,
        input.profileReviewedAt ?? null,
    ];

    await query(
        `INSERT INTO site_profile (
            site_url, customer, domain, ga4_property_id, country, language, device,
            primary_location, service_areas, brand_terms, competitors, tracked_queries,
            notes, active, description, services, audiences, goals, exclusions,
            business_terms, profile_notes, profile_reviewed_at, updated_at
         ) VALUES (
            $1, $2, $3, $4,
            COALESCE($5, 'au'), COALESCE($6, 'en'), COALESCE($7, 'mobile'), $8,
            COALESCE($9::jsonb,  '[]'::jsonb), COALESCE($10::jsonb, '[]'::jsonb),
            COALESCE($11::jsonb, '[]'::jsonb), COALESCE($12::jsonb, '[]'::jsonb),
            $13, COALESCE($14, TRUE), $15,
            COALESCE($16::jsonb, '[]'::jsonb), COALESCE($17::jsonb, '[]'::jsonb), $18,
            COALESCE($19::jsonb, '[]'::jsonb), COALESCE($20::jsonb, '[]'::jsonb),
            $21, $22::timestamptz, now()
         )
         ON CONFLICT (site_url) DO UPDATE SET
            customer            = COALESCE(EXCLUDED.customer,            site_profile.customer),
            domain              = COALESCE(EXCLUDED.domain,              site_profile.domain),
            ga4_property_id     = COALESCE(EXCLUDED.ga4_property_id,     site_profile.ga4_property_id),
            country             = COALESCE($5,                           site_profile.country),
            language            = COALESCE($6,                           site_profile.language),
            device              = COALESCE($7,                           site_profile.device),
            primary_location    = COALESCE(EXCLUDED.primary_location,    site_profile.primary_location),
            service_areas       = COALESCE($9::jsonb,                    site_profile.service_areas),
            brand_terms         = COALESCE($10::jsonb,                   site_profile.brand_terms),
            competitors         = COALESCE($11::jsonb,                   site_profile.competitors),
            tracked_queries     = COALESCE($12::jsonb,                   site_profile.tracked_queries),
            notes               = COALESCE(EXCLUDED.notes,               site_profile.notes),
            active              = COALESCE($14,                          site_profile.active),
            description         = COALESCE(EXCLUDED.description,         site_profile.description),
            services            = COALESCE($16::jsonb,                   site_profile.services),
            audiences           = COALESCE($17::jsonb,                   site_profile.audiences),
            goals               = COALESCE(EXCLUDED.goals,               site_profile.goals),
            exclusions          = COALESCE($19::jsonb,                   site_profile.exclusions),
            business_terms      = COALESCE($20::jsonb,                   site_profile.business_terms),
            profile_notes       = COALESCE(EXCLUDED.profile_notes,       site_profile.profile_notes),
            profile_reviewed_at = COALESCE(EXCLUDED.profile_reviewed_at, site_profile.profile_reviewed_at),
            updated_at          = now()`,
        values
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
