import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock googleapis before importing anything that uses it
vi.mock('googleapis', () => ({
    searchconsole_v1: {},
    google: {
        searchconsole: vi.fn().mockReturnValue({})
    }
}));

// Mock node-machine-id
vi.mock('node-machine-id', () => ({
    default: {
        machineIdSync: vi.fn().mockReturnValue('mock-machine-id')
    }
}));

// Import mocks BEFORE tools to ensure vi.mock in mocks.ts takes effect?
// Actually, let's redefine the mock here to be safe and explicit, or try reordering.
// Reordering imports relies on hoisting behavior which might be tricky.
// Better to explicitly mock here.

import { mockSearchConsoleClient } from './mocks';

// Re-mock src/google/client here to ensure it applies
vi.mock('../src/google/client', () => ({
  getSearchConsoleClient: vi.fn().mockResolvedValue(mockSearchConsoleClient),
}));

import { inspectBatch as inspectBatchGoogle } from '../src/google/tools/inspection';
import { inspectBatch as inspectBatchBing } from '../src/bing/tools/inspection';

// Mock Bing client using vi.hoisted to avoid hoisting issues
const mockBingClient = vi.hoisted(() => ({
    getUrlInfo: vi.fn(),
}));

vi.mock('../src/bing/client', () => ({
    getBingClient: vi.fn().mockResolvedValue(mockBingClient),
}));

describe('Batch Inspection Tool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Google Batch Inspection', () => {
        it('should process multiple URLs in batch', async () => {
            const siteUrl = 'https://example.com';
            const urls = ['https://example.com/page1', 'https://example.com/page2', 'https://example.com/page3'];

            mockSearchConsoleClient.urlInspection.index.inspect.mockImplementation(async ({ requestBody }) => {
                return {
                    data: {
                        inspectionResult: {
                            indexStatusResult: {
                                verdict: 'PASS',
                                inspectionUrl: requestBody.inspectionUrl
                            }
                        }
                    }
                };
            });

            const results = await inspectBatchGoogle(siteUrl, urls);

            expect(results).toHaveLength(3);
            expect(mockSearchConsoleClient.urlInspection.index.inspect).toHaveBeenCalledTimes(3);
            expect(results[0].url).toBe(urls[0]);
            expect(results[0].result?.inspectionResult?.indexStatusResult?.verdict).toBe('PASS');
        });

        it('should reuse a single client instance for the entire batch instead of per-URL lookups', async () => {
            const getSearchConsoleClientMock = (await import('../src/google/client')).getSearchConsoleClient;
            vi.mocked(getSearchConsoleClientMock).mockClear();

            const siteUrl = 'https://example.com';
            const urls = ['https://example.com/page1', 'https://example.com/page2', 'https://example.com/page3'];

            mockSearchConsoleClient.urlInspection.index.inspect.mockResolvedValue({
                data: { result: 'ok' }
            });

            await inspectBatchGoogle(siteUrl, urls);

            // Verified optimization: Client resolves exactly 1 time instead of N+1 times
            expect(getSearchConsoleClientMock).toHaveBeenCalledTimes(1);
        });

        it('should handle errors for individual URLs', async () => {
            const siteUrl = 'https://example.com';
            const urls = ['https://example.com/page1', 'https://example.com/error'];

            mockSearchConsoleClient.urlInspection.index.inspect.mockImplementation(async ({ requestBody }) => {
                if (requestBody.inspectionUrl.includes('error')) {
                    throw new Error('API Error');
                }
                return { data: { result: 'ok' } };
            });

            const results = await inspectBatchGoogle(siteUrl, urls);

            expect(results).toHaveLength(2);
            expect(results[0].result).toBeDefined();
            expect(results[1].error).toBe('API Error');
        });
    });

    describe('Bing Batch Inspection', () => {
        it('should process multiple URLs in batch', async () => {
            const siteUrl = 'https://example.com';
            const urls = ['https://example.com/page1', 'https://example.com/page2'];

            mockBingClient.getUrlInfo.mockResolvedValue({
                IndexStatus: 'Indexed'
            });

            const results = await inspectBatchBing(siteUrl, urls);

            expect(results).toHaveLength(2);
            expect(mockBingClient.getUrlInfo).toHaveBeenCalledTimes(2);
            expect(results[0].result).toEqual({ IndexStatus: 'Indexed' });
        });

        it('should handle errors for individual URLs', async () => {
            const siteUrl = 'https://example.com';
            const urls = ['https://example.com/page1', 'https://example.com/error'];

            mockBingClient.getUrlInfo.mockImplementation(async (site, url) => {
                if (url.includes('error')) {
                    throw new Error('Bing API Error');
                }
                return { IndexStatus: 'Indexed' };
            });

            const results = await inspectBatchBing(siteUrl, urls);

            expect(results).toHaveLength(2);
            expect(results[0].result).toBeDefined();
            expect(results[1].error).toBe('Bing API Error');
        });
    });
});
