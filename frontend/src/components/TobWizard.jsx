import { useCallback, useMemo, useState } from "react";
import { MONTH_NAMES } from "../utils/formatters.js";
import { collectTobRowsInScope, defaultTobMonthFromFile } from "../logic/tobCalculation.js";
import { isTobType } from "../logic/transactionFilters.js";
import TobScopeTable from "./TobScopeTable.jsx";

const inputStyle = {
  padding: "8px 12px",
  background: "#0d0d0b",
  border: "1px solid #2a2820",
  color: "#e8e4db",
  borderRadius: 3,
  fontFamily: "Georgia, serif",
};

function ScopeOption({ id, title, detail, active, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onClick(id)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        marginBottom: 8,
        border: active ? "1px solid #c4a84a" : "1px solid #2a2820",
        borderRadius: 4,
        background: active ? "#1a1a0a" : "#0d0d0b",
        color: active ? "#e8e4db" : "#9a9070",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ fontSize: 14, color: active ? "#c4a84a" : "#e8e4db", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#6a6450", lineHeight: 1.5 }}>{detail}</div>
    </button>
  );
}

export default function TobWizard({ parsed, typeColIndex, dateColIndex }) {
  const hasDates = dateColIndex >= 0;

  const defaultMonth = useMemo(
    () => defaultTobMonthFromFile(parsed, typeColIndex, dateColIndex),
    [parsed, typeColIndex, dateColIndex]
  );

  const [scope, setScope] = useState("month");
  const [year, setYear] = useState(defaultMonth.year);
  const [monthIndex, setMonthIndex] = useState(defaultMonth.monthIndex);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedIndices, setSelectedIndices] = useState(() => new Set());
  const [result, setResult] = useState(null);

  const onScopeChange = useCallback((next) => {
    setScope(next);
    setResult(null);
    if (next !== "individual") setSelectedIndices(new Set());
  }, []);

  const toggleRow = useCallback((sourceIndex) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(sourceIndex)) next.delete(sourceIndex);
      else next.add(sourceIndex);
      return next;
    });
  }, []);

  const candidateEntries = useMemo(() => {
    if (!parsed || typeColIndex < 0) return [];
    return parsed.rows
      .map((row, sourceIndex) => ({ row, sourceIndex }))
      .filter((e) => isTobType(e.row[typeColIndex]));
  }, [parsed, typeColIndex]);

  const scopedPreview = useMemo(() => {
    if (!parsed || typeColIndex < 0) return [];
    return collectTobRowsInScope(parsed, typeColIndex, dateColIndex, scope, {
      year,
      monthIndex,
      periodStart,
      periodEnd,
      selectedIndices,
    });
  }, [parsed, typeColIndex, dateColIndex, scope, year, monthIndex, periodStart, periodEnd, selectedIndices]);

  const runCalculation = useCallback(() => {
    if (!parsed || typeColIndex < 0) return;

    if ((scope === "month" || scope === "period") && !hasDates) {
      setResult({ error: "This file has no Date column — choose Individual transactions instead." });
      return;
    }
    if (scope === "period") {
      if (!periodStart || !periodEnd) {
        setResult({ error: "Pick both a start date and an end date for the period." });
        return;
      }
      if (new Date(periodStart) > new Date(periodEnd)) {
        setResult({ error: "Start date must be on or before end date." });
        return;
      }
    }
    if (scope === "individual" && selectedIndices.size === 0) {
      setResult({ error: "Select at least one buy or sell row (use the checkboxes)." });
      return;
    }

    const scoped = collectTobRowsInScope(parsed, typeColIndex, dateColIndex, scope, {
      year, monthIndex, periodStart, periodEnd, selectedIndices,
    });

    let scopeLabel = "";
    if (scope === "month") scopeLabel = `${MONTH_NAMES[monthIndex]} ${year}`;
    else if (scope === "period") scopeLabel = `${periodStart} → ${periodEnd}`;
    else scopeLabel = `${selectedIndices.size} selected transaction${selectedIndices.size === 1 ? "" : "s"}`;

    setResult({ error: null, scopeLabel, count: scoped.length });
  }, [parsed, typeColIndex, dateColIndex, scope, hasDates, year, monthIndex, periodStart, periodEnd, selectedIndices]);

  return (
    <div
      style={{
        border: "1px solid #2a2820",
        borderRadius: 4,
        background: "#111109",
        padding: "18px 20px",
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a5540", marginBottom: 16 }}>
        TOB — what to include
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8a8060", lineHeight: 1.6 }}>
        Most declarations use a single calendar month (for example March). You can also use a date range, or
        hand-pick buy and sell lines.
      </p>

      <ScopeOption
        id="month" active={scope === "month"} onClick={onScopeChange} disabled={!hasDates}
        title="A calendar month"
        detail="Declare TOB for all buys and sells in that month (typical)."
      />
      <ScopeOption
        id="period" active={scope === "period"} onClick={onScopeChange} disabled={!hasDates}
        title="A date range"
        detail="From one date through another (inclusive)."
      />
      <ScopeOption
        id="individual" active={scope === "individual"} onClick={onScopeChange}
        title="Individual transactions"
        detail="Only buy and sell rows from your file are listed below — tick the ones to include."
      />

      {/* Month picker */}
      {scope === "month" && (
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#8a8060" }}>
            Month{" "}
            <select
              value={monthIndex}
              onChange={(e) => { setMonthIndex(Number(e.target.value)); setResult(null); }}
              style={{ ...inputStyle, marginLeft: 8 }}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i}>{name}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#8a8060" }}>
            Year{" "}
            <input
              type="number" min={2000} max={2100} value={year}
              onChange={(e) => { setYear(Number(e.target.value) || year); setResult(null); }}
              style={{ ...inputStyle, marginLeft: 8, width: 88, fontFamily: "ui-monospace, monospace" }}
            />
          </label>
          {!hasDates && (
            <span style={{ fontSize: 12, color: "#9a7040" }}>No Date column — switch to Individual.</span>
          )}
        </div>
      )}

      {/* Month preview */}
      {scope === "month" && hasDates && (
        <div style={{ marginTop: 20, borderTop: "1px solid #1e1c14", paddingTop: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a5540", marginBottom: 8 }}>
            Transactions in scope
          </div>
          <div style={{ fontSize: 12, color: "#6a6450", marginBottom: 4 }}>
            {MONTH_NAMES[monthIndex]} {year} — {scopedPreview.length} buy/sell line{scopedPreview.length === 1 ? "" : "s"}
          </div>
          <TobScopeTable
            headers={parsed.headers} entries={scopedPreview}
            showCheckbox={false} selectedIndices={selectedIndices} onToggle={toggleRow}
            emptyLabel="No buy/sell transactions in this month."
          />
        </div>
      )}

      {/* Period picker */}
      {scope === "period" && (
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#8a8060" }}>
            From{" "}
            <input
              type="date" value={periodStart}
              onChange={(e) => { setPeriodStart(e.target.value); setResult(null); }}
              style={{ ...inputStyle, marginLeft: 8 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "#8a8060" }}>
            To{" "}
            <input
              type="date" value={periodEnd}
              onChange={(e) => { setPeriodEnd(e.target.value); setResult(null); }}
              style={{ ...inputStyle, marginLeft: 8 }}
            />
          </label>
          {!hasDates && <span style={{ fontSize: 12, color: "#9a7040" }}>No Date column in this file.</span>}
        </div>
      )}

      {/* Period preview */}
      {scope === "period" && hasDates && (
        <div style={{ marginTop: 20, borderTop: "1px solid #1e1c14", paddingTop: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a5540", marginBottom: 8 }}>
            Transactions in scope
          </div>
          <div style={{ fontSize: 12, color: "#6a6450", marginBottom: 4 }}>
            {periodStart && periodEnd
              ? `${periodStart} → ${periodEnd} — ${scopedPreview.length} buy/sell line${scopedPreview.length === 1 ? "" : "s"}`
              : "Set a start and end date to see matching trades."}
          </div>
          <TobScopeTable
            headers={parsed.headers} entries={scopedPreview}
            showCheckbox={false} selectedIndices={selectedIndices} onToggle={toggleRow}
            emptyLabel={!periodStart || !periodEnd ? "Choose dates above to list trades in range." : "No buy/sell transactions in this date range."}
          />
        </div>
      )}

      {/* Individual picker */}
      {scope === "individual" && (
        <div style={{ marginTop: 20, borderTop: "1px solid #1e1c14", paddingTop: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a5540", marginBottom: 8 }}>
            Buy and sell only
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#8a8060", lineHeight: 1.6 }}>
            Cash movements and dividends are hidden here.{" "}
            <strong style={{ color: "#c4a84a" }}>{selectedIndices.size}</strong>{" "}
            line{selectedIndices.size === 1 ? "" : "s"} selected for TOB.
          </p>
          <TobScopeTable
            headers={parsed.headers} entries={candidateEntries}
            showCheckbox selectedIndices={selectedIndices} onToggle={toggleRow}
            emptyLabel="No buy or sell rows in this file."
          />
        </div>
      )}

      {/* Run button */}
      <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          onClick={runCalculation}
          style={{
            padding: "12px 22px",
            border: "1px solid #c4a84a",
            borderRadius: 4,
            background: "#2a2410",
            color: "#c4a84a",
            cursor: "pointer",
            fontSize: 12,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontFamily: "Georgia, serif",
          }}
        >
          Run calculation
        </button>
      </div>

      {/* Error */}
      {result?.error && (
        <div
          style={{
            marginTop: 16, padding: 14,
            background: "#1a0a0a", border: "1px solid #3a1515",
            borderRadius: 3, color: "#c46a4a", fontSize: 13,
          }}
        >
          {result.error}
        </div>
      )}

      {/* Result */}
      {result && !result.error && (
        <div
          style={{
            marginTop: 16, padding: 16,
            background: "#0d0d0b", border: "1px solid #2a2820",
            borderRadius: 3, fontSize: 13, color: "#9a9070", lineHeight: 1.6,
          }}
        >
          <div style={{ color: "#c4a84a", marginBottom: 8, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>
            Scope ready
          </div>
          <div>
            <strong style={{ color: "#e8e4db" }}>{result.scopeLabel}</strong> —{" "}
            <strong style={{ color: "#e8e4db" }}>{result.count}</strong> buy/sell transaction
            {result.count === 1 ? "" : "s"} will be used for TOB.
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "#5a5540" }}>
            Rates and amounts come next; this step only fixes which rows are in scope.
          </div>
        </div>
      )}
    </div>
  );
}
