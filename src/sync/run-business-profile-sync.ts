import { listProfiles } from '../store/profiles.js';
import {
	mapLookup,
	planBusinessProfileSync,
	type MirrorFields,
	type SourceProfile,
	type SyncPlanEntry
} from './business-profile-sync.js';
import { TtsDataClient } from './tts-data-client.js';

export interface SyncSummary {
	synced: string[];
	skippedInactive: string[];
	skippedUnconfirmed: string[];
	skippedUnmatched: string[];
	failed: { siteUrl: string; error: string }[];
}

function emptySummary(): SyncSummary {
	return { synced: [], skippedInactive: [], skippedUnconfirmed: [], skippedUnmatched: [], failed: [] };
}

interface TtsSite {
	id: string;
	gsc_property: string | null;
}

/**
 * Upsert one site's mirrored fields. select-then-write rather than a PostgREST
 * upsert header: this job has a single writer (one nightly run) so there is no
 * concurrent-write race to protect against, and select-then-write means the
 * writer stays a three-method client (select/patch/insert) with no on_conflict
 * semantics to get right for a table this sync does not own the schema of.
 */
async function upsertOne(
	client: TtsDataClient,
	siteId: string,
	fields: MirrorFields
): Promise<void> {
	const existing = await client.select<{ site_id: string }>('business_profile', {
		site_id: `eq.${siteId}`,
		select: 'site_id',
		limit: '1'
	});

	if (existing.length > 0) {
		await client.patch('business_profile', { site_id: `eq.${siteId}` }, fields);
	} else {
		await client.insert('business_profile', { site_id: siteId, ...fields });
	}
}

/**
 * Runs the full sync: read active MCP profiles, map to tts-data site ids, plan,
 * then write. One site failing to write does not abort the run — every other
 * site still gets its chance, and the failure is named in the summary so it
 * reaches the same alert path as any other partial-failure nightly job.
 */
export async function runBusinessProfileSync(
	client: TtsDataClient,
	now: () => Date = () => new Date(),
	profileSource: () => Promise<SourceProfile[]> = () => listProfiles()
): Promise<SyncSummary> {
	const profiles = await profileSource();

	const sites = await client.select<TtsSite>('site', { select: 'id,gsc_property' });
	const bySiteUrl: Record<string, string> = {};
	for (const site of sites) {
		if (site.gsc_property) bySiteUrl[site.gsc_property] = site.id;
	}

	const plan = planBusinessProfileSync(profiles, mapLookup(bySiteUrl), now().toISOString());
	return executePlan(client, plan);
}

async function executePlan(client: TtsDataClient, plan: SyncPlanEntry[]): Promise<SyncSummary> {
	const summary = emptySummary();

	for (const entry of plan) {
		switch (entry.kind) {
			case 'skip-inactive':
				summary.skippedInactive.push(entry.siteUrl);
				break;
			case 'skip-unconfirmed':
				summary.skippedUnconfirmed.push(entry.siteUrl);
				break;
			case 'skip-unmatched':
				summary.skippedUnmatched.push(entry.siteUrl);
				break;
			case 'sync':
				try {
					await upsertOne(client, entry.siteId, entry.fields);
					summary.synced.push(entry.siteUrl);
				} catch (error) {
					summary.failed.push({
						siteUrl: entry.siteUrl,
						error: error instanceof Error ? error.message : String(error)
					});
				}
				break;
		}
	}

	return summary;
}
