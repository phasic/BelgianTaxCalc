/**
 * TOB (Taks op Beursverrichtingen) classification.
 *
 * Belgian tax law (art. 120 WDRT) — three tiers under art. 120, 1°:
 *
 *   0,12%  cap €1 300   Bonds, distributing funds (non-ETF)
 *   0,35%  cap €1 600   Stocks, distributing ETFs
 *   1,32%  cap €4 000   Accumulating ETFs and accumulating funds
 *
 * Art. 120, 3°  (separate category):
 *   1,32%  cap €4 000   Direct redemption of accumulating shares at the
 *                        emitting institution (not a bourse transaction).
 *
 * In practice, all Revolut CSV transactions are bourse transactions
 * (art. 120, 1°).  Art. 120, 3° is here for completeness and can be
 * applied via a manual override when needed.
 */

export const TOB_ARTICLES = {
  "120,1_low": {
    key: "120,1_low",
    art: "art. 120, 1° — 0,12%",
    rate: 0.0012,
    cap: 1300,
    label: "Bonds / distributing funds",
  },
  "120,1_mid": {
    key: "120,1_mid",
    art: "art. 120, 1° — 0,35%",
    rate: 0.0035,
    cap: 1600,
    label: "Stocks / distributing ETFs",
  },
  "120,1_high": {
    key: "120,1_high",
    art: "art. 120, 1° — 1,32%",
    rate: 0.0132,
    cap: 4000,
    label: "Accumulating ETFs / funds",
  },
  "120,3": {
    key: "120,3",
    art: "art. 120, 3° — 1,32%",
    rate: 0.0132,
    cap: 4000,
    label: "Redemption of accumulating shares at issuer",
  },
};

const BOND_SECURITY_TYPES = new Set([
  "corporate bond",
  "government bond",
  "bond",
  "euro-bond",
  "eurobond",
  "convertible bond",
  "zero coupon bond",
  "treasury note",
  "treasury bill",
  "sovereign",
  "agency bond",
]);

const STOCK_SECURITY_TYPES = new Set([
  "common stock",
  "preferred stock",
  "adr",
  "gdr",
  "ny reg shrs",
  "dutch cert",
  "depositary receipt",
]);

// Exchange-traded products — further split by acc/dist name heuristics
const ETF_SECURITY_TYPES = new Set(["etf", "etp", "etc", "etn"]);

// Regular funds (non-ETF) — split by acc/dist name heuristics
const FUND_SECURITY_TYPES = new Set([
  "mutual fund",
  "open-end fund",
  "closed-end fund",
  "fund",
]);

/**
 * Determine the TOB article for a ticker based on instrument data.
 *
 * Priority:
 *   1. OpenFIGI securityType / marketSector (authoritative)
 *   2. Name heuristics for acc vs dist (OpenFIGI has no dedicated field)
 *   3. Manual user override — only when OpenFIGI cannot classify
 *
 * @param {{ name?, securityType?, securityType2?, marketSector?, manualType? } | null} info
 * @returns {{ key, art, rate, cap, label, basis, manual?: true, unresolved?: true }}
 */
export function classifyInstrument(info) {
  const st  = (info?.securityType  ?? "").toLowerCase().trim();
  const st2 = (info?.securityType2 ?? "").toLowerCase().trim();
  const ms  = (info?.marketSector  ?? "").toLowerCase().trim();
  const name = (info?.name ?? "").toLowerCase();

  const isDefinitelyBond = BOND_SECURITY_TYPES.has(st) || BOND_SECURITY_TYPES.has(st2)
    || ms === "government";
  const isDefinitelyStock = STOCK_SECURITY_TYPES.has(st) || STOCK_SECURITY_TYPES.has(st2);
  const isETF  = ETF_SECURITY_TYPES.has(st)  || ETF_SECURITY_TYPES.has(st2);
  const isFund = FUND_SECURITY_TYPES.has(st) || FUND_SECURITY_TYPES.has(st2)
    || ms === "mutual fund";

  const isAccumulating =
    /\bacc\b/.test(name) ||
    name.includes("accumulat") ||
    name.includes("capitaliz") ||
    name.includes("capitalise") ||
    /\bcap\b/.test(name) ||
    name.includes("thesaurierend") ||
    name.includes("herleggend");

  if (isDefinitelyBond) {
    return { ...TOB_ARTICLES["120,1_low"], basis: st || ms };
  }

  if (isDefinitelyStock) {
    return { ...TOB_ARTICLES["120,1_mid"], basis: st };
  }

  if (isETF) {
    if (isAccumulating) {
      return { ...TOB_ARTICLES["120,1_high"], basis: `${st} — accumulating` };
    }
    return { ...TOB_ARTICLES["120,1_mid"], basis: `${st} — distributing` };
  }

  if (isFund) {
    if (isAccumulating) {
      return { ...TOB_ARTICLES["120,1_high"], basis: `${st} — accumulating fund` };
    }
    return { ...TOB_ARTICLES["120,1_low"], basis: `${st} — distributing fund` };
  }

  if (ms === "equity") {
    return { ...TOB_ARTICLES["120,1_mid"], basis: "equity sector" };
  }

  // OpenFIGI absent or inconclusive — fall back to manual override
  if (info?.manualType === "stock")     return { ...TOB_ARTICLES["120,1_mid"],  basis: "manual override", manual: true };
  if (info?.manualType === "fund_dist") return { ...TOB_ARTICLES["120,1_low"],  basis: "manual override", manual: true };
  if (info?.manualType === "fund_acc")  return { ...TOB_ARTICLES["120,1_high"], basis: "manual override", manual: true };

  return {
    unresolved: true,
    basis: st
      ? `unrecognised securityType "${st}" — set type manually`
      : "no instrument data — resolve via OpenFIGI or set type manually",
  };
}
