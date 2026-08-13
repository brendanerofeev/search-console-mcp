import { getProfile, listProfiles, upsertProfile, deleteProfile } from '../../store/profiles.js';
import { discoverProfiles } from '../../store/discover.js';

/**
 * site_profile: read/write the per-customer settings that everything
 * location-, brand-, and competitor-sensitive resolves from.
 */
export async function siteProfileHandler(args: {
    action?: 'list' | 'get' | 'set' | 'delete' | 'discover';
    siteUrl?: string;
    customer?: string;
    ga4PropertyId?: string;
    country?: string;
    language?: string;
    device?: 'mobile' | 'desktop';
    primaryLocation?: string;
    serviceAreas?: string[];
    brandTerms?: string[];
    competitors?: string[];
    trackedQueries?: string[];
    notes?: string;
    active?: boolean;
    includeInactive?: boolean;
}) {
    const action = args.action ?? 'list';
    let payload: unknown;

    switch (action) {
        case 'list':
            payload = await listProfiles(args.includeInactive ?? false);
            break;

        case 'get': {
            if (!args.siteUrl) throw new Error("siteUrl is required for action 'get'.");
            const profile = await getProfile(args.siteUrl);
            payload = profile ?? { error: `No profile for ${args.siteUrl}. Use action 'set' to create one.` };
            break;
        }

        case 'set': {
            const { siteUrl, action: _action, includeInactive: _includeInactive, ...fields } = args;
            if (!siteUrl) throw new Error("siteUrl is required for action 'set'.");
            payload = await upsertProfile({ siteUrl, ...fields });
            break;
        }

        case 'delete': {
            if (!args.siteUrl) throw new Error("siteUrl is required for action 'delete'.");
            payload = { siteUrl: args.siteUrl, deleted: await deleteProfile(args.siteUrl) };
            break;
        }

        case 'discover': {
            const discovered = await discoverProfiles();
            payload = {
                discovered: discovered.length,
                created: discovered.filter((d) => d.created).length,
                // Rank tracking is meaningless without a market for local
                // businesses, so surface the ones still missing a location.
                needLocation: discovered.filter((d) => !d.hasLocation).map((d) => d.siteUrl),
                sites: discovered,
            };
            break;
        }

        default:
            throw new Error(`Unknown action '${action}'.`);
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}
