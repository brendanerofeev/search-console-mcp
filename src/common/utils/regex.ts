const MAX_PATTERN_LENGTH = 512;
const MAX_INPUT_LENGTH = 10_000;

const NESTED_QUANTIFIER_RE = /\((?:[^()\\]|\\.)*[+*{](?:[^()\\]|\\.)*\)[+*{?]/;
const OPEN_WILDCARD_RE = /(?:^|[^\\])\.\*(?:$|[|)]|\s)/;
const BACKREFERENCE_RE = /\\[1-9]/;

function isSafePattern(pattern: string): { ok: true } | { ok: false; reason: string } {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return { ok: false, reason: `Pattern too long (${pattern.length} > ${MAX_PATTERN_LENGTH})` };
    }

    if (NESTED_QUANTIFIER_RE.test(pattern)) {
        return { ok: false, reason: 'Nested quantifiers are not allowed' };
    }

    if (OPEN_WILDCARD_RE.test(pattern)) {
        return { ok: false, reason: 'Open-ended wildcards (.*) are not allowed' };
    }

    if (BACKREFERENCE_RE.test(pattern)) {
        return { ok: false, reason: 'Backreferences are not allowed due to backtracking risk' };
    }

    return { ok: true };
}

function normalizeFlags(flags: string): string {
    return [...new Set(flags.replace(/g/g, '').split(''))].join('');
}

export function safeTest(pattern: string, flags: string, text: string): boolean {
    const safety = isSafePattern(pattern);
    if (!safety.ok) {
        console.warn(`Regex rejected for safety: ${safety.reason}. Pattern: ${pattern}`);
        return false;
    }

    const boundedText = text.slice(0, MAX_INPUT_LENGTH);

    try {
        const re = new RegExp(pattern, normalizeFlags(flags));
        return re.test(boundedText);
    } catch (e) {
        console.warn(`Regex evaluation failed for pattern: ${pattern}. Error: ${e}`);
        return false;
    }
}

export function safeTestBatch(pattern: string, flags: string, texts: string[]): boolean[] {
    if (texts.length === 0) return [];

    const safety = isSafePattern(pattern);
    if (!safety.ok) {
        console.warn(`Batch regex rejected for safety: ${safety.reason}. Pattern: ${pattern}`);
        return new Array(texts.length).fill(false);
    }

    try {
        const re = new RegExp(pattern, normalizeFlags(flags));
        return texts.map(t => re.test(t.slice(0, MAX_INPUT_LENGTH)));
    } catch (e) {
        console.warn(`Batch regex evaluation failed for pattern: ${pattern}. Error: ${e}`);
        return new Array(texts.length).fill(false);
    }
}
