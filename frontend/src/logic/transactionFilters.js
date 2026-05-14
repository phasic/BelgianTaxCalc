/** Returns the index of the "Type" column, or -1 if absent. */
export function findTypeColumnIndex(headers) {
  const norm = headers.map((h) => h.trim().toLowerCase());
  let i = norm.findIndex((h) => h === "type");
  if (i === -1) i = norm.findIndex((h) => h.includes("type"));
  return i;
}

/** Returns the index of the "Date" column, or -1 if absent. */
export function findDateColumnIndex(headers) {
  const norm = headers.map((h) => h.trim().toLowerCase());
  let i = norm.findIndex((h) => h === "date");
  if (i === -1) i = norm.findIndex((h) => h.includes("date"));
  return i;
}

/** True when a transaction type cell represents a TOB-liable trade (buy or sell). */
export function isTobType(typeCell) {
  const t = (typeCell || "").trim().toUpperCase();
  return t.startsWith("BUY") || t.startsWith("SELL");
}

/** True when a transaction type cell represents a dividend payment. */
export function isDividendType(typeCell) {
  const t = (typeCell || "").trim().toUpperCase();
  return t === "DIVIDEND" || t.startsWith("DIVIDEND");
}
