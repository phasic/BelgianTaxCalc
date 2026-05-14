import { useEffect, useMemo, useRef, useState } from "react";
import { collectTobRowsInScope, calculateTobResult } from "../logic/tobCalculation.js";
import { makeTransactionKey } from "../logic/tobDeadline.js";
import { findTypeColumnIndex, findDateColumnIndex } from "../logic/transactionFilters.js";
import { MONTH_NAMES } from "../utils/formatters.js";
import FileDropZone from "./FileDropZone.jsx";
import TobResultTable from "./TobResultTable.jsx";

const EUR = new Intl.NumberFormat("nl-BE", {
  style: "currency", currency: "EUR",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function buildThreeMonths() {
  const today = new Date();
  return [2, 1, 0].map((offset) => {
    const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    return { year: d.getFullYear(), monthIndex: d.getMonth() };
  });
}

function monthLabel(m) {
  const currentYear = new Date().getFullYear();
  return m.year !== currentYear
    ? `${MONTH_NAMES[m.monthIndex]} ${m.year}`
    : MONTH_NAMES[m.monthIndex];
}

function StepLabel({ n, children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#7a7460", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "#2a2818", color: "#c4a84a", fontSize: 10, fontWeight: 600 }}>{n}</span>
      {children}
    </div>
  );
}

export default function QuickTob({
  parsed,
  fileName,
  onFile,
  user,
  historyParsed,
  reloadHistory,
  instrumentNames = new Map(),
  tobPaidKeys,
  toggleTobPaid,
  markPaidBatch,
}) {
  const months = useMemo(buildThreeMonths, []);
  const [selectedIdx, setSelectedIdx] = useState(1); // previous month pre-selected
  const [detailOpen, setDetailOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const autoLoadAttempted = useRef(false);

  // ── Source of truth ──
  // Logged in → always use cloud history. Not logged in → fall back to CSV.
  const effectiveData = user ? historyParsed : parsed;
  const typeColIndex = effectiveData ? findTypeColumnIndex(effectiveData.headers) : -1;
  const dateColIndex = effectiveData ? findDateColumnIndex(effectiveData.headers) : -1;
  const hasData = Boolean(effectiveData && typeColIndex >= 0 && dateColIndex >= 0);

  // ── Auto-load history when opening Quick TOB (if signed in and not yet loaded) ──
  useEffect(() => {
    if (!user || historyParsed || !reloadHistory || autoLoadAttempted.current) return;
    autoLoadAttempted.current = true;
    setHistoryLoading(true);
    reloadHistory().finally(() => setHistoryLoading(false));
  }, [user, historyParsed, reloadHistory]);

  // Reset auto-load gate if the user changes (logs out / back in)
  useEffect(() => {
    autoLoadAttempted.current = false;
  }, [user]);

  const selectedMonth = months[selectedIdx];

  // ── Per-month stats: {total, unpaid} for each of the 3 month buttons ──
  const monthStats = useMemo(() => {
    if (!hasData) return months.map(() => ({ total: 0, unpaid: 0 }));
    return months.map((m) => {
      const scoped = collectTobRowsInScope(effectiveData, typeColIndex, dateColIndex, "month", {
        year: m.year, monthIndex: m.monthIndex,
        periodStart: "", periodEnd: "", selectedIndices: new Set(),
      });
      const unpaid = scoped.filter(
        ({ row }) => !tobPaidKeys?.has(makeTransactionKey(row, effectiveData.headers))
      ).length;
      return { total: scoped.length, unpaid };
    });
  }, [hasData, effectiveData, typeColIndex, dateColIndex, months, tobPaidKeys]);

  // ── TOB calculation — only unpaid transactions ──
  const { tobResult, allMonthKeys } = useMemo(() => {
    if (!hasData) return { tobResult: null, allMonthKeys: [] };

    const scoped = collectTobRowsInScope(effectiveData, typeColIndex, dateColIndex, "month", {
      year: selectedMonth.year, monthIndex: selectedMonth.monthIndex,
      periodStart: "", periodEnd: "", selectedIndices: new Set(),
    });

    const allKeys = scoped.map(({ row }) =>
      makeTransactionKey(row, effectiveData.headers)
    );

    const unpaidScoped = scoped.filter(
      ({ row }) => !tobPaidKeys?.has(makeTransactionKey(row, effectiveData.headers))
    );

    const tob = unpaidScoped.length
      ? calculateTobResult(unpaidScoped, effectiveData.headers, instrumentNames)
      : null;

    return { tobResult: tob, allMonthKeys: allKeys };
  }, [hasData, effectiveData, typeColIndex, dateColIndex, selectedMonth, instrumentNames, tobPaidKeys]);

  const paidCount = allMonthKeys.filter((k) => tobPaidKeys?.has(k)).length;
  const allPaid = allMonthKeys.length > 0 && paidCount === allMonthKeys.length;

  // ── Data section ──
  function renderDataSection() {
    if (user) {
      if (historyLoading) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", background: "#111109", border: "1px solid #3d3a28", borderRadius: 4, color: "#8a8268", fontSize: 13 }}>
            <span style={{ opacity: 0.6 }}>⟳</span> Loading your transaction history from cloud…
          </div>
        );
      }
      if (historyParsed) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", background: "#111109", border: "1px solid #3d3a28", borderRadius: 4 }}>
            <span style={{ color: "#72c472", fontSize: 18 }}>✓</span>
            <span style={{ color: "#c0b890", fontSize: 13 }}>
              Using cloud history — {historyParsed.rows.length.toLocaleString()} transactions
            </span>
            <button
              type="button"
              onClick={() => { setHistoryLoading(true); reloadHistory().finally(() => setHistoryLoading(false)); }}
              style={{ marginLeft: "auto", padding: "6px 12px", border: "1px solid #3d3a28", borderRadius: 3, background: "transparent", color: "#8a8268", fontSize: 11, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "Georgia, serif" }}
            >
              ↻ Refresh
            </button>
          </div>
        );
      }
      // Signed in but no history yet — show a load button + optional CSV
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: "13px 18px", background: "#111109", border: "1px solid #3d3a28", borderRadius: 4, color: "#8a8268", fontSize: 13 }}>
            No history loaded yet. Add a CSV below — it will be saved and used for calculation.
          </div>
          <FileDropZone parsed={parsed} fileName={fileName} onFile={onFile} />
        </div>
      );
    }

    // Not logged in — use CSV
    return (
      <div>
        <div style={{ marginBottom: 10, padding: "10px 14px", background: "#1a1408", border: "1px solid #3a2e10", borderRadius: 3, fontSize: 12, color: "#a89058" }}>
          Sign in to use your cloud history. For now, calculations use the loaded CSV.
        </div>
        {parsed ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", background: "#111109", border: "1px solid #3d3a28", borderRadius: 4 }}>
            <span style={{ color: "#72c472", fontSize: 18 }}>✓</span>
            <span style={{ color: "#c0b890", fontSize: 13 }}>{parsed.rows.length.toLocaleString()} rows from {fileName}</span>
          </div>
        ) : (
          <FileDropZone parsed={parsed} fileName={fileName} onFile={onFile} />
        )}
      </div>
    );
  }

  return (
    <div>

      {/* ── STEP 1: Data ── */}
      <div style={{ marginBottom: 32 }}>
        <StepLabel n="1">Your data</StepLabel>
        {renderDataSection()}
      </div>

      {/* ── STEP 2: Month selection ── */}
      <div style={{ marginBottom: 32 }}>
        <StepLabel n="2">Which month?</StepLabel>
        <div style={{ display: "flex", gap: 12 }}>
          {months.map((m, idx) => {
            const active = idx === selectedIdx;
            const sublabels = ["2 months ago", "last month", "current month"];
            const stats = monthStats[idx];
            let statsText = null;
            let statsColor = "#6a6450";
            if (stats.total === 0) {
              statsText = "no transactions";
            } else if (stats.unpaid === 0) {
              statsText = "✓ all paid";
              statsColor = "#72c472";
            } else {
              statsText = `${stats.unpaid} unpaid`;
              statsColor = stats.unpaid > 0 && active ? "#e8a040" : "#9a8050";
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                style={{
                  flex: 1,
                  padding: "20px 12px 16px",
                  border: active ? "2px solid #c4a84a" : "1px solid #3d3a28",
                  borderRadius: 6,
                  background: active ? "#1e1a08" : "#111109",
                  cursor: "pointer",
                  textAlign: "center",
                  fontFamily: "Georgia, serif",
                  transition: "border-color 0.15s, background 0.15s",
                  outline: "none",
                }}
              >
                <div style={{ fontSize: 19, fontWeight: 400, color: active ? "#c4a84a" : "#c0b890", marginBottom: 5 }}>
                  {monthLabel(m)}
                </div>
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: active ? "#9a8040" : "#6a6450", marginBottom: statsText ? 6 : 0 }}>
                  {sublabels[idx]}
                </div>
                {statsText && (
                  <div style={{ fontSize: 11, color: statsColor, marginTop: 4 }}>
                    {statsText}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── STEP 3: Results ── */}
      <div style={{ marginBottom: 24 }}>
        <StepLabel n="3">TOB for {monthLabel(selectedMonth)}</StepLabel>

        {!hasData ? (
          <div style={{ padding: "16px 20px", background: "#111109", border: "1px solid #3d3a28", borderRadius: 4, color: "#8a8268", fontSize: 13 }}>
            {user ? "Waiting for history to load…" : "Load a CSV above to calculate your TOB."}
          </div>
        ) : allPaid && allMonthKeys.length > 0 ? (
          <div style={{ padding: "16px 20px", background: "#0c1f0c", border: "1px solid #2a5228", borderRadius: 4, color: "#72c472", fontSize: 13, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 18 }}>✓</span>
            All {allMonthKeys.length} transactions for {monthLabel(selectedMonth)} are marked as paid.
            <button
              type="button"
              onClick={() => markPaidBatch(allMonthKeys, false)}
              style={{ marginLeft: "auto", padding: "6px 12px", border: "1px solid #2a5228", borderRadius: 3, background: "transparent", color: "#72c472", fontSize: 11, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "Georgia, serif" }}
            >
              ✕ Unmark all
            </button>
          </div>
        ) : !tobResult ? (
          <div style={{ padding: "16px 20px", background: "#111109", border: "1px solid #3d3a28", borderRadius: 4, color: "#8a8268", fontSize: 13 }}>
            No unpaid buy/sell transactions in {monthLabel(selectedMonth)}.
          </div>
        ) : (
          <div style={{ background: "#111109", border: "1px solid #3d3a28", borderRadius: 4, overflow: "hidden" }}>

            {/* Per-article breakdown */}
            <div style={{ padding: "18px 22px 14px" }}>
              {paidCount > 0 && (
                <div style={{ marginBottom: 12, fontSize: 11, color: "#72c472" }}>
                  {paidCount} of {allMonthKeys.length} transactions already marked paid — excluded from calculation.
                </div>
              )}
              {Object.values(tobResult.byArt).map((grp, i, arr) => (
                <div
                  key={grp.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "130px 1fr auto",
                    alignItems: "center",
                    gap: "0 16px",
                    padding: "9px 0",
                    borderBottom: i < arr.length - 1 ? "1px solid #1e1e10" : "none",
                  }}
                >
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#c4a84a" }}>{grp.art}</span>
                  <span style={{ fontSize: 12, color: "#8a8268" }}>{grp.label}</span>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#e8d890", textAlign: "right" }}>
                    {EUR.format(grp.totalTOB)}
                  </span>
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14, paddingTop: 14, borderTop: "2px solid #3d3a28" }}>
                <span style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#a89870" }}>
                  Total TOB due
                </span>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 26, color: "#f0e060", letterSpacing: 1 }}>
                  {EUR.format(tobResult.totalTOB)}
                </span>
              </div>
            </div>

            {/* Action bar */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #2e2c1e", background: "#0e0e0a", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <a
                href="https://eservices.minfin.fgov.be/myminfin-web/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", border: "1px solid #524e34", borderRadius: 3, background: "#181810", color: "#c4a84a", fontSize: 11, letterSpacing: 1, textDecoration: "none", fontFamily: "Georgia, serif", textTransform: "uppercase" }}
              >
                ↗ Pay on MyMinfin
              </a>

              <button
                type="button"
                onClick={() => markPaidBatch(allMonthKeys.filter((k) => !tobPaidKeys?.has(k)), true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", border: "1px solid #3d6a40", borderRadius: 3, background: "#111a10", color: "#90c878", cursor: "pointer", fontSize: 11, letterSpacing: 1, fontFamily: "Georgia, serif", textTransform: "uppercase" }}
              >
                ✓ Mark all {allMonthKeys.length} as paid
              </button>

              <button
                type="button"
                onClick={() => setDetailOpen((v) => !v)}
                style={{ marginLeft: "auto", padding: "8px 14px", border: "1px solid #2e2c1e", borderRadius: 3, background: "transparent", color: "#7a7460", cursor: "pointer", fontSize: 11, letterSpacing: 1, fontFamily: "Georgia, serif", textTransform: "uppercase" }}
              >
                {detailOpen ? "▴ Hide details" : "▾ Show details"} ({tobResult.lineItems.length} lines)
              </button>
            </div>

            {detailOpen && (
              <div style={{ borderTop: "1px solid #2e2c1e" }}>
                <TobResultTable
                  headers={effectiveData.headers}
                  lineItems={tobResult.lineItems}
                  instrumentNames={instrumentNames}
                  dateColIndex={dateColIndex}
                  tobPaidKeys={tobPaidKeys}
                  toggleTobPaid={toggleTobPaid}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
