/**
 * Heuristic detection of generative-AI / AI-Mode / conversational "fanout" queries.
 *
 * Detection deliberately avoids complex regular expressions. Regex alternations
 * that mix multi-word phrases and are unanchored with a trailing `.*` cause
 * catastrophic backtracking (ReDoS), which the project explicitly guards
 * against. Instead this classifier uses simple token-based checks that are
 * linear in input size.
 *
 * The original public API surfaces of this module (detectGenAIQueries,
 * GenAIDetectionResult, etc.) are unchanged.
 *
 * Context: neither Google nor Bing exposes generative-AI citation data or an
 * AI surface via their public APIs yet (verified as of Aug 2026). Google's
 * dedicated "Generative AI performance report" is UI-only and its Search
 * Analytics API rejects AI `searchAppearance` values; Bing's AI Performance
 * report is documented as not-yet-available over the API. The closest signal
 * an MCP can compute from the query-level data the APIs *do* return is to flag
 * queries whose phrasing resembles the conversational, prompt-like strings
 * users type into AI Overviews / AI Mode / Copilot.
 *
 * IMPORTANT LIMITATION: search engines anonymize rare / conversational queries,
 * so the queries surfaced here are an undercount of true generative-AI activity.
 * Callers should surface this caveat to the user (see {@link GENAI_CAVEAT}).
 */

export type GenAIBucket =
  | 'full_conversation'
  | 'prompt_verb'
  | 'question'
  | 'follow_up'
  | 'acknowledgement'
  | 'unclassified';

export interface GenAIQuery {
  query: string;
  bucket: GenAIBucket;
  confidence: number;
  impressions: number;
  clicks: number;
  ctr: number;
  position?: number;
  pages?: string[];
}

export interface GenAIDetectionResult {
  queries: GenAIQuery[];
  summary: {
    totalMatching: number;
    totalQueries: number;
    byBucket: Record<GenAIBucket, number>;
    /** Share of matching queries out of all queries analysed. */
    matchRatio: number;
    impressions: number;
    clicks: number;
  };
  caveat: string;
}

/** Highlighted in tool output so consumers know the figure is heuristic, not official. */
export const GENAI_CAVEAT =
  "No official API exposes generative-AI citation data yet (Google and Bing both keep it " +
  "UI-only as of Aug 2026), so these are heuristic matches on query phrasing. Search engines " +
  "anonymize rare/conversational queries, so this is an UNDERCOUNT of true AI-driven activity, " +
  "not an official report.";

/**
 * Single-word imperative verbs characteristic of user-to-AI instructions
 * (e.g. "write a script", "generate a plan", "explain how X works").
 * Scanned as tokens (not a concatenated alternation) to avoid ReDoS.
 */
const PROMPT_VERBS = new Set([
  'write', 'draft', 'compose', 'generate', 'create', 'produce', 'build',
  'make', 'summarize', 'summarise', 'explain', 'describe', 'outline',
  'translate', 'convert', 'paraphrase', 'rewrite', 'review', 'edit', 'fix',
  'debug', 'solve', 'calculate', 'compute', 'compare', 'list',
]);

/** Question-leading words: strong signal of natural-language / AI queries. */
const QUESTION_LEADERS = new Set([
  'who', 'what', 'where', 'when', 'why', 'how', 'which', 'can', 'could',
  'would', 'should', 'is', 'are', 'does', 'do', 'tell',
]);

/** Follow-up / continuation tokens typical of an AI conversation. */
const FOLLOW_UP_TOKENS = new Set([
  'more', 'continue', 'next', 'another', 'elaborate', 'detail',
]);

/** Multi-word phrase triggers checked as lowercase substrings (linear, ReDoS-safe). */
const PHRASE_TRIGGERS: Array<[string, GenAIBucket]> = [
  ['act as', 'prompt_verb'],
  ['pretend you are', 'prompt_verb'],
  ['show me how', 'prompt_verb'],
  ['teach me', 'prompt_verb'],
  ['help me', 'prompt_verb'],
  ['what is the best', 'prompt_verb'],
  ['how do i', 'question'],
  ['tell me', 'question'],
  ['explain', 'prompt_verb'],
  ['go on', 'follow_up'],
  ['keep going', 'follow_up'],
  ['show me more', 'follow_up'],
  ['in more detail', 'follow_up'],
  ['more examples', 'follow_up'],
  ['another example', 'follow_up'],
  ['any other', 'follow_up'],
  ['sounds good', 'acknowledgement'],
  ['that works', 'acknowledgement'],
  ['thank you', 'acknowledgement'],
  ['no thanks', 'acknowledgement'],
  ['yes go on', 'follow_up'],
];

/** Short acknowledgements / affirmations users type into an AI conversation. */
const ACKNOWLEDGEMENT_RE = /^(yes|yeah|yep|ok|okay|sure|correct|right|good|great|thanks)\b/i;

const MIN_CONVERSATION_WORDS = 4;

/** Conversational connector tokens used to reward long natural-language phrases. */
const CONVERSATION_CONNECTORS = new Set([
  'please', 'about', 'versus', 'vs', 'instead', 'rather', 'and', 'or', 'with',
  'versus', 'between',
]);

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Lowercase the query and split into word tokens on non-word characters. */
function tokenize(q: string): { lower: string; tokens: Set<string> } {
  const lower = q.toLowerCase();
  const tokens = new Set(lower.split(/[^a-z0-9]+/).filter(Boolean));
  return { lower, tokens };
}

function bucketFor(query: string): { bucket: GenAIBucket; confidence: number } {
  const q = query.trim();
  const { lower, tokens } = tokenize(q);
  if (lower.length === 0) return { bucket: 'unclassified', confidence: 0 };

  // Short acknowledgement / affirmation.
  if (ACKNOWLEDGEMENT_RE.test(q)) {
    return { bucket: 'acknowledgement', confidence: 0.7 };
  }

  // Phrase triggers (multi-word) checked by substring — linear and safe.
  for (const [phrase, bucket] of PHRASE_TRIGGERS) {
    if (lower.includes(phrase)) {
      return { bucket, confidence: bucket === 'follow_up' ? 0.85 : 0.8 };
    }
  }

  // Follow-up tokens.
  if (FOLLOW_UP_TOKENS.has('continue') && tokens.has('continue')) {
    return { bucket: 'follow_up', confidence: 0.85 };
  }
  for (const tok of FOLLOW_UP_TOKENS) {
    if (tokens.has(tok)) return { bucket: 'follow_up', confidence: 0.8 };
  }

  // Prompt verb as leading token.
  if (tokens.size > 0) {
    const first = lower.split(/[^a-z0-9]+/).find(Boolean);
    if (first && PROMPT_VERBS.has(first)) {
      return { bucket: 'prompt_verb', confidence: 0.8 };
    }
  }

  // Question-led.
  if (tokens.size > 0) {
    const first = lower.split(/[^a-z0-9]+/).find(Boolean);
    if (first && QUESTION_LEADERS.has(first)) {
      return { bucket: 'question', confidence: 0.7 };
    }
  }

  // Long natural-language phrase with conversational connectors.
  const words = countWords(q);
  if (words >= MIN_CONVERSATION_WORDS) {
    for (const c of tokens) {
      if (CONVERSATION_CONNECTORS.has(c)) {
        return { bucket: 'full_conversation', confidence: 0.5 };
      }
    }
  }

  return { bucket: 'unclassified', confidence: 0 };
}

export interface GenAIInputRow {
  query: string;
  impressions: number;
  clicks: number;
  ctr?: number;
  position?: number;
}

/**
 * Classify an array of queries by how likely they are generative-AI / conversational.
 *
 * @param rows - Query-level performance rows (at minimum `query` and `impressions`).
 * @param options - Optional minimum impression threshold to reduce noise.
 * @returns A {@link GenAIDetectionResult} with matching queries ranked by confidence then impressions.
 */
export function detectGenAIQueries(
  rows: GenAIInputRow[],
  options: { minImpressions?: number } = {}
): GenAIDetectionResult {
  const { minImpressions = 1 } = options;

  const byBucket: Record<GenAIBucket, number> = {
    full_conversation: 0,
    prompt_verb: 0,
    question: 0,
    follow_up: 0,
    acknowledgement: 0,
    unclassified: 0,
  };

  const matched: GenAIQuery[] = [];

  for (const row of rows) {
    if (row.impressions < minImpressions) continue;
    const { bucket, confidence } = bucketFor(row.query);
    if (bucket === 'unclassified' || confidence <= 0) continue;

    byBucket[bucket]++;
    matched.push({
      query: row.query,
      bucket,
      confidence,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr ?? (row.impressions > 0 ? row.clicks / row.impressions : 0),
      position: row.position,
      pages: (row as any).pages,
    });
  }

  matched.sort((a, b) => b.confidence - a.confidence || b.impressions - a.impressions);

  const totalQueries = rows.length;
  const totalImp = matched.reduce((s, q) => s + q.impressions, 0);
  const totalClicks = matched.reduce((s, q) => s + q.clicks, 0);

  return {
    queries: matched,
    summary: {
      totalMatching: matched.length,
      totalQueries,
      byBucket,
      matchRatio: totalQueries > 0 ? matched.length / totalQueries : 0,
      impressions: totalImp,
      clicks: totalClicks,
    },
    caveat: GENAI_CAVEAT,
  };
}
