import { describe, expect, it, vi } from 'vitest';
import { configFromEnv, TtsDataClient } from '../../../src/sync/tts-data-client.js';

describe('configFromEnv', () => {
	it('throws when either credential is missing, naming both required vars', () => {
		expect(() => configFromEnv({})).toThrow(/TTS_DATA_API_URL and TTS_DATA_API_TOKEN/);
		expect(() => configFromEnv({ TTS_DATA_API_URL: 'https://x' })).toThrow(/TTS_DATA_API_TOKEN/);
	});

	it('reads both vars when present', () => {
		const config = configFromEnv({ TTS_DATA_API_URL: 'https://x', TTS_DATA_API_TOKEN: 'tok' });
		expect(config).toEqual({ apiUrl: 'https://x', apiToken: 'tok' });
	});
});

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), { status: 200, headers });
}

describe('TtsDataClient', () => {
	it('sends the seo_service bearer token and Accept-Profile on select', async () => {
		const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
			expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
			expect((init.headers as Record<string, string>)['Accept-Profile']).toBe('seo');
			return jsonResponse([{ id: 'site-1' }]);
		});
		const client = new TtsDataClient({ apiUrl: 'https://x', apiToken: 'tok', fetchImpl });

		const rows = await client.select('site', { select: 'id' });

		expect(rows).toEqual([{ id: 'site-1' }]);
		expect(fetchImpl).toHaveBeenCalledWith('https://x/site?select=id', expect.anything());
	});

	it('patch reports true when content-range shows a row was updated', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse('', { 'content-range': '0-0/1' }));
		const client = new TtsDataClient({ apiUrl: 'https://x', apiToken: 'tok', fetchImpl });

		const updated = await client.patch('business_profile', { site_id: 'eq.site-1' }, { summary: 'x' });

		expect(updated).toBe(true);
	});

	it('patch reports false when content-range shows nothing matched', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse('', { 'content-range': '*/0' }));
		const client = new TtsDataClient({ apiUrl: 'https://x', apiToken: 'tok', fetchImpl });

		const updated = await client.patch('business_profile', { site_id: 'eq.missing' }, { summary: 'x' });

		expect(updated).toBe(false);
	});

	it('throws with the response body on a non-2xx response', async () => {
		const fetchImpl = vi.fn(
			async () => new Response('constraint violation', { status: 400, statusText: 'Bad Request' })
		);
		const client = new TtsDataClient({ apiUrl: 'https://x', apiToken: 'tok', fetchImpl });

		await expect(client.insert('business_profile', { site_id: 'site-1' })).rejects.toThrow(
			/tts-data postgrest 400.*constraint violation/
		);
	});
});
