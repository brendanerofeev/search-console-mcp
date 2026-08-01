export const CACHE_TTL = {
  SEARCH_CONSOLE_DAILY: 86_400_000, // 24 Hours (GSC / Bing daily analytics)
  BEHAVIOR_HOURLY: 3_600_000,      // 1 Hour (GA4 / PageSpeed)
  REALTIME: 0,                     // Realtime GA4 data
};

export interface AnnotatedToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  ttlMs?: number;
}

/**
 * Annotates tool output response with MCP 2026-07-28 cache longevity metadata (`ttlMs`).
 */
export function formatAnnotatedResponse(
  data: any,
  ttlMs: number = CACHE_TTL.SEARCH_CONSOLE_DAILY,
  isError: boolean = false
): AnnotatedToolResponse {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text", text }],
    isError,
    ttlMs,
  };
}
