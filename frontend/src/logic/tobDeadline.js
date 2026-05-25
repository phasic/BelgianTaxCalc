import { parseRowDate } from "./tobCalculation.js";

/**
 * Returns the last Mon–Fri workday of the given month.
 * month is 0-indexed (Jan = 0).
 */
function lastWorkdayOfMonth(year, month) {
  let d = new Date(year, month + 1, 0); // last calendar day of `month`
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/**
 * Belgian TOB deadline = last workday of the SECOND month following the
 * transaction month. E.g. transaction on 6 May → deadline = last workday of July.
 */
export function getTobDeadline(dateStr) {
  if (!dateStr) return null;
  const d = parseRowDate(String(dateStr));
  if (!d) return null;
  const txMonth = d.getMonth();       // 0-indexed
  const txYear = d.getFullYear();
  const deadlineMonth = (txMonth + 2) % 12;
  const deadlineYear = txYear + Math.floor((txMonth + 2) / 12);
  return lastWorkdayOfMonth(deadlineYear, deadlineMonth);
}

/** Days remaining until `deadline` (negative = overdue). */
export function getDaysUntilDeadline(deadline) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Returns `{ bg, text }` styling based on urgency / paid status.
 * `bg` may be null (transparent).
 */
export function deadlineStyle(deadline, isPaid) {
  if (isPaid) return { bg: "rgba(34,197,94,0.10)", text: "#22c55e" };
  if (!deadline) return null;
  const days = getDaysUntilDeadline(deadline);
  if (days < 0)   return { bg: "rgba(239,68,68,0.10)",   text: "#ef4444" }; // overdue
  if (days <= 7)  return { bg: "rgba(249,115,22,0.10)",  text: "#f97316" }; // < 1 week
  if (days <= 21) return { bg: "rgba(245,158,11,0.10)",  text: "#f59e0b" }; // < 3 weeks
  if (days <= 60) return { bg: "rgba(245,158,11,0.06)",  text: "#d97706" }; // < 2 months
  return { bg: null, text: "#71717a" };                                       // plenty of time
}

/**
 * Composite key uniquely identifying a transaction row for paid-state tracking.
 * Keys are matched case-insensitively against header names.
 */
export function makeTransactionKey(row, headers) {
  const get = (name) => {
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === name);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  };
  return [get("date"), get("ticker"), get("type"), get("total amount")].join("|");
}

/** Format a deadline Date as YYYY-MM-DD. */
export function formatDeadline(deadline) {
  if (!deadline) return "—";
  const y = deadline.getFullYear();
  const m = String(deadline.getMonth() + 1).padStart(2, "0");
  const d = String(deadline.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
