import {
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  cellsByHeaderFromRow,
  fingerprintFromCellsByHeader,
} from "./transactionFingerprint.js";

const TX_COLLECTION = "transactions";
const MAX_READ_IN = 30;
const MAX_BATCH_WRITES = 500;
const HISTORY_READ_CAP = 8000;

/** @param {import('firebase/firestore').Firestore} firestore */
export async function fetchExistingFingerprintIds(firestore, uid, ids) {
  const existing = new Set();
  for (let i = 0; i < ids.length; i += MAX_READ_IN) {
    const chunk = ids.slice(i, i + MAX_READ_IN);
    const q = query(
      collection(firestore, "users", uid, TX_COLLECTION),
      where(documentId(), "in", chunk)
    );
    const snap = await getDocs(q);
    snap.forEach((d) => existing.add(d.id));
  }
  return existing;
}

/**
 * Saves each CSV row as one Firestore doc keyed by content fingerprint.
 * Rows that already exist (same fingerprint) are skipped — no duplicates.
 * Duplicate rows within the same file only write once.
 *
 * @returns {{ added: number, skippedExisting: number, skippedDuplicateInFile: number, totalRows: number }}
 */
export async function saveParsedCsvForUser(firestore, uid, parsed, sourceFileName) {
  const rowsMeta = [];
  const seenInFile = new Set();

  for (let ri = 0; ri < parsed.rows.length; ri++) {
    const cellsByHeader = cellsByHeaderFromRow(parsed.headers, parsed.rows[ri]);
    const fingerprint = await fingerprintFromCellsByHeader(cellsByHeader);
    if (seenInFile.has(fingerprint)) continue;
    seenInFile.add(fingerprint);
    rowsMeta.push({ fingerprint, cellsByHeader });
  }

  const ids = rowsMeta.map((r) => r.fingerprint);
  const existing = await fetchExistingFingerprintIds(firestore, uid, ids);

  let batch = writeBatch(firestore);
  let opsInBatch = 0;
  let added = 0;
  let skippedExisting = 0;

  const flush = async () => {
    if (opsInBatch === 0) return;
    await batch.commit();
    batch = writeBatch(firestore);
    opsInBatch = 0;
  };

  for (const row of rowsMeta) {
    if (existing.has(row.fingerprint)) {
      skippedExisting++;
      continue;
    }
    const ref = doc(firestore, "users", uid, TX_COLLECTION, row.fingerprint);
    batch.set(ref, {
      fingerprint: row.fingerprint,
      cellsByHeader: row.cellsByHeader,
      sourceFileName: sourceFileName ?? "",
      savedAt: serverTimestamp(),
    });
    opsInBatch++;
    added++;
    if (opsInBatch >= MAX_BATCH_WRITES) {
      await flush();
    }
  }
  await flush();

  const skippedDuplicateInFile = parsed.rows.length - rowsMeta.length;

  return {
    added,
    skippedExisting,
    skippedDuplicateInFile,
    totalRows: parsed.rows.length,
  };
}

/**
 * Load saved transactions and merge into a single { headers, rows } for the table.
 * Newest `savedAt` first.
 */
export async function loadSavedHistoryParsed(firestore, uid) {
  const q = query(
    collection(firestore, "users", uid, TX_COLLECTION),
    orderBy("savedAt", "desc"),
    limit(HISTORY_READ_CAP)
  );
  const snap = await getDocs(q);
  const docs = [];
  snap.forEach((d) => docs.push(d.data()));

  const COLUMN_ORDER = [
    "Date",
    "Ticker",
    "Type",
    "Quantity",
    "Price per share",
    "Total Amount",
    "Currency",
    "FX Rate",
  ];

  const headerSet = new Set();
  for (const data of docs) {
    const c = data.cellsByHeader;
    if (c && typeof c === "object") {
      Object.keys(c).forEach((h) => headerSet.add(h));
    }
  }
  const known = COLUMN_ORDER.filter((h) => headerSet.has(h));
  const rest = [...headerSet]
    .filter((h) => !COLUMN_ORDER.includes(h))
    .sort((a, b) => a.localeCompare(b));
  const headers = [...known, ...rest];

  const currencyIdx = headers.indexOf("Currency");
  const fxRateIdx = headers.indexOf("FX Rate");

  const rows = docs.map((data) => {
    const c = data.cellsByHeader || {};
    return headers.map((h, i) => {
      const raw = String(c[h] ?? "");
      if (i === fxRateIdx && currencyIdx !== -1) {
        const currency = String(c["Currency"] ?? "").trim().toUpperCase();
        if (currency === "EUR") return "—";
      }
      return raw;
    });
  });

  return { headers, rows, docCount: docs.length };
}
