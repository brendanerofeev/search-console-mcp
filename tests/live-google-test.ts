import 'dotenv/config';
import { listSites } from '../src/google/tools/sites.js';
import { getPerformanceSummary, getTopQueries, getTopPages, detectAnomalies, detectTrends } from '../src/google/tools/analytics.js';
import { inspectUrl } from '../src/google/tools/inspection.js';
import { listSitemaps } from '../src/google/tools/sitemaps.js';
import { healthCheck } from '../src/google/tools/sites-health.js';
import { findLowHangingFruit, generateRecommendations } from '../src/google/tools/seo-insights.js';
import { getTimeSeriesInsights } from '../src/google/tools/advanced-analytics.js';
import { publishNotification, getNotificationStatus } from '../src/google/tools/indexing.js';
import { resolveAccount } from '../src/common/auth/resolver.js';

if (process.env.CI) {
    console.log('Skipping live test in CI environment.');
    process.exit(0);
}

async function runLiveTest() {
    console.log('--- Starting Live Google Search Console API Test ---\n');

    try {
        // 1. List Sites
        console.log('Step 1: Fetching Site List...');
        const sites = await listSites();
        if (sites.length === 0) {
            console.error('❌ No sites found in Google Search Console. Cannot proceed with further tests.');
            return;
        }

        // Try to find a site that is authorized (not restricted by boundary filters)
        let siteUrl: string | undefined;
        for (const site of sites) {
            if (site.siteUrl) {
                try {
                    await resolveAccount(site.siteUrl, 'google');
                    siteUrl = site.siteUrl;
                    break;
                } catch (e) {
                    // Site is filtered out by account boundary config, try next one
                }
            }
        }

        if (!siteUrl) {
            console.error('❌ No authorized sites found. Cannot proceed with further tests.');
            return;
        }

        console.log(`✅ Found ${sites.length} sites in account. Testing with authorized site: ${siteUrl}\n`);

        // 2. Health Check
        console.log('Step 2: Performing Health Check...');
        const healthReports = await healthCheck(siteUrl);
        const health = healthReports[0];
        console.log('✅ Health Check Status:', health.status);
        console.log('✅ Issues Found:', health.issues.length ? health.issues.join(', ') : 'None');
        console.log('✅ Performance Summary:', JSON.stringify(health.performance.changes).slice(0, 100) + '...\n');

        // 3. Basic Analytics
        console.log('Step 3: Fetching Performance Summary (Last 28 days)...');
        const summary = await getPerformanceSummary(siteUrl);
        console.log(`✅ Summary: ${summary.clicks} clicks, ${summary.impressions} impressions, Avg Position: ${summary.position}\n`);

        console.log('Step 4: Fetching Top Queries...');
        const topQueries = await getTopQueries(siteUrl, { limit: 5 });
        console.log(`✅ Found ${topQueries.items.length} top queries.\n`);

        console.log('Step 5: Fetching Top Pages...');
        const topPages = await getTopPages(siteUrl, { limit: 5 });
        console.log(`✅ Found ${topPages.items.length} top pages.\n`);

        // 4. Advanced Analytics
        console.log('Step 6: Fetching Time Series Insights...');
        const timeSeries = await getTimeSeriesInsights(siteUrl, { days: 14 });
        console.log(`✅ Time Series Data: ${timeSeries.history.length} data points. Trend: ${timeSeries.forecast.currentTrend}\n`);

        console.log('Step 7: Fetching Anomaly Data...');
        const anomalies = await detectAnomalies(siteUrl);
        console.log(`✅ Anomalies Detected: ${anomalies.length}\n`);

        console.log('Step 8: Detecting Trends...');
        const trends = await detectTrends(siteUrl);
        console.log(`✅ Detected ${trends.length} trending items.\n`);

        // 5. SEO Intelligence
        console.log('Step 9: Looking for Low Hanging Fruit (Opportunities)...');
        const opportunities = await findLowHangingFruit(siteUrl);
        console.log(`✅ Found ${opportunities.length} keyword opportunities.\n`);

        console.log('Step 10: Generating SEO Recommendations...');
        const recs = await generateRecommendations(siteUrl);
        console.log(`✅ Generated ${recs.length} prioritized insights.\n`);

        // 6. URL Inspection
        console.log('Step 11: Inspecting URL...');
        try {
            const targetUrl = siteUrl.startsWith('sc-domain:') ? `https://${siteUrl.split(':')[1]}/` : siteUrl;
            const inspection = await inspectUrl(siteUrl, targetUrl);
            console.log(`✅ Inspection Result: ${inspection.inspectionResult?.indexStatusResult?.verdict || 'Unknown'}\n`);
        } catch (e) {
            console.error('❌ Step 11 failed:', (e as Error).message);
        }

        // 7. Sitemaps
        console.log('Step 12: Listing Sitemaps...');
        const sitemaps = await listSitemaps(siteUrl);
        console.log(`✅ Found ${sitemaps.length} sitemaps.\n`);

        // 8. Google Indexing API
        console.log('Step 13: Testing Google Indexing API...');
        try {
            const targetUrl = (siteUrl.startsWith('sc-domain:') ? `https://${siteUrl.split(':')[1]}/` : siteUrl) + 'jobs/test-job-posting';
            console.log(`Submitting URL update notification for: ${targetUrl}`);
            const publishResult = await publishNotification(siteUrl, targetUrl, 'URL_UPDATED');
            console.log('✅ Indexing API Notification Published:', JSON.stringify(publishResult, null, 2));

            console.log('Fetching status metadata...');
            const statusResult = await getNotificationStatus(siteUrl, targetUrl);
            console.log('✅ Indexing API Status Metadata:', JSON.stringify(statusResult, null, 2));
        } catch (e) {
            console.warn('⚠️ Step 13 Google Indexing API test skipped or failed (likely due to missing indexing API enablement, project scope mismatch, or permission limits):', (e as Error).message);
        }

        console.log('--- All Live Google API Tests Completed! ---');
    } catch (error) {
        console.error('❌ Live Test Failed:', (error as Error).message);
        if ((error as Error).stack) console.error((error as Error).stack);
    }
}

runLiveTest();
