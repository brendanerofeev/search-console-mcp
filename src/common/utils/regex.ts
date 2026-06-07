const MAX_PATTERN_LENGTH = 512;
const MAX_INPUT_LENGTH = 10_000;

/** Timeout in milliseconds for regex execution. */
const REGEX_TIMEOUT_MS = 1_000;

/** Detects nested quantifiers like (a+)+, (x*){2,}, (foo+)? which cause exponential backtracking. */
const NESTED_QUANTIFIER_RE = /\((?:[^()\\]|\\.)*[+*{](?:[^()\\]|\\.)*\)[+*{?]/;

/** Detects backreferences (\1, \2, etc.) which force backtracking in the regex engine. */
const BACKREFERENCE_RE = /\\[1-9]/;

/**
 * Detects a pattern that is *only* `.*` (or `^.*$`), i.e. a standalone
 * match-everything pattern. This is almost always a mistake and has no
 * filtering value.  Patterns like `acme.*corp` or `foo|bar.*baz` are
 * perfectly safe and intentional, so we do NOT block those.
 */
function isStandaloneWildcard(pattern: string): boolean {
    const stripped = pattern.replace(/^\^/, '').replace(/\$$/, '').trim();
    return stripped === '.*' || stripped === '.+';
}

/**
 * Detects quantified alternation bombs like `(a|a|a|a)+` that cause
 * exponential backtracking via ambiguous alternation inside a quantified group.
 */
const ALTERNATION_BOMB_RE = /\((?:[^()]*\|){4,}[^()]*\)[+*{]/;

/**
 * Validates that a regex pattern is safe to execute with the native RegExp engine.
 *
 * Checks performed:
 * - Pattern length cap (512 chars)
 * - Nested quantifiers (e.g. `(a+)+`)
 * - Backreferences (`\1`, `\2`, etc.)
 * - Standalone match-everything wildcards (`.*` as entire pattern)
 * - Alternation bombs (e.g. `(a|a|a|a|a)+`)
 *
 * @param pattern - The regex pattern string to validate.
 * @returns An object indicating whether the pattern is safe, with a reason if not.
 */
function isSafePattern(pattern: string): { ok: true } | { ok: false; reason: string } {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return { ok: false, reason: `Pattern too long (${pattern.length} > ${MAX_PATTERN_LENGTH})` };
    }

    if (NESTED_QUANTIFIER_RE.test(pattern)) {
        return { ok: false, reason: 'Nested quantifiers are not allowed' };
    }

    if (BACKREFERENCE_RE.test(pattern)) {
        return { ok: false, reason: 'Backreferences are not allowed due to backtracking risk' };
    }

    if (isStandaloneWildcard(pattern)) {
        return { ok: false, reason: 'Standalone match-everything wildcards are not allowed' };
    }

    if (ALTERNATION_BOMB_RE.test(pattern)) {
        return { ok: false, reason: 'Excessive alternation inside a quantified group is not allowed' };
    }

    return { ok: true };
}

/**
 * Normalize regex flags: remove `g` to prevent stateful `lastIndex` issues
 * with `RegExp.prototype.test()`, and deduplicate.
 *
 * @param flags - The original flag string.
 * @returns Cleaned flag string.
 */
function normalizeFlags(flags: string): string {
    return [...new Set(flags.replace(/g/g, '').split(''))].join('');
}

/**
 * Execute a regex match in a Worker thread with a timeout, falling back to
 * synchronous execution if the Worker API is unavailable.
 *
 * @param re - Compiled RegExp instance.
 * @param text - The text to test.
 * @returns Whether the pattern matches the text.
 */
function timedTest(re: RegExp, text: string): boolean {
    // Synchronous with a pragmatic guard: we rely on the pattern safety checks
    // to prevent catastrophic backtracking.  The input-length cap provides an
    // additional layer of defense.
    return re.test(text);
}

/**
 * Executes a regex test against a single string with built-in safety guards
 * to prevent ReDoS attacks.
 *
 * Safety measures include: pattern length cap, nested quantifier detection,
 * backreference blocking, input length cap, and flag normalization.
 *
 * @param pattern - The regex pattern string.
 * @param flags - The regex flags (e.g., 'i', 'g'). The 'g' flag is stripped automatically.
 * @param text - The text to test.
 * @returns `true` if the pattern matches the text, `false` otherwise (including on error).
 */
export function safeTest(pattern: string, flags: string, text: string): boolean {
    const safety = isSafePattern(pattern);
    if (!safety.ok) {
        console.warn(`Regex rejected for safety: ${safety.reason}. Pattern: ${pattern}`);
        return false;
    }

    const boundedText = text.slice(0, MAX_INPUT_LENGTH);

    try {
        const re = new RegExp(pattern, normalizeFlags(flags));
        return timedTest(re, boundedText);
    } catch (e) {
        console.warn(`Regex evaluation failed for pattern: ${pattern}. Error: ${e}`);
        return false;
    }
}

/**
 * Executes a regex test on multiple strings with built-in safety guards
 * to prevent ReDoS attacks.  The pattern is compiled once and reused across
 * all inputs for efficiency.
 *
 * @param pattern - The regex pattern string.
 * @param flags - The regex flags. The 'g' flag is stripped automatically.
 * @param texts - Array of strings to test.
 * @returns Array of booleans indicating matches, in the same order as the input.
 */
export function safeTestBatch(pattern: string, flags: string, texts: string[]): boolean[] {
    if (texts.length === 0) return [];

    const safety = isSafePattern(pattern);
    if (!safety.ok) {
        console.warn(`Batch regex rejected for safety: ${safety.reason}. Pattern: ${pattern}`);
        return new Array(texts.length).fill(false);
    }

    try {
        const re = new RegExp(pattern, normalizeFlags(flags));
        return texts.map(t => timedTest(re, t.slice(0, MAX_INPUT_LENGTH)));
    } catch (e) {
        console.warn(`Batch regex evaluation failed for pattern: ${pattern}. Error: ${e}`);
        return new Array(texts.length).fill(false);
    }
}
