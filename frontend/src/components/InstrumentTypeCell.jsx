import { useEffect, useRef, useState } from "react";
import { classifyInstrument } from "../logic/tobClassification.js";

const OPTIONS = [
  {
    value: "stock",
    label: "Stock / ETC",
    sub: "art. 120, 1° — 0,35% · cap €1 600",
    color: "#7a8898",
  },
  {
    value: "fund_dist",
    label: "Bond / ETN / distributing ETF",
    sub: "art. 120, 1° — 0,12% · cap €1 300",
    color: "#7a9870",
  },
  {
    value: "fund_acc",
    label: "Accumulating ETF/fund — NOT Belgian-registered",
    sub: "art. 120, 1° — 0,12% · cap €1 300",
    color: "#7a9870",
  },
  {
    value: "fund_acc_be",
    label: "Accumulating ETF/fund — Belgian-registered (FSMA)",
    sub: "art. 120, 1° — 1,32% · cap €4 000 · also applies if any compartment of the fund is on the FSMA list",
    color: "#f97316",
  },
];

export default function InstrumentTypeCell({ ticker, instrumentInfo, updateManualType }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef(null);

  const classification = instrumentInfo ? classifyInstrument(instrumentInfo) : null;
  const isUnresolved = !classification || classification.unresolved;
  const isManual = Boolean(classification?.manual);
  const isInteractive = Boolean((isUnresolved || isManual) && ticker && updateManualType);

  const typeLabel =
    !isUnresolved
      ? classification.key === "120,1_mid"  ? "Share/ETC"
        : classification.key === "120,1_high" ? "Acc (BE)"
        : classification.key === "120,3"      ? "Acc RE"
        : "Bond/ETF"
      : null;

  const typeColor =
    classification?.key === "120,1_mid"  ? "#7a8898"
    : classification?.key === "120,1_low"  ? "#7a9870"
    : classification?.key === "120,1_high" ? "#f97316"
    : classification?.key === "120,3"      ? "#f97316"
    : "#3f3f46";

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

  const handleSelect = (value) => { updateManualType(ticker, value); setMenuOpen(false); };
  const handleClear = () => { updateManualType(ticker, null); setMenuOpen(false); };

  return (
    <td
      onClick={handleClick}
      title={
        isInteractive
          ? isUnresolved
            ? "OpenFIGI could not classify this ticker — click to set type manually"
            : "Manually set — click to change or clear"
          : undefined
      }
      style={{
        padding: "10px 12px", fontSize: 11, letterSpacing: 0.3,
        verticalAlign: "top", whiteSpace: "nowrap",
        cursor: isInteractive ? "pointer" : "default",
        userSelect: "none", position: "relative",
      }}
    >
      {isUnresolved ? (
        isInteractive ? (
          <span style={{ color: "#71717a", borderBottom: "1px dashed rgba(255,255,255,0.15)", paddingBottom: 1 }}>
            <span style={{ marginRight: 4 }}>⚠</span>set type
          </span>
        ) : (
          <span style={{ color: "#3f3f46" }}>—</span>
        )
      ) : (
        <span style={{ color: isManual ? "#f59e0b" : typeColor }}>
          {isManual && <span style={{ marginRight: 4, color: "#f97316" }} title="Manually set">⚠</span>}
          {typeLabel}
        </span>
      )}

      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: menuPos.y + 10, left: menuPos.x,
            zIndex: 9999,
            background: "rgba(24,24,27,0.97)",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
            overflow: "hidden", minWidth: 300,
          }}
        >
          <div style={{
            padding: "10px 14px", fontSize: 11, color: "#52525b",
            borderBottom: "1px solid rgba(255,255,255,0.06)", letterSpacing: 0.3,
          }}>
            {ticker} — set instrument type manually
          </div>
          <div style={{
            padding: "8px 14px", fontSize: 11, color: "#71717a",
            lineHeight: 1.5, borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            ⚠ Temporary override — OpenFIGI will replace this once resolved.
          </div>

          {OPTIONS.map((opt) => {
            const active = instrumentInfo?.manualType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSelect(opt.value); }}
                style={{
                  display: "block", width: "100%", padding: "11px 16px",
                  background: active ? "rgba(245,158,11,0.08)" : "transparent",
                  border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  textAlign: "left", cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 13, color: active ? "#f59e0b" : opt.color, fontWeight: active ? 500 : 400 }}>
                  {active && "✓ "}{opt.label}
                </div>
                <div style={{ fontSize: 10, color: "#52525b", marginTop: 2 }}>{opt.sub}</div>
              </button>
            );
          })}

          {isManual && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              style={{
                display: "block", width: "100%", padding: "10px 16px",
                background: "transparent", border: "none",
                textAlign: "left", cursor: "pointer",
                fontSize: 11, color: "#71717a",
              }}
            >
              ✕  Clear manual override
            </button>
          )}
        </div>
      )}
    </td>
  );
}
