import { loadConfig } from "./auth/config.js";

export interface ElicitationResponse {
  isError: boolean;
  inputRequired: boolean;
  parameter: string;
  message: string;
  options: string[];
}

/**
 * Checks if a siteUrl is provided. If missing, attempts to read available sites from config
 * and returns an interactive MCP 2026-07-28 `input_required` elicitation payload.
 */
export async function ensureSiteUrlOrElicit(
  siteUrl?: string
): Promise<{ siteUrl?: string; elicitationPayload?: string }> {
  if (siteUrl && siteUrl.trim() !== "") {
    return { siteUrl };
  }

  let availableSites: string[] = [];
  try {
    const config = await loadConfig();
    const accounts = Object.values(config.accounts);
    for (const acc of accounts) {
      if (acc.websites && Array.isArray(acc.websites)) {
        availableSites.push(...acc.websites);
      }
    }
  } catch {
    // If config fails to load, fall back to empty list
  }

  // Remove duplicates
  availableSites = Array.from(new Set(availableSites));

  if (availableSites.length === 1) {
    // If exactly one site exists in config, auto-select it
    return { siteUrl: availableSites[0] };
  }

  const payload: ElicitationResponse = {
    isError: false,
    inputRequired: true,
    parameter: "siteUrl",
    message: availableSites.length > 0
      ? `Please select a verified target site URL from your account to proceed:`
      : `siteUrl is required. Please provide a valid site URL (e.g., https://example.com).`,
    options: availableSites,
  };

  return {
    elicitationPayload: JSON.stringify(payload, null, 2),
  };
}
