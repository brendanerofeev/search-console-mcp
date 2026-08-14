import { getProfile, upsertProfile, listProfiles } from '../../store/profiles.js';
import { gatherProfileEvidence } from '../../seo/business-profile.js';

/**
 * business_profile: the human-authored description of what each business does.
 *
 * Search Console can only ever surface terms a site ALREADY appears for, so it
 * can never propose a service the client sells but has never ranked for. This
 * is the other half of the keyword input.
 */
export async function businessProfileHandler(args: {
    action?: 'get' | 'set' | 'gather' | 'status';
    siteUrl?: string;
    description?: string;
    services?: string[];
    audiences?: string[];
    goals?: string;
    exclusions?: string[];
    businessTerms?: string[];
    profileNotes?: string;
    markReviewed?: boolean;
    maxPages?: number;
}) {
    const action = args.action ?? 'get';
    let payload: unknown;

    switch (action) {
        case 'status': {
            // Which sites still need a profile written.
            const profiles = await listProfiles(true);
            payload = profiles.map((p) => ({
                siteUrl: p.siteUrl,
                customer: p.customer ?? null,
                hasDescription: !!p.description,
                services: p.services.length,
                audiences: p.audiences.length,
                hasGoals: !!p.goals,
                hasLocation: !!p.primaryLocation,
                reviewedAt: p.profileReviewedAt ?? null,
                complete: !!p.description && p.services.length > 0 && !!p.profileReviewedAt,
            }));
            break;
        }

        case 'get': {
            if (!args.siteUrl) throw new Error("siteUrl is required for action 'get'.");
            const p = await getProfile(args.siteUrl);
            if (!p) { payload = { error: `No profile for ${args.siteUrl}` }; break; }
            payload = {
                siteUrl: p.siteUrl,
                customer: p.customer,
                domain: p.domain,
                description: p.description ?? null,
                services: p.services,
                audiences: p.audiences,
                goals: p.goals ?? null,
                exclusions: p.exclusions,
                businessTerms: p.businessTerms,
                primaryLocation: p.primaryLocation ?? null,
                serviceAreas: p.serviceAreas,
                brandTerms: p.brandTerms,
                competitors: p.competitors,
                profileNotes: p.profileNotes ?? null,
                reviewedAt: p.profileReviewedAt ?? null,
            };
            break;
        }

        case 'gather': {
            if (!args.siteUrl) throw new Error("siteUrl is required for action 'gather'.");
            const p = await getProfile(args.siteUrl);
            const domain = p?.domain ?? args.siteUrl;
            payload = await gatherProfileEvidence(domain, args.maxPages ?? 8);
            break;
        }

        case 'set': {
            if (!args.siteUrl) throw new Error("siteUrl is required for action 'set'.");
            payload = await upsertProfile({
                siteUrl: args.siteUrl,
                description: args.description,
                services: args.services,
                audiences: args.audiences,
                goals: args.goals,
                exclusions: args.exclusions,
                businessTerms: args.businessTerms,
                profileNotes: args.profileNotes,
                // Only a human review sets this; it gates the profile as usable.
                profileReviewedAt: args.markReviewed ? new Date().toISOString() : undefined,
            });
            break;
        }

        default:
            throw new Error(`Unknown action '${action}'.`);
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}
