import { formatCellDisplay } from "../utils/formatters.js";

const thStyle = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 400,
  color: "#8a8060",
  fontSize: 10,
  letterSpacing: 1,
  textTransform: "uppercase",
  borderBottom: "1px solid #2a2820",
  whiteSpace: "nowrap",
};

export default function TobScopeTable({
  headers,
  entries,
  showCheckbox,
  selectedIndices,
  onToggle,
  emptyLabel,
}) {
  const colSpan = headers.length + (showCheckbox ? 1 : 0);

  return (
    <div
      style={{
        overflowX: "auto",
        maxHeight: "min(50vh, 420px)",
        overflowY: "auto",
        marginTop: 12,
        border: "1px solid #2a2820",
        borderRadius: 4,
        background: "#0d0d0b",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
        <thead>
          <tr style={{ position: "sticky", top: 0, background: "#14140f", zIndex: 1 }}>
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
            {headers.map((h, hi) => (
              <th key={`${hi}-${h}`} style={thStyle}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                style={{ padding: "24px 16px", textAlign: "center", color: "#6a6450", fontSize: 13 }}
              >
                {emptyLabel}
              </td>
            </tr>
          ) : (
            entries.map(({ sourceIndex, row }) => (
              <tr key={sourceIndex} style={{ borderTop: "1px solid #1a1810" }}>
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
                {row.map((cell, ci) => {
                  const header = headers[ci] ?? "";
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
  );
}
