// In dev, requests are proxied through Vite to avoid CORS.
// In production, a Firebase Cloud Function (Cloud Run) acts as the server-side proxy.
// VITE_OPENFIGI_PROXY_URL must be set as a GitHub secret to the Cloud Run URL.
const OPENFIGI_URL = import.meta.env.DEV
  ? "/openfigi/v3/mapping"
  : import.meta.env.VITE_OPENFIGI_PROXY_URL;
const BATCH_SIZE = 10; // max items per OpenFIGI request

import { auth } from "./firebase.js";

/** Get a Bearer token for the current Firebase user, or null in dev/unauthenticated. */
async function getAuthHeader() {
  if (import.meta.env.DEV) return null; // dev uses Vite proxy, no auth needed
  try {
    const token = await auth?.currentUser?.getIdToken();
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a list of ticker symbols to instrument names via the OpenFIGI API.
 * Returns a Map<ticker, { name, securityType, securityType2, marketSector }>.
 * Unresolvable tickers are omitted from the result.
 *
 * @param {string[]} tickers
 * @returns {Promise<Map<string, { name: string, securityType: string, securityType2: string, marketSector: string }>>}
 */
export async function resolveTickerNames(tickers) {
  const result = new Map();
  if (!tickers.length) return result;

  const unique = [...new Set(tickers.filter(Boolean))];
  const authHeader = await getAuthHeader();

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const body = batch.map((t) => ({ idType: "TICKER", idValue: t }));

    const headers = { "Content-Type": "application/json" };
    if (authHeader) headers["Authorization"] = authHeader;

    let response;
    try {
      response = await fetch(OPENFIGI_URL, {
        method: "POST",
        headers,
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
          securityType2: first.securityType2 ?? "",
          marketSector: first.marketSector ?? "",
        });
      }
    }
  }

  return result;
}
