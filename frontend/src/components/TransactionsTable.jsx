import { useMemo, useState, useEffect } from "react";
import { isTobType, isDividendType } from "../logic/transactionFilters.js";
import { formatCellDisplay } from "../utils/formatters.js";
import DeadlineCell from "./DeadlineCell.jsx";
import InstrumentTypeCell from "./InstrumentTypeCell.jsx";
import { makeTransactionKey } from "../logic/tobDeadline.js";

const FILTER_BUTTONS = [
  { id: "all",       label: "All" },
  { id: "tob",       label: "TOB" },
  { id: "dividends", label: "Dividends" },
  { id: "unpaid",    label: "Unpaid TOB" },
  { id: "paid",      label: "Paid TOB" },
];

const SORT_COL_DEFS = [
  { id: "date",   match: (h) => h.includes("date") },
  { id: "name",   match: (h) => h === "name" || (h.includes("name") && !h.includes("username")) },
  { id: "ticker", match: (h) => h === "ticker" || h.includes("ticker") },
  { id: "type",   match: (h) => h === "type" || h.includes("type") },
  { id: "amount", match: (h) => h.includes("total") || h.includes("amount") },
];

function getSortColId(header) {
  const h = header.trim().toLowerCase();
  for (const def of SORT_COL_DEFS) {
    if (def.match(h)) return def.id;
  }
  return null;
}

function compareCell(a, b, sortId) {
  if (sortId === "date") {
    return new Date(a || 0).getTime() - new Date(b || 0).getTime();
  }
  if (sortId === "amount") {
    const na = parseFloat((a || "").replace(/[^0-9.\-]/g, "")) || 0;
    const nb = parseFloat((b || "").replace(/[^0-9.\-]/g, "")) || 0;
    return na - nb;
  }
  return (a || "").localeCompare(b || "");
}

export default function TransactionsTable({ parsed, typeColIndex, viewFilter, setViewFilter, instrumentNames = new Map(), tobPaidKeys, toggleTobPaid, updateManualType }) {
  const [sortConfig, setSortConfig] = useState({ colIndex: null, dir: "desc" });

  useEffect(() => {
    setSortConfig({ colIndex: null, dir: "desc" });
  }, [parsed]);

  const sortColIds = useMemo(
    () => (parsed ? parsed.headers.map((h) => getSortColId(h)) : []),
    [parsed]
  );

  const currencyColIndex = useMemo(
    () => (parsed ? parsed.headers.findIndex((h) => h.trim().toLowerCase() === "currency") : -1),
    [parsed]
  );
  const fxRateColIndex = useMemo(
    () => (parsed ? parsed.headers.findIndex((h) => h.trim().toLowerCase() === "fx rate") : -1),
    [parsed]
  );
  const tickerColIndex = useMemo(
    () => (parsed ? parsed.headers.findIndex((h) => h.trim().toLowerCase() === "ticker") : -1),
    [parsed]
  );

  const dateColIndex = useMemo(
    () => (parsed ? parsed.headers.findIndex((h) => h.trim().toLowerCase().includes("date")) : -1),
    [parsed]
  );

  const activeSortColIndex =
    sortConfig.colIndex !== null ? sortConfig.colIndex : dateColIndex;
  const activeSortDir = sortConfig.dir;
  const activeSortId = activeSortColIndex >= 0 ? sortColIds[activeSortColIndex] : null;

  function handleHeaderClick(colIdx) {
    const id = sortColIds[colIdx];
    if (!id) return;
    setSortConfig((prev) => ({
      colIndex: colIdx,
      dir: prev.colIndex === colIdx && prev.dir === "desc" ? "asc" : "desc",
    }));
  }

  const { displayEntries, filterNote } = useMemo(() => {
    if (!parsed) return { displayEntries: [], filterNote: null };
    let withIdx = parsed.rows.map((row, sourceIndex) => ({ row, sourceIndex }));

    if (activeSortId && activeSortColIndex >= 0) {
      withIdx = [...withIdx].sort((a, b) => {
        const cmp = compareCell(
          a.row[activeSortColIndex],
          b.row[activeSortColIndex],
          activeSortId
        );
        return activeSortDir === "desc" ? -cmp : cmp;
      });
    }

    if (typeColIndex === -1) {
      return { displayEntries: withIdx, filterNote: "No Type column found — filters are disabled." };
    }
    if (viewFilter === "all") return { displayEntries: withIdx, filterNote: null };

    const isTob = (e) => isTobType(e.row[typeColIndex]);
    const isPaid = (e) => tobPaidKeys?.has(makeTransactionKey(e.row, parsed.headers));

    const pred =
      viewFilter === "tob"       ? isTob
      : viewFilter === "dividends" ? (e) => isDividendType(e.row[typeColIndex])
      : viewFilter === "paid"      ? (e) => isTob(e) && isPaid(e)
      : viewFilter === "unpaid"    ? (e) => isTob(e) && !isPaid(e)
      : () => true;

    return { displayEntries: withIdx.filter(pred), filterNote: null };
  }, [parsed, typeColIndex, viewFilter, activeSortColIndex, activeSortDir, activeSortId, tobPaidKeys]);

  if (!parsed) return null;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 4,
        background: "#18181b",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#71717a",
            marginRight: "auto",
          }}
        >
          Parsed transactions
        </div>
        <div
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          role="group"
          aria-label="Filter by transaction kind"
        >
          {FILTER_BUTTONS.map(({ id, label }) => {
            const active = viewFilter === id;
            const disabled = typeColIndex === -1 && id !== "all";
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); setViewFilter(id); }}
                style={{
                  padding: "8px 16px",
                  border: active ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 3,
                  background: active ? "#1e1e22" : "transparent",
                  color: active ? "#f59e0b" : "#71717a",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.45 : 1,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {filterNote && (
        <div style={{ padding: "10px 18px", fontSize: 12, color: "#b08848", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {filterNote}
        </div>
      )}
      {!filterNote && viewFilter !== "all" && (
        <div style={{ padding: "10px 18px", fontSize: 12, color: "#71717a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          Showing {displayEntries.length} of {parsed.rows.length} rows
          {viewFilter === "tob"       ? " (buy and sell trades only)"
          : viewFilter === "dividends" ? " (dividends only)"
          : viewFilter === "paid"      ? " (TOB-paid transactions)"
          : viewFilter === "unpaid"    ? " (unpaid buy/sell transactions)"
          : ""}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: "min(70vh, 640px)", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "#1c1c20", zIndex: 1 }}>
              {parsed.headers.flatMap((h, hi) => {
                if (hi === currencyColIndex) return [];
                const sortId = sortColIds[hi];
                const isActive = hi === activeSortColIndex;
                const thEl = (
                  <th
                    key={`${hi}-${h}`}
                    onClick={sortId ? () => handleHeaderClick(hi) : undefined}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      fontWeight: 400,
                      color: isActive ? "#f59e0b" : sortId ? "#a89860" : "#8a8060",
                      fontSize: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                      whiteSpace: "nowrap",
                      cursor: sortId ? "pointer" : "default",
                      userSelect: "none",
                    }}
                  >
                    {h}
                    {sortId && (
                      <span style={{ marginLeft: 5, opacity: isActive ? 1 : 0.35, fontSize: 10 }}>
                        {isActive ? (activeSortDir === "desc" ? "↓" : "↑") : "↕"}
                      </span>
                    )}
                  </th>
                );
                if (hi === dateColIndex) {
                  return [
                    thEl,
                    <th key="deadline-th" style={{ textAlign: "left", padding: "10px 12px", fontWeight: 400, color: "#8a7a50", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap" }}>
                      TOB Deadline
                    </th>,
                  ];
                }
                return [thEl];
              })}
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontWeight: 400,
                  color: "#a1a1aa",
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  whiteSpace: "nowrap",
                }}
              >
                Instrument
              </th>
            </tr>
          </thead>
          <tbody>
            {displayEntries.length === 0 ? (
              <tr>
                <td
                  colSpan={parsed.headers.length - (currencyColIndex >= 0 ? 1 : 0) + 2}
                  style={{ padding: "28px 16px", textAlign: "center", color: "#71717a", fontSize: 13 }}
                >
                  {viewFilter === "all" ? "No data rows in this file." : "No rows match this filter."}
                </td>
              </tr>
            ) : (
              displayEntries.map(({ row, sourceIndex }, ri) => {
                const ticker = tickerColIndex >= 0 ? (row[tickerColIndex] ?? "").trim() : "";
                const instrumentInfo = ticker ? instrumentNames.get(ticker) : null;

                const typeStr = typeColIndex >= 0 ? (row[typeColIndex] ?? "") : "";
                const isToB = isTobType(typeStr);

                return (
                  <tr key={`${sourceIndex}-${ri}`} style={{ borderTop: "1px solid #1c1c20" }}>
                    {row.flatMap((cell, ci) => {
                      if (ci === currencyColIndex) return [];
                      const header = parsed.headers[ci] ?? "";
                      const isTicker = header.toLowerCase() === "ticker";
                      const instrument = isTicker && cell ? instrumentNames.get(cell) : null;
                      const isEurFxRate =
                        ci === fxRateColIndex &&
                        currencyColIndex !== -1 &&
                        (row[currencyColIndex] ?? "").trim().toUpperCase() === "EUR";
                      const tdEl = (
                        <td
                          key={ci}
                          style={{
                            padding: "10px 12px",
                            color: isTicker && cell ? "#f59e0b" : "#d4d4d8",
                            fontFamily: isTicker && cell ? "var(--font-mono)" : "inherit",
                            verticalAlign: "top",
                          }}
                        >
                          {isEurFxRate ? "—" : formatCellDisplay(header, cell)}
                          {instrument?.name && (
                            <div style={{ fontFamily: "inherit", fontSize: 11, color: "#52525b", marginTop: 3, fontStyle: "italic", letterSpacing: 0.2 }}>
                              {instrument.name}
                            </div>
                          )}
                        </td>
                      );
                      if (ci === dateColIndex) {
                        return [
                          tdEl,
                          <DeadlineCell
                            key="deadline-cell"
                            row={row}
                            headers={parsed.headers}
                            dateStr={cell}
                            isTob={isToB}
                            tobPaidKeys={tobPaidKeys}
                            toggleTobPaid={toggleTobPaid}
                          />,
                        ];
                      }
                      return [tdEl];
                    })}
                    <InstrumentTypeCell
                      ticker={ticker}
                      instrumentInfo={instrumentInfo}
                      updateManualType={updateManualType}
                    />
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
