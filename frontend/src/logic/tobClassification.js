/**
 * TOB (Taks op Beursverrichtingen) classification — Belgian art. 120 WDRT.
 *
 * Three factors determine the rate for ETFs:
 *
 *  1. Accumulating vs distributing
 *     Distributing                    → 0,12%
 *     Accumulating                    → depends on registration (see #2)
 *
 *  2. Belgian registration (FSMA list)  — only relevant for accumulating
 *     Accumulating + NOT Belgian-reg  → 0,12%
 *     Accumulating + Belgian-reg      → 1,32%
 *     Trap: if any compartment of the same fund is on the FSMA list,
 *     ALL compartments (incl. your acc variant) are considered Belgian.
 *
 *  3. Instrument type
 *     Stocks                          → always 0,35% (registration irrelevant)
 *     Bonds / ETNs                    → 0,12%
 *     ETCs (commodity trackers)       → 0,35%
 *     Options / futures / CFDs        → no TOB
 *
 * Art. 120, 3°:  direct redemption of accumulating shares at the emitting
 *                institution (not a bourse trade) → 1,32%, cap €4 000.
 *
 * Belgian registration cannot be detected automatically from OpenFIGI.
 * Accumulating ETFs therefore default to 0,12%.  Use the manual override
 * "fund_acc_be" to flag Belgian-registered funds and apply 1,32%.
 */

export const TOB_ARTICLES = {
  "120,1_low": {
    key: "120,1_low",
    art: "art. 120, 1° — 0,12%",
    rate: 0.0012,
    cap: 1300,
    label: "Bonds, ETNs, distributing ETFs, acc ETF/fund (non-BE)",
  },
  "120,1_mid": {
    key: "120,1_mid",
    art: "art. 120, 1° — 0,35%",
    rate: 0.0035,
    cap: 1600,
    label: "Stocks, ETCs",
  },
  "120,1_high": {
    key: "120,1_high",
    art: "art. 120, 1° — 1,32%",
    rate: 0.0132,
    cap: 4000,
    label: "Accumulating ETF/fund (Belgian-registered, FSMA)",
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

// ETF / ETP — distributing → 0.12%, accumulating → 0.12% (non-BE default) or 1.32% (BE, manual)
const ETF_TYPES = new Set(["etf", "etp"]);

// ETN (Exchange-Traded Note) — bond-like → 0.12%
const ETN_TYPES = new Set(["etn"]);

// ETC (Exchange-Traded Commodity, e.g. gold tracker) — 0.35%
const ETC_TYPES = new Set(["etc"]);

// Regular funds (non-ETF) — same acc/dist logic as ETF
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
 *      "fund_acc_be" is always respected (Belgian-registration is user knowledge)
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
  const isETF = ETF_TYPES.has(st) || ETF_TYPES.has(st2);
  const isETN = ETN_TYPES.has(st) || ETN_TYPES.has(st2);
  const isETC = ETC_TYPES.has(st) || ETC_TYPES.has(st2);
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

  // Bonds and ETNs (bond-like) → 0.12%
  if (isDefinitelyBond || isETN) {
    return { ...TOB_ARTICLES["120,1_low"], basis: st || ms };
  }

  // Stocks → 0.35%
  if (isDefinitelyStock) {
    return { ...TOB_ARTICLES["120,1_mid"], basis: st };
  }

  // ETCs (commodity trackers, e.g. gold) → 0.35%
  if (isETC) {
    return { ...TOB_ARTICLES["120,1_mid"], basis: "etc — commodity tracker" };
  }

  // ETF / ETP
  if (isETF) {
    if (isAccumulating) {
      return {
        ...TOB_ARTICLES["120,1_low"],
        basis: `${st} — accumulating (non-BE default; set to 1,32% if on FSMA list)`,
      };
    }
    return { ...TOB_ARTICLES["120,1_low"], basis: `${st} — distributing` };
  }

  // Regular fund (mutual fund, SICAV, bevek …)
  if (isFund) {
    if (isAccumulating) {
      return {
        ...TOB_ARTICLES["120,1_low"],
        basis: `${st} — accumulating fund (non-BE default; set to 1,32% if on FSMA list)`,
      };
    }
    return { ...TOB_ARTICLES["120,1_low"], basis: `${st} — distributing fund` };
  }

  // marketSector "equity" as a fallback for stocks
  if (ms === "equity") {
    return { ...TOB_ARTICLES["120,1_mid"], basis: "equity sector" };
  }

  // ── Manual overrides (OpenFIGI absent / inconclusive) ──
  // "fund_acc_be" is always respected regardless of OpenFIGI state because
  // Belgian registration is user knowledge that OpenFIGI cannot supply.
  if (info?.manualType === "fund_acc_be") return { ...TOB_ARTICLES["120,1_high"], basis: "manual — Belgian-registered (FSMA)", manual: true };
  if (info?.manualType === "stock")       return { ...TOB_ARTICLES["120,1_mid"],  basis: "manual override", manual: true };
  if (info?.manualType === "fund_dist")   return { ...TOB_ARTICLES["120,1_low"],  basis: "manual override", manual: true };
  if (info?.manualType === "fund_acc")    return { ...TOB_ARTICLES["120,1_low"],  basis: "manual — accumulating, not Belgian-registered", manual: true };

  return {
    unresolved: true,
    basis: st
      ? `unrecognised securityType "${st}" — set type manually`
      : "no instrument data — resolve via OpenFIGI or set type manually",
  };
}
