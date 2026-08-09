/**
 * Convert an array of flat JSON objects to a CSV string.
 * Automatically handles escaping of double quotes and commas.
 */
export function jsonToCsv(data: Record<string, any>[]): string {
  if (!data || data.length === 0) {
    return "";
  }

  // Get all unique headers from all objects
  const headerSet = new Set<string>();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row && typeof row === 'object') {
      const keys = Object.keys(row);
      for (let k = 0; k < keys.length; k++) {
        headerSet.add(keys[k]);
      }
    }
  }
  const headers = Array.from(headerSet);
  if (headers.length === 0) return "";

  const numHeaders = headers.length;
  let csv = "";

  // Write header row
  for (let h = 0; h < numHeaders; h++) {
    const header = headers[h];
    const hasQuote = header.includes('"');
    const escaped = hasQuote ? header.replace(/"/g, '""') : header;
    if (hasQuote || escaped.includes(',') || escaped.includes('\n')) {
      csv += `"${escaped}"`;
    } else {
      csv += escaped;
    }
    if (h < numHeaders - 1) csv += ',';
  }

  // Write data rows directly without per-row array allocations
  for (let i = 0; i < data.length; i++) {
    csv += '\n';
    const row = data[i];
    const isObject = row && typeof row === 'object';
    for (let h = 0; h < numHeaders; h++) {
      const val = isObject ? row[headers[h]] : undefined;
      if (val !== undefined && val !== null) {
        const stringVal = String(val);
        const hasQuote = stringVal.includes('"');
        const escaped = hasQuote ? stringVal.replace(/"/g, '""') : stringVal;

        if (hasQuote || escaped.includes(',') || escaped.includes('\n')) {
          csv += `"${escaped}"`;
        } else {
          csv += escaped;
        }
      }
      if (h < numHeaders - 1) csv += ',';
    }
  }

  return csv;
}
