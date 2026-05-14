import { useMemo, useState, useEffect } from "react";
import { isTobType, isDividendType } from "../logic/transactionFilters.js";
import { formatCellDisplay } from "../utils/formatters.js";
import { classifyInstrument } from "../logic/tobClassification.js";

const FILTER_BUTTONS = [
  { id: "all", label: "All" },
  { id: "tob", label: "TOB" },
  { id: "dividends", label: "Dividends" },
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

export default function TransactionsTable({ parsed, typeColIndex, viewFilter, setViewFilter, instrumentNames = new Map() }) {
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
    const pred =
      viewFilter === "tob"
        ? (e) => isTobType(e.row[typeColIndex])
        : (e) => isDividendType(e.row[typeColIndex]);
    return { displayEntries: withIdx.filter(pred), filterNote: null };
  }, [parsed, typeColIndex, viewFilter, activeSortColIndex, activeSortDir, activeSortId]);

  if (!parsed) return null;

  return (
    <div
      style={{
        border: "1px solid #2a2820",
        borderRadius: 4,
        background: "#111109",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid #1e1c14",
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
            color: "#5a5540",
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
                  border: active ? "1px solid #c4a84a" : "1px solid #2a2820",
                  borderRadius: 3,
                  background: active ? "#1a1a0a" : "transparent",
                  color: active ? "#c4a84a" : "#6a6450",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.45 : 1,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontFamily: "Georgia, serif",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {filterNote && (
        <div style={{ padding: "10px 18px", fontSize: 12, color: "#9a7040", borderBottom: "1px solid #1e1c14" }}>
          {filterNote}
        </div>
      )}
      {!filterNote && viewFilter !== "all" && (
        <div style={{ padding: "10px 18px", fontSize: 12, color: "#6a6450", borderBottom: "1px solid #1e1c14" }}>
          Showing {displayEntries.length} of {parsed.rows.length} rows
          {viewFilter === "tob" ? " (buy and sell trades only)" : " (dividends only)"}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: "min(70vh, 640px)", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "#14140f", zIndex: 1 }}>
              {parsed.headers.map((h, hi) => {
                if (hi === currencyColIndex) return null;
                const sortId = sortColIds[hi];
                const isActive = hi === activeSortColIndex;
                return (
                  <th
                    key={`${hi}-${h}`}
                    onClick={sortId ? () => handleHeaderClick(hi) : undefined}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      fontWeight: 400,
                      color: isActive ? "#c4a84a" : sortId ? "#a89860" : "#8a8060",
                      fontSize: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      borderBottom: "1px solid #2a2820",
                      whiteSpace: "nowrap",
                      cursor: sortId ? "pointer" : "default",
                      userSelect: "none",
                    }}
                  >
                    {h}
                    {sortId && (
                      <span
                        style={{
                          marginLeft: 5,
                          opacity: isActive ? 1 : 0.35,
                          fontSize: 10,
                        }}
                      >
                        {isActive ? (activeSortDir === "desc" ? "↓" : "↑") : "↕"}
                      </span>
                    )}
                  </th>
                );
              })}
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontWeight: 400,
                  color: "#8a8060",
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  borderBottom: "1px solid #2a2820",
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
                  colSpan={parsed.headers.length - (currencyColIndex >= 0 ? 1 : 0) + 1}
                  style={{ padding: "28px 16px", textAlign: "center", color: "#6a6450", fontSize: 13 }}
                >
                  {viewFilter === "all" ? "No data rows in this file." : "No rows match this filter."}
                </td>
              </tr>
            ) : (
              displayEntries.map(({ row, sourceIndex }, ri) => {
                const ticker = tickerColIndex >= 0 ? (row[tickerColIndex] ?? "").trim() : "";
                const instrumentInfo = ticker ? instrumentNames.get(ticker) : null;
                const classification = instrumentInfo ? classifyInstrument(instrumentInfo) : null;
                const instrumentTypeLabel =
                  classification && !classification.unknown
                    ? classification.key === "120,2" ? "Share" : "Fund"
                    : null;

                return (
                  <tr key={`${sourceIndex}-${ri}`} style={{ borderTop: "1px solid #1a1810" }}>
                    {row.map((cell, ci) => {
                      if (ci === currencyColIndex) return null;
                      const header = parsed.headers[ci] ?? "";
                      const isTicker = header.toLowerCase() === "ticker";
                      const instrument = isTicker && cell ? instrumentNames.get(cell) : null;
                      const isEurFxRate =
                        ci === fxRateColIndex &&
                        currencyColIndex !== -1 &&
                        (row[currencyColIndex] ?? "").trim().toUpperCase() === "EUR";
                      return (
                        <td
                          key={ci}
                          style={{
                            padding: "10px 12px",
                            color: isTicker && cell ? "#c4a84a" : "#9a9070",
                            fontFamily: isTicker && cell ? "ui-monospace, monospace" : "inherit",
                            verticalAlign: "top",
                          }}
                        >
                          {isEurFxRate ? "—" : formatCellDisplay(header, cell)}
                          {instrument?.name && (
                            <div
                              style={{
                                fontFamily: "Georgia, serif",
                                fontSize: 11,
                                color: "#6a6050",
                                marginTop: 3,
                                fontStyle: "italic",
                                letterSpacing: 0.2,
                              }}
                            >
                              {instrument.name}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        padding: "10px 12px",
                        color: instrumentTypeLabel === "Fund" ? "#7a9870" : instrumentTypeLabel === "Share" ? "#7a8898" : "#3a3830",
                        fontSize: 11,
                        letterSpacing: 0.5,
                        verticalAlign: "top",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {instrumentTypeLabel ?? "—"}
                    </td>
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
