import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeWebsite, resolveAccount } from '../src/common/auth/resolver.js';
import { loadConfig } from '../src/common/auth/config.js';

// Mock config.js
vi.mock('../src/common/auth/config.js', async () => {
    const actual = await vi.importActual('../src/common/auth/config.js');
    return {
        ...actual as any,
        loadConfig: vi.fn(),
    };
});

describe('Multi-Account Resolution & Boundaries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Website Normalization', () => {
        it('should normalize domain strings', () => {
            expect(normalizeWebsite('example.com')).toEqual({ type: 'domain', value: 'example.com' });
            expect(normalizeWebsite('EXAMPLE.COM ')).toEqual({ type: 'domain', value: 'example.com' });
            // sc-domain: is currently treated as url-prefix in the implementation
            expect(normalizeWebsite('sc-domain:example.com')).toEqual({ type: 'url-prefix', value: 'sc-domain:example.com' });
        });

        it('should normalize URL-prefix strings', () => {
            // Trailing slash is removed
            expect(normalizeWebsite('https://example.com/')).toEqual({ type: 'url-prefix', value: 'https://example.com' });
            expect(normalizeWebsite('http://example.com/blog/')).toEqual({ type: 'url-prefix', value: 'http://example.com/blog' });
        });
    });

    describe('Account Resolution', () => {
        const mockConfig = {
            accounts: {
                'google_corp': {
                    id: 'google_corp',
                    engine: 'google',
                    alias: 'Corp',
                    websites: ['example.com', 'https://corp.com/site'] // No trailing slash in boundary
                },
                'google_personal': {
                    id: 'google_personal',
                    engine: 'google',
                    alias: 'Personal',
                    websites: [] // Global unrestricted
                },
                'bing_agency': {
                    id: 'bing_agency',
                    engine: 'bing',
                    alias: 'Agency',
                    websites: ['https://client.org']
                }
            }
        };

        it('should resolve by exact URL prefix', async () => {
            vi.mocked(loadConfig).mockResolvedValue(mockConfig as any);
            const account = await resolveAccount('https://corp.com/site/', 'google');
            expect(account.id).toBe('google_corp');
        });

        it('should resolve by domain match', async () => {
            vi.mocked(loadConfig).mockResolvedValue(mockConfig as any);
            const account = await resolveAccount('https://sub.example.com/page', 'google');
            expect(account.id).toBe('google_corp');
        });

        it('should resolve bare domain input against URL-prefix boundary', async () => {
            vi.mocked(loadConfig).mockResolvedValue(mockConfig as any);
            const account = await resolveAccount('client.org', 'bing');
            expect(account.id).toBe('bing_agency');
        });

        it('should resolve sc-domain input against URL-prefix boundary', async () => {
            vi.mocked(loadConfig).mockResolvedValue(mockConfig as any);
            const account = await resolveAccount('sc-domain:client.org', 'bing');
            expect(account.id).toBe('bing_agency');
        });

        it('should resolve to global unrestricted account if no match found', async () => {
            vi.mocked(loadConfig).mockResolvedValue(mockConfig as any);
            const account = await resolveAccount('https://other-site.com', 'google');
            expect(account.id).toBe('google_personal');
        });

        it('should throw FORBIDDEN error if site not in boundary and no global account exists', async () => {
            vi.mocked(loadConfig).mockResolvedValue(mockConfig as any);
            try {
                await resolveAccount('https://unauthorized.com', 'bing');
                expect.fail('Should have thrown error');
            } catch (error: any) {
                expect(error.message).toContain('Access restricted');
                expect(error.code).toBe('FORBIDDEN');
            }
        });

        it('should handle invalid URLs gracefully when doing domain match', async () => {
            vi.mocked(loadConfig).mockResolvedValue(mockConfig as any);
            try {
                // "invalid-url/prefix" is considered a url-prefix by normalizeWebsite,
                // but new URL("invalid-url/prefix") will throw an error.
                await resolveAccount('invalid-url/prefix', 'bing');
                expect.fail('Should have thrown error');
            } catch (error: any) {
                // It should not crash with "TypeError: Invalid URL", it should throw FORBIDDEN
                // because it's not matching any boundary and no global bing account exists
                expect(error.message).toContain('Access restricted');
                expect(error.code).toBe('FORBIDDEN');
            }
        });

        it('should throw AMBIGUOUS error if multiple global accounts for same engine', async () => {
            const ambiguousConfig = {
                accounts: {
                    'g1': { id: 'g1', engine: 'google', websites: [] },
                    'g2': { id: 'g2', engine: 'google', websites: [] }
                }
            };
            vi.mocked(loadConfig).mockResolvedValue(ambiguousConfig as any);

            try {
                await resolveAccount('https://any.com', 'google');
                expect.fail('Should have thrown error');
            } catch (error: any) {
                expect(error.message).toContain('Multiple google accounts found');
                expect(error.code).toBe('AMBIGUOUS');
            }
        });
    });
});
