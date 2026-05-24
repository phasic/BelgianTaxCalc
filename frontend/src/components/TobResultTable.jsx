import { useEffect, useState } from "react";
import { formatCellDisplay } from "../utils/formatters.js";
import { getTobDeadline, getDaysUntilDeadline, deadlineStyle, makeTransactionKey, formatDeadline } from "../logic/tobDeadline.js";
import DeadlineCell from "./DeadlineCell.jsx";
import InstrumentTypeCell from "./InstrumentTypeCell.jsx";

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

// Only these CSV columns are relevant for the tax declaration.
// Everything else (quantity, price per share, FX rate, …) is hidden.
const RELEVANT_COL_NAMES = new Set(["date", "ticker", "type", "total amount"]);

function formatDateShort(dateStr) {
  if (!dateStr) return "—";
  if (dateStr.includes("T")) {
    try {
      const d = new Date(dateStr);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      }
    } catch { /* fall through */ }
  }
  return dateStr.split(",")[0]; // "14 Aug 2024, 17:25" → "14 Aug 2024"
}

function MobileCard({ sourceIndex, row, headers, ticker, classification, eurAmount, tobAmount, capped, instrumentNames, dateColIndex, tobPaidKeys, toggleTobPaid }) {
  const instrument = ticker ? instrumentNames.get(ticker) : null;
  const key = makeTransactionKey(row, headers);
  const isPaid = tobPaidKeys?.has(key) ?? false;

  const dateCell = dateColIndex >= 0 ? row[dateColIndex] : "";
  const typeColIdx = headers.findIndex((h) => h.trim().toLowerCase() === "type");
  const typeCell = typeColIdx >= 0 ? row[typeColIdx] : "";

  const deadline = getTobDeadline(dateCell);
  const days = deadline ? getDaysUntilDeadline(deadline) : null;
  const ds = deadline ? deadlineStyle(deadline, isPaid) : null;

  let daysLabel = "";
  if (isPaid) daysLabel = "✓ paid";
  else if (days !== null) {
    if (days < 0) daysLabel = `${Math.abs(days)}d overdue`;
    else if (days === 0) daysLabel = "today!";
    else daysLabel = `${days}d left`;
  }

  const shortDate = formatDateShort(dateCell);

  return (
    <div style={{
      padding: "14px 16px",
      borderTop: "1px solid #282618",
      background: isPaid ? "#0c130c" : "transparent",
    }}>
      {/* Ticker + Type + TOB amount */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            {ticker && (
              <span style={{ fontFamily: "ui-monospace, monospace", color: "#c4a84a", fontSize: 14 }}>{ticker}</span>
            )}
            {typeCell && (
              <span style={{ fontSize: 10, color: "#8a8268", letterSpacing: 1, textTransform: "uppercase" }}>{typeCell}</span>
            )}
          </div>
          {instrument?.name && (
            <div style={{ fontSize: 11, color: "#6a6050", fontStyle: "italic", marginTop: 2 }}>{instrument.name}</div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {classification.unresolved ? (
            <span style={{ fontSize: 12, color: "#c04848" }}>unresolved</span>
          ) : tobAmount !== null ? (
            <>
              <div style={{ fontFamily: "ui-monospace, monospace", color: "#e8d890", fontSize: 15 }}>
                {EUR.format(tobAmount)}
                {capped && <span style={{ fontSize: 10, color: "#9a7040", marginLeft: 3 }}>(max)</span>}
              </div>
              {eurAmount !== null && (
                <div style={{ fontSize: 10, color: "#7a7460" }}>on {EUR.format(eurAmount)}</div>
              )}
            </>
          ) : <span style={{ color: "#7a7460" }}>—</span>}
        </div>
      </div>

      {/* Date + Classification + Deadline badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <div style={{ fontSize: 11, color: "#6a6450" }}>
          {shortDate}
          {!classification.unresolved && (
            <span style={{ marginLeft: 6, fontFamily: "ui-monospace, monospace", color: "#7a7050" }}>
              · {classification.art}
            </span>
          )}
        </div>

        {deadline && (
          <button
            type="button"
            onClick={() => toggleTobPaid?.(key)}
            title={isPaid ? "Tap to mark as unpaid" : "Tap to mark as paid"}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              padding: "5px 10px",
              background: ds?.bg ?? "#111109",
              border: "1px solid " + (isPaid ? "#2a5228" : (days !== null && days < 0 ? "#6a2020" : "#2e2c1e")),
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
              minWidth: 96,
            }}
          >
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: ds?.text ?? "#7a7460" }}>
              {formatDeadline(deadline)}
            </span>
            <span style={{ fontSize: 10, color: ds?.text ?? "#7a7460", opacity: 0.85 }}>{daysLabel}</span>
          </button>
        )}
      </div>

      {classification.unresolved && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#7a5050", fontStyle: "italic" }}>
          {classification.basis} — resolve in Instruments tab
        </div>
      )}
    </div>
  );
}

export default function TobResultTable({ headers, lineItems, instrumentNames = new Map(), dateColIndex = -1, tobPaidKeys, toggleTobPaid, updateManualType }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 680);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 679px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Pre-compute which column indices to render (desktop table only)
  const visibleCols = headers.reduce((acc, h, i) => {
    if (RELEVANT_COL_NAMES.has(h.trim().toLowerCase())) acc.push(i);
    return acc;
  }, []);

  if (isMobile) {
    return (
      <div style={{
        border: "1px solid #3d3a28",
        borderRadius: 4,
        background: "#0d0d0b",
        overflowY: "auto",
        maxHeight: "min(60vh, 520px)",
        marginTop: 12,
      }}>
        {lineItems.map(({ sourceIndex, row, ticker, classification, eurAmount, tobAmount, capped }) => (
          <MobileCard
            key={sourceIndex}
            sourceIndex={sourceIndex}
            row={row}
            headers={headers}
            ticker={ticker}
            classification={classification}
            eurAmount={eurAmount}
            tobAmount={tobAmount}
            capped={capped}
            instrumentNames={instrumentNames}
            dateColIndex={dateColIndex}
            tobPaidKeys={tobPaidKeys}
            toggleTobPaid={toggleTobPaid}
          />
        ))}
      </div>
    );
  }

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
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
        <thead>
          <tr style={{ position: "sticky", top: 0, background: "#14140f", zIndex: 1 }}>
            {visibleCols.flatMap((hi) => {
              const h = headers[hi];
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
            const instrumentInfo = ticker ? instrumentNames.get(ticker) : null;
            return (
              <tr key={sourceIndex} style={{ borderTop: "1px solid #282618" }}>
                {visibleCols.flatMap((ci) => {
                  const cell = row[ci];
                  const header = headers[ci] ?? "";
                  const isTicker = header.trim().toLowerCase() === "ticker";
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

                <InstrumentTypeCell
                  ticker={ticker}
                  instrumentInfo={instrumentInfo}
                  updateManualType={updateManualType}
                />

                <td style={{ padding: "10px 12px", whiteSpace: "nowrap", verticalAlign: "top", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                  {classification.unresolved ? (
                    <span style={{ color: "#c04848" }}>
                      ! unresolved
                      <div style={{ fontSize: 10, color: "#9a5040", marginTop: 2, fontFamily: "Georgia, serif", fontStyle: "italic", maxWidth: 160, whiteSpace: "normal" }}>
                        {classification.basis}
                      </div>
                    </span>
                  ) : (
                    <span style={{ color: "#c4a84a" }}>
                      {classification.art}
                      {classification.basis && (
                        <div style={{ fontSize: 10, color: "#7a6a40", marginTop: 2, fontFamily: "Georgia, serif", fontStyle: "italic", maxWidth: 180, whiteSpace: "normal" }}>
                          {classification.basis}
                        </div>
                      )}
                    </span>
                  )}
                </td>

                <td style={{ padding: "10px 12px", color: classification.unresolved ? "#4a3a30" : "#c0b890", whiteSpace: "nowrap", verticalAlign: "top", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                  {classification.unresolved ? "—" : PCT(classification.rate)}
                </td>

                <td style={{ padding: "10px 12px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>
                  {classification.unresolved ? (
                    <span style={{ color: "#c04848", fontSize: 11 }}>excluded</span>
                  ) : tobAmount !== null ? (
                    <span style={{ color: "#e8d890" }}>
                      {EUR.format(tobAmount)}
                      {capped && (
                        <span style={{ fontSize: 10, color: "#9a7040", marginLeft: 4 }}>(max)</span>
                      )}
                    </span>
                  ) : (
                    <span style={{ color: "#7a7460" }}>—</span>
                  )}
                  {!classification.unresolved && eurAmount !== null && (
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
