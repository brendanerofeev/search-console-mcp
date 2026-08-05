---
title: "Installation"
description: "Get up and running with Google and Bing in less than 2 minutes."
---

We designed `search-console-mcp` to work instantly with your favorite AI editor. No complex configuration required.

## Prerequisites

1.  **Node.js 18 or higher**
2.  **A verified Google Search Console, Bing Webmaster Tools, or Google Analytics 4 property**

## 🚀 One-Line Setup

Run this command in your terminal. The wizard will walk you through connecting your Google and/or Bing accounts.

```bash
npx search-console-mcp setup
```

The tool will open your browser for secure authentication and then display the exact code snippet to copy-paste into your config.

Want to add more accounts later? Just run `setup` again — it supports multiple Google and Bing accounts.

---

## 📦 One-Click MCPB Bundle Installation

For **Claude Desktop** or other supported MCP clients, you can skip Node.js installation altogether by downloading the packaged `.mcpb` bundle.

1. Download [`search-console-mcp.mcpb`](https://github.com/saurabhsharma2u/search-console-mcp/releases/latest/download/search-console-mcp.mcpb).
2. Drag and drop the `.mcpb` file directly into **Claude Desktop** (or import it via **Settings → Extensions**).
3. The app will launch the server and present interactive form fields to enter your optional API keys (`GOOGLE_APPLICATION_CREDENTIALS`, `BING_API_KEY`, `PAGESPEED_API_KEY`).

---

## Client Configuration

If you prefer to set it up manually, here are the instructions for the most popular clients.

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "search-console": {
      "command": "npx",
      "args": ["-y", "search-console-mcp"],
      "env": {
        "BING_API_KEY": "your-api-key-here",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/your/service-account.json",
        "PAGESPEED_API_KEY": "your-pagespeed-key (optional)"
      }
    }
  }
}
```

*That's it! Environment variables are optional and only needed if you are using a Bing API Key, a Google Service Account, or a PageSpeed API Key.*

### Cursor

1.  Open **Cursor Settings** (Cmd + ,).
2.  Navigate to **Features** > **MCP**.
3.  Click **+ Add New MCP Server**.
4.  Enter the following:
    *   **Name:** `Search Console`
    *   **Type:** `command`
    *   **Command:** `npx -y search-console-mcp`
5.  **Environment Variables (Optional):** Click **Edit** on your new server to add variables if needed:
    *   `BING_API_KEY`: For Bing integration.
    *   `GOOGLE_APPLICATION_CREDENTIALS`: For Google Service Account auth.
    *   `PAGESPEED_API_KEY`: For higher PageSpeed quotas (optional).

<Tip>
  If you see an error about "command not found," try using the full path to your node executable or `npm` prefix.
</Tip>

### VS Code

You can configure the server specifically for your workspace using the standard MCP extension.

1.  **Option A: Config File**
    Create a file named `.vscode/mcp.json` and add:

    ```json
    {
        "servers": {
            "search-console": {
                "command": "npx",
                "args": [
                    "-y",
                    "search-console-mcp"
                ],
                "env": {
                    "BING_API_KEY": "your-api-key-here",
                    "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/your/service-account.json",
                    "PAGESPEED_API_KEY": "your-pagespeed-key (optional)"
                }
            }
        }
    }
    ```

2.  **Option B: Command Palette**
    *   Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
    *   Search for **"MCP: Add Server"**.
    *   Enter the command: `npx -y search-console-mcp`.

---

## Verify Your Setup

After installation, confirm your accounts are connected:

```bash
npx search-console-mcp accounts list
```

This will show all connected Google and Bing accounts and which sites they can access.

---

## What's Next?

- [Authentication](/getting-started/authentication) — Detailed auth options (OAuth, Service Account, API Key for Google, Bing, and GA4)
- [Managing Accounts](/getting-started/accounts) — List, remove, and restrict accounts across all platforms
- [Multi-Account Support](/getting-started/multi-account) — Connect multiple accounts across all platforms
- [First Queries](/getting-started/first-queries) — Start asking your AI agent questions
