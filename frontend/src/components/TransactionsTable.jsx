import { useMemo } from "react";
import { isTobType, isDividendType } from "../logic/transactionFilters.js";
import { formatCellDisplay } from "../utils/formatters.js";

const FILTER_BUTTONS = [
  { id: "all", label: "All" },
  { id: "tob", label: "TOB" },
  { id: "dividends", label: "Dividends" },
];

export default function TransactionsTable({ parsed, typeColIndex, viewFilter, setViewFilter }) {
  const { displayEntries, filterNote } = useMemo(() => {
    if (!parsed) return { displayEntries: [], filterNote: null };
    const withIdx = parsed.rows.map((row, sourceIndex) => ({ row, sourceIndex }));
    if (typeColIndex === -1) {
      return { displayEntries: withIdx, filterNote: "No Type column found — filters are disabled." };
    }
    if (viewFilter === "all") return { displayEntries: withIdx, filterNote: null };
    const pred =
      viewFilter === "tob"
        ? (e) => isTobType(e.row[typeColIndex])
        : (e) => isDividendType(e.row[typeColIndex]);
    return { displayEntries: withIdx.filter(pred), filterNote: null };
  }, [parsed, typeColIndex, viewFilter]);

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
              {parsed.headers.map((h, hi) => (
                <th
                  key={`${hi}-${h}`}
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
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayEntries.length === 0 ? (
              <tr>
                <td
                  colSpan={parsed.headers.length}
                  style={{ padding: "28px 16px", textAlign: "center", color: "#6a6450", fontSize: 13 }}
                >
                  {viewFilter === "all" ? "No data rows in this file." : "No rows match this filter."}
                </td>
              </tr>
            ) : (
              displayEntries.map(({ row, sourceIndex }, ri) => (
                <tr key={`${sourceIndex}-${ri}`} style={{ borderTop: "1px solid #1a1810" }}>
                  {row.map((cell, ci) => {
                    const header = parsed.headers[ci] ?? "";
                    const isTicker = header.toLowerCase() === "ticker";
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
                        {formatCellDisplay(header, cell)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
