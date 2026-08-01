/**
 * Executes named async tasks in parallel using Promise.allSettled.
 * Prevents one failing engine from breaking other engines, and reduces multi-engine query latency by ~50%.
 *
 * @param actions Object mapping engine name (e.g. 'google', 'bing', 'ga4') to an async action function or null/undefined.
 * @returns Combined result object with engine keys and independent error isolation.
 */
export async function executeParallel(actions: {
  [key: string]: (() => Promise<any>) | null | undefined;
}): Promise<Record<string, any>> {
  const activeEntries = Object.entries(actions).filter(([_, action]) => typeof action === "function");
  if (activeEntries.length === 0) return {};

  const settled = await Promise.allSettled(
    activeEntries.map(async ([key, action]) => {
      try {
        const res = await action!();
        return { key, res };
      } catch (err: any) {
        return { key, error: err?.message ?? String(err) };
      }
    })
  );

  const results: Record<string, any> = {};
  for (const item of settled) {
    if (item.status === "fulfilled") {
      const { key, res, error } = item.value;
      results[key] = error !== undefined ? { error } : res;
    }
  }
  return results;
}
