/**
 * Google Indexing API - Reference Documentation
 *
 * This documentation is exposed as an MCP resource for AI agents.
 */

export const indexingDocs = `# Google Indexing API - Reference

The Google Indexing API allows you to notify Google when pages are added, updated, or removed.

## ⚠️ Important: Supported Content Types

The Google Indexing API is **officially supported only for pages with \`JobPosting\` or \`BroadcastEvent\` structured data**. Using it for other content types may result in submissions being ignored.

For general content, use **sitemaps** and the **URL Inspection API** instead.

## Available Tools

### \`indexing_submit_url\`
Notify Google or Bing that a URL has been updated and should be recrawled.

**Parameters:**
- \`siteUrl\` (required): The property URL as registered in Search Console
- \`url\` (required): The specific URL to submit for indexing
- \`engine\` (optional): \`"google"\` (default) or \`"bing"\`

### \`indexing_remove_url\`
Notify Google that a URL has been removed (e.g., an expired job posting).

**Parameters:**
- \`siteUrl\` (required): The property URL
- \`url\` (required): The URL that was removed

### \`indexing_status\`
Check the notification status for a previously submitted URL.

**Parameters:**
- \`siteUrl\` (required): The property URL
- \`url\` (required): The URL to check

### \`indexing_batch_submit\`
Submit multiple URLs for indexing in a single operation.

**Parameters:**
- \`siteUrl\` (required): The property URL
- \`urls\` (required): Array of URLs to submit (max 200 for Google, max 500 for Bing)
- \`engine\` (optional): \`"google"\` (default) or \`"bing"\`

## Authentication

### Google
Requires OAuth2 or a Service Account with the \`https://www.googleapis.com/auth/indexing\` scope. This is a separate scope from the Search Console read-only scope.

For **Service Accounts**, you must:
1. Add the service account email as an owner in Google Search Console for the property
2. Enable the "Indexing API" in Google Cloud Console

### Bing
Uses the existing Bing Webmaster API key (same as other Bing tools).

## Quotas

| Engine | Daily Limit | Batch Max |
|--------|-------------|-----------|
| Google | 200 requests/day | 200 per batch |
| Bing   | Varies (check \`bing_url_submission_quota\`) | 500 per batch |

## Examples

### Submit a new page
\`\`\`json
{
  "siteUrl": "https://example.com",
  "url": "https://example.com/jobs/software-engineer",
  "engine": "google"
}
\`\`\`

### Check submission status
\`\`\`json
{
  "siteUrl": "https://example.com",
  "url": "https://example.com/jobs/software-engineer"
}
\`\`\`

### Batch submit
\`\`\`json
{
  "siteUrl": "https://example.com",
  "urls": [
    "https://example.com/jobs/role-1",
    "https://example.com/jobs/role-2"
  ],
  "engine": "google"
}
\`\`\`
`;

export default indexingDocs;
