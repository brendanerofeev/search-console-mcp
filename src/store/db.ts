/**
 * Local SQLite store.
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
 * Uses better-sqlite3 rather than node:sqlite so this fork keeps working on
 * Node 18/20 (node:sqlite needs 22.5+), leaving the door open to upstreaming.
 * Pinned to 12.x: v13 publishes no prebuilt binaries, which forces a source
 * build and fails on any machine without a C++ toolchain.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = Database.Database;

let cached: Db | null = null;

/** Resolved path of the store; override with SEO_DB_PATH. */
export function getDbPath(): string {
    return process.env.SEO_DB_PATH ?? join(homedir(), '.search-console-mcp-data.db');
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- One row per customer site. Everything location- or brand-sensitive resolves
-- from here, because these properties belong to different customers in
-- different markets; a global default would silently misreport rank.
CREATE TABLE IF NOT EXISTS site_profile (
  site_url            TEXT PRIMARY KEY,      -- GSC property, e.g. sc-domain:example.com
  customer            TEXT,                  -- Client/business name
  domain              TEXT,                  -- Bare host, e.g. example.com
  ga4_property_id     TEXT,
  country             TEXT NOT NULL DEFAULT 'au',   -- Serper gl
  language            TEXT NOT NULL DEFAULT 'en',   -- Serper hl
  device              TEXT NOT NULL DEFAULT 'mobile',
  primary_location    TEXT,                  -- e.g. 'Brisbane, Queensland, Australia'
  service_areas       TEXT NOT NULL DEFAULT '[]',   -- JSON array of extra locations
  brand_terms         TEXT NOT NULL DEFAULT '[]',   -- JSON array
  competitors         TEXT NOT NULL DEFAULT '[]',   -- JSON array of domains
  tracked_queries     TEXT NOT NULL DEFAULT '[]',   -- JSON array
  notes               TEXT,
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

-- Daily Search Console rows, snapshotted so they outlive Google's window.
CREATE TABLE IF NOT EXISTS rank_daily (
  site_url    TEXT NOT NULL,
  date        TEXT NOT NULL,
  query       TEXT NOT NULL,
  page        TEXT NOT NULL DEFAULT '',
  clicks      REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr         REAL NOT NULL DEFAULT 0,
  position    REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (site_url, date, query, page)
);
CREATE INDEX IF NOT EXISTS idx_rank_daily_query ON rank_daily (site_url, query, date);
CREATE INDEX IF NOT EXISTS idx_rank_daily_date  ON rank_daily (site_url, date);

-- Observed live SERP positions (ours and competitors'), from Serper.
CREATE TABLE IF NOT EXISTS serp_daily (
  site_url   TEXT NOT NULL,
  date       TEXT NOT NULL,
  query      TEXT NOT NULL,
  location   TEXT NOT NULL DEFAULT '',
  device     TEXT NOT NULL DEFAULT 'mobile',
  position   INTEGER NOT NULL,
  url        TEXT NOT NULL,
  domain     TEXT NOT NULL,
  is_ours    INTEGER NOT NULL DEFAULT 0,
  title      TEXT,
  PRIMARY KEY (site_url, date, query, location, device, position)
);
CREATE INDEX IF NOT EXISTS idx_serp_daily_q ON serp_daily (site_url, query, date);

-- URLs discovered from sitemaps, independent of whether they've been inspected.
CREATE TABLE IF NOT EXISTS url_discovery (
  site_url   TEXT NOT NULL,
  url        TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'sitemap',
  lastmod    TEXT,
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
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
  sitemaps          TEXT,
  referring_urls    TEXT,
  rich_results      TEXT,
  inspected_at      TEXT NOT NULL,
  raw               TEXT,
  PRIMARY KEY (site_url, url)
);
CREATE INDEX IF NOT EXISTS idx_url_status_verdict ON url_status (site_url, verdict);
CREATE INDEX IF NOT EXISTS idx_url_status_seen    ON url_status (site_url, inspected_at);

-- URL Inspection quota ledger, per property per UTC day.
CREATE TABLE IF NOT EXISTS quota_usage (
  site_url TEXT NOT NULL,
  day      TEXT NOT NULL,
  calls    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_url, day)
);

-- Free-form bookkeeping (last sync timestamps, backfill cursors).
CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Open (and migrate) the store. Cached for the process lifetime. */
export function getDb(): Db {
    if (cached) return cached;
    const path = getDbPath();
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    db.exec(SCHEMA);
    cached = db;
    return db;
}

/** Close and clear the cached handle (tests). */
export function closeDb(): void {
    cached?.close();
    cached = null;
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
