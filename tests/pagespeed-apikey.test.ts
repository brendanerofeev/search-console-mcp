import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzePageSpeed } from '../src/google/tools/pagespeed.js';
import { google } from 'googleapis';

// Mock googleapis
const mockRunPageSpeed = vi.fn();
vi.mock('googleapis', () => {
    return {
        google: {
            pagespeedonline: () => ({
                pagespeedapi: {
                    runpagespeed: (...args: any[]) => mockRunPageSpeed(...args)
                }
            })
        }
    };
});

describe('PageSpeed Insights API Key Support', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear env var before each test
        vi.stubEnv('PAGESPEED_API_KEY', '');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('should not pass key parameter when PAGESPEED_API_KEY is not configured', async () => {
        mockRunPageSpeed.mockResolvedValue({
            data: {
                lighthouseResult: {
                    categories: {
                        performance: { score: 0.9 },
                        accessibility: { score: 0.8 },
                        'best-practices': { score: 0.95 },
                        seo: { score: 1.0 }
                    },
                    audits: {}
                }
            }
        });

        await analyzePageSpeed('https://example.com', 'desktop');

        expect(mockRunPageSpeed).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://example.com',
            strategy: 'desktop',
            category: ['performance', 'accessibility', 'best-practices', 'seo']
        }));
        // Verify key is not present in the arguments passed to the api call
        const passedArgs = mockRunPageSpeed.mock.calls[0][0];
        expect(passedArgs.key).toBeUndefined();
    });

    it('should pass key parameter when PAGESPEED_API_KEY is set', async () => {
        vi.stubEnv('PAGESPEED_API_KEY', 'test-api-key-123');

        mockRunPageSpeed.mockResolvedValue({
            data: {
                lighthouseResult: {
                    categories: {
                        performance: { score: 0.9 },
                        accessibility: { score: 0.8 },
                        'best-practices': { score: 0.95 },
                        seo: { score: 1.0 }
                    },
                    audits: {}
                }
            }
        });

        await analyzePageSpeed('https://example.com', 'mobile');

        expect(mockRunPageSpeed).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://example.com',
            strategy: 'mobile',
            category: ['performance', 'accessibility', 'best-practices', 'seo'],
            key: 'test-api-key-123'
        }));
    });

    it('should throw descriptive rate limit instruction error when 429 occurs without an API key', async () => {
        const rateLimitError: any = new Error('Quota exceeded');
        rateLimitError.code = 429;
        mockRunPageSpeed.mockRejectedValue(rateLimitError);

        await expect(analyzePageSpeed('https://example.com'))
            .rejects.toThrow(/PageSpeed Insights rate limit exceeded. You are using the free tier/);
    });

    it('should throw descriptive rate limit instruction error when 500 occurs without an API key', async () => {
        const rateLimitError: any = new Error('Internal Server Error');
        rateLimitError.code = 500;
        mockRunPageSpeed.mockRejectedValue(rateLimitError);

        await expect(analyzePageSpeed('https://example.com'))
            .rejects.toThrow(/PageSpeed Insights rate limit exceeded. You are using the free tier/);
    });

    it('should pass original error through when 429 occurs with an API key', async () => {
        vi.stubEnv('PAGESPEED_API_KEY', 'test-api-key-123');
        const rateLimitError: any = new Error('Quota exceeded with key');
        rateLimitError.code = 429;
        mockRunPageSpeed.mockRejectedValue(rateLimitError);

        await expect(analyzePageSpeed('https://example.com'))
            .rejects.toThrow('Quota exceeded with key');
    });
});
