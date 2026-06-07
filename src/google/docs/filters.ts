/**
 * Google Search Console - Filters Reference
 * 
 * This documentation is exposed as an MCP resource for AI agents.
 */

export const filtersDocs = `# Google Search Console - Filters Reference

Filters allow you to narrow down your Search Analytics data to specific queries, pages, countries, or devices.

## Filter Structure

Each filter has three properties:
- \`dimension\`: What to filter on (query, page, country, device)
- \`operator\`: How to match (equals, contains, etc.)
- \`expression\`: The value to match against

## Available Operators

| Operator | Description | Example |
|----------|-------------|---------|
| \`equals\` | Exact match | \`"expression": "https://example.com/page"\` |
| \`contains\` | Substring match | \`"expression": "coffee"\` |
| \`notContains\` | Exclude substring | \`"expression": "spam"\` |
| \`includingRegex\` | Regex match | \`"expression": "coffee|tea"\` |
| \`excludingRegex\` | Exclude regex match | \`"expression": "test.*page"\` |

## Filter Examples

### Filter by specific page
\`\`\`json
{
  "filters": [{
    "dimension": "page",
    "operator": "equals",
    "expression": "https://example.com/blog/my-article"
  }]
}
\`\`\`

### Filter queries containing a word
\`\`\`json
{
  "filters": [{
    "dimension": "query",
    "operator": "contains",
    "expression": "how to"
  }]
}
\`\`\`

### Filter by country
\`\`\`json
{
  "filters": [{
    "dimension": "country",
    "operator": "equals",
    "expression": "USA"
  }]
}
\`\`\`

### Filter by device type
\`\`\`json
{
  "filters": [{
    "dimension": "device",
    "operator": "equals",
    "expression": "MOBILE"
  }]
}
\`\`\`

### Multiple filters (AND logic)
All filters are combined with AND logic:
\`\`\`json
{
  "filters": [
    {
      "dimension": "query",
      "operator": "contains",
      "expression": "recipe"
    },
    {
      "dimension": "country",
      "operator": "equals",
      "expression": "USA"
    }
  ]
}
\`\`\`

### Regex filter for multiple patterns
Match queries about coffee OR tea:
\`\`\`json
{
  "filters": [{
    "dimension": "query",
    "operator": "includingRegex",
    "expression": "coffee|tea|espresso"
  }]
}
\`\`\`

## Important Notes

1. **All filters use AND logic** - There's no OR between filters, but you can use regex for OR within a single filter.
2. **Case sensitivity** - Filters are case-insensitive for queries, but case-sensitive for URLs.
3. **Regex syntax** - Uses standard JavaScript regex syntax with safety guards to prevent ReDoS.
4. **URL filters** - Must match the canonical URL as reported by GSC.
`;

export default filtersDocs;
