import { useMemo } from "react";
import { calculateTobResult } from "../logic/tobCalculation.js";
import { findTypeColumnIndex, findDateColumnIndex, isTobType } from "../logic/transactionFilters.js";
import { makeTransactionKey } from "../logic/tobDeadline.js";

const EUR = new Intl.NumberFormat("nl-BE", {
  style: "currency", currency: "EUR",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function parseRowDate(str) {
  if (!str) return null;
  const d = new Date(str.includes("T") ? str : str.split(",")[0].trim());
  return isNaN(d.getTime()) ? null : d;
}

function fmtMonthYear(d) {
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function spanLabel(a, b) {
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (months < 1) return "< 1 month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const yrs = Math.floor(months / 12);
  const mo = months % 12;
  return mo === 0
    ? `${yrs} year${yrs === 1 ? "" : "s"}`
    : `${yrs} yr ${mo} mo`;
}

function StatTile({ label, value, sub, color }) {
  return (
    <div style={{
      flex: "1 1 calc(50% - 8px)",
      minWidth: 200,
      padding: "28px 24px",
      background: "#18181b",
      border: "1px solid #3a3820",
      borderRadius: 8,
      boxSizing: "border-box",
    }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#52525b", marginBottom: 14 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 38, color: color ?? "#f0ead8", lineHeight: 1, wordBreak: "break-all" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#71717a", marginTop: 10 }}>{sub}</div>
      )}
    </div>
  );
}

export default function Overview({ displayParsed, instrumentNames = new Map(), tobPaidKeys }) {
  const stats = useMemo(() => {
    if (!displayParsed) return null;
    const { headers, rows } = displayParsed;
    const typeIdx = findTypeColumnIndex(headers);
    const dateIdx = findDateColumnIndex(headers);

    let minDate = null, maxDate = null;
    if (dateIdx >= 0) {
      for (const row of rows) {
        const d = parseRowDate(row[dateIdx]);
        if (!d) continue;
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
    }

    const tobEntries = typeIdx >= 0
      ? rows.map((row, i) => ({ sourceIndex: i, row })).filter(({ row }) => isTobType(row[typeIdx]))
      : [];

    const tobResult = tobEntries.length
      ? calculateTobResult(tobEntries, headers, instrumentNames)
      : null;

    const paidEntries = tobEntries.filter(
      ({ row }) => tobPaidKeys?.has(makeTransactionKey(row, headers))
    );
    const paidResult = paidEntries.length
      ? calculateTobResult(paidEntries, headers, instrumentNames)
      : null;

    return {
      totalTx: rows.length,
      tobTx: tobEntries.length,
      minDate,
      maxDate,
      totalTOB: tobResult?.totalTOB ?? 0,
      paidTOB: paidResult?.totalTOB ?? 0,
      unresolvedCount: tobResult?.unresolvedTickers?.length ?? 0,
    };
  }, [displayParsed, instrumentNames, tobPaidKeys]);

  if (!displayParsed) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", color: "#52525b", fontSize: 14 }}>
        Load transaction data to see your overview.
      </div>
    );
  }

  if (!stats) return null;

  const allSettled = stats.totalTOB <= stats.paidTOB;
  const outstanding = stats.totalTOB - stats.paidTOB;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <StatTile
          label="Total transactions"
          value={stats.totalTx.toLocaleString("nl-BE")}
          sub={stats.minDate && stats.maxDate
            ? `${fmtMonthYear(stats.minDate)} – ${fmtMonthYear(stats.maxDate)}`
            : null}
          color="#f59e0b"
        />
        <StatTile
          label="Time span"
          value={stats.minDate && stats.maxDate ? spanLabel(stats.minDate, stats.maxDate) : "—"}
          sub={stats.minDate && stats.maxDate
            ? `${fmtMonthYear(stats.minDate)} to ${fmtMonthYear(stats.maxDate)}`
            : "no date data"}
          color="#8aaa78"
        />
        <StatTile
          label="TOB transactions"
          value={stats.tobTx.toLocaleString("nl-BE")}
          sub={stats.totalTx > 0
            ? `${Math.round((stats.tobTx / stats.totalTx) * 100)}% of all transactions`
            : null}
          color="#c09050"
        />
        <StatTile
          label="Total TOB paid"
          value={EUR.format(stats.paidTOB)}
          sub={allSettled
            ? `all settled · ${EUR.format(stats.totalTOB)} total`
            : `${EUR.format(outstanding)} still outstanding`}
          color="#22c55e"
        />
      </div>

      {stats.unresolvedCount > 0 && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid #3a2020", borderRadius: 4, fontSize: 12, color: "#ef4444" }}>
          {stats.unresolvedCount} unresolved ticker{stats.unresolvedCount === 1 ? "" : "s"} excluded from TOB totals — resolve in Instruments tab.
        </div>
      )}
    </div>
  );
}
