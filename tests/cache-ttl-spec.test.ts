import { describe, it, expect } from "vitest";
import { formatAnnotatedResponse, CACHE_TTL } from "../src/common/utils/cache-ttl.js";

describe("Cache Longevity & Structured TTL Annotations (MCP 2026-07-28 Spec)", () => {
  it("formats response with default 24h search console TTL", () => {
    const data = { clicks: 1500, impressions: 45000 };
    const res = formatAnnotatedResponse(data);

    expect(res.ttlMs).toBe(CACHE_TTL.SEARCH_CONSOLE_DAILY);
    expect(res.ttlMs).toBe(86400000);
    expect(res.isError).toBe(false);
    expect(res.content[0].type).toBe("text");
    expect(JSON.parse(res.content[0].text)).toEqual(data);
  });

  it("formats hourly behavior analytics response with 1h TTL", () => {
    const data = { pageViews: 250 };
    const res = formatAnnotatedResponse(data, CACHE_TTL.BEHAVIOR_HOURLY);

    expect(res.ttlMs).toBe(3600000);
    expect(res.isError).toBe(false);
  });

  it("formats realtime analytics response with 0ms TTL", () => {
    const data = { activeUsers: 42 };
    const res = formatAnnotatedResponse(data, CACHE_TTL.REALTIME);

    expect(res.ttlMs).toBe(0);
    expect(res.isError).toBe(false);
  });

  it("handles error responses and preserves isError flag", () => {
    const res = formatAnnotatedResponse("API quota exceeded", 0, true);

    expect(res.isError).toBe(true);
    expect(res.ttlMs).toBe(0);
    expect(res.content[0].text).toBe("API quota exceeded");
  });
});
