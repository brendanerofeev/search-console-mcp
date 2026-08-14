/**
 * Postgres store.
 *
 * Exists because Google gives us nothing durable:
 *  - Search Console's Search Analytics window is ROLLING (~16 months) and, in
 *    practice, only reaches back to when each property was created. Days that
 *    age out are gone permanently, so history must be snapshotted locally.
 *  - The URL Inspection API is capped at 2,000 calls/day/property and returns
 *    one URL per call, so index status must be cached rather than re-fetched.
 *  - Competitor positions (Serper) are billed per call and are not retained
 *    anywhere by Google at all.
 *
 * Postgres rather than SQLite because this backs multi-tenant reporting that
 * customers log into: concurrent readers alongside the writer, and row-level
 * tenant isolation, are both things SQLite would fight us on.
 */
import pg from 'pg';

const { Pool } = pg;

export type QueryParam = unknown;

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

/** Connection string; DATABASE_URL is the deployment contract. */
export function getConnectionString(): string {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error(
            'DATABASE_URL is not set. Point it at the Postgres instance, e.g. ' +
            'postgres://search_console:<password>@db:5432/search_console'
        );
    }
    return url;
}

/** Lazily-created connection pool. */
export function getPool(): pg.Pool {
    if (!pool) {
        pool = new Pool({
            connectionString: getConnectionString(),
            max: Number(process.env.PGPOOL_MAX ?? 10),
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 10_000,
        });
        // A pool error (e.g. server restart) must not take the process down.
        pool.on('error', (err) => console.error('[store] idle client error:', err.message));
    }
    return pool;
}

const SCHEMA = `
-- One row per customer site. Everything location- or brand-sensitive resolves
-- from here, because these properties belong to different customers in
-- different markets; a global default would silently misreport rank.
CREATE TABLE IF NOT EXISTS site_profile (
  site_url            TEXT PRIMARY KEY,
  customer            TEXT,
  domain              TEXT NOT NULL,
  ga4_property_id     TEXT,
  country             TEXT NOT NULL DEFAULT 'au',
  language            TEXT NOT NULL DEFAULT 'en',
  device              TEXT NOT NULL DEFAULT 'mobile',
  primary_location    TEXT,
  service_areas       JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand_terms         JSONB NOT NULL DEFAULT '[]'::jsonb,
  competitors         JSONB NOT NULL DEFAULT '[]'::jsonb,
  tracked_queries     JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes               TEXT,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily Search Console rows, snapshotted so they outlive Google's window.
CREATE TABLE IF NOT EXISTS rank_daily (
  site_url    TEXT NOT NULL,
  date        DATE NOT NULL,
  query       TEXT NOT NULL,
  page        TEXT NOT NULL DEFAULT '',
  clicks      DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctr         DOUBLE PRECISION NOT NULL DEFAULT 0,
  position    DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (site_url, date, query, page)
);
CREATE INDEX IF NOT EXISTS idx_rank_daily_query ON rank_daily (site_url, query, date);
CREATE INDEX IF NOT EXISTS idx_rank_daily_date  ON rank_daily (site_url, date);

-- Observed live SERP positions (ours and competitors'), from Serper.
CREATE TABLE IF NOT EXISTS serp_daily (
  site_url   TEXT NOT NULL,
  date       DATE NOT NULL,
  query      TEXT NOT NULL,
  location   TEXT NOT NULL DEFAULT '',
  device     TEXT NOT NULL DEFAULT 'mobile',
  position   INTEGER NOT NULL,
  url        TEXT NOT NULL,
  domain     TEXT NOT NULL,
  is_ours    BOOLEAN NOT NULL DEFAULT FALSE,
  title      TEXT,
  PRIMARY KEY (site_url, date, query, location, device, position)
);
CREATE INDEX IF NOT EXISTS idx_serp_daily_q      ON serp_daily (site_url, query, date);
CREATE INDEX IF NOT EXISTS idx_serp_daily_domain ON serp_daily (site_url, domain, date);

-- URLs discovered from sitemaps, independent of whether they've been inspected.
CREATE TABLE IF NOT EXISTS url_discovery (
  site_url   TEXT NOT NULL,
  url        TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'sitemap',
  lastmod    TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (site_url, url)
);

-- Cached URL Inspection results, so the 2,000/day quota is spent only on
-- URLs that are new or stale.
CREATE TABLE IF NOT EXISTS url_status (
  site_url          TEXT NOT NULL,
  url               TEXT NOT NULL,
  verdict           TEXT,
  coverage_state    TEXT,
  robots_txt_state  TEXT,
  indexing_state    TEXT,
  page_fetch_state  TEXT,
  google_canonical  TEXT,
  user_canonical    TEXT,
  crawled_as        TEXT,
  last_crawl_time   TEXT,
  sitemaps          JSONB,
  referring_urls    JSONB,
  rich_results      JSONB,
  inspected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw               JSONB,
  PRIMARY KEY (site_url, url)
);
CREATE INDEX IF NOT EXISTS idx_url_status_verdict ON url_status (site_url, verdict);
CREATE INDEX IF NOT EXISTS idx_url_status_seen    ON url_status (site_url, inspected_at);

-- URL Inspection quota ledger, per property per UTC day.
CREATE TABLE IF NOT EXISTS quota_usage (
  site_url TEXT NOT NULL,
  day      DATE NOT NULL,
  calls    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_url, day)
);

-- Free-form bookkeeping (last sync timestamps, backfill cursors).
CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- What the business actually does. Keyword relevance cannot be judged from
-- Search Console alone: GSC only shows terms we ALREADY appear for, so it can
-- never propose a service we sell but have never ranked for. This is the other
-- half of the input, and it is human-authored per customer.
ALTER TABLE site_profile ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE site_profile ADD COLUMN IF NOT EXISTS services      JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE site_profile ADD COLUMN IF NOT EXISTS audiences     JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE site_profile ADD COLUMN IF NOT EXISTS goals         TEXT;
-- Terms that must never become targets (wrong service, wrong region, competitor
-- brands we cannot win, job-seeker intent).
ALTER TABLE site_profile ADD COLUMN IF NOT EXISTS exclusions    JSONB NOT NULL DEFAULT '[]'::jsonb;
-- What a customer would CALL this kind of provider when searching
-- ("technology consultant", "plumber", "systems integrator"). Head terms are
-- built from this. It cannot be inferred from the services list, which is
-- written in internal capability language ("software licence right-sizing")
-- rather than the words anyone actually types into Google.
ALTER TABLE site_profile ADD COLUMN IF NOT EXISTS business_terms JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE site_profile ADD COLUMN IF NOT EXISTS profile_notes TEXT;
ALTER TABLE site_profile ADD COLUMN IF NOT EXISTS profile_reviewed_at TIMESTAMPTZ;

-- Keyword candidates from every source, with provenance kept so a term backed
-- by three independent sources can outrank one backed by a guess.
CREATE TABLE IF NOT EXISTS keyword_candidate (
  site_url     TEXT NOT NULL,
  keyword      TEXT NOT NULL,
  source       TEXT NOT NULL,          -- gsc | profile | serper | ads | manual
  opportunity  TEXT,                   -- classification when it came from GSC
  impressions  DOUBLE PRECISION,
  position     DOUBLE PRECISION,
  search_volume INTEGER,               -- Ads Keyword Planner, when available
  competition  TEXT,
  score        DOUBLE PRECISION NOT NULL DEFAULT 0,
  click_upside DOUBLE PRECISION,
  rationale    TEXT,
  -- pending | targeted | rejected. Set by a human reviewing the report.
  status       TEXT NOT NULL DEFAULT 'pending',
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (site_url, keyword, source)
);
CREATE INDEX IF NOT EXISTS idx_kw_candidate_status ON keyword_candidate (site_url, status);

-- The keywords we have decided to shoot for. This is the operational worklist:
-- most day-to-day effort is moving these up, not finding new ones.
CREATE TABLE IF NOT EXISTS keyword_target (
  site_url        TEXT NOT NULL,
  keyword         TEXT NOT NULL,
  target_page     TEXT,                -- the page that SHOULD win it
  target_position INTEGER NOT NULL DEFAULT 5,
  priority        INTEGER NOT NULL DEFAULT 3,   -- 1 highest
  status          TEXT NOT NULL DEFAULT 'active', -- active | won | parked
  notes           TEXT,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (site_url, keyword)
);
CREATE INDEX IF NOT EXISTS idx_kw_target_status ON keyword_target (site_url, status);
`;

/** Create the schema once per process. Safe to call from every entry point. */
export function ensureSchema(): Promise<void> {
    schemaReady ??= getPool()
        .query(SCHEMA)
        .then(() => undefined);
    return schemaReady;
}

/** Run a query, ensuring the schema exists first. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params: QueryParam[] = []
): Promise<T[]> {
    await ensureSchema();
    const res = await getPool().query<T>(text, params as any[]);
    return res.rows;
}

/** Run a query expecting at most one row. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params: QueryParam[] = []
): Promise<T | undefined> {
    return (await query<T>(text, params))[0];
}

/**
 * Run `fn` inside a transaction on a dedicated client.
 * Used for bulk inserts so a partial sync never lands half-written.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    await ensureSchema();
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
    } finally {
        client.release();
    }
}

/** Close the pool (tests, graceful shutdown). */
export async function closeDb(): Promise<void> {
    await pool?.end();
    pool = null;
    schemaReady = null;
}

/** ISO-8601 timestamp. */
export function nowIso(): string {
    return new Date().toISOString();
}

/** YYYY-MM-DD for a Date (UTC). */
export function isoDate(d: Date = new Date()): string {
    return d.toISOString().slice(0, 10);
}

/** Bare registrable host from a GSC property string or URL. */
export function toDomain(value: string): string {
    return value
        .replace(/^sc-domain:/, '')
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .toLowerCase()
        .replace(/^www\./, '');
}
