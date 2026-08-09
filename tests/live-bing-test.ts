import 'dotenv/config';
import { listSites } from '../src/bing/tools/sites.js';
import { getQueryStats, getPageStats, detectAnomalies } from '../src/bing/tools/analytics.js';
import { getUrlSubmissionQuota } from '../src/bing/tools/url-submission.js';
import { getUrlInfo } from '../src/bing/tools/inspection.js';
import { listSitemaps } from '../src/bing/tools/sitemaps.js';
import { healthCheck } from '../src/bing/tools/sites-health.js';
import { findLowHangingFruit, generateRecommendations, findLostQueries, analyzeBrandVsNonBrand } from '../src/bing/tools/seo-insights.js';
import { getTimeSeriesInsights } from '../src/bing/tools/advanced-analytics.js';
import { compareEngines } from '../src/common/tools/compare-engines/index.js';

if (process.env.CI) {
    console.log('Skipping live test in CI environment.');
    process.exit(0);
}

async function runLiveTest() {
    console.log('--- Starting Live Bing API Test ---\n');

    try {
        // 1. List Sites
        console.log('Step 1: Fetching Site List...');
        const sites = await listSites();
        if (sites.length === 0) {
            console.error('❌ No sites found in Bing Webmaster Tools. Cannot proceed with further tests.');
            return;
        }

        const siteUrl = sites[0].Url;
        console.log(`✅ Found ${sites.length} sites. Testing with: ${siteUrl}\n`);

        // 2. Health Check
        console.log('Step 2: Performing Health Check...');
        const health = await healthCheck(siteUrl);
        console.log('✅ Health Check Results Summary:', JSON.stringify(health).slice(0, 100) + '...\n');

        // 3. Basic Analytics
        console.log('Step 3: Fetching Query Stats...');
        const queryStats = await getQueryStats(siteUrl);
        console.log(`✅ Found ${queryStats.length} query stats.\n`);

        console.log('Step 4: Fetching Page Stats...');
        const pageStats = await getPageStats(siteUrl);
        console.log(`✅ Found ${pageStats.length} page stats.\n`);

        // 4. Advanced Analytics
        console.log('Step 5: Fetching Time Series Insights (Last 7 days)...');
        const timeSeries = await getTimeSeriesInsights(siteUrl, { days: 7, granularity: 'daily' });
        console.log(`✅ Time Series Data: ${timeSeries.history.length} data points.\n`);

        console.log('Step 6: Fetching Anomaly Data...');
        const anomalies = await detectAnomalies(siteUrl);
        console.log(`✅ Anomalies Detected: ${anomalies.length}\n`);

        // 5. SEO Intelligence
        console.log('Step 7: Looking for Low Hanging Fruit (Opportunities)...');
        const opportunities = await findLowHangingFruit(siteUrl);
        console.log(`✅ Found ${opportunities.length} keyword opportunities.\n`);

        console.log('Step 8: Generating SEO Recommendations...');
        const recs = await generateRecommendations(siteUrl);
        console.log(`✅ Generated ${recs.length} prioritized insights.\n`);

        console.log('Step 8a: Finding Lost Queries...');
        const lostQueries = await findLostQueries(siteUrl, { days: 28 });
        console.log(`✅ Found ${lostQueries.length} lost queries.\n`);

        console.log('Step 8b: Performing Brand vs Non-Brand Analysis...');
        const brandAnalysis = await analyzeBrandVsNonBrand(siteUrl, 'brand', { days: 28 });
        console.log(`✅ Brand Analysis: ${brandAnalysis.length} segments.\n`);

        // 6. Inspection & Quotas
        console.log('Step 9: Checking URL Submission Quota...');
        const quota = await getUrlSubmissionQuota(siteUrl);
        console.log('DEBUG: Quota response:', JSON.stringify(quota));
        console.log(`✅ Daily Quota: ${quota.DailyQuota}, Monthly: ${quota.MonthlyQuota}\n`);

        console.log('Step 10: Fetching URL Info for homepage...');
        try {
            const urlInfo = await getUrlInfo(siteUrl, siteUrl);
            console.log('DEBUG: URL Info response:', JSON.stringify(urlInfo));
            console.log(`✅ URL Info: Status ${urlInfo.HttpStatus}, Last Crawled: ${urlInfo.LastCrawledDate}\n`);
        } catch (e) {
            console.error('❌ Step 10 failed:', (e as Error).message);
        }

        // 7. Sitemaps
        console.log('Step 11: Listing Sitemaps...');
        const sitemaps = await listSitemaps(siteUrl);
        console.log(`✅ Found ${sitemaps.length} sitemaps.\n`);

        // 8. Cross-Engine Comparison
        console.log('Step 12: Testing Cross-Engine Comparison (compare_engines)...');
        const endDateStr = new Date().toISOString().split('T')[0];
        const startDateStr = (() => {
            const d = new Date();
            d.setDate(d.getDate() - 28);
            return d.toISOString().split('T')[0];
        })();

        try {
            const comparison = await compareEngines({
                siteUrl,
                startDate: startDateStr,
                endDate: endDateStr,
                dimension: 'query'
            });
            console.log(`✅ Compare Engines Result: ${comparison.rows.length} rows compared across Bing and Google.\n`);
        } catch (e) {
            console.warn('⚠️ Step 12 compare_engines test skipped/failed:', (e as Error).message, '\n');
        }

        console.log('--- All Live API Tests Completed! ---');
    } catch (error) {
        console.error('❌ Live Test Failed:', (error as Error).message);
        if ((error as Error).stack) console.error((error as Error).stack);
    }
}

runLiveTest();
