/**
 * The only module that speaks to tts-data, for the business-profile sync. Deliberately
 * narrow (select/patch/insert against one table, one schema) rather than a generic
 * PostgREST client — this job never needs more, and a narrow surface is easier to
 * audit for a job that WRITES commercial-fact data into another repo's database.
 *
 * Auth/header shape matches tts's own apps/site-measurement/src/lib/store/client.ts
 * so the two stay recognisably the same kind of thing, though this is a separate,
 * purpose-built implementation, not a shared dependency.
 */
export interface TtsDataConfig {
	apiUrl: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
}

export function configFromEnv(env: Record<string, string | undefined>): TtsDataConfig {
	const apiUrl = env.TTS_DATA_API_URL;
	const apiToken = env.TTS_DATA_API_TOKEN;
	if (!apiUrl || !apiToken) {
		throw new Error(
			'TTS_DATA_API_URL and TTS_DATA_API_TOKEN must both be set for the business-profile sync ' +
				'(a seo_service-scoped PostgREST credential — see ClickUp 14zfmu0z27c for provisioning).'
		);
	}
	return { apiUrl, apiToken };
}

export class TtsDataClient {
	private readonly url: string;
	private readonly token: string;
	private readonly fetchImpl: typeof fetch;

	constructor(config: TtsDataConfig) {
		this.url = config.apiUrl;
		this.token = config.apiToken;
		this.fetchImpl = config.fetchImpl ?? fetch;
	}

	private headers(extra: Record<string, string> = {}): Record<string, string> {
		return {
			Authorization: `Bearer ${this.token}`,
			'Accept-Profile': 'seo',
			'Content-Type': 'application/json',
			...extra
		};
	}

	private async request(url: string, init: RequestInit & { headers: Record<string, string> }) {
		const response = await this.fetchImpl(url, init);
		const text = await response.text();
		if (!response.ok) {
			throw new Error(`tts-data postgrest ${response.status} on ${url}: ${text}`);
		}
		return { text, response };
	}

	async select<T>(table: string, query: Record<string, string>): Promise<T[]> {
		const qs = new URLSearchParams(query).toString();
		const { text } = await this.request(`${this.url}/${table}?${qs}`, {
			method: 'GET',
			headers: this.headers()
		});
		return text ? (JSON.parse(text) as T[]) : [];
	}

	/** Returns true if a row was updated, false if the filter matched nothing. */
	async patch(table: string, query: Record<string, string>, values: unknown): Promise<boolean> {
		const qs = new URLSearchParams(query).toString();
		const { response } = await this.request(`${this.url}/${table}?${qs}`, {
			method: 'PATCH',
			headers: this.headers({ 'Content-Profile': 'seo', Prefer: 'return=minimal,count=exact' }),
			body: JSON.stringify(values)
		});
		const range = response.headers.get('content-range') ?? '';
		const reported = Number(range.split('/')[1]);
		return Number.isFinite(reported) && reported > 0;
	}

	async insert(table: string, row: unknown): Promise<void> {
		await this.request(`${this.url}/${table}`, {
			method: 'POST',
			headers: this.headers({ 'Content-Profile': 'seo', Prefer: 'return=minimal' }),
			body: JSON.stringify(row)
		});
	}
}
