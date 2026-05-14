import { isTobType } from "./transactionFilters.js";

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
