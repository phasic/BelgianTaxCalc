import { useEffect, useRef, useState } from "react";
import {
  getTobDeadline,
  getDaysUntilDeadline,
  deadlineStyle,
  makeTransactionKey,
  formatDeadline,
} from "../logic/tobDeadline.js";

/**
 * Renders a <td> with the TOB payment deadline for the transaction.
 *
 * Props:
 *   row          – the raw data row (array of cell values)
 *   headers      – the header array for the table
 *   dateStr      – the date string for this row (e.g. "2025-05-06")
 *   isTob        – true if this is a buy/sell transaction subject to TOB
 *   tobPaidKeys  – Set<string> of paid transaction keys
 *   toggleTobPaid – (key: string) => void
 */
export default function DeadlineCell({ row, headers, dateStr, isTob, tobPaidKeys, toggleTobPaid }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef(null);

  const key = makeTransactionKey(row, headers);
  const isPaid = tobPaidKeys?.has(key) ?? false;
  const deadline = isTob ? getTobDeadline(dateStr) : null;
  const days = deadline ? getDaysUntilDeadline(deadline) : null;
  const ds = deadline ? deadlineStyle(deadline, isPaid) : null;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Non-TOB row: just a dash
  if (!deadline) {
    return (
      <td style={{ padding: "10px 12px", color: "#4a4535", fontSize: 12, verticalAlign: "top", whiteSpace: "nowrap" }}>
        —
      </td>
    );
  }

  let daysLabel;
  if (isPaid) {
    daysLabel = "✓ paid";
  } else if (days < 0) {
    daysLabel = `${Math.abs(days)}d overdue`;
  } else if (days === 0) {
    daysLabel = "due today!";
  } else {
    daysLabel = `${days}d left`;
  }

  const handleClick = (e) => {
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen((v) => !v);
  };

  return (
    <td
      onClick={handleClick}
      title="Click to mark TOB paid / unpaid"
      style={{
        padding: "8px 12px",
        cursor: "pointer",
        background: ds?.bg ?? "transparent",
        fontSize: 12,
        verticalAlign: "top",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      <div style={{ fontFamily: "ui-monospace, monospace", color: ds?.text ?? "#7a7460" }}>
        {formatDeadline(deadline)}
      </div>
      <div style={{ fontSize: 10, marginTop: 2, color: ds?.text ?? "#7a7460", opacity: 0.8 }}>
        {daysLabel}
      </div>

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
            minWidth: 220,
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
            TOB payment — {formatDeadline(deadline)}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTobPaid?.(key);
              setMenuOpen(false);
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "13px 16px",
              background: "transparent",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "Georgia, serif",
              color: isPaid ? "#ff8040" : "#72c472",
            }}
          >
            {isPaid ? "✕  Mark as unpaid" : "✓  Mark TOB as paid"}
          </button>
          {!isPaid && days !== null && days < 0 && (
            <div style={{ padding: "0 16px 12px", fontSize: 11, color: "#ff5555" }}>
              Deadline passed {Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} ago.
            </div>
          )}
          {!isPaid && days !== null && days >= 0 && (
            <div style={{ padding: "0 16px 12px", fontSize: 11, color: "#8a8268" }}>
              {days === 0 ? "Due today." : `${days} day${days === 1 ? "" : "s"} remaining.`}
            </div>
          )}
        </div>
      )}
    </td>
  );
}
