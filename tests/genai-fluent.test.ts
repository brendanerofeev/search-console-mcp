import { describe, it, expect, vi } from "vitest";

vi.mock("../src/google/tools/genai.js", () => ({
  detectGenAIQueriesGoogle: vi.fn().mockResolvedValue({
    queries: [{ query: "write a plan", bucket: "prompt_verb", confidence: 0.8, impressions: 10, clicks: 1 }],
    summary: { totalMatching: 1, totalQueries: 50, byBucket: { full_conversation: 0, prompt_verb: 1, question: 0, follow_up: 0, acknowledgement: 0, unclassified: 0 }, matchRatio: 0.02, impressions: 10, clicks: 1 },
    caveat: "test caveat",
  }),
}));

vi.mock("../src/bing/tools/genai.js", () => ({
  detectGenAIQueriesBing: vi.fn().mockResolvedValue({
    queries: [{ query: "continue", bucket: "follow_up", confidence: 0.85, impressions: 5, clicks: 0 }],
    summary: { totalMatching: 1, totalQueries: 20, byBucket: { full_conversation: 0, prompt_verb: 0, question: 0, follow_up: 1, acknowledgement: 0, unclassified: 0 }, matchRatio: 0.05, impressions: 5, clicks: 0 },
    caveat: "test caveat",
  }),
}));

import { genaiQueryInsightsHandler } from "../src/tools/fluent/genai.js";
import * as googleGenAI from "../src/google/tools/genai.js";
import * as bingGenAI from "../src/bing/tools/genai.js";

describe("genai_query_insights fluent handler", () => {
  it("runs the Google detector when engine is google, passing options through", async () => {
    vi.mocked(googleGenAI.detectGenAIQueriesGoogle).mockClear();
    vi.mocked(bingGenAI.detectGenAIQueriesBing).mockClear();

    await genaiQueryInsightsHandler({ siteUrl: "https://example.com/", engine: "google", days: 14, includePages: true, minImpressions: 5 });

    expect(googleGenAI.detectGenAIQueriesGoogle).toHaveBeenCalledWith("https://example.com/", {
      days: 14,
      minImpressions: 5,
      includePages: true,
    });
    expect(bingGenAI.detectGenAIQueriesBing).not.toHaveBeenCalled();
  });

  it("runs the Bing detector when engine is bing", async () => {
    vi.mocked(googleGenAI.detectGenAIQueriesGoogle).mockClear();
    vi.mocked(bingGenAI.detectGenAIQueriesBing).mockClear();
    await genaiQueryInsightsHandler({ siteUrl: "https://example.com/", engine: "bing" });

    expect(bingGenAI.detectGenAIQueriesBing).toHaveBeenCalledWith("https://example.com/", {
      minImpressions: 1,
      includePages: false,
    });
    expect(googleGenAI.detectGenAIQueriesGoogle).not.toHaveBeenCalled();
  });

  it("runs both engines with defaults for engine=all and serializes a valid text result", async () => {
    vi.mocked(googleGenAI.detectGenAIQueriesGoogle).mockClear();
    vi.mocked(bingGenAI.detectGenAIQueriesBing).mockClear();

    const res = await genaiQueryInsightsHandler({ siteUrl: "https://example.com/" });

    expect(googleGenAI.detectGenAIQueriesGoogle).toHaveBeenCalled();
    expect(bingGenAI.detectGenAIQueriesBing).toHaveBeenCalled();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.google).toBeDefined();
    expect(parsed.bing).toBeDefined();
  });
});
