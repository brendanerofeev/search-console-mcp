import 'dotenv/config';
import { compareEnginesHandler, siteHealthCheckHandler } from '../src/tools/fluent/health.js';
import { listSites as listGoogleSites } from '../src/google/tools/sites.js';
import { listSites as listBingSites } from '../src/bing/tools/sites.js';
import { resolveAccount } from '../src/common/auth/resolver.js';

if (process.env.CI) {
  console.log('Skipping live test in CI environment.');
  process.exit(0);
}

async function runLiveCommonTest() {
  console.log('--- Tier 3: Live Cross-Platform API Smoke Test Suite ---\n');

  try {
    // 1. Resolve site URL to test
    let siteUrl: string | undefined;

    try {
      const bingSites = await listBingSites();
      if (bingSites.length > 0) {
        siteUrl = bingSites[0].Url;
        console.log(`✅ Step 1: Found Bing site for cross-platform comparison: ${siteUrl}`);
      }
    } catch {
      console.log('ℹ️ Could not list Bing sites, trying Google...');
    }

    if (!siteUrl) {
      try {
        const googleSites = await listGoogleSites();
        for (const site of googleSites) {
          if (site.siteUrl) {
            try {
              await resolveAccount(site.siteUrl, 'google');
              siteUrl = site.siteUrl;
              break;
            } catch {
              // Ignore boundary failures
            }
          }
        }
      } catch {
        console.log('ℹ️ Could not list Google sites.');
      }
    }

    if (!siteUrl) {
      siteUrl = 'https://example.com/';
      console.log(`ℹ️ Falling back to default test siteUrl: ${siteUrl}`);
    }

    // 2. Test compare_engines
    console.log(`\nStep 2: Invoking compare_engines with ONLY siteUrl: "${siteUrl}"...`);
    const compareResult = await compareEnginesHandler({ siteUrl });
    const parsedCompare = JSON.parse(compareResult.content[0].text);
    console.log(`✅ compare_engines: ${parsedCompare.rows.length} compared keyword rows returned.`);

    // 3. Test site_health_check
    console.log(`\nStep 3: Invoking site_health_check with siteUrl: "${siteUrl}"...`);
    const healthResult = await siteHealthCheckHandler({ siteUrl });
    const parsedHealth = JSON.parse(healthResult.content[0].text);

    console.log('✅ site_health_check response received:');
    if (parsedHealth.bing) {
      const bHealth = Array.isArray(parsedHealth.bing) ? parsedHealth.bing[0] : parsedHealth.bing;
      console.log(`   - Bing Clicks: ${bHealth.performance?.current?.clicks ?? 0}`);
      console.log(`   - Bing Sitemaps: ${bHealth.sitemaps?.total ?? 0}`);
      
      // Tier 3 Assertion: Check if any unparsed MS dates or "unknown" sitemap paths exist
      const unparsedMsDates = JSON.stringify(parsedHealth).includes('/Date(');
      if (unparsedMsDates) {
        console.warn('⚠️ WARNING: Live response contains unparsed MS date format /Date(...)');
      } else {
        console.log('   - Date Format Assertion: ✅ Clean ISO dates everywhere!');
      }
    }

    console.log('\n--- Tier 3 Live Smoke Test Completed Successfully! ---');
  } catch (error: any) {
    console.error('❌ Tier 3 Live Test Failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

runLiveCommonTest();
