import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeWebsite, resolveAccount } from '../src/common/auth/resolver.js';
import { loadConfig } from '../src/common/auth/config.js';
import { parseMicrosoftDate } from '../src/common/utils/dates.js';

// Mock loadConfig to return realistic test account configurations
vi.mock('../src/common/auth/config.js', async () => {
  const actual = await vi.importActual('../src/common/auth/config.js');
  return {
    ...actual as any,
    loadConfig: vi.fn(),
  };
});

describe('Tier 1: MCP Server End-to-End User Input Scenarios', () => {
  const mockConfig = {
    accounts: {
      'google_corp': {
        id: 'google_corp',
        engine: 'google',
        alias: 'Google Corp',
        websites: ['sc-domain:example.com', 'https://example.com/']
      },
      'bing_agency': {
        id: 'bing_agency',
        engine: 'bing',
        alias: 'Bing Agency',
        websites: ['https://example.com/']
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(mockConfig as any);
  });

  describe('User Input Variation Resolution (Domain vs sc-domain vs URL-prefix)', () => {
    const userInputs = [
      { input: 'example.com', description: 'Bare domain' },
      { input: 'https://example.com/', description: 'Full HTTPS URL' },
      { input: 'https://example.com/blog/page-1', description: 'Subpage URL' },
      { input: 'sc-domain:example.com', description: 'GSC sc-domain format' }
    ];

    userInputs.forEach(({ input, description }) => {
      it(`should successfully authorize ${description} ("${input}") for Bing`, async () => {
        const account = await resolveAccount(input, 'bing');
        expect(account.id).toBe('bing_agency');
      });

      it(`should successfully authorize ${description} ("${input}") for Google`, async () => {
        const account = await resolveAccount(input, 'google');
        expect(account.id).toBe('google_corp');
      });
    });
  });

  describe('Real-World Production Date Payload Handling', () => {
    it('should parse positive Bing timestamps (/Date(ms-offset)/)', () => {
      const parsed = parseMicrosoftDate('/Date(1731225600000-0800)/');
      expect(parsed).toBeInstanceOf(Date);
      expect(isNaN(parsed.getTime())).toBe(false);
      expect(parsed.getTime()).toBe(1731225600000);
    });

    it('should parse positive Bing timestamps without offset (/Date(ms)/)', () => {
      const parsed = parseMicrosoftDate('/Date(1786249419000)/');
      expect(parsed).toBeInstanceOf(Date);
      expect(isNaN(parsed.getTime())).toBe(false);
      expect(parsed.getTime()).toBe(1786249419000);
    });

    it('should parse negative Bing timestamps (/Date(-11644473600000)/) without returning Invalid Date', () => {
      const parsed = parseMicrosoftDate('/Date(-11644473600000)/');
      expect(parsed).toBeInstanceOf(Date);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });
});
