import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/google/tools/analytics.js", () => ({
  queryAnalytics: vi.fn(),
}));

import { detectGenAIQueriesGoogle } from "../src/google/tools/genai.js";
import { queryAnalytics } from "../src/google/tools/analytics.js";

describe("detectGenAIQueriesGoogle", () => {
  beforeEach(() => {
    vi.mocked(queryAnalytics).mockReset();
    vi.mocked(queryAnalytics).mockResolvedValue([]);
  });

  it("queries query+page when includePages is set and rolls pages up", async () => {
    vi.mocked(queryAnalytics).mockResolvedValue([
      { keys: ["write a plan", "/blog/a"], clicks: 2, impressions: 10, ctr: 0.2, position: 5 },
      { keys: ["write a plan", "/blog/b"], clicks: 1, impressions: 5, ctr: 0.2, position: 7 },
      { keys: ["cheap hosting", "/hosting"], clicks: 9, impressions: 100, ctr: 0.09, position: 3 },
    ]);

    const res = await detectGenAIQueriesGoogle("https://example.com/", { includePages: true });

    // Query + page dimensions requested.
    expect(queryAnalytics).toHaveBeenCalledWith(expect.objectContaining({ dimensions: ["query", "page"] }));

    const match = res.queries.find(q => q.query === "write a plan");
    expect(match).toBeDefined();
    // Aggregated across both pages.
    expect(match!.impressions).toBe(15);
    expect(match!.pages).toEqual(["/blog/a", "/blog/b"]);
    // Non-conversational query excluded.
    expect(res.queries.find(q => q.query === "cheap hosting")).toBeUndefined();
  });

  it("does not request page dimension when includePages is false", async () => {
    await detectGenAIQueriesGoogle("https://example.com/", { includePages: false });
    expect(queryAnalytics).toHaveBeenCalledWith(expect.objectContaining({ dimensions: ["query"] }));
  });

  it("applies the requested minImpressions", async () => {
    vi.mocked(queryAnalytics).mockResolvedValue([
      { keys: ["generate a list"], clicks: 0, impressions: 2, ctr: 0, position: 1 },
      { keys: ["write an outline"], clicks: 1, impressions: 40, ctr: 0.025, position: 2 },
    ]);
    const res = await detectGenAIQueriesGoogle("https://example.com/", { minImpressions: 10 });
    expect(res.queries.map(q => q.query)).toEqual(["write an outline"]);
  });
});
