// In dev, requests are proxied through Vite to avoid CORS. In production the
// app is a static build so it needs a real backend proxy — fall back to direct
// for now (can be replaced with a Cloud Function URL later).
const OPENFIGI_URL = import.meta.env.DEV
  ? "/openfigi/v3/mapping"
  : "https://api.openfigi.com/v3/mapping";
const BATCH_SIZE = 10; // max items per OpenFIGI request

/**
 * Resolve a list of ticker symbols to instrument names via the OpenFIGI API.
 * Returns a Map<ticker, { name, securityType }> for successfully resolved tickers.
 * Unresolvable tickers are omitted from the result.
 *
 * @param {string[]} tickers
 * @returns {Promise<Map<string, { name: string, securityType: string }>>}
 */
export async function resolveTickerNames(tickers) {
  const result = new Map();
  if (!tickers.length) return result;

  const unique = [...new Set(tickers.filter(Boolean))];

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const body = batch.map((t) => ({ idType: "TICKER", idValue: t }));

    let response;
    try {
      response = await fetch(OPENFIGI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Network failure for this batch — skip
      continue;
    }

    if (!response.ok) continue;

    let json;
    try {
      json = await response.json();
    } catch {
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const entry = json[j];
      if (!entry || entry.error || !Array.isArray(entry.data) || !entry.data.length) continue;
      const first = entry.data[0];
      if (first?.name) {
        result.set(batch[j], {
          name: first.name,
          securityType: first.securityType ?? "",
        });
      }
    }
  }

  return result;
}
