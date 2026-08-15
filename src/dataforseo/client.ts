/**
 * DataForSEO API client.
 *
 * Covers the three gaps nothing else in this server can fill: off-page/backlink
 * data, real Google Ads search volume without the Basic-access queue, and AI
 * search visibility (LLM mentions/citations).
 *
 * The account is PREPAID pay-as-you-go, which changes how this has to be
 * written: every response carries a `cost` in dollars, and a loop that forgets
 * to check it can drain the balance with nothing to show. So every call is
 * metered into api_spend, and the balance is checkable — an unmetered client
 * against a prepaid account is a liability, not a convenience.
 */
import { query } from '../store/db.js';

const BASE = 'https://api.dataforseo.com/v3';

export class DataForSeoError extends Error {
    constructor(message: string, readonly statusCode?: number) {
        super(message);
        this.name = 'DataForSeoError';
    }
}

function auth(): string {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) {
        throw new DataForSeoError(
            'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not set, so backlink, search-volume ' +
            'and AI-visibility tools are unavailable. If they are stored in sops, run /sync in ' +
            'this session to load them (an interactive session does not get sops values ' +
            'automatically; the workflow engine does, at boot). Otherwise set them in .env.'
        );
    }
    return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

/** Record what a call cost, so prepaid balance burn is visible after the fact. */
async function meter(endpoint: string, cost: number, siteUrl?: string): Promise<void> {
    await query(
        `INSERT INTO api_spend (provider, endpoint, site_url, day, calls, cost_usd)
         VALUES ('dataforseo', $1, $2, CURRENT_DATE, 1, $3)
         ON CONFLICT (provider, endpoint, site_url, day) DO UPDATE SET
           calls = api_spend.calls + 1,
           cost_usd = api_spend.cost_usd + EXCLUDED.cost_usd`,
        [endpoint, siteUrl ?? '', cost]
    );
}

export interface CallResult<T> {
    result: T;
    cost: number;
}

/**
 * POST a task array to a DataForSEO endpoint and return the first task result.
 *
 * DataForSEO wraps everything twice (status at the envelope AND per task) and a
 * task can fail while the envelope reports 20000, so both layers are checked —
 * otherwise a failed task reads as an empty result and looks like "no data".
 */
export async function call<T = unknown>(
    endpoint: string,
    task: Record<string, unknown>,
    opts: { siteUrl?: string } = {}
): Promise<CallResult<T>> {
    const res = await fetch(`${BASE}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify([task]),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new DataForSeoError(
            `DataForSEO ${endpoint} returned HTTP ${res.status}. ${body.slice(0, 200)}`,
            res.status
        );
    }

    const json = (await res.json()) as {
        status_code: number;
        status_message: string;
        cost?: number;
        tasks?: Array<{ status_code: number; status_message: string; cost?: number; result?: T }>;
    };

    if (json.status_code !== 20000) {
        throw new DataForSeoError(`DataForSEO ${endpoint}: ${json.status_message} (${json.status_code})`);
    }

    const t = json.tasks?.[0];
    if (!t) throw new DataForSeoError(`DataForSEO ${endpoint} returned no task.`);
    if (t.status_code !== 20000) {
        throw new DataForSeoError(`DataForSEO ${endpoint} task: ${t.status_message} (${t.status_code})`);
    }

    const cost = Number(json.cost ?? t.cost ?? 0);
    await meter(endpoint, cost, opts.siteUrl).catch(() => { /* metering must never break the call */ });

    return { result: t.result as T, cost };
}

/** Remaining prepaid balance and today's spend. */
export async function accountBalance(): Promise<{ balance: number; spentToday: number; spentTotal: number }> {
    const res = await fetch(`${BASE}/appendix/user_data`, { headers: { Authorization: auth() } });
    if (!res.ok) throw new DataForSeoError(`DataForSEO user_data returned HTTP ${res.status}`, res.status);
    const json = (await res.json()) as {
        tasks?: Array<{ result?: Array<{ money?: { balance?: number } }> }>;
    };
    const balance = Number(json.tasks?.[0]?.result?.[0]?.money?.balance ?? 0);

    const rows = await query<{ today: string; total: string }>(
        `SELECT COALESCE(SUM(cost_usd) FILTER (WHERE day = CURRENT_DATE),0)::text today,
                COALESCE(SUM(cost_usd),0)::text total
           FROM api_spend WHERE provider = 'dataforseo'`
    );
    return {
        balance,
        spentToday: Number(rows[0]?.today ?? 0),
        spentTotal: Number(rows[0]?.total ?? 0),
    };
}
