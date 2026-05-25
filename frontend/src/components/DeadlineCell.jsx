import { useEffect, useRef, useState } from "react";
import {
  getTobDeadline,
  getDaysUntilDeadline,
  deadlineStyle,
  makeTransactionKey,
  formatDeadline,
} from "../logic/tobDeadline.js";

export default function DeadlineCell({ row, headers, dateStr, isTob, tobPaidKeys, toggleTobPaid }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef(null);

  const key = makeTransactionKey(row, headers);
  const isPaid = tobPaidKeys?.has(key) ?? false;
  const deadline = isTob ? getTobDeadline(dateStr) : null;
  const days = deadline ? getDaysUntilDeadline(deadline) : null;
  const ds = deadline ? deadlineStyle(deadline, isPaid) : null;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  if (!deadline) {
    return (
      <td style={{ padding: "10px 12px", color: "#3f3f46", fontSize: 12, verticalAlign: "top", whiteSpace: "nowrap" }}>
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
      <div style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", color: ds?.text ?? "#71717a" }}>
        {formatDeadline(deadline)}
      </div>
      <div style={{ fontSize: 10, marginTop: 2, color: ds?.text ?? "#71717a", opacity: 0.8 }}>
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
            background: "rgba(24,24,27,0.97)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
            overflow: "hidden",
            minWidth: 220,
          }}
        >
          <div style={{
            padding: "10px 14px",
            fontSize: 11,
            color: "#52525b",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            letterSpacing: 0.3,
          }}>
            TOB deadline · {formatDeadline(deadline)}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTobPaid?.(key);
              setMenuOpen(false);
            }}
            style={{
              display: "block", width: "100%",
              padding: "13px 16px", background: "transparent", border: "none",
              textAlign: "left", cursor: "pointer", fontSize: 13,
              color: isPaid ? "#f97316" : "#22c55e",
              fontWeight: 500,
            }}
          >
            {isPaid ? "✕  Mark as unpaid" : "✓  Mark TOB as paid"}
          </button>
          {!isPaid && days !== null && (
            <div style={{ padding: "0 16px 12px", fontSize: 11, color: days < 0 ? "#ef4444" : "#71717a" }}>
              {days < 0
                ? `Deadline passed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`
                : days === 0 ? "Due today." : `${days} day${days === 1 ? "" : "s"} remaining.`}
            </div>
          )}
        </div>
      )}
    </td>
  );
}
