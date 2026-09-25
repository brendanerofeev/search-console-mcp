/**
 * One-way sync: search-console-MCP profile store -> tts-data seo.business_profile.
 *
 * ClickUp 14zfmu0z27c. Brendan's 21 Sep decision made tts-data the record of truth
 * the site-measurement rubric reads; this store remains the editing surface. Never
 * the reverse direction, and never triggered by anything that looks like a write to
 * both stores at once — the 18-19 Sep confusion happened precisely because a write
 * to one store looked like a write to both.
 *
 * TWO DECISIONS TAKEN HERE (both were open questions on the card, decided 25 Sep,
 * Brendan's authority — "you can do that"):
 *
 * 1. WHEN this runs: on an explicit schedule (nightly), not hooked into
 *    `business_profile --action=set`. An on-confirmation trigger would need this
 *    module imported into the write path, which is exactly the kind of implicit,
 *    look-like-one-write coupling the card warns against. A separate scheduled job
 *    is a visible, auditable trigger, matches every other tts-data feed
 *    (search-console-sync, profile-mirror-drift), and idempotency (required below)
 *    makes "runs again later" harmless. Sequencing note: this MUST run after any
 *    reader-widening change (14zfmu0z27d, already merged), or after — never matters
 *    which, since a site with no row and no sync just keeps reading `unavailable`.
 *
 * 2. Deletion/absence semantics: a site_profile row that is DEACTIVATED
 *    (`active = false`) or DELETED from the MCP store is simply not present in the
 *    active list this sync reads, so it is SKIPPED — the tts-data row, if one
 *    exists, is left completely untouched (not blanked, not deleted). Rationale:
 *    the mirrored fields are commercial facts a human confirmed; a deactivation is
 *    not evidence that those facts became false, and blanking would make a real,
 *    reviewed profile look identical to one that was never mirrored (mirror: null),
 *    which is a worse lie than staleness. A row is only ever written by an active,
 *    reviewed source profile — this sync never removes data on its own initiative.
 */

/** The subset of the MCP SiteProfile this sync reads. */
export interface SourceProfile {
	siteUrl: string;
	active: boolean;
	description?: string;
	services: string[];
	audiences: string[];
	goals?: string;
	exclusions: string[];
	businessTerms: string[];
	/** ISO timestamp of the original human confirmation. Unset = draft, never synced. */
	profileReviewedAt?: string;
}

/** The exact tts-data seo.business_profile columns this sync writes. */
export interface MirrorFields {
	summary: string | null;
	services: string[];
	/**
	 * The MCP store's profile_reviewed_at, verbatim. NEVER the moment of syncing —
	 * stamping review time at load would silently reset K7's profile-age score to
	 * 100 for every site on every run. That is the card's hard constraint.
	 */
	reviewed_at: string;
	audiences: string[];
	goals: string | null;
	exclusions: string[];
	business_terms: string[];
	/** The moment of THIS sync. The only field allowed to carry sync-time. */
	synced_at: string;
}

export type SyncPlanEntry =
	| { kind: 'sync'; siteUrl: string; siteId: string; fields: MirrorFields }
	| { kind: 'skip-inactive'; siteUrl: string }
	| { kind: 'skip-unconfirmed'; siteUrl: string }
	| { kind: 'skip-unmatched'; siteUrl: string };

/**
 * Resolves a source profile's siteUrl to the tts-data seo.site.id it mirrors into.
 * Implemented as an interface (not a plain Map) so the orchestrator can back it
 * with a single PostgREST query while tests supply a fixed table.
 */
export interface SiteIdLookup {
	idFor(siteUrl: string): string | undefined;
}

export function mapLookup(bySiteUrl: Record<string, string>): SiteIdLookup {
	return { idFor: (siteUrl) => bySiteUrl[siteUrl] };
}

/**
 * Pure planning: no I/O, given profiles + a site lookup + the sync's own clock,
 * decide what happens to each source row. Deterministic and fully unit-testable;
 * the orchestrator's only job is to run this and then execute the 'sync' entries.
 */
export function planBusinessProfileSync(
	profiles: SourceProfile[],
	lookup: SiteIdLookup,
	syncedAt: string
): SyncPlanEntry[] {
	return profiles.map((profile) => {
		// Decision 2: an inactive/removed source row is invisible to this sync, full
		// stop. Nothing about the tts-data side is touched for it.
		if (!profile.active) return { kind: 'skip-inactive', siteUrl: profile.siteUrl };

		// Unconfirmed drafts stay unsynced on purpose: "confirmed profile in the MCP
		// store" is the card's own done-when condition, and a draft mirrored in would
		// let an unreviewed guess feed K4/K7 exactly like a reviewed fact.
		if (!profile.profileReviewedAt) return { kind: 'skip-unconfirmed', siteUrl: profile.siteUrl };

		const siteId = lookup.idFor(profile.siteUrl);
		if (!siteId) return { kind: 'skip-unmatched', siteUrl: profile.siteUrl };

		return {
			kind: 'sync',
			siteUrl: profile.siteUrl,
			siteId,
			fields: {
				// Empty overwrites: the source records genuinely-empty fields as
				// observed values, not gaps (Impact Maintenance's businessTerms is the
				// worked example on the card) — so every array/goal below is passed
				// through as-is, never skipped because it happens to be empty.
				summary: profile.description ?? null,
				services: profile.services,
				reviewed_at: profile.profileReviewedAt,
				audiences: profile.audiences,
				goals: profile.goals ?? null,
				exclusions: profile.exclusions,
				business_terms: profile.businessTerms,
				synced_at: syncedAt
			}
		};
	});
}
