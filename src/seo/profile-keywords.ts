/**
 * Keyword candidates derived from the business profile.
 *
 * Search Console can only surface terms a site ALREADY appears for. A service
 * the client sells but has never ranked for is invisible to it — and those are
 * usually the most valuable gaps. This expands the profile's own facts
 * (services x locations x audiences x intent) into the terms a customer would
 * plausibly search.
 *
 * These are HYPOTHESES, not measured demand. Without Google Ads volume we do
 * not know which are searched at all, so they are scored on structural
 * confidence (does the business genuinely offer this, in this place) and must be
 * validated — by a live SERP check, by Ads volume, or by waiting for Search
 * Console to show impressions.
 */
import type { SiteProfile } from '../store/profiles.js';

export interface ProfileKeyword {
    keyword: string;
    /** How it was constructed, so the pattern can be judged as a whole. */
    pattern: string;
    service?: string;
    location?: string;
    audience?: string;
    intent: 'commercial' | 'urgent' | 'informational' | 'brand';
    /** Structural confidence 0-100 — NOT demand. */
    confidence: number;
}

/** Noise words that appear in service labels but not in searches. */
const LABEL_NOISE = /\b(programmes?|and replacement|appliances|systems?)\b/g;

/**
 * Turn a service label into the phrases a searcher would actually type.
 *
 * Labels are written for humans reading a menu ("Blocked Drains & Drain
 * Cleaning"), and concatenating them produces compounds nobody searches
 * ("blocked drains drain cleaning brisbane"). Splitting on and/& yields the
 * real alternatives instead — "blocked drains", "drain cleaning".
 */
function serviceVariants(service: string): string[] {
    const cleaned = service
        .toLowerCase()
        .replace(LABEL_NOISE, ' ')
        // Removing a noise word can strand its conjunction ("gas fitting and ").
        .replace(/\s+(?:and|&|,)\s*$/, '')
        .replace(/^\s*(?:and|&|,)\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();

    const parts = cleaned.split(/\s+(?:and|&|,)\s+/).map((p) => p.trim()).filter(Boolean);

    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of parts) {
        // Single-word fragments of a compound label are modifiers, not services:
        // "burst and leaking pipes" splits to "burst", which as a keyword means
        // nothing. Keep a lone word only when it IS the whole label.
        if (part.split(' ').length < 2 && parts.length > 1) continue;
        if (part.length > 2 && !seen.has(part)) { seen.add(part); out.push(part); }
    }
    // Fall back to the cleaned label if every part was filtered out.
    if (!out.length && cleaned.length > 2) out.push(cleaned);
    return out.slice(0, 3);
}

/**
 * Audience labels are joined phrases too ("body corporate and strata"), and each
 * side is searched independently — a strata manager types "strata plumber", not
 * "body corporate strata plumber".
 */
function audienceVariants(audience: string): string[] {
    const cleaned = audience
        .toLowerCase()
        .replace(/\s+(committees?|managers?|owners?)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned
        .split(/\s+(?:and|&|,)\s+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 2)
        .slice(0, 2);
}

/** City/suburb name only — Serper wants full location strings, searchers don't. */
function shortLocation(location: string): string {
    return location.split(',')[0].trim().toLowerCase();
}

const URGENT = /(emergency|burst|blocked|leak)/i;

export interface GenerateOptions {
    /** Cap the location list; suburb rollouts can be large. */
    maxLocations?: number;
    includeAudiences?: boolean;
}

/**
 * Expand a reviewed business profile into candidate keywords.
 *
 * Refuses to run on an unreviewed profile: these candidates inherit the
 * profile's claims wholesale, so generating from a draft would launder a guess
 * into a worklist.
 */
export function generateFromProfile(profile: SiteProfile, opts: GenerateOptions = {}): ProfileKeyword[] {
    if (!profile.profileReviewedAt) {
        throw new Error(
            `Business profile for ${profile.siteUrl} has not been reviewed. ` +
            'Confirm it with business_profile --action=set --markReviewed=true first: every ' +
            'candidate below inherits its claims.'
        );
    }

    const services = [...new Set(profile.services.flatMap(serviceVariants))].filter(Boolean);
    if (!services.length) return [];

    // Primary location first (usually the city), then service areas.
    const locations = [
        ...(profile.primaryLocation ? [profile.primaryLocation] : []),
        ...profile.serviceAreas,
    ]
        .map(shortLocation)
        .filter((v, i, a) => v && a.indexOf(v) === i)
        .slice(0, opts.maxLocations ?? 8);

    const exclusions = profile.exclusions.map((e) => e.toLowerCase());
    const out: ProfileKeyword[] = [];
    const seen = new Set<string>();

    const add = (kw: ProfileKeyword) => {
        const key = kw.keyword.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(key)) return;
        // Exclusions are absolute — wrong service, wrong region, wrong intent.
        if (exclusions.some((ex) => key.includes(ex))) return;
        seen.add(key);
        out.push({ ...kw, keyword: key });
    };

    for (const service of services) {
        const urgent = URGENT.test(service);
        const intent: ProfileKeyword['intent'] = urgent ? 'urgent' : 'commercial';

        // Bare service — highest volume, hardest to win, national competition.
        add({ keyword: service, pattern: 'service', service, intent, confidence: 55 });

        for (const location of locations) {
            // service + location is the workhorse of local SEO.
            add({
                keyword: `${service} ${location}`,
                pattern: 'service+location',
                service, location, intent,
                // The primary city is a stronger bet than an outer suburb.
                confidence: location === shortLocation(profile.primaryLocation ?? '') ? 90 : 75,
            });
        }

        // "<service> near me" — high intent, resolved by proximity not text.
        add({ keyword: `${service} near me`, pattern: 'service+nearme', service, intent, confidence: 60 });
    }

    // Audience-led terms: how a strata manager searches differs from a homeowner,
    // and these are usually far less contested than the bare service terms.
    // What a customer calls this kind of provider. Previously hardcoded to
    // 'plumber', which was right for one client and produced nonsense everywhere
    // else ("businesses that have outgrown spreadsheets plumber brisbane").
    // It cannot be inferred from `services` either: those are internal capability
    // names ("software licence right-sizing"), not words anyone types.
    const trades = profile.businessTerms.map((t) => t.toLowerCase().trim()).filter(Boolean);

    for (const trade of trades) {
        // The head terms: what the business IS, plain and with a location.
        add({ keyword: trade, pattern: 'business', intent: 'commercial', confidence: 70 });
        for (const location of locations) {
            add({
                keyword: `${trade} ${location}`,
                pattern: 'business+location',
                location, intent: 'commercial',
                confidence: location === shortLocation(profile.primaryLocation ?? '') ? 95 : 80,
            });
        }
        add({ keyword: `${trade} near me`, pattern: 'business+nearme', intent: 'commercial', confidence: 60 });
    }

    // Audience-qualified terms only make sense once we know the noun.
    if (opts.includeAudiences !== false && trades.length) {
        const trade = trades[0];
        for (const audience of profile.audiences) {
            for (const a of audienceVariants(audience)) {
                // Audiences phrased as sentences ("businesses that have outgrown
                // spreadsheets") describe a situation, not a search. Only short,
                // noun-like audiences make usable qualifiers.
                if (!a || a === 'homeowners' || a.split(' ').length > 2) continue;
                add({ keyword: `${a} ${trade}`, pattern: 'audience+trade', audience, intent: 'commercial', confidence: 70 });
                const city = locations[0];
                if (city) {
                    add({
                        keyword: `${a} ${trade} ${city}`,
                        pattern: 'audience+trade+location',
                        audience, location: city, intent: 'commercial', confidence: 85,
                    });
                }
            }
        }
    }

    for (const brand of profile.brandTerms) {
        add({ keyword: brand.toLowerCase(), pattern: 'brand', intent: 'brand', confidence: 100 });
    }

    return out.sort((a, b) => b.confidence - a.confidence);
}
