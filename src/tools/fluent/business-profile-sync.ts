import { listProfiles } from '../../store/profiles.js';
import { configFromEnv, TtsDataClient } from '../../sync/tts-data-client.js';
import { runBusinessProfileSync } from '../../sync/run-business-profile-sync.js';

/**
 * business_profile_sync: the write side of ClickUp 14zfmu0z27c. One-way,
 * MCP profile store -> tts-data seo.business_profile. See
 * src/sync/business-profile-sync.ts for the WHEN/deletion design decisions.
 *
 * Deliberately takes no arguments — the whole point is a single explicit,
 * scheduled, all-active-profiles run, not a per-site trigger a caller could
 * invoke on confirmation and recreate the 18-19 Sep two-writes confusion.
 */
export async function businessProfileSyncHandler() {
	const client = new TtsDataClient(configFromEnv(process.env));
	const summary = await runBusinessProfileSync(client, () => new Date(), () => listProfiles());

	return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
}
