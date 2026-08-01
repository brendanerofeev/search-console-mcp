import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureSiteUrlOrElicit } from "../src/common/elicitation.js";
import * as authConfig from "../src/common/auth/config.js";

vi.mock("../src/common/auth/config.js");

describe("Interactive Elicitation (MCP 2026-07-28 Spec)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns provided siteUrl directly if present", async () => {
    const result = await ensureSiteUrlOrElicit("https://example.com");
    expect(result.siteUrl).toBe("https://example.com");
    expect(result.elicitationPayload).toBeUndefined();
  });

  it("auto-selects single available site if siteUrl is omitted", async () => {
    vi.spyOn(authConfig, "loadConfig").mockResolvedValue({
      accounts: {
        acc1: {
          id: "acc1",
          engine: "google",
          alias: "main",
          websites: ["https://mysite.com"],
        },
      },
    } as any);

    const result = await ensureSiteUrlOrElicit("");
    expect(result.siteUrl).toBe("https://mysite.com");
    expect(result.elicitationPayload).toBeUndefined();
  });

  it("returns input_required elicitation payload when multiple sites exist", async () => {
    vi.spyOn(authConfig, "loadConfig").mockResolvedValue({
      accounts: {
        acc1: {
          id: "acc1",
          engine: "google",
          alias: "g1",
          websites: ["https://site-a.com", "https://site-b.com"],
        },
      },
    } as any);

    const result = await ensureSiteUrlOrElicit("");
    expect(result.siteUrl).toBeUndefined();
    expect(result.elicitationPayload).toBeDefined();

    const payload = JSON.parse(result.elicitationPayload!);
    expect(payload.inputRequired).toBe(true);
    expect(payload.parameter).toBe("siteUrl");
    expect(payload.options).toEqual(["https://site-a.com", "https://site-b.com"]);
  });

  it("returns input_required prompt when no sites are configured", async () => {
    vi.spyOn(authConfig, "loadConfig").mockRejectedValue(new Error("No config file"));

    const result = await ensureSiteUrlOrElicit(undefined);
    expect(result.siteUrl).toBeUndefined();
    expect(result.elicitationPayload).toBeDefined();

    const payload = JSON.parse(result.elicitationPayload!);
    expect(payload.inputRequired).toBe(true);
    expect(payload.parameter).toBe("siteUrl");
    expect(payload.options).toEqual([]);
    expect(payload.message).toContain("siteUrl is required");
  });
});
