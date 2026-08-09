import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseMicrosoftDate } from '../src/common/utils/dates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Tier 2: Real Production API Snapshot Fixtures', () => {
  const bingFixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/bing-response.json'), 'utf8'));
  const gscFixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/gsc-response.json'), 'utf8'));

  describe('Bing API Real Snapshot Parsing', () => {
    it('should parse queryStats dates from Bing snapshot without throwing NaN', () => {
      bingFixture.queryStats.forEach((item: any) => {
        const parsedDate = parseMicrosoftDate(item.Date);
        expect(parsedDate).toBeInstanceOf(Date);
        expect(isNaN(parsedDate.getTime())).toBe(false);
      });
    });

    it('should parse sitemap submission dates including negative Win32 epoch timestamps', () => {
      bingFixture.sitemaps.forEach((sm: any) => {
        const parsedDate = parseMicrosoftDate(sm.lastSubmitted);
        expect(parsedDate).toBeInstanceOf(Date);
        expect(isNaN(parsedDate.getTime())).toBe(false);
      });
    });

    it('should parse LastCrawledDate from Bing UrlInfo snapshot', () => {
      const parsedDate = parseMicrosoftDate(bingFixture.urlInfo.LastCrawledDate);
      expect(parsedDate).toBeInstanceOf(Date);
      expect(isNaN(parsedDate.getTime())).toBe(false);
      expect(parsedDate.getTime()).toBe(1786249419000);
    });
  });

  describe('Google Search Console API Snapshot Parsing', () => {
    it('should identify sc-domain prefix in siteList snapshot entries', () => {
      const sites = gscFixture.siteList.siteEntry;
      const domainSite = sites.find((s: any) => s.siteUrl.startsWith('sc-domain:'));
      expect(domainSite).toBeDefined();
      expect(domainSite.siteUrl).toBe('sc-domain:example.com');
    });

    it('should parse Search Analytics query rows correctly', () => {
      const rows = gscFixture.searchAnalyticsQuery.rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].keys[0]).toBe('seo tools');
      expect(rows[0].clicks).toBe(150);
    });
  });
});
