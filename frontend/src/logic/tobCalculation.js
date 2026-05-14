import { isTobType } from "./transactionFilters.js";
import { classifyInstrument, TOB_ARTICLES } from "./tobClassification.js";

export function parseRowDate(cell) {
  if (!cell) return null;
  const d = new Date(cell);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateInCalendarMonth(d, year, monthIndex) {
  return d.getFullYear() === year && d.getMonth() === monthIndex;
}

export function dateInClosedPeriod(d, startStr, endStr) {
  if (!startStr || !endStr) return false;
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T23:59:59.999");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return d >= start && d <= end;
}

/**
 * Walk backwards through the file to find the most recent month that has a
 * buy/sell transaction — used to pre-select the TOB month picker.
 */
export function defaultTobMonthFromFile(parsed, typeColIndex, dateColIndex) {
  if (!parsed || typeColIndex < 0 || dateColIndex < 0) {
    const n = new Date();
    return { year: n.getFullYear(), monthIndex: n.getMonth() };
  }
  for (let i = parsed.rows.length - 1; i >= 0; i--) {
    const row = parsed.rows[i];
    if (!isTobType(row[typeColIndex])) continue;
    const d = parseRowDate(row[dateColIndex]);
    if (d) return { year: d.getFullYear(), monthIndex: d.getMonth() };
  }
  const n = new Date();
  return { year: n.getFullYear(), monthIndex: n.getMonth() };
}

/**
 * Return all rows that fall within the requested TOB scope.
 * @param {object} parsed  - { headers, rows }
 * @param {number} typeColIndex
 * @param {number} dateColIndex
 * @param {'month'|'period'|'individual'} scope
 * @param {{ year, monthIndex, periodStart, periodEnd, selectedIndices }} opts
 */
export function collectTobRowsInScope(parsed, typeColIndex, dateColIndex, scope, opts) {
  const out = [];
  for (let sourceIndex = 0; sourceIndex < parsed.rows.length; sourceIndex++) {
    const row = parsed.rows[sourceIndex];
    if (!isTobType(row[typeColIndex])) continue;

    if (scope === "individual") {
      if (!opts.selectedIndices.has(sourceIndex)) continue;
      out.push({ sourceIndex, row });
      continue;
    }

    if (dateColIndex < 0) continue;
    const d = parseRowDate(row[dateColIndex]);
    if (!d) continue;

    if (scope === "month") {
      if (!dateInCalendarMonth(d, opts.year, opts.monthIndex)) continue;
    } else if (scope === "period") {
      if (!dateInClosedPeriod(d, opts.periodStart, opts.periodEnd)) continue;
    }

    out.push({ sourceIndex, row });
  }
  return out;
}

/**
 * Parse a "Total Amount" cell like "USD 215.03" or "EUR 200" into a plain number.
 * Returns null when the cell can't be parsed.
 */
export function parseCurrencyAmount(cell) {
  if (!cell) return null;
  const match = String(cell).match(/[\d]+(?:[.,]\d+)*/);
  if (!match) return null;
  return parseFloat(match[0].replace(",", "."));
}

/**
 * Convert a transaction's total amount to EUR using the FX rate column.
 * FX rate in the Revolut CSV = units of foreign currency per 1 EUR.
 *
 * @returns {number | null}
 */
export function parseTotalAmountEUR(row, headers) {
  const idx = (key) =>
    headers.findIndex((h) => h.trim().toLowerCase() === key.toLowerCase());

  const totalIdx = idx("Total Amount");
  const fxIdx    = idx("FX Rate");
  const currIdx  = idx("Currency");

  const totalCell = row[totalIdx] ?? "";
  const fxCell    = row[fxIdx] ?? "";
  const currency  = (row[currIdx] ?? "").trim().toUpperCase();

  const amount = parseCurrencyAmount(totalCell);
  if (amount === null) return null;

  if (currency === "EUR" || fxCell === "—" || !fxCell) return Math.abs(amount);

  const fx = parseFloat(fxCell);
  if (!fx || fx <= 0) return null;

  return Math.abs(amount) / fx;
}

/**
 * For a single in-scope row, compute its TOB line item.
 *
 * @param {{ sourceIndex: number, row: string[] }} entry
 * @param {string[]} headers
 * @param {Map<string, { name: string, securityType: string }>} instrumentNames
 * @returns {{
 *   sourceIndex: number,
 *   row: string[],
 *   ticker: string,
 *   classification: object,
 *   eurAmount: number | null,
 *   tobRaw: number | null,
 *   tobAmount: number | null,   // after applying the legal cap
 *   capped: boolean,
 * }}
 */
export function calculateTobLineItem(entry, headers, instrumentNames) {
  const { sourceIndex, row } = entry;

  const tickerIdx = headers.findIndex((h) => h.trim().toLowerCase() === "ticker");
  const ticker = tickerIdx >= 0 ? (row[tickerIdx] ?? "").trim() : "";

  const info = instrumentNames.get(ticker);
  const classification = classifyInstrument(info);

  const eurAmount = parseTotalAmountEUR(row, headers);
  // Unresolved instruments have no rate — exclude from calculation entirely
  const tobRaw = (eurAmount !== null && !classification.unresolved)
    ? eurAmount * classification.rate
    : null;
  const tobAmount = tobRaw !== null ? Math.min(tobRaw, classification.cap) : null;
  const capped = tobRaw !== null && tobAmount !== tobRaw;

  return { sourceIndex, row, ticker, classification, eurAmount, tobRaw, tobAmount, capped };
}

/**
 * Run TOB calculation for all in-scope rows and return line items + per-article summary.
 *
 * @param {{ sourceIndex: number, row: string[] }[]} scopedEntries
 * @param {string[]} headers
 * @param {Map<string, { name: string, securityType: string }>} instrumentNames
 */
export function calculateTobResult(scopedEntries, headers, instrumentNames) {
  const lineItems = scopedEntries.map((e) =>
    calculateTobLineItem(e, headers, instrumentNames)
  );

  // Collect unresolved tickers (deduplicated) — these are excluded from totals
  const unresolvedTickers = [
    ...new Set(
      lineItems
        .filter((i) => i.classification.unresolved)
        .map((i) => i.ticker)
        .filter(Boolean)
    ),
  ];

  // Group resolved items by article key
  const byArt = {};
  for (const item of lineItems) {
    if (item.classification.unresolved) continue;
    const key = item.classification.key;
    if (!byArt[key]) {
      byArt[key] = {
        ...TOB_ARTICLES[key],
        totalEUR: 0,
        totalTOB: 0,
        count: 0,
      };
    }
    if (item.eurAmount !== null) byArt[key].totalEUR += item.eurAmount;
    if (item.tobAmount !== null) byArt[key].totalTOB += item.tobAmount;
    byArt[key].count++;
  }

  const totalTOB = lineItems.reduce((s, i) => s + (i.tobAmount ?? 0), 0);

  return { lineItems, byArt, totalTOB, unresolvedTickers };
}
