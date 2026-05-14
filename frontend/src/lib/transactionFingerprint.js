/** Build a stable map header → trimmed cell value */
export function cellsByHeaderFromRow(headers, row) {
  const out = {};
  headers.forEach((h, i) => {
    const key = String(h ?? "").trim();
    if (!key) return;
    out[key] = String(row[i] ?? "").trim();
  });
  return out;
}

/** Canonical JSON for hashing: sorted keys, stable values */
export function canonicalCellsJson(cellsByHeader) {
  const keys = Object.keys(cellsByHeader).sort((a, b) => a.localeCompare(b));
  const pairs = keys.map((k) => [k, cellsByHeader[k] ?? ""]);
  return JSON.stringify(pairs);
}

export async function fingerprintFromCellsByHeader(cellsByHeader) {
  const canonical = canonicalCellsJson(cellsByHeader);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
