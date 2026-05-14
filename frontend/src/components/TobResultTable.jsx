import { formatCellDisplay } from "../utils/formatters.js";
import DeadlineCell from "./DeadlineCell.jsx";

const thStyle = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 400,
  color: "#a89870",
  fontSize: 10,
  letterSpacing: 1,
  textTransform: "uppercase",
  borderBottom: "1px solid #3d3a28",
  whiteSpace: "nowrap",
};

const EUR = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PCT = (r) => `${(r * 100).toFixed(2)}%`;

export default function TobResultTable({ headers, lineItems, instrumentNames = new Map(), dateColIndex = -1, tobPaidKeys, toggleTobPaid }) {
  const currencyColIndex = headers.findIndex((h) => h.trim().toLowerCase() === "currency");

  return (
    <div
      style={{
        overflowX: "auto",
        maxHeight: "min(60vh, 520px)",
        overflowY: "auto",
        marginTop: 12,
        border: "1px solid #3d3a28",
        borderRadius: 4,
        background: "#0d0d0b",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
        <thead>
          <tr style={{ position: "sticky", top: 0, background: "#14140f", zIndex: 1 }}>
            {headers.flatMap((h, hi) => {
              if (hi === currencyColIndex) return [];
              const thEl = <th key={`${hi}-${h}`} style={thStyle}>{h}</th>;
              if (hi === dateColIndex) {
                return [thEl, <th key="deadline-th" style={{ ...thStyle, color: "#8a7a50" }}>TOB Deadline</th>];
              }
              return [thEl];
            })}
            <th style={{ ...thStyle, color: "#9a8050" }}>Instrument</th>
            <th style={{ ...thStyle, color: "#9a8050" }}>Art.</th>
            <th style={{ ...thStyle, color: "#9a8050" }}>Rate</th>
            <th style={{ ...thStyle, color: "#9a8050", textAlign: "right" }}>TOB (EUR)</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map(({ sourceIndex, row, ticker, classification, eurAmount, tobAmount, capped }) => {
            const instrument = ticker ? instrumentNames.get(ticker) : null;
            const instrumentTypeLabel =
              classification && !classification.unknown
                ? classification.key === "120,2" ? "Share" : "Fund"
                : null;
            return (
              <tr key={sourceIndex} style={{ borderTop: "1px solid #282618" }}>
                {row.flatMap((cell, ci) => {
                  if (ci === currencyColIndex) return [];
                  const header = headers[ci] ?? "";
                  const isTicker = header.toLowerCase() === "ticker";
                  const tdEl = (
                    <td
                      key={ci}
                      style={{
                        padding: "10px 12px",
                        color: isTicker && cell ? "#c4a84a" : "#c0b890",
                        fontFamily: isTicker && cell ? "ui-monospace, monospace" : "inherit",
                        verticalAlign: "top",
                      }}
                    >
                      {formatCellDisplay(header, cell)}
                      {isTicker && instrument?.name && (
                        <div style={{ fontFamily: "Georgia, serif", fontSize: 11, color: "#6a6050", marginTop: 3, fontStyle: "italic" }}>
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

                {/* Instrument type */}
                <td style={{ padding: "10px 12px", color: instrumentTypeLabel === "Fund" ? "#7a9870" : instrumentTypeLabel === "Share" ? "#7a8898" : "#3a3830", fontSize: 11, letterSpacing: 0.5, verticalAlign: "top", whiteSpace: "nowrap" }}>
                  {instrumentTypeLabel ?? "—"}
                </td>

                {/* Art. */}
                <td style={{ padding: "10px 12px", color: "#c4a84a", whiteSpace: "nowrap", verticalAlign: "top", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                  {classification.art}
                  {classification.unknown && (
                    <div style={{ fontSize: 10, color: "#9a7040", marginTop: 2 }}>assumed</div>
                  )}
                </td>

                {/* Rate */}
                <td style={{ padding: "10px 12px", color: "#c0b890", whiteSpace: "nowrap", verticalAlign: "top", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                  {PCT(classification.rate)}
                </td>

                {/* TOB amount */}
                <td style={{ padding: "10px 12px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>
                  {tobAmount !== null ? (
                    <span style={{ color: "#e8d890" }}>
                      {EUR.format(tobAmount)}
                      {capped && (
                        <span style={{ fontSize: 10, color: "#9a7040", marginLeft: 4 }}>(max)</span>
                      )}
                    </span>
                  ) : (
                    <span style={{ color: "#7a7460" }}>—</span>
                  )}
                  {eurAmount !== null && (
                    <div style={{ fontSize: 10, color: "#7a7460", marginTop: 2 }}>
                      on {EUR.format(eurAmount)}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
