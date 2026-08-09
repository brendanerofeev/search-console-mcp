import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGoogleData, fetchBingData } from '../src/common/tools/compare-engines/adapters.js';
import * as googleAnalytics from '../src/google/tools/analytics.js';
import * as bingClient from '../src/bing/client.js';

// Mock dependencies
vi.mock('../src/google/tools/analytics.js', () => ({
    queryAnalytics: vi.fn(),
}));

vi.mock('../src/bing/client.js', () => ({
    getBingClient: vi.fn(),
}));

describe('Compare Engines Adapters', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('fetchGoogleData', () => {
        const options = {
            siteUrl: 'https://example.com',
            startDate: '2023-01-01',
            endDate: '2023-01-07',
            dimension: 'query' as const,
            limit: 10,
            offset: 0
        };

        it('should fetch data from Google Analytics', async () => {
            const mockData = [{ keys: ['test'], clicks: 10, impressions: 100, ctr: 0.1, position: 1 }];
            vi.mocked(googleAnalytics.queryAnalytics).mockResolvedValue(mockData as any);

            const result = await fetchGoogleData(options);

            expect(result).toEqual(mockData);
            expect(googleAnalytics.queryAnalytics).toHaveBeenCalledWith({
                siteUrl: options.siteUrl,
                startDate: options.startDate,
                endDate: options.endDate,
                dimensions: [options.dimension],
                limit: options.limit,
                startRow: options.offset
            });
        });

        it('should handle Google API errors (403/Forbidden) gracefully', async () => {
            vi.mocked(googleAnalytics.queryAnalytics).mockRejectedValue(new Error('403 Forbidden'));

            const result = await fetchGoogleData(options);

            expect(result).toEqual([]);
        });

        it('should throw other errors', async () => {
            vi.mocked(googleAnalytics.queryAnalytics).mockRejectedValue(new Error('Network Error'));

            await expect(fetchGoogleData(options)).rejects.toThrow('Network Error');
        });
    });

    describe('fetchBingData', () => {
        const options = {
            siteUrl: 'https://example.com',
            startDate: '2023-01-01',
            endDate: '2023-01-07',
            dimension: 'query' as const,
            limit: 10,
            offset: 0
        };

        const mockBingClient = {
            getQueryStats: vi.fn(),
            getPageStats: vi.fn(),
        };

        beforeEach(() => {
            vi.mocked(bingClient.getBingClient).mockResolvedValue(mockBingClient as any);
        });

        it('should fetch query stats from Bing', async () => {
            const mockRawData = [
                { Query: 'test1', Clicks: 10, Impressions: 100, AvgPosition: 1, Date: '2023-01-02' },
                { Query: 'test2', Clicks: 5, Impressions: 50, AvgPosition: 2, Date: '2023-01-03' },
            ];
            mockBingClient.getQueryStats.mockResolvedValue(mockRawData);

            const result = await fetchBingData(options);

            expect(result).toHaveLength(2);
            expect(result[0].Query).toBe('test1');
            expect(result[0].Clicks).toBe(10);
            expect(result[0].CTR).toBe(0.1);
            expect(mockBingClient.getQueryStats).toHaveBeenCalledWith(options.siteUrl);
        });

        it('should correctly parse Microsoft JSON date format strings from Bing API', async () => {
            const mockMsDateData = [
                { Query: 'msdate1', Clicks: 15, Impressions: 150, AvgPosition: 1, Date: '/Date(1672617600000-0800)/' }, // 2023-01-02
            ];
            mockBingClient.getQueryStats.mockResolvedValue(mockMsDateData);

            const result = await fetchBingData(options);

            expect(result).toHaveLength(1);
            expect(result[0].Query).toBe('msdate1');
        });

        it('should fetch page stats from Bing', async () => {
            const pageOptions = { ...options, dimension: 'page' as const };
            const mockRawData = [
                { Query: 'http://example.com/page1', Clicks: 20, Impressions: 200, AvgPosition: 1, Date: '2023-01-02' }
            ];
            mockBingClient.getPageStats.mockResolvedValue(mockRawData);

            const result = await fetchBingData(pageOptions);

            expect(result).toHaveLength(1);
            expect(result[0].Query).toBe('http://example.com/page1');
            expect(mockBingClient.getPageStats).toHaveBeenCalledWith(pageOptions.siteUrl);
        });

        it('should handle Bing API errors (403/Forbidden) gracefully', async () => {
            mockBingClient.getQueryStats.mockRejectedValue(new Error('403 Forbidden'));

            const result = await fetchBingData(options);

            expect(result).toEqual([]);
        });

        it('should throw other Bing errors', async () => {
            mockBingClient.getQueryStats.mockRejectedValue(new Error('Network Error'));

            await expect(fetchBingData(options)).rejects.toThrow('Network Error');
        });

        it('should return empty array for unsupported dimensions', async () => {
            const invalidOptions = { ...options, dimension: 'country' as any };
            const result = await fetchBingData(invalidOptions);
            expect(result).toEqual([]);
        });

        it('should aggregate data correctly', async () => {
            const mockRawData = [
                { Query: 'test', Clicks: 10, Impressions: 100, AvgPosition: 1, Date: '2023-01-02' },
                { Query: 'test', Clicks: 20, Impressions: 200, AvgPosition: 2, Date: '2023-01-03' },
            ];
            mockBingClient.getQueryStats.mockResolvedValue(mockRawData);

            const result = await fetchBingData(options);

            expect(result).toHaveLength(1);
            expect(result[0].Query).toBe('test');
            expect(result[0].Clicks).toBe(30);
            expect(result[0].Impressions).toBe(300);
            // Weighted position: (1*100 + 2*200) / 300 = 500 / 300 = 1.666...
            expect(result[0].AvgPosition).toBeCloseTo(1.667, 3);
            expect(result[0].CTR).toBe(0.1); // 30 / 300
        });

        it('should filter data by date range', async () => {
            const mockRawData = [
                { Query: 'test1', Clicks: 10, Impressions: 100, AvgPosition: 1, Date: '2023-01-02' }, // Inside
                { Query: 'test2', Clicks: 5, Impressions: 50, AvgPosition: 2, Date: '2023-01-10' },  // Outside
            ];
            mockBingClient.getQueryStats.mockResolvedValue(mockRawData);

            const result = await fetchBingData(options);

            expect(result).toHaveLength(1);
            expect(result[0].Query).toBe('test1');
        });

        it('should handle zero impressions correctly to avoid division by zero', async () => {
            const mockRawData = [
                { Query: 'test', Clicks: 0, Impressions: 0, AvgPosition: 0, Date: '2023-01-02' }
            ];
            mockBingClient.getQueryStats.mockResolvedValue(mockRawData);

            const result = await fetchBingData(options);

            expect(result).toHaveLength(1);
            expect(result[0].CTR).toBe(0);
            expect(result[0].AvgPosition).toBe(0);
        });

        it('should respect pagination', async () => {
            const mockRawData = Array.from({ length: 20 }, (_, i) => ({
                Query: `test${i}`, Clicks: 10, Impressions: 100, AvgPosition: 1, Date: '2023-01-02'
            }));
            mockBingClient.getQueryStats.mockResolvedValue(mockRawData);

            const pagedOptions = { ...options, limit: 5, offset: 5 };
            const result = await fetchBingData(pagedOptions);

            expect(result).toHaveLength(5);
            expect(result.length).toBe(5);
        });

        it('should use default pagination limit if not specified', async () => {
            const mockRawData = Array.from({ length: 1500 }, (_, i) => ({
                Query: `test${i}`, Clicks: 10, Impressions: 100, AvgPosition: 1, Date: '2023-01-02'
            }));
            mockBingClient.getQueryStats.mockResolvedValue(mockRawData);

            const noLimitOptions = { ...options, limit: undefined, offset: undefined };
            const result = await fetchBingData(noLimitOptions as any);

            expect(result.length).toBe(1000); // Default limit is 1000
        });
    });
});
