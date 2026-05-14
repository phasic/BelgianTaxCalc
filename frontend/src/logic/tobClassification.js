/**
 * TOB (Taks op Beursverrichtingen) classification.
 *
 * Three-question decision tree per Belgian tax law (art. 120 W.Div.):
 *
 *  Q1. Stock or fund?
 *      → Stock                          → art. 120, 2°  →  0.35%  (cap €1 600)
 *      → Fund                           → Q2
 *  Q2. Distributing or accumulating?
 *      → Distributing                   → art. 120, 1°  →  1.32%  (cap €4 000)
 *      → Accumulating                   → Q3
 *  Q3. UCITS (European passport)?
 *      → Yes ("UCITS ETF" in name)      → art. 120, 3°  →  1.32%  (cap €4 000)
 *      → No                             → art. 120, 1°  →  1.32%  (cap €4 000)
 */

export const TOB_ARTICLES = {
  "120,1": {
    key: "120,1",
    art: "art. 120, 1°",
    rate: 0.0132,
    cap: 4000,
    label: "Distributing fund / non-UCITS accumulating fund",
  },
  "120,2": {
    key: "120,2",
    art: "art. 120, 2°",
    rate: 0.0035,
    cap: 1600,
    label: "Stock",
  },
  "120,3": {
    key: "120,3",
    art: "art. 120, 3°",
    rate: 0.0132,
    cap: 4000,
    label: "UCITS accumulating fund",
  },
};

// OpenFIGI securityType values that unambiguously mean "stock"
const STOCK_SECURITY_TYPES = new Set([
  "common stock",
  "preferred stock",
  "adr",
  "gdr",
  "ny reg shrs",
  "dutch cert",
  "depositary receipt",
]);

// OpenFIGI securityType values that unambiguously mean "fund / ETF"
const FUND_SECURITY_TYPES = new Set([
  "etf",
  "mutual fund",
  "open-end fund",
  "closed-end fund",
  "etp",
  "etc",
  "etn",
  "fund",
]);

/**
 * Determine the TOB article for a ticker based on OpenFIGI instrument data.
 *
 * Q1 uses OpenFIGI securityType / marketSector — not name heuristics.
 * Q2 / Q3 (fund sub-type) still use the name because OpenFIGI doesn't expose
 *    distributing vs accumulating as a dedicated field.
 *
 * @param {{ name: string, securityType: string, securityType2: string, marketSector: string } | null | undefined} info
 * @returns {{ key, art, rate, cap, label, basis, unknown?: boolean }}
 */
export function classifyInstrument(info) {
  if (!info?.name && !info?.securityType) {
    return {
      unresolved: true,
      basis: "no instrument data — resolve ticker via OpenFIGI first",
    };
  }

  const st  = (info.securityType  ?? "").toLowerCase().trim();
  const st2 = (info.securityType2 ?? "").toLowerCase().trim();
  const ms  = (info.marketSector  ?? "").toLowerCase().trim();
  const name = (info.name ?? "").toLowerCase();

  // --- Q1: stock or fund? — trust OpenFIGI securityType first ---
  const isDefinitelyStock = STOCK_SECURITY_TYPES.has(st) || STOCK_SECURITY_TYPES.has(st2);
  const isDefinitelyFund  = FUND_SECURITY_TYPES.has(st)  || FUND_SECURITY_TYPES.has(st2)
    || ms === "mutual fund";

  if (isDefinitelyStock) {
    return { ...TOB_ARTICLES["120,2"], basis: info.securityType };
  }

  if (!isDefinitelyFund) {
    // marketSector "equity" is a reasonable proxy for stock
    if (ms === "equity") {
      return { ...TOB_ARTICLES["120,2"], basis: `${info.securityType} (equity sector)` };
    }
    // securityType exists but is unrecognised — cannot determine article
    return {
      unresolved: true,
      basis: `unrecognised securityType "${info.securityType}" — cannot determine article`,
    };
  }

  // --- Q2: accumulating or distributing? (name-based, OpenFIGI has no field for this) ---
  const isAccumulating =
    /\bacc\b/.test(name) ||
    name.includes("accumulat") ||
    name.includes("capitaliz") ||
    name.includes("capitalise") ||
    /\bcap\b/.test(name) ||
    name.includes("thesaurierend") ||
    name.includes("herleggend");

  // --- Q3 (if accumulating): UCITS? ---
  const isUCITS = name.includes("ucits");

  if (isAccumulating && isUCITS) {
    return { ...TOB_ARTICLES["120,3"], basis: `${info.securityType} — UCITS accumulating` };
  }

  return {
    ...TOB_ARTICLES["120,1"],
    basis: isAccumulating
      ? `${info.securityType} — accumulating (non-UCITS)`
      : `${info.securityType} — distributing`,
  };
}
