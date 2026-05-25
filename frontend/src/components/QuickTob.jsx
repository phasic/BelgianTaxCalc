import { useEffect, useMemo, useRef, useState } from "react";
import { collectTobRowsInScope, calculateTobResult, parseRowDate } from "../logic/tobCalculation.js";
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
    <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#71717a", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "#232328", color: "#f59e0b", fontSize: 10, fontWeight: 600 }}>{n}</span>
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
    fontFamily: "inherit", textDecoration: "none", letterSpacing: 1,
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
        <div style={{ padding: "12px 18px", background: "rgba(239,68,68,0.08)", borderBottom: "1px solid rgba(239,68,68,0.25)", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: "#ef4444", letterSpacing: 0.5 }}>
            {result.unresolvedTickers.length} ticker{result.unresolvedTickers.length > 1 ? "s" : ""} could not be classified — excluded from total
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.unresolvedTickers.map((t) => (
              <span key={t} style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "2px 8px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 3, color: "#f87171" }}>{t}</span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#71717a", fontStyle: "italic" }}>
            Go to the Transactions tab and resolve instrument types via OpenFIGI, then recalculate.
          </div>
        </div>
      )}

      {/* Gov form fill-in */}
      <div style={{ padding: "16px 20px 14px" }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#71717a", marginBottom: 14 }}>
          Fill in at divtax.minfin.fgov.be — {label}
        </div>
        {paidNote && (
          <div style={{ marginBottom: 12, fontSize: 11, color: "#22c55e" }}>{paidNote}</div>
        )}
        {Object.values(result.byArt).map((grp) => (
          <div key={grp.key} style={{ marginBottom: 12, padding: "18px 20px", border: "1px solid #4a4020", borderRadius: 6, background: "#18181b" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#3f3f46", marginBottom: 5 }}>Transaction type</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "#f59e0b", letterSpacing: 0.5 }}>{grp.art}</span>
                <span style={{ fontSize: 11, color: "#52525b" }}>{grp.label}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ padding: "14px 16px", background: "#141410", borderRadius: 4, border: "1px solid #232328" }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#52525b", marginBottom: 8 }}>Number of transactions</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, color: "#f0ead8", lineHeight: 1 }}>{grp.count}</div>
              </div>
              <div style={{ padding: "14px 16px", background: "#141410", borderRadius: 4, border: "1px solid #232328" }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#52525b", marginBottom: 8 }}>Taxable amount</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "#f0ead8", lineHeight: 1, wordBreak: "break-all" }}>{EUR.format(grp.totalEUR)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Calculated TOB */}
      <div style={{ padding: "12px 20px 16px", borderTop: "1px solid #1e1e10", background: "#18181b" }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#52525b", marginBottom: 10 }}>
          Calculated TOB (double-check)
        </div>
        {Object.values(result.byArt).map((grp) => (
          <div key={grp.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#71717a", marginBottom: 5 }}>
            <span>{grp.art} <span style={{ fontFamily: "var(--font-mono)" }}>({(grp.rate * 100).toFixed(2)}%)</span></span>
            <span style={{ fontFamily: "var(--font-mono)", color: "#f59e0b" }}>{EUR.format(grp.totalTOB)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#a1a1aa" }}>Total TOB due</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, color: "#fbbf24", letterSpacing: 1 }}>{EUR.format(result.totalTOB)}</span>
        </div>
      </div>

      {/* Action bar */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#18181b", display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, alignItems: isMobile ? "stretch" : "center" }}>
        <ActionBtn href="https://divtax.minfin.fgov.be/" bg="#3a2e08" color="#f0d060" borderColor="rgba(245,158,11,0.4)">
          ↗ File on divtax
        </ActionBtn>
        <ActionBtn onClick={onMarkAllPaid} bg="rgba(34,197,94,0.08)" color="#22c55e" borderColor="rgba(34,197,94,0.25)">
          ✓ Mark all {markKeys.length} paid
        </ActionBtn>
        <button
          type="button"
          onClick={() => setDetailOpen((v) => !v)}
          style={{ marginLeft: isMobile ? 0 : "auto", alignSelf: isMobile ? "flex-start" : "auto", padding: "8px 14px", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, background: "transparent", color: "#71717a", cursor: "pointer", fontSize: 11, letterSpacing: 1, fontFamily: "inherit", textTransform: "uppercase" }}
        >
          {detailOpen ? "▴ Hide details" : "▾ Show details"} ({result.lineItems.length})
        </button>
      </div>

      {detailOpen && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
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

  // ── Data freshness ──
  const { earliestDate, mostRecentDate } = useMemo(() => {
    if (!hasData || dateColIndex < 0) return { earliestDate: null, mostRecentDate: null };
    let earliest = null, latest = null;
    for (const row of effectiveData.rows) {
      const d = parseRowDate(String(row[dateColIndex] ?? ""));
      if (!d) continue;
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;
    }
    return { earliestDate: earliest, mostRecentDate: latest };
  }, [hasData, effectiveData, dateColIndex]);

  const daysSinceLatest = mostRecentDate
    ? Math.floor((Date.now() - mostRecentDate.getTime()) / 86_400_000)
    : null;
  const isStale = daysSinceLatest !== null && daysSinceLatest > 30;

  function fmtMonthYear(d) {
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }
  function fmtDateShort(d) {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function dateRangeLabel() {
    if (!earliestDate || !mostRecentDate) return null;
    const from = fmtMonthYear(earliestDate);
    const to = fmtMonthYear(mostRecentDate);
    return from === to ? from : `${from} – ${to}`;
  }

  function isMonthOpen(mKey, monthAllPaid) {
    if (mKey in monthOpenState) return monthOpenState[mKey];
    return !monthAllPaid; // default: open if unpaid, closed if all paid
  }

  // ── Data section ──
  function renderDataSection() {
    if (user) {
      if (historyLoading) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, color: "#71717a", fontSize: 13 }}>
            <span style={{ opacity: 0.6 }}>⟳</span> Loading your transaction history from cloud…
          </div>
        );
      }
      if (historyParsed) {
        const range = dateRangeLabel();
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Stats bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "#fbbf24", lineHeight: 1 }}>
                  {historyParsed.rows.length.toLocaleString()}
                </span>
                <span style={{ fontSize: 13, color: "#a1a1aa" }}>transactions</span>
                <span style={{ fontSize: 11, color: "#52525b" }}>· ☁ cloud</span>
                {range && (
                  <span style={{ fontSize: 11, color: "#52525b" }}>· {range}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setHistoryLoading(true); reloadHistory().finally(() => setHistoryLoading(false)); }}
                style={{ flexShrink: 0, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, background: "transparent", color: "#71717a", fontSize: 11, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}
              >
                ↻ Refresh
              </button>
            </div>

            {/* Stale data warning */}
            {isStale && (
              <div style={{ padding: "12px 16px", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 6, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ color: "#f97316", fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>⚠</span>
                <div>
                  <div style={{ fontSize: 13, color: "#f97316", marginBottom: 3 }}>Your data might be outdated</div>
                  <div style={{ fontSize: 11, color: "#a3764a", lineHeight: 1.6 }}>
                    Most recent transaction is from {fmtDateShort(mostRecentDate)} ({daysSinceLatest} days ago).
                    Upload a new Revolut statement to include recent trades.
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: "13px 18px", background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, color: "#71717a", fontSize: 13 }}>
            No history loaded yet. Add a CSV below — it will be saved and used for calculation.
          </div>
          <FileDropZone parsed={parsed} fileName={fileName} onFile={onFile} />
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 6, fontSize: 12, color: "#a89058" }}>
          Sign in to save history to the cloud. Calculations currently use the loaded CSV.
        </div>
        {parsed ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "#fbbf24", lineHeight: 1 }}>
                  {parsed.rows.length.toLocaleString()}
                </span>
                <span style={{ fontSize: 13, color: "#a1a1aa" }}>transactions</span>
                <span style={{ fontSize: 11, color: "#52525b" }}>· {fileName}</span>
                {dateRangeLabel() && (
                  <span style={{ fontSize: 11, color: "#52525b" }}>· {dateRangeLabel()}</span>
                )}
              </div>
            </div>
            {isStale && (
              <div style={{ padding: "12px 16px", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 6, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ color: "#f97316", fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>⚠</span>
                <div>
                  <div style={{ fontSize: 13, color: "#f97316", marginBottom: 3 }}>Your data might be outdated</div>
                  <div style={{ fontSize: 11, color: "#a3764a", lineHeight: 1.6 }}>
                    Most recent transaction is from {fmtDateShort(mostRecentDate)} ({daysSinceLatest} days ago).
                    Upload a newer Revolut statement to include recent trades.
                  </div>
                </div>
              </div>
            )}
          </>
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
        <div style={{ padding: "16px 20px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 4, color: "#22c55e", fontSize: 13, display: "flex", alignItems: "center", gap: 12 }}>
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
            <div key={mKey} style={{ border: mAllPaid ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(255,255,255,0.07)", borderRadius: 6, overflow: "hidden", background: mAllPaid ? "#0a130a" : "#18181b" }}>

              {/* ── Month header (always visible, click to toggle) ── */}
              <button
                type="button"
                onClick={toggle}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", gap: 12 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, color: mAllPaid ? "#3a6a3a" : "#3f3f46", width: 10 }}>{open ? "▾" : "▶"}</span>
                  <span style={{ fontSize: 16, color: mAllPaid ? "#22c55e" : "#d4d4d8" }}>
                    {mAllPaid && <span style={{ marginRight: 6 }}>✓</span>}{label}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  {mAllPaid ? (
                    <span style={{ fontSize: 11, color: "#22c55e", letterSpacing: 0.5 }}>all paid</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 11, color: "#9a8050" }}>{unpaidCount} unpaid</span>
                      {mTobResult && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#fbbf24" }}>
                          {EUR.format(mTobResult.totalTOB)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </button>

              {/* ── Month body (collapsible) ── */}
              {open && (
                <div style={{ borderTop: `1px solid ${mAllPaid ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}` }}>
                  {mAllPaid ? (
                    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 13, color: "#22c55e" }}>
                        All {allKeys.length} transaction{allKeys.length === 1 ? "" : "s"} for {label} are marked paid.
                      </span>
                      <button
                        type="button"
                        onClick={() => markPaidBatch(allKeys, false)}
                        style={{ padding: "6px 12px", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 3, background: "transparent", color: "#22c55e", fontSize: 11, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit", whiteSpace: "nowrap" }}
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
            let statsText = null, statsColor = "#52525b";
            if (stats.total === 0) { statsText = "no transactions"; }
            else if (stats.unpaid === 0) { statsText = "✓ all paid"; statsColor = "#22c55e"; }
            else { statsText = `${stats.unpaid} unpaid`; statsColor = active ? "#f59e0b" : "#9a8050"; }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                onMouseEnter={() => setHoveredMonth(idx)}
                onMouseLeave={() => setHoveredMonth(null)}
                style={{
                  flex: 1, padding: "18px 10px 14px",
                  border: active ? "2px solid #f59e0b" : hovered ? "1px solid #6a6040" : "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 6, background: active ? "rgba(245,158,11,0.08)" : hovered ? "#161410" : "#18181b",
                  cursor: "pointer", textAlign: "center", fontFamily: "inherit", outline: "none",
                  boxShadow: active ? "0 0 14px rgba(196,168,74,0.12)" : "none",
                  transition: "border-color 0.12s, background 0.12s, box-shadow 0.12s",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 400, color: active ? "#f59e0b" : "#d4d4d8", marginBottom: 4 }}>{monthLabel(m)}</div>
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: active ? "#d97706" : "#52525b", marginBottom: statsText ? 6 : 0 }}>{sublabels[idx]}</div>
                {statsText && <div style={{ fontSize: 11, color: statsColor, marginTop: 2 }}>{statsText}</div>}
                {!active && <div style={{ fontSize: 14, color: hovered ? "#6a6040" : "#3a3828", marginTop: 6 }}>›</div>}
                {active && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6, letterSpacing: 1, textTransform: "uppercase", opacity: 0.7 }}>selected</div>}
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
                border: active ? "2px solid #f59e0b" : "1px solid rgba(255,255,255,0.07)",
                borderRadius: 6, background: active ? "rgba(245,158,11,0.08)" : "#18181b",
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                outline: "none", transition: "border-color 0.12s, background 0.12s",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span style={{ fontSize: 14, color: active ? "#f59e0b" : "#d4d4d8" }}>All unpaid transactions</span>
                <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: active ? "#d97706" : "#52525b" }}>
                  per month — file &amp; mark each separately
                </span>
              </div>
              <span style={{
                fontSize: 13, fontFamily: "var(--font-mono)",
                color: totalUnpaidTx === 0 ? "#22c55e" : (active ? "#f59e0b" : "#9a8050"),
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
          <div style={{ padding: "16px 20px", background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, color: "#71717a", fontSize: 13 }}>
            {user ? "Waiting for history to load…" : "Load a CSV above to calculate your TOB."}
          </div>

        ) : selectedIdx === null ? (
          renderAllUnpaidByMonth()

        ) : allPaid && allMonthKeys.length > 0 ? (
          <div style={{ padding: "16px 20px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 4, color: "#22c55e", fontSize: 13, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 18 }}>✓</span>
            All {allMonthKeys.length} transactions for {monthLabel(selectedMonth)} are marked as paid.
            <button type="button" onClick={() => markPaidBatch(allMonthKeys, false)}
              style={{ marginLeft: "auto", padding: "6px 12px", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 3, background: "transparent", color: "#22c55e", fontSize: 11, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}>
              ✕ Unmark all
            </button>
          </div>

        ) : !tobResult ? (
          <div style={{ padding: "16px 20px", background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, color: "#71717a", fontSize: 13 }}>
            No unpaid buy/sell transactions in {monthLabel(selectedMonth)}.
          </div>

        ) : (
          <div style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, overflow: "hidden" }}>
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
