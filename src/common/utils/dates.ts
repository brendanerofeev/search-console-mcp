
const MS_DATE_REGEX = /\/Date\((\d+)([+-]\d+)?\)\//;

/**
 * Parses a Microsoft-style JSON date string (e.g., "/Date(1731225600000-0800)/")
 * into a standard JavaScript Date object.
 */
export function parseMicrosoftDate(dateStr: string): Date {
    if (!dateStr) return new Date(0);

    // Extract the timestamp digits using module-scoped regex
    const match = dateStr.match(MS_DATE_REGEX);
    if (match) {
        const timestamp = parseInt(match[1], 10);
        return new Date(timestamp);
    }

    // Fallback to standard Date parsing if format doesn't match
    return new Date(dateStr);
}

/**
 * Normalizes a date to the start of the day (00:00:00.000) in local time.
 */
export function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Normalizes a date to the end of the day (23:59:59.999) in local time.
 */
export function endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}
