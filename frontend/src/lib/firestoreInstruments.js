import {
  collection,
  deleteField,
  doc,
  documentId,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
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
      if (data.name || data.manualType) {
        known.set(d.id, {
          name: data.name ?? "",
          securityType: data.securityType ?? "",
          securityType2: data.securityType2 ?? "",
          marketSector: data.marketSector ?? "",
          manualType: data.manualType ?? null,
        });
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

  for (const [ticker, { name, securityType, securityType2, marketSector }] of instruments) {
    const ref = doc(firestore, "users", uid, INSTRUMENTS_COLLECTION, ticker);
    // Full replace (no merge) so any stale manualType flag is cleared when OpenFIGI resolves the ticker.
    batch.set(ref, { ticker, name, securityType, securityType2: securityType2 ?? "", marketSector: marketSector ?? "", resolvedAt: serverTimestamp() });
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
 * Fetch all instrument docs for a user from Firestore.
 * Returns a Map<ticker, { name, securityType, securityType2, marketSector, manualType }>.
 *
 * @param {import('firebase/firestore').Firestore} firestore
 * @param {string} uid
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchAllInstruments(firestore, uid) {
  const snap = await getDocs(
    collection(firestore, "users", uid, INSTRUMENTS_COLLECTION)
  );
  const instruments = new Map();
  snap.forEach((d) => {
    const data = d.data();
    instruments.set(d.id, {
      name: data.name ?? "",
      securityType: data.securityType ?? "",
      securityType2: data.securityType2 ?? "",
      marketSector: data.marketSector ?? "",
      manualType: data.manualType ?? null,
      resolvedAt: data.resolvedAt ?? null,
    });
  });
  return instruments;
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

  // For tickers OpenFIGI couldn't resolve, write a minimal stub so they appear
  // in the Instruments list and can be manually classified. Stubs are intentionally
  // left out of fetchKnownInstruments (no name / no manualType) so the next sync
  // will retry OpenFIGI automatically.
  const unresolvable = needsResolving.filter((t) => !resolved.has(t));
  if (unresolvable.length) {
    let batch = writeBatch(firestore);
    let ops = 0;
    for (const ticker of unresolvable) {
      const ref = doc(firestore, "users", uid, INSTRUMENTS_COLLECTION, ticker);
      // merge: true — never overwrite a manualType the user already set
      batch.set(ref, { ticker, stubAt: serverTimestamp() }, { merge: true });
      ops++;
      if (ops >= 500) {
        await batch.commit();
        batch = writeBatch(firestore);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  return { resolved: resolved.size };
}

/**
 * Save (or clear) a manual instrument type override for a single ticker.
 *
 * @param {import('firebase/firestore').Firestore} firestore
 * @param {string} uid
 * @param {string} ticker
 * @param {"stock"|"fund_dist"|"fund_acc"|null} manualType  null = clear override
 */
export async function saveManualInstrumentType(firestore, uid, ticker, manualType) {
  const ref = doc(firestore, "users", uid, INSTRUMENTS_COLLECTION, ticker);
  if (manualType === null) {
    // Try to remove just the manualType field; if doc doesn't exist yet, nothing to clear
    try {
      await updateDoc(ref, { manualType: deleteField() });
    } catch {
      // Doc didn't exist — nothing to do
    }
  } else {
    // Merge so we don't overwrite any existing name/securityType data
    await setDoc(ref, { ticker, manualType, updatedAt: serverTimestamp() }, { merge: true });
  }
}
