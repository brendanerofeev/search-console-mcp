import { describe, it, expect } from "vitest";
import { detectGenAIQueries, GENAI_CAVEAT } from "../src/common/tools/genai-queries.js";

describe("detectGenAIQueries", () => {
  it("classifies prompt-verb queries", () => {
    const res = detectGenAIQueries([
      { query: "write a python script for seo", impressions: 120, clicks: 4 },
    ]);
    expect(res.queries[0].bucket).toBe("prompt_verb");
    expect(res.summary.totalMatching).toBe(1);
  });

  it("classifies follow-up queries", () => {
    const res = detectGenAIQueries([
      { query: "continue", impressions: 5, clicks: 0 },
      { query: "show me more examples", impressions: 8, clicks: 1 },
    ]);
    expect(res.queries.every(q => q.bucket === "follow_up")).toBe(true);
  });

  it("classifies acknowledgements", () => {
    const res = detectGenAIQueries([
      { query: "yes", impressions: 3, clicks: 0 },
      { query: "sounds good", impressions: 6, clicks: 0 },
    ]);
    expect(res.queries.every(q => q.bucket === "acknowledgement")).toBe(true);
  });

  it("classifies question-led queries", () => {
    const res = detectGenAIQueries([
      { query: "how do i reduce page load time", impressions: 50, clicks: 3 },
    ]);
    expect(res.queries[0].bucket).toBe("question");
  });

  it("classifies long conversational phrases", () => {
    const res = detectGenAIQueries([
      { query: "best seo tool compared to ahrefs versus semrush please", impressions: 90, clicks: 2 },
    ]);
    expect(res.queries.length).toBeGreaterThan(0);
  });

  it("ignores ordinary tail queries", () => {
    const res = detectGenAIQueries([
      { query: "seo", impressions: 1000, clicks: 100 },
      { query: "backlinks", impressions: 500, clicks: 20 },
    ]);
    expect(res.summary.totalMatching).toBe(0);
  });

  it("ranks by confidence then impressions", () => {
    const res = detectGenAIQueries([
      { query: "seo tool prices", impressions: 8, clicks: 0 },
      { query: "generate a keyword list for my blog", impressions: 10, clicks: 1 },
    ]);
    expect(res.queries[0].query).toContain("generate");
  });

  it("applies minImpressions threshold", () => {
    const res = detectGenAIQueries(
      [
        { query: "generate a plan", impressions: 2, clicks: 0 },
        { query: "write an article outline", impressions: 40, clicks: 1 },
      ],
      { minImpressions: 10 }
    );
    expect(res.queries.length).toBe(1);
    expect(res.queries[0].query).toBe("write an article outline");
  });

  it("computes summary metrics and includes the caveat", () => {
    const res = detectGenAIQueries([
      { query: "write a summary about seo", impressions: 100, clicks: 10 },
      { query: "normal", impressions: 900, clicks: 30 },
    ]);
    expect(res.summary.totalQueries).toBe(2);
    expect(res.summary.totalMatching).toBe(1);
    expect(res.summary.impressions).toBe(100);
    expect(res.summary.clicks).toBe(10);
    expect(res.caveat).toBe(GENAI_CAVEAT);
    expect(res.caveat.toLowerCase()).toContain("undercount");
  });

  it("is resilient to ReDoS-unsafe patterns (uses safe test utilities)", () => {
    // Even pathological inputs across many rows should not crash.
    const rows = Array.from({ length: 500 }, (_, i) => ({
      query: `${"a".repeat(100)}${i} + nested (a+)+ bomb`,
      impressions: 1,
      clicks: 0,
    }));
    const res = detectGenAIQueries(rows);
    expect(Array.isArray(res.queries)).toBe(true);
  });
});
