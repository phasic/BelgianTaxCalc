import { useCallback, useMemo, useState } from "react";
import { MONTH_NAMES } from "../utils/formatters.js";
import { collectTobRowsInScope, defaultTobMonthFromFile, calculateTobResult, parseRowDate } from "../logic/tobCalculation.js";
import { isTobType } from "../logic/transactionFilters.js";
import TobScopeTable from "./TobScopeTable.jsx";
import TobResultTable from "./TobResultTable.jsx";

const EUR = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = (r) => `${(r * 100).toFixed(2)}%`;

const inputStyle = {
  padding: "8px 12px",
  background: "#0d0d0b",
  border: "1px solid #3d3a28",
  color: "#e8e4db",
  borderRadius: 3,
  fontFamily: "Georgia, serif",
};

function CollapsibleSection({ title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 20, borderTop: "1px solid #2e2c1e", paddingTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
          marginBottom: open ? 12 : 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#7a7460",
          }}
        >
          {title}
        </span>
        {badge != null && (
          <span style={{ fontSize: 11, color: "#5a5440" }}>({badge})</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#5a5440" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && children}
    </div>
  );
}

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
        border: active ? "1px solid #c4a84a" : "1px solid #3d3a28",
        borderRadius: 4,
        background: active ? "#1a1a0a" : "#111109",
        color: "#e8e4db",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ fontSize: 14, color: active ? "#c4a84a" : "#d8d0b8", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#8a8268", lineHeight: 1.5 }}>{detail}</div>
    </button>
  );
}

export default function TobWizard({ parsed, typeColIndex, dateColIndex, instrumentNames = new Map(), tobPaidKeys, toggleTobPaid, updateManualType }) {
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

  /** Min / max date strings (YYYY-MM-DD) across all TOB rows. */
  const dateRange = useMemo(() => {
    if (!hasDates || !candidateEntries.length) return { min: "", max: "" };
    let min = null;
    let max = null;
    for (const { row } of candidateEntries) {
      const d = parseRowDate(row[dateColIndex]);
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    const fmt = (d) => d.toISOString().slice(0, 10);
    return { min: min ? fmt(min) : "", max: max ? fmt(max) : "" };
  }, [candidateEntries, dateColIndex, hasDates]);

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

    const tob = calculateTobResult(scoped, parsed.headers, instrumentNames);
    setResult({ error: null, scopeLabel, ...tob });
  }, [parsed, typeColIndex, dateColIndex, scope, hasDates, year, monthIndex, periodStart, periodEnd, selectedIndices, instrumentNames]);

  return (
    <div
      style={{
        border: "1px solid #3d3a28",
        borderRadius: 4,
        background: "#141410",
        padding: "18px 20px",
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#7a7460", marginBottom: 16 }}>
        TOB — what to include
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#a89870", lineHeight: 1.6 }}>
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
          <label style={{ fontSize: 12, color: "#a89870" }}>
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
          <label style={{ fontSize: 12, color: "#a89870" }}>
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
        <CollapsibleSection
          title="Transactions in scope"
          badge={`${MONTH_NAMES[monthIndex]} ${year} — ${scopedPreview.length} buy/sell line${scopedPreview.length === 1 ? "" : "s"}`}
        >
          <TobScopeTable
            headers={parsed.headers} entries={scopedPreview}
            showCheckbox={false} selectedIndices={selectedIndices} onToggle={toggleRow}
            emptyLabel="No buy/sell transactions in this month."
            instrumentNames={instrumentNames}
            dateColIndex={dateColIndex}
            tobPaidKeys={tobPaidKeys}
            toggleTobPaid={toggleTobPaid}
          />
        </CollapsibleSection>
      )}

      {/* Period picker */}
      {scope === "period" && (
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#a89870" }}>
            From{" "}
            <input
              type="date"
              value={periodStart}
              min={dateRange.min || undefined}
              max={dateRange.max || undefined}
              onChange={(e) => { setPeriodStart(e.target.value); setResult(null); }}
              style={{ ...inputStyle, marginLeft: 8 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "#a89870" }}>
            To{" "}
            <input
              type="date"
              value={periodEnd}
              min={dateRange.min || undefined}
              max={dateRange.max || undefined}
              onChange={(e) => { setPeriodEnd(e.target.value); setResult(null); }}
              style={{ ...inputStyle, marginLeft: 8 }}
            />
          </label>
          {dateRange.min && dateRange.max && (
            <button
              type="button"
              onClick={() => { setPeriodStart(dateRange.min); setPeriodEnd(dateRange.max); setResult(null); }}
              style={{
                padding: "8px 14px",
                border: periodStart === dateRange.min && periodEnd === dateRange.max
                  ? "1px solid #c4a84a" : "1px solid #3d3a28",
                borderRadius: 3,
                background: "transparent",
                color: periodStart === dateRange.min && periodEnd === dateRange.max
                  ? "#c4a84a" : "#a89870",
                cursor: "pointer",
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontFamily: "Georgia, serif",
              }}
            >
              Full range
            </button>
          )}
          {!hasDates && <span style={{ fontSize: 12, color: "#9a7040" }}>No Date column in this file.</span>}
        </div>
      )}

      {/* Period preview */}
      {scope === "period" && hasDates && (
        <CollapsibleSection
          title="Transactions in scope"
          badge={
            periodStart && periodEnd
              ? `${periodStart} → ${periodEnd} — ${scopedPreview.length} buy/sell line${scopedPreview.length === 1 ? "" : "s"}`
              : "set dates above to preview"
          }
        >
          <TobScopeTable
            headers={parsed.headers} entries={scopedPreview}
            showCheckbox={false} selectedIndices={selectedIndices} onToggle={toggleRow}
            emptyLabel={!periodStart || !periodEnd ? "Choose dates above to list trades in range." : "No buy/sell transactions in this date range."}
            instrumentNames={instrumentNames}
            dateColIndex={dateColIndex}
            tobPaidKeys={tobPaidKeys}
            toggleTobPaid={toggleTobPaid}
          />
        </CollapsibleSection>
      )}

      {/* Individual picker */}
      {scope === "individual" && (
        <CollapsibleSection
          title="Buy and sell only"
          badge={`${selectedIndices.size} line${selectedIndices.size === 1 ? "" : "s"} selected for TOB`}
        >
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#a89870", lineHeight: 1.6 }}>
            Cash movements and dividends are hidden here.
          </p>
          <TobScopeTable
            headers={parsed.headers} entries={candidateEntries}
            showCheckbox selectedIndices={selectedIndices} onToggle={toggleRow}
            emptyLabel="No buy or sell rows in this file."
            instrumentNames={instrumentNames}
            dateColIndex={dateColIndex}
            tobPaidKeys={tobPaidKeys}
            toggleTobPaid={toggleTobPaid}
          />
        </CollapsibleSection>
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
        <div style={{ marginTop: 16, padding: 14, background: "#1a0a0a", border: "1px solid #3a1515", borderRadius: 3, color: "#c46a4a", fontSize: 13 }}>
          {result.error}
        </div>
      )}

      {/* TOB Results */}
      {result && !result.error && (
        <div style={{ marginTop: 24 }}>

          {/* --- Unresolved instruments error --- */}
          {result.unresolvedTickers?.length > 0 && (
            <div style={{ marginBottom: 16, padding: "14px 18px", background: "#1a0a0a", border: "1px solid #6a2020", borderRadius: 4 }}>
              <div style={{ fontSize: 12, color: "#c04848", marginBottom: 8, letterSpacing: 0.5 }}>
                {result.unresolvedTickers.length} ticker{result.unresolvedTickers.length > 1 ? "s" : ""} could not be classified and are excluded from the total
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {result.unresolvedTickers.map((t) => (
                  <span key={t} style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "2px 8px", background: "#2a1010", border: "1px solid #6a2020", borderRadius: 3, color: "#e07070" }}>
                    {t}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#7a5050", fontStyle: "italic" }}>
                Resolve instrument types via OpenFIGI in the Transactions tab, then recalculate.
              </div>
            </div>
          )}

          {/* --- Government form fill-in --- */}
          <div style={{ marginBottom: 20, padding: 18, background: "#111109", border: "1px solid #3d3a28", borderRadius: 4 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#7a7460", marginBottom: 14 }}>
              Fill in at divtax.minfin.fgov.be — {result.scopeLabel}
            </div>

            {Object.values(result.byArt).map((grp) => (
              <div
                key={grp.key}
                style={{ marginBottom: 10, padding: "12px 14px", border: "1px solid #2a2818", borderRadius: 4, background: "#0e0e0a" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#c4a84a" }}>{grp.art}</span>
                  <span style={{ fontSize: 11, color: "#6a6450" }}>{grp.label}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 5, columnGap: 32, fontSize: 12 }}>
                  <span style={{ color: "#8a8268" }}>Number of transactions</span>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "#e8e4db", textAlign: "right" }}>{grp.count}</span>
                  <span style={{ color: "#8a8268" }}>Taxable amount</span>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "#e8e4db", textAlign: "right" }}>{EUR.format(grp.totalEUR)}</span>
                </div>
              </div>
            ))}

            {/* Calculated TOB — double-check */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #282618" }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#6a6450", marginBottom: 8 }}>
                Calculated TOB (double-check)
              </div>
              {Object.values(result.byArt).map((grp) => (
                <div key={grp.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7a7460", marginBottom: 4 }}>
                  <span>{grp.art} <span style={{ fontFamily: "ui-monospace, monospace" }}>({PCT(grp.rate)})</span></span>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "#c8c080" }}>{EUR.format(grp.totalTOB)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 16, marginTop: 10, paddingTop: 10, borderTop: "1px solid #3d3a28" }}>
                <span style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#a89870" }}>Total TOB due</span>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 20, color: "#f0e060", letterSpacing: 1 }}>
                  {EUR.format(result.totalTOB)}
                </span>
              </div>
            </div>
          </div>

          {/* --- Transaction detail table --- */}
          <CollapsibleSection title="Transaction detail" badge={`${result.lineItems.length} line${result.lineItems.length === 1 ? "" : "s"}`}>
            <TobResultTable
              headers={parsed.headers}
              lineItems={result.lineItems}
              instrumentNames={instrumentNames}
              dateColIndex={dateColIndex}
              tobPaidKeys={tobPaidKeys}
              toggleTobPaid={toggleTobPaid}
              updateManualType={updateManualType}
            />
          </CollapsibleSection>

          {/* --- Next steps --- */}
          <div
            style={{
              marginTop: 28,
              padding: "22px 24px",
              background: "#111109",
              border: "1px solid #3d3a28",
              borderRadius: 4,
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#7a7460", marginBottom: 16 }}>
              Next steps — filing with the Belgian government
            </div>

            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#c0b890", lineHeight: 1.7 }}>
              Belgian residents must declare and pay TOB themselves each month via{" "}
              <strong style={{ color: "#e8e4db" }}>divtax.minfin.fgov.be</strong>.
              The deadline is the{" "}
              <strong style={{ color: "#e8e4db" }}>last workday of the second month following the transactions</strong>{" "}
              (e.g. transactions in May → deadline is the last workday of July).
            </p>

            <ol style={{ margin: "0 0 20px", paddingLeft: 22, fontSize: 13, color: "#c0b890", lineHeight: 2.1 }}>
              <li>
                Go to{" "}
                <a
                  href="https://divtax.minfin.fgov.be/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#c4a84a", textDecoration: "none", borderBottom: "1px solid #c4a84a55" }}
                >
                  divtax.minfin.fgov.be
                </a>{" "}
                and log in with eID, itsme, or another accepted method.
              </li>
              <li>
                Select the month and choose the transaction type (art. 120, 1° or 3°).
              </li>
              <li>
                For each article in the fill-in section above, enter the{" "}
                <em style={{ color: "#d8d0b8" }}>number of transactions</em> and the{" "}
                <em style={{ color: "#d8d0b8" }}>taxable amount</em>.
              </li>
              <li>
                Submit the declaration and pay the total TOB of{" "}
                <strong style={{ color: "#f0e060", fontFamily: "ui-monospace, monospace" }}>
                  {EUR.format(result.totalTOB)}
                </strong>{" "}
                before the deadline.
              </li>
            </ol>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                borderTop: "1px solid #2e2c1e",
                paddingTop: 16,
                marginBottom: 16,
              }}
            >
              {[
                { label: "File TOB online", url: "https://divtax.minfin.fgov.be/" },
                { label: "SPF Finances — TOB info", url: "https://finances.belgium.be/fr/particuliers/bourse/taxe-boursiere" },
                { label: "Official rates & rules", url: "https://finances.belgium.be/fr/particuliers/bourse/taxe-boursiere/taux" },
              ].map(({ label, url }) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    border: "1px solid #524e34",
                    borderRadius: 3,
                    background: "#181810",
                    color: "#c4a84a",
                    fontSize: 11,
                    letterSpacing: 1,
                    textDecoration: "none",
                    fontFamily: "Georgia, serif",
                    textTransform: "uppercase",
                  }}
                >
                  ↗ {label}
                </a>
              ))}
            </div>

            <p style={{ margin: 0, fontSize: 11, color: "#7a7460", lineHeight: 1.6 }}>
              This tool provides a calculation aid only and does not constitute tax advice.
              Verify your declaration with official SPF Finances documentation or a tax advisor.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
