import { useEffect, useMemo, useRef, useState } from "react";
import { collectTobRowsInScope, calculateTobResult } from "../logic/tobCalculation.js";
import { makeTransactionKey } from "../logic/tobDeadline.js";
import { findTypeColumnIndex, findDateColumnIndex, isTobType } from "../logic/transactionFilters.js";
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

function ActionBtn({ href, onClick, bg, color, borderColor, children, style }) {
  const [hov, setHov] = useState(false);
  const base = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "13px 20px", border: `1px solid ${borderColor ?? "transparent"}`,
    borderRadius: 4, background: hov ? "transparent" : bg, cursor: "pointer",
    fontFamily: "Georgia, serif", textDecoration: "none", letterSpacing: 1,
    textTransform: "uppercase", fontSize: 13, color,
    transition: "background 0.15s, border-color 0.15s",
    ...style,
  };
  if (hov) { base.background = "transparent"; base.borderColor = borderColor ?? color; }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={base}
         onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} style={base}
            onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {children}
    </button>
  );
}

// Shared fill-in card body — used by both single-month and per-month views
function FillInBody({ result, label, headers, instrumentNames, dateColIndex, tobPaidKeys, toggleTobPaid, updateManualType, markKeys, paidNote, onMarkAllPaid, isMobile, extraDetailKey }) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      {/* Unresolved warning */}
      {result.unresolvedTickers?.length > 0 && (
        <div style={{ padding: "12px 18px", background: "#1a0a0a", borderBottom: "1px solid #6a2020", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: "#c04848", letterSpacing: 0.5 }}>
            {result.unresolvedTickers.length} ticker{result.unresolvedTickers.length > 1 ? "s" : ""} could not be classified — excluded from total
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.unresolvedTickers.map((t) => (
              <span key={t} style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "2px 8px", background: "#2a1010", border: "1px solid #6a2020", borderRadius: 3, color: "#e07070" }}>{t}</span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#7a5050", fontStyle: "italic" }}>
            Go to the Transactions tab and resolve instrument types via OpenFIGI, then recalculate.
          </div>
        </div>
      )}

      {/* Gov form fill-in */}
      <div style={{ padding: "16px 20px 14px" }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#7a7460", marginBottom: 14 }}>
          Fill in at divtax.minfin.fgov.be — {label}
        </div>
        {paidNote && (
          <div style={{ marginBottom: 12, fontSize: 11, color: "#72c472" }}>{paidNote}</div>
        )}
        {Object.values(result.byArt).map((grp) => (
          <div key={grp.key} style={{ marginBottom: 12, padding: "18px 20px", border: "1px solid #4a4020", borderRadius: 6, background: "#0e0e0a" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#5a5440", marginBottom: 5 }}>Transaction type</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 20, color: "#c4a84a", letterSpacing: 0.5 }}>{grp.art}</span>
                <span style={{ fontSize: 11, color: "#6a6450" }}>{grp.label}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ padding: "14px 16px", background: "#141410", borderRadius: 4, border: "1px solid #2a2818" }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#6a6450", marginBottom: 8 }}>Number of transactions</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 32, color: "#f0ead8", lineHeight: 1 }}>{grp.count}</div>
              </div>
              <div style={{ padding: "14px 16px", background: "#141410", borderRadius: 4, border: "1px solid #2a2818" }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#6a6450", marginBottom: 8 }}>Taxable amount</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, color: "#f0ead8", lineHeight: 1, wordBreak: "break-all" }}>{EUR.format(grp.totalEUR)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Calculated TOB */}
      <div style={{ padding: "12px 20px 16px", borderTop: "1px solid #1e1e10", background: "#0c0c08" }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#6a6450", marginBottom: 10 }}>
          Calculated TOB (double-check)
        </div>
        {Object.values(result.byArt).map((grp) => (
          <div key={grp.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7a7460", marginBottom: 5 }}>
            <span>{grp.art} <span style={{ fontFamily: "ui-monospace, monospace" }}>({(grp.rate * 100).toFixed(2)}%)</span></span>
            <span style={{ fontFamily: "ui-monospace, monospace", color: "#c8c080" }}>{EUR.format(grp.totalTOB)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10, paddingTop: 10, borderTop: "1px solid #3d3a28" }}>
          <span style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#a89870" }}>Total TOB due</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 26, color: "#f0e060", letterSpacing: 1 }}>{EUR.format(result.totalTOB)}</span>
        </div>
      </div>

      {/* Action bar */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid #2e2c1e", background: "#0e0e0a", display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, alignItems: isMobile ? "stretch" : "center" }}>
        <ActionBtn href="https://divtax.minfin.fgov.be/" bg="#3a2e08" color="#f0d060" borderColor="#6a5818">
          ↗ File on divtax
        </ActionBtn>
        <ActionBtn onClick={onMarkAllPaid} bg="#132813" color="#72c472" borderColor="#2a5228">
          ✓ Mark all {markKeys.length} paid
        </ActionBtn>
        <button
          type="button"
          onClick={() => setDetailOpen((v) => !v)}
          style={{ marginLeft: isMobile ? 0 : "auto", alignSelf: isMobile ? "flex-start" : "auto", padding: "8px 14px", border: "1px solid #2e2c1e", borderRadius: 3, background: "transparent", color: "#7a7460", cursor: "pointer", fontSize: 11, letterSpacing: 1, fontFamily: "Georgia, serif", textTransform: "uppercase" }}
        >
          {detailOpen ? "▴ Hide details" : "▾ Show details"} ({result.lineItems.length})
        </button>
      </div>

      {detailOpen && (
        <div style={{ borderTop: "1px solid #2e2c1e" }}>
          <TobResultTable
            headers={headers}
            lineItems={result.lineItems}
            instrumentNames={instrumentNames}
            dateColIndex={dateColIndex}
            tobPaidKeys={tobPaidKeys}
            toggleTobPaid={toggleTobPaid}
            updateManualType={updateManualType}
          />
        </div>
      )}
    </>
  );
}

export default function QuickTob({
  parsed, fileName, onFile, user, historyParsed, reloadHistory,
  instrumentNames = new Map(), tobPaidKeys, toggleTobPaid, markPaidBatch, updateManualType,
}) {
  const months = useMemo(buildThreeMonths, []);
  const [selectedIdx, setSelectedIdx] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hoveredMonth, setHoveredMonth] = useState(null);
  // Per-month collapse state for "all unpaid" view. Default: open if unpaid, closed if all paid.
  const [monthOpenState, setMonthOpenState] = useState({});
  const autoLoadAttempted = useRef(false);

  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const effectiveData = user ? historyParsed : parsed;
  const typeColIndex = effectiveData ? findTypeColumnIndex(effectiveData.headers) : -1;
  const dateColIndex = effectiveData ? findDateColumnIndex(effectiveData.headers) : -1;
  const hasData = Boolean(effectiveData && typeColIndex >= 0 && dateColIndex >= 0);

  useEffect(() => {
    if (!user || historyParsed || !reloadHistory || autoLoadAttempted.current) return;
    autoLoadAttempted.current = true;
    setHistoryLoading(true);
    reloadHistory().finally(() => setHistoryLoading(false));
  }, [user, historyParsed, reloadHistory]);

  useEffect(() => { autoLoadAttempted.current = false; }, [user]);

  const selectedMonth = selectedIdx !== null ? months[selectedIdx] : null;

  // ── Per-month stats for the 3 month buttons ──
  const monthStats = useMemo(() => {
    if (!hasData) return months.map(() => ({ total: 0, unpaid: 0 }));
    return months.map((m) => {
      const scoped = collectTobRowsInScope(effectiveData, typeColIndex, dateColIndex, "month", {
        year: m.year, monthIndex: m.monthIndex, periodStart: "", periodEnd: "", selectedIndices: new Set(),
      });
      const unpaid = scoped.filter(({ row }) => !tobPaidKeys?.has(makeTransactionKey(row, effectiveData.headers))).length;
      return { total: scoped.length, unpaid };
    });
  }, [hasData, effectiveData, typeColIndex, dateColIndex, months, tobPaidKeys]);

  // ── Single-month result (for the 3 month buttons) ──
  const { tobResult, allMonthKeys } = useMemo(() => {
    if (!hasData || selectedIdx === null) return { tobResult: null, allMonthKeys: [] };
    const scoped = collectTobRowsInScope(effectiveData, typeColIndex, dateColIndex, "month", {
      year: selectedMonth.year, monthIndex: selectedMonth.monthIndex, periodStart: "", periodEnd: "", selectedIndices: new Set(),
    });
    const allKeys = scoped.map(({ row }) => makeTransactionKey(row, effectiveData.headers));
    const unpaidScoped = scoped.filter(({ row }) => !tobPaidKeys?.has(makeTransactionKey(row, effectiveData.headers)));
    const tob = unpaidScoped.length ? calculateTobResult(unpaidScoped, effectiveData.headers, instrumentNames) : null;
    return { tobResult: tob, allMonthKeys: allKeys };
  }, [hasData, effectiveData, typeColIndex, dateColIndex, selectedIdx, selectedMonth, instrumentNames, tobPaidKeys]);

  // ── All months grouped — for the "all unpaid" per-month breakdown ──
  const allTobMonths = useMemo(() => {
    if (!hasData) return [];
    const monthMap = new Map();
    for (let i = 0; i < effectiveData.rows.length; i++) {
      const row = effectiveData.rows[i];
      if (!isTobType(row[typeColIndex])) continue;
      const dateCell = row[dateColIndex];
      const d = new Date(dateCell);
      if (isNaN(d.getTime())) continue;
      const year = d.getFullYear();
      const moIdx = d.getMonth();
      const mKey = `${year}-${moIdx}`;
      const txKey = makeTransactionKey(row, effectiveData.headers);
      if (!monthMap.has(mKey)) monthMap.set(mKey, { year, monthIndex: moIdx, mKey, allKeys: [], unpaidEntries: [] });
      const m = monthMap.get(mKey);
      m.allKeys.push(txKey);
      if (!tobPaidKeys?.has(txKey)) m.unpaidEntries.push({ sourceIndex: i, row });
    }
    const sorted = [...monthMap.values()].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex
    );
    return sorted.map((m) => ({
      ...m,
      allPaid: m.unpaidEntries.length === 0,
      tobResult: m.unpaidEntries.length
        ? calculateTobResult(m.unpaidEntries, effectiveData.headers, instrumentNames)
        : null,
    }));
  }, [hasData, effectiveData, typeColIndex, dateColIndex, tobPaidKeys, instrumentNames]);

  const unpaidMonthCount = allTobMonths.filter((m) => !m.allPaid).length;
  const totalUnpaidTx = allTobMonths.reduce((s, m) => s + m.unpaidEntries.length, 0);

  const paidCount = allMonthKeys.filter((k) => tobPaidKeys?.has(k)).length;
  const allPaid = allMonthKeys.length > 0 && paidCount === allMonthKeys.length;

  function isMonthOpen(mKey, monthAllPaid) {
    if (mKey in monthOpenState) return monthOpenState[mKey];
    return !monthAllPaid; // default: open if unpaid, closed if all paid
  }

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
            <span style={{ color: "#c0b890", fontSize: 13 }}>Using cloud history — {historyParsed.rows.length.toLocaleString()} transactions</span>
            <button type="button" onClick={() => { setHistoryLoading(true); reloadHistory().finally(() => setHistoryLoading(false)); }}
              style={{ marginLeft: "auto", padding: "6px 12px", border: "1px solid #3d3a28", borderRadius: 3, background: "transparent", color: "#8a8268", fontSize: 11, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "Georgia, serif" }}>
              ↻ Refresh
            </button>
          </div>
        );
      }
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: "13px 18px", background: "#111109", border: "1px solid #3d3a28", borderRadius: 4, color: "#8a8268", fontSize: 13 }}>
            No history loaded yet. Add a CSV below — it will be saved and used for calculation.
          </div>
          <FileDropZone parsed={parsed} fileName={fileName} onFile={onFile} />
        </div>
      );
    }
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

  // ── Per-month breakdown for "all unpaid" ──
  function renderAllUnpaidByMonth() {
    if (allTobMonths.length === 0) {
      return (
        <div style={{ padding: "16px 20px", background: "#0c1f0c", border: "1px solid #2a5228", borderRadius: 4, color: "#72c472", fontSize: 13, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>✓</span> No unpaid buy/sell transactions.
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {allTobMonths.map(({ year, monthIndex, mKey, allKeys, unpaidEntries, allPaid: mAllPaid, tobResult: mTobResult }) => {
          const label = monthLabel({ year, monthIndex });
          const open = isMonthOpen(mKey, mAllPaid);
          const unpaidCount = unpaidEntries.length;
          const toggle = () => setMonthOpenState((prev) => ({ ...prev, [mKey]: !open }));

          const handleMarkAllPaid = () => {
            const keys = unpaidEntries.map((e) => makeTransactionKey(e.row, effectiveData.headers));
            markPaidBatch(keys, true);
            setMonthOpenState((prev) => ({ ...prev, [mKey]: false }));
          };

          return (
            <div key={mKey} style={{ border: mAllPaid ? "1px solid #2a5228" : "1px solid #3d3a28", borderRadius: 6, overflow: "hidden", background: mAllPaid ? "#0a130a" : "#111109" }}>

              {/* ── Month header (always visible, click to toggle) ── */}
              <button
                type="button"
                onClick={toggle}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "Georgia, serif", textAlign: "left", gap: 12 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, color: mAllPaid ? "#3a6a3a" : "#5a5440", width: 10 }}>{open ? "▾" : "▶"}</span>
                  <span style={{ fontSize: 16, color: mAllPaid ? "#72c472" : "#c0b890" }}>
                    {mAllPaid && <span style={{ marginRight: 6 }}>✓</span>}{label}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  {mAllPaid ? (
                    <span style={{ fontSize: 11, color: "#72c472", letterSpacing: 0.5 }}>all paid</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 11, color: "#9a8050" }}>{unpaidCount} unpaid</span>
                      {mTobResult && (
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#f0e060" }}>
                          {EUR.format(mTobResult.totalTOB)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </button>

              {/* ── Month body (collapsible) ── */}
              {open && (
                <div style={{ borderTop: `1px solid ${mAllPaid ? "#1e3a1e" : "#2e2c1e"}` }}>
                  {mAllPaid ? (
                    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 13, color: "#72c472" }}>
                        All {allKeys.length} transaction{allKeys.length === 1 ? "" : "s"} for {label} are marked paid.
                      </span>
                      <button
                        type="button"
                        onClick={() => markPaidBatch(allKeys, false)}
                        style={{ padding: "6px 12px", border: "1px solid #2a5228", borderRadius: 3, background: "transparent", color: "#72c472", fontSize: 11, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "Georgia, serif", whiteSpace: "nowrap" }}
                      >
                        ✕ Unmark
                      </button>
                    </div>
                  ) : mTobResult ? (
                    <FillInBody
                      result={mTobResult}
                      label={label}
                      headers={effectiveData.headers}
                      instrumentNames={instrumentNames}
                      dateColIndex={dateColIndex}
                      tobPaidKeys={tobPaidKeys}
                      toggleTobPaid={toggleTobPaid}
                      updateManualType={updateManualType}
                      markKeys={unpaidEntries.map((e) => makeTransactionKey(e.row, effectiveData.headers))}
                      onMarkAllPaid={handleMarkAllPaid}
                      isMobile={isMobile}
                    />
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
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

        {/* Month cards */}
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          {months.map((m, idx) => {
            const active = idx === selectedIdx;
            const hovered = hoveredMonth === idx;
            const sublabels = ["2 months ago", "last month", "current month"];
            const stats = monthStats[idx];
            let statsText = null, statsColor = "#6a6450";
            if (stats.total === 0) { statsText = "no transactions"; }
            else if (stats.unpaid === 0) { statsText = "✓ all paid"; statsColor = "#72c472"; }
            else { statsText = `${stats.unpaid} unpaid`; statsColor = active ? "#e8a040" : "#9a8050"; }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                onMouseEnter={() => setHoveredMonth(idx)}
                onMouseLeave={() => setHoveredMonth(null)}
                style={{
                  flex: 1, padding: "18px 10px 14px",
                  border: active ? "2px solid #c4a84a" : hovered ? "1px solid #6a6040" : "1px solid #3d3a28",
                  borderRadius: 6, background: active ? "#1e1a08" : hovered ? "#161410" : "#111109",
                  cursor: "pointer", textAlign: "center", fontFamily: "Georgia, serif", outline: "none",
                  boxShadow: active ? "0 0 14px rgba(196,168,74,0.12)" : "none",
                  transition: "border-color 0.12s, background 0.12s, box-shadow 0.12s",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 400, color: active ? "#c4a84a" : "#c0b890", marginBottom: 4 }}>{monthLabel(m)}</div>
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: active ? "#9a8040" : "#6a6450", marginBottom: statsText ? 6 : 0 }}>{sublabels[idx]}</div>
                {statsText && <div style={{ fontSize: 11, color: statsColor, marginTop: 2 }}>{statsText}</div>}
                {!active && <div style={{ fontSize: 14, color: hovered ? "#6a6040" : "#3a3828", marginTop: 6 }}>›</div>}
                {active && <div style={{ fontSize: 11, color: "#c4a84a", marginTop: 6, letterSpacing: 1, textTransform: "uppercase", opacity: 0.7 }}>selected</div>}
              </button>
            );
          })}
        </div>

        {/* All unpaid button */}
        {(() => {
          const active = selectedIdx === null;
          return (
            <button
              type="button"
              onClick={() => setSelectedIdx(null)}
              style={{
                width: "100%", padding: "14px 20px",
                border: active ? "2px solid #c4a84a" : "1px solid #3d3a28",
                borderRadius: 6, background: active ? "#1e1a08" : "#111109",
                cursor: "pointer", fontFamily: "Georgia, serif",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                outline: "none", transition: "border-color 0.12s, background 0.12s",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span style={{ fontSize: 14, color: active ? "#c4a84a" : "#c0b890" }}>All unpaid transactions</span>
                <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: active ? "#9a8040" : "#6a6450" }}>
                  per month — file &amp; mark each separately
                </span>
              </div>
              <span style={{
                fontSize: 13, fontFamily: "ui-monospace, monospace",
                color: totalUnpaidTx === 0 ? "#72c472" : (active ? "#e8a040" : "#9a8050"),
                background: totalUnpaidTx > 0 ? (active ? "#2a2008" : "#1a1808") : "transparent",
                padding: totalUnpaidTx > 0 ? "3px 10px" : "0", borderRadius: 12,
              }}>
                {totalUnpaidTx === 0 ? "✓ all paid" : `${unpaidMonthCount} month${unpaidMonthCount === 1 ? "" : "s"} · ${totalUnpaidTx} tx`}
              </span>
            </button>
          );
        })()}
      </div>

      {/* ── STEP 3: Results ── */}
      <div style={{ marginBottom: 24 }}>
        <StepLabel n="3">
          {selectedIdx === null ? "TOB — all unpaid, by month" : `TOB for ${monthLabel(selectedMonth)}`}
        </StepLabel>

        {!hasData ? (
          <div style={{ padding: "16px 20px", background: "#111109", border: "1px solid #3d3a28", borderRadius: 4, color: "#8a8268", fontSize: 13 }}>
            {user ? "Waiting for history to load…" : "Load a CSV above to calculate your TOB."}
          </div>

        ) : selectedIdx === null ? (
          renderAllUnpaidByMonth()

        ) : allPaid && allMonthKeys.length > 0 ? (
          <div style={{ padding: "16px 20px", background: "#0c1f0c", border: "1px solid #2a5228", borderRadius: 4, color: "#72c472", fontSize: 13, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 18 }}>✓</span>
            All {allMonthKeys.length} transactions for {monthLabel(selectedMonth)} are marked as paid.
            <button type="button" onClick={() => markPaidBatch(allMonthKeys, false)}
              style={{ marginLeft: "auto", padding: "6px 12px", border: "1px solid #2a5228", borderRadius: 3, background: "transparent", color: "#72c472", fontSize: 11, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "Georgia, serif" }}>
              ✕ Unmark all
            </button>
          </div>

        ) : !tobResult ? (
          <div style={{ padding: "16px 20px", background: "#111109", border: "1px solid #3d3a28", borderRadius: 4, color: "#8a8268", fontSize: 13 }}>
            No unpaid buy/sell transactions in {monthLabel(selectedMonth)}.
          </div>

        ) : (
          <div style={{ background: "#111109", border: "1px solid #3d3a28", borderRadius: 6, overflow: "hidden" }}>
            <FillInBody
              result={tobResult}
              label={monthLabel(selectedMonth)}
              headers={effectiveData.headers}
              instrumentNames={instrumentNames}
              dateColIndex={dateColIndex}
              tobPaidKeys={tobPaidKeys}
              toggleTobPaid={toggleTobPaid}
              updateManualType={updateManualType}
              markKeys={allMonthKeys.filter((k) => !tobPaidKeys?.has(k))}
              paidNote={paidCount > 0 ? `${paidCount} of ${allMonthKeys.length} transactions already marked paid — excluded.` : null}
              onMarkAllPaid={() => markPaidBatch(allMonthKeys.filter((k) => !tobPaidKeys?.has(k)), true)}
              isMobile={isMobile}
            />
          </div>
        )}
      </div>
    </div>
  );
}
