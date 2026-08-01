import { z } from "zod";
import * as googleSites from "../../google/tools/sites.js";
import * as bingSites from "../../bing/tools/sites.js";
import { loadConfig, updateAccount, removeAccount } from "../../common/auth/config.js";
import { executeParallel } from "../../common/utils/parallel.js";

export const EngineSchema = z.enum(["google", "bing", "all"]).optional().default("all").describe("Target search engine");

export async function sitesListHandler(args: { engine?: "google" | "bing" | "all" }) {
  const engine = args.engine ?? "all";
  const results = await executeParallel({
    google: (engine === "google" || engine === "all") ? () => googleSites.listSites() : null,
    bing: (engine === "bing" || engine === "all") ? () => bingSites.listSites() : null,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}

export async function sitesManageHandler(args: { action: "add" | "delete"; siteUrl: string; engine?: "google" | "bing" | "all" }) {
  const engine = args.engine ?? "all";
  const results = await executeParallel({
    google: (engine === "google" || engine === "all")
      ? () => (args.action === "add" ? googleSites.addSite(args.siteUrl) : googleSites.deleteSite(args.siteUrl))
      : null,
    bing: (engine === "bing" || engine === "all")
      ? () => (args.action === "add" ? bingSites.addSite(args.siteUrl) : bingSites.removeSite(args.siteUrl))
      : null,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}

export async function accountsManageHandler(args: { action: "list" | "add_site" | "remove"; accountId?: string; siteUrl?: string; email?: string }) {
  if (args.action === "list") {
    const config = await loadConfig();
    const accountList = Object.values(config.accounts).map(a => ({
      id: a.id,
      alias: a.alias,
      engine: a.engine,
      websites: a.websites
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(accountList, null, 2) }]
    };
  }

  if (args.action === "add_site") {
    if (!args.accountId || !args.siteUrl) {
      throw new Error("accountId and siteUrl are required for add_site action");
    }
    const config = await loadConfig();
    const account = config.accounts[args.accountId];
    if (!account) {
      return { isError: true, content: [{ type: "text", text: `Account ${args.accountId} not found.` }] };
    }
    const websites = account.websites || [];
    if (!websites.includes(args.siteUrl)) {
      websites.push(args.siteUrl);
    }
    await updateAccount({ ...account, websites });
    return {
      content: [{ type: "text", text: `Added site ${args.siteUrl} to account ${args.accountId}` }]
    };
  }

  if (args.action === "remove") {
    if (!args.accountId) {
      throw new Error("accountId is required for remove action");
    }
    await removeAccount(args.accountId);
    return {
      content: [{ type: "text", text: `Removed account ${args.accountId}` }]
    };
  }

  throw new Error(`Unsupported action: ${args.action}`);
}
