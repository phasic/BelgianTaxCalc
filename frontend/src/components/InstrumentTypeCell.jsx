import { useEffect, useRef, useState } from "react";
import { classifyInstrument } from "../logic/tobClassification.js";

const OPTIONS = [
  {
    value: "stock",
    label: "Stock / distributing ETF",
    sub: "art. 120, 1° — 0,35% · cap €1 600",
    color: "#7a8898",
  },
  {
    value: "fund_dist",
    label: "Bond / distributing fund",
    sub: "art. 120, 1° — 0,12% · cap €1 300",
    color: "#7a9870",
  },
  {
    value: "fund_acc",
    label: "Accumulating fund / ETF",
    sub: "art. 120, 1° — 1,32% · cap €4 000",
    color: "#9a7870",
  },
];

/**
 * Renders a <td> for the "Instrument" column.
 *
 * Behaviour:
 *  - OpenFIGI resolved → shows "Share" / "Fund" without interaction.
 *  - Unresolved (OpenFIGI failed, no manual) → shows "⚠ set type" call-to-action.
 *  - Manually set (OpenFIGI fallback) → shows "⚠ Share" / "⚠ Fund" + click to change/clear.
 *
 * The ⚠ badge signals the classification came from a manual override, not from OpenFIGI.
 * The app silently retries OpenFIGI in the background for manually-typed tickers; once
 * resolved the manual flag is cleared and the badge disappears automatically.
 *
 * Props:
 *   ticker           – ticker symbol (string)
 *   instrumentInfo   – from instrumentNames Map (may be null)
 *   updateManualType – (ticker, "stock"|"fund_dist"|"fund_acc"|null) => void
 *                      only required when manual interaction is desired
 */
export default function InstrumentTypeCell({ ticker, instrumentInfo, updateManualType }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef(null);

  const classification = instrumentInfo ? classifyInstrument(instrumentInfo) : null;
  const isUnresolved = !classification || classification.unresolved;
  const isManual = Boolean(classification?.manual);

  // Only show the type-picker when OpenFIGI couldn't classify (includes manual overrides).
  // If OpenFIGI fully resolved the type, no manual interaction is offered.
  const isInteractive = Boolean((isUnresolved || isManual) && ticker && updateManualType);

  const typeLabel =
    !isUnresolved
      ? classification.key === "120,1_mid" ? "Share/ETF"
        : classification.key === "120,1_low" ? "Bond/Fund"
        : "Acc Fund"
      : null;

  const typeColor =
    classification?.key === "120,1_mid" ? "#7a8898"
    : classification?.key === "120,1_low" ? "#7a9870"
    : classification?.key === "120,1_high" || classification?.key === "120,3" ? "#9a7870"
    : "#4a4535";

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleClick = (e) => {
    if (!isInteractive) return;
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen((v) => !v);
  };

  const handleSelect = (value) => {
    updateManualType(ticker, value);
    setMenuOpen(false);
  };

  const handleClear = () => {
    updateManualType(ticker, null);
    setMenuOpen(false);
  };

  return (
    <td
      onClick={handleClick}
      title={
        isInteractive
          ? isUnresolved
            ? "OpenFIGI could not classify this ticker — click to set type manually"
            : "Manually set — click to change or clear (OpenFIGI will re-check automatically)"
          : undefined
      }
      style={{
        padding: "10px 12px",
        fontSize: 11,
        letterSpacing: 0.5,
        verticalAlign: "top",
        whiteSpace: "nowrap",
        cursor: isInteractive ? "pointer" : "default",
        userSelect: "none",
        position: "relative",
      }}
    >
      {isUnresolved ? (
        /* ── Unresolved: show call-to-action ── */
        isInteractive ? (
          <span
            style={{
              color: "#7a5a30",
              borderBottom: "1px dashed #5a4520",
              paddingBottom: 1,
            }}
          >
            {/* warning triangle with ! */}
            <span style={{ marginRight: 4, fontSize: 12 }}>⚠</span>
            set type
          </span>
        ) : (
          <span style={{ color: "#3a3830" }}>—</span>
        )
      ) : (
        /* ── Classified: show type label, with ⚠ badge if manual ── */
        <span style={{ color: isManual ? "#c4a84a" : typeColor }}>
          {isManual && (
            <span
              style={{
                marginRight: 5,
                fontSize: 11,
                color: "#c4943a",
                fontStyle: "normal",
              }}
              title="Manually set — OpenFIGI will override this automatically once resolved"
            >
              ⚠
            </span>
          )}
          {typeLabel}
        </span>
      )}

      {/* ── Type picker menu ── */}
      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuPos.y + 10,
            left: menuPos.x,
            zIndex: 9999,
            background: "#1a1a10",
            border: "1px solid #3d3a28",
            borderRadius: 4,
            boxShadow: "0 8px 32px rgba(0,0,0,0.75)",
            overflow: "hidden",
            minWidth: 280,
          }}
        >
          <div
            style={{
              padding: "8px 14px",
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: "#7a7460",
              borderBottom: "1px solid #2e2c1e",
            }}
          >
            {ticker} — set instrument type manually
          </div>
          <div
            style={{
              padding: "8px 14px 4px",
              fontSize: 10,
              color: "#6a5a30",
              lineHeight: 1.5,
              borderBottom: "1px solid #1e1c14",
            }}
          >
            ⚠ This is a temporary override. The app retries OpenFIGI automatically
            and will replace this once it can resolve the ticker.
          </div>

          {OPTIONS.map((opt) => {
            const active = instrumentInfo?.manualType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSelect(opt.value); }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "11px 16px",
                  background: active ? "#1e1e14" : "transparent",
                  border: "none",
                  borderBottom: "1px solid #1e1c14",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "Georgia, serif",
                }}
              >
                <div style={{ fontSize: 13, color: active ? "#c4a84a" : opt.color }}>
                  {active && "✓ "}{opt.label}
                </div>
                <div style={{ fontSize: 10, color: "#6a6450", marginTop: 2, letterSpacing: 0.3 }}>
                  {opt.sub}
                </div>
              </button>
            );
          })}

          {isManual && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                fontSize: 11,
                color: "#7a7460",
                fontFamily: "Georgia, serif",
                letterSpacing: 0.5,
              }}
            >
              ✕  Clear manual override (revert to OpenFIGI)
            </button>
          )}
        </div>
      )}
    </td>
  );
}
