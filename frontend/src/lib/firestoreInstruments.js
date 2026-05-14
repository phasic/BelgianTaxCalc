import {
  collection,
  doc,
  documentId,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { resolveTickerNames } from "./openFigi.js";

const INSTRUMENTS_COLLECTION = "instruments";
const MAX_READ_IN = 30;

/**
 * Fetch instrument docs for the given tickers that already exist in Firestore.
 * Returns a Map<ticker, { name, securityType }> for docs that have a name.
 *
 * @param {import('firebase/firestore').Firestore} firestore
 * @param {string} uid
 * @param {string[]} tickers
 * @returns {Promise<Map<string, { name: string, securityType: string }>>}
 */
export async function fetchKnownInstruments(firestore, uid, tickers) {
  const known = new Map();
  if (!tickers.length) return known;

  for (let i = 0; i < tickers.length; i += MAX_READ_IN) {
    const chunk = tickers.slice(i, i + MAX_READ_IN);
    const q = query(
      collection(firestore, "users", uid, INSTRUMENTS_COLLECTION),
      where(documentId(), "in", chunk)
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data();
      if (data.name) {
        known.set(d.id, { name: data.name, securityType: data.securityType ?? "" });
      }
    });
  }

  return known;
}

/**
 * Persist resolved instrument data to Firestore.
 * Doc ID = ticker symbol.
 *
 * @param {import('firebase/firestore').Firestore} firestore
 * @param {string} uid
 * @param {Map<string, { name: string, securityType: string }>} instruments
 */
export async function saveInstruments(firestore, uid, instruments) {
  if (!instruments.size) return;

  let batch = writeBatch(firestore);
  let ops = 0;

  for (const [ticker, { name, securityType }] of instruments) {
    const ref = doc(firestore, "users", uid, INSTRUMENTS_COLLECTION, ticker);
    batch.set(ref, { ticker, name, securityType, resolvedAt: serverTimestamp() });
    ops++;
    if (ops >= 500) {
      await batch.commit();
      batch = writeBatch(firestore);
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
}

/**
 * For any ticker in `tickers` that is unknown or has no name in Firestore,
 * call OpenFIGI to resolve the name and persist the result.
 *
 * Returns { resolved: number } — count of newly resolved tickers.
 *
 * @param {import('firebase/firestore').Firestore} firestore
 * @param {string} uid
 * @param {string[]} tickers
 * @returns {Promise<{ resolved: number }>}
 */
export async function resolveAndSaveNewTickers(firestore, uid, tickers) {
  const unique = [...new Set(tickers.filter(Boolean))];
  if (!unique.length) return { resolved: 0 };

  const known = await fetchKnownInstruments(firestore, uid, unique);
  const needsResolving = unique.filter((t) => !known.has(t));

  if (!needsResolving.length) return { resolved: 0 };

  const resolved = await resolveTickerNames(needsResolving);
  await saveInstruments(firestore, uid, resolved);

  return { resolved: resolved.size };
}
