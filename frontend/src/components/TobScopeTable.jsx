import { formatCellDisplay } from "../utils/formatters.js";
import { classifyInstrument } from "../logic/tobClassification.js";
import DeadlineCell from "./DeadlineCell.jsx";

const thStyle = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 400,
  color: "#a1a1aa",
  fontSize: 10,
  letterSpacing: 1,
  textTransform: "uppercase",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
  whiteSpace: "nowrap",
};

export default function TobScopeTable({
  headers,
  entries,
  showCheckbox,
  selectedIndices,
  onToggle,
  emptyLabel,
  instrumentNames = new Map(),
  dateColIndex = -1,
  tobPaidKeys,
  toggleTobPaid,
}) {
  const currencyColIndex = headers.findIndex((h) => h.trim().toLowerCase() === "currency");
  const tickerColIndex = headers.findIndex((h) => h.trim().toLowerCase() === "ticker");
  // +1 for Instrument, +1 for Deadline
  const visibleColCount = headers.length - (currencyColIndex >= 0 ? 1 : 0) + 2;
  const colSpan = visibleColCount + (showCheckbox ? 1 : 0);

  return (
    <div
      style={{
        overflowX: "auto",
        maxHeight: "min(50vh, 420px)",
        overflowY: "auto",
        marginTop: 12,
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 4,
        background: "#18181b",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
        <thead>
          <tr style={{ position: "sticky", top: 0, background: "#1c1c20", zIndex: 1 }}>
            {showCheckbox && (
              <th
                style={{
                  ...thStyle,
                  width: 44,
                  textAlign: "center",
                  padding: "10px 8px",
                }}
              >
                Include
              </th>
            )}
            {headers.flatMap((h, hi) => {
              if (hi === currencyColIndex) return [];
              const thEl = <th key={`${hi}-${h}`} style={thStyle}>{h}</th>;
              if (hi === dateColIndex) {
                return [
                  thEl,
                  <th key="deadline-th" style={{ ...thStyle, color: "#8a7a50" }}>TOB Deadline</th>,
                ];
              }
              return [thEl];
            })}
            <th style={thStyle}>Instrument</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                style={{ padding: "24px 16px", textAlign: "center", color: "#71717a", fontSize: 13 }}
              >
                {emptyLabel}
              </td>
            </tr>
          ) : (
            entries.map(({ sourceIndex, row }) => {
              const ticker = tickerColIndex >= 0 ? (row[tickerColIndex] ?? "").trim() : "";
              const instrumentInfo = ticker ? instrumentNames.get(ticker) : null;
              const classification = instrumentInfo ? classifyInstrument(instrumentInfo) : null;
              const instrumentTypeLabel =
                classification && !classification.unknown
                  ? classification.key === "120,2" ? "Share" : "Fund"
                  : null;

              return (
                <tr key={sourceIndex} style={{ borderTop: "1px solid #1c1c20" }}>
                  {showCheckbox && (
                    <td style={{ textAlign: "center", verticalAlign: "middle", padding: "8px" }}>
                      <input
                        type="checkbox"
                        checked={selectedIndices.has(sourceIndex)}
                        onChange={() => onToggle(sourceIndex)}
                        aria-label={`Include row ${sourceIndex + 1} in TOB scope`}
                      />
                    </td>
                  )}
                  {row.flatMap((cell, ci) => {
                    if (ci === currencyColIndex) return [];
                    const header = headers[ci] ?? "";
                    const isTicker = header.toLowerCase() === "ticker";
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
                        {formatCellDisplay(header, cell)}
                      </td>
                    );
                    if (ci === dateColIndex) {
                      return [
                        tdEl,
                        <DeadlineCell
                          key="deadline-cell"
                          row={row}
                          headers={headers}
                          dateStr={cell}
                          isTob={true}
                          tobPaidKeys={tobPaidKeys}
                          toggleTobPaid={toggleTobPaid}
                        />,
                      ];
                    }
                    return [tdEl];
                  })}
                  <td
                    style={{
                      padding: "10px 12px",
                      color: instrumentTypeLabel === "Fund" ? "#7a9870" : instrumentTypeLabel === "Share" ? "#7a8898" : "#3f3f46",
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
  );
}
