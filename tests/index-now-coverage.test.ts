import { describe, it, expect, vi } from "vitest";
import { submitIndexNow } from "../src/bing/tools/index-now.js";

describe("IndexNow Tool 100% Coverage", () => {
  it("submitIndexNow success response", async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK")
      });

      const res = await submitIndexNow({
        host: "example.com",
        key: "key123",
        urlList: ["https://example.com/page-1"]
      });

      expect(res).toContain("Successfully submitted 1 URLs to IndexNow for host example.com");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("submitIndexNow HTTP error response", async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Invalid Key Format")
      });

      await expect(
        submitIndexNow({
          host: "example.com",
          key: "bad-key",
          urlList: ["https://example.com/page-1"]
        })
      ).rejects.toThrow("IndexNow submission failed: 400 Invalid Key Format");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
