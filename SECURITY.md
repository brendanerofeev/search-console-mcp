
# Security Policy

## Supported Versions

The latest published version of Search Console MCP is actively maintained and receives security updates.

Older versions may not receive patches. Users are encouraged to upgrade to the latest release.

---

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public GitHub issue.

Instead, report it privately:

Email: saurabhsharma2u@gmail.com

Please include:

- A clear description of the issue
- Steps to reproduce
- Potential impact
- Any suggested mitigation (if known)

You will receive acknowledgment within a reasonable timeframe.

---

## Security Model

Search Console MCP is designed as a local-first CLI tool with the following security principles:

### 1. OAuth-Based Authentication

- Uses OAuth 2.0 Device Authorization Flow
- Requests minimal scope (`webmasters.readonly`)
- Does not request write access to Google services
- Does not collect Google account passwords

Users authenticate directly with Google.

---

### 2. Local Token Storage

OAuth tokens are stored locally on the user’s device.

Primary storage:
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service / libsecret

Fallback storage (if secure vault unavailable):
- Encrypted using AES-256-GCM
- Machine-bound key derivation
- File permissions restricted to current user (600)

Only minimal data is stored:
- `refresh_token`
- Expiry metadata

Access tokens are short-lived and not permanently stored unless necessary.

---

### 3. No Central Data Collection & Zero Telemetry

Search Console MCP:

- Does not operate a backend server or telemetry collector
- Does not transmit user data or Search Console insights to the developer
- All API communication occurs directly over HTTPS between the user’s machine and search engine APIs.

---

### 4. Outbound Network & API Transparency (Socket.dev Disclosure)

Search Console MCP makes direct outbound HTTPS requests using native `fetch` (`globalThis.fetch`) exclusively to official endpoints. We maintain a zero-middleman architecture:

| Component | Target Destination Domain | Purpose |
| :--- | :--- | :--- |
| **Google Search Console & GA4** | `*.googleapis.com`, `oauth2.googleapis.com` | Fetching Search Console analytics, URL inspection, & GA4 performance data |
| **Bing Webmaster Tools** | `www.bing.com` | Querying Bing keyword stats, site health checks, & crawl issues |
| **IndexNow Submissions** | `api.indexnow.org` | Direct notification of updated URLs to search engines |
| **Structured Data Validation** | `validator.schema.org` | Validating JSON-LD schema syntax |
| **Update Checker** | `registry.npmjs.org` | Checking for package version updates (results cached locally for 24h) |

---

### 5. Local Process & Shell Execution Policy (Socket.dev Disclosure)

Search Console MCP uses Node's native `child_process` strictly for interactive CLI setup and user-initiated package updates. **No arbitrary user input is ever passed to shell execution**:

| Tool / CLI Script | Executed Command | Purpose & Trigger |
| :--- | :--- | :--- |
| **`npx search-console-mcp update`** | `execSync("npm install -g search-console-mcp")` | Upgrades the CLI package to the latest version on npm when confirmed by the user. |
| **`npx search-console-mcp setup`** | `execSync("git remote get-url origin")` | Auto-detects project repository URL during interactive setup. |
| **`util_star_repo` tool** | `execAsync("gh repo star ...")` | Optional utility tool allowing users to star the open-source repository via GitHub CLI or browser. |

---

## Security Boundaries

The primary security boundary is the protection of OAuth refresh tokens.

If an attacker gains:

- Full access to the user’s operating system account
- Administrative access to the machine

Then local security protections may be bypassed. This risk is inherent to all CLI-based applications.

---

## Revocation

Users may revoke application access at any time via their Google Account security settings.

Upon revocation:
- Stored refresh tokens become invalid
- Further API access will fail

Users may also run logout commands to remove locally stored credentials.

---

## Responsible Disclosure

We appreciate responsible disclosure and will make reasonable efforts to:

- Investigate reported issues
- Patch confirmed vulnerabilities
- Credit reporters (if desired)

Security is a priority, especially around OAuth and credential handling.
