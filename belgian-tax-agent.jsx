import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Query Wikidata SPARQL for ISINs by ticker symbol.
 * Uses exchange-ticker qualifiers (P414/P249) → ISIN property (P946).
 * Works for major stocks; UCITS ETFs are generally not in Wikidata.
 * CORS: Wikidata SPARQL returns Access-Control-Allow-Origin: *
 */
async function fetchWikidataIsins(tickers) {
  if (!tickers.length) return {};
  const tickerList = tickers.map((t) => `"${t.toUpperCase()}"`).join(" ");
  const query = `SELECT ?item ?itemLabel ?ticker ?isin WHERE {
  ?item wdt:P946 ?isin .
  ?item p:P414 [ ps:P414 ?exch ; pq:P249 ?ticker ] .
  FILTER (UCASE(?ticker) IN (${tickerList}))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 100`;
  try {
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "BelgianTaxCalc/1.0" },
    });
    if (!resp.ok) return {};
    const data = await resp.json();
    const result = {};
    for (const binding of data?.results?.bindings ?? []) {
      const ticker = binding.ticker?.value?.toUpperCase();
      const isin = binding.isin?.value;
      const name = binding.itemLabel?.value;
      if (ticker && isin && !result[ticker]) {
        result[ticker] = { isin, name, source: "wikidata" };
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Query OpenFIGI /v3/mapping for instrument name + shareClassFIGI.
 * Called via the Vite dev-server proxy at /api/openfigi (avoids CORS).
 * Returns shareClassFIGI as fallback identifier when ISIN is unavailable.
 */
async function fetchOpenFigiInfo(tickers) {
  if (!tickers.length) return {};
  const BATCH = 10;
  const result = {};
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const jobs = batch.map((t) => ({ idType: "TICKER", idValue: t }));
    try {
      const resp = await fetch("/api/openfigi/v3/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobs),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      for (let j = 0; j < batch.length; j++) {
        const ticker = batch[j].toUpperCase();
        const job = data[j];
        if (job?.data?.length) {
          const d = job.data[0];
          result[ticker] = {
            isin: null,
            name: d.name ?? null,
            shareClassFIGI: d.shareClassFIGI ?? null,
            securityType: d.securityType ?? null,
            source: "openfigi",
          };
        }
      }
    } catch {
      /* ignore batch errors; results will be null for these tickers */
    }
  }
  return result;
}

/** Split one CSV line into fields; supports "quoted, commas" */
function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(current.trim());
  return fields.map((f) => f.replace(/^"|"$/g, ""));
}

function parseRevolutCsv(raw) {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) throw new Error("File is empty.");

  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error("Need a header row and at least one data row.");

  const headers = splitCsvLine(lines[0]);
  if (headers.length === 0 || headers.every((h) => !h)) throw new Error("Could not read column headers.");

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((c) => c === "")) continue;
    while (cells.length < headers.length) cells.push("");
    if (cells.length > headers.length) cells.length = headers.length;
    rows.push(cells);
  }

  return { headers, rows };
}

function formatCellDisplay(header, value) {
  const h = header.toLowerCase();
  if (!value) return "—";
  if (h.includes("date") && value.includes("T")) {
    try {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch {
      /* fall through */
    }
  }
  return value;
}

function findTypeColumnIndex(headers) {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  let i = normalized.findIndex((h) => h === "type");
  if (i === -1) i = normalized.findIndex((h) => h.includes("type"));
  return i;
}

function findDateColumnIndex(headers) {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  let i = normalized.findIndex((h) => h === "date");
  if (i === -1) i = normalized.findIndex((h) => h.includes("date"));
  return i;
}

function parseRowDate(cell) {
  if (!cell) return null;
  const d = new Date(cell);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** TOB-relevant: exchange trades (Revolut uses e.g. BUY - MARKET, SELL - LIMIT). */
function isTobType(typeCell) {
  const t = (typeCell || "").trim().toUpperCase();
  return t.startsWith("BUY") || t.startsWith("SELL");
}

function isDividendType(typeCell) {
  const t = (typeCell || "").trim().toUpperCase();
  return t === "DIVIDEND" || t.startsWith("DIVIDEND");
}

function defaultTobMonthFromFile(parsed, typeColIndex, dateColIndex) {
  if (!parsed || typeColIndex < 0 || dateColIndex < 0) {
    const n = new Date();
    return { year: n.getFullYear(), monthIndex: n.getMonth() };
  }
  for (let i = parsed.rows.length - 1; i >= 0; i--) {
    const row = parsed.rows[i];
    if (!isTobType(row[typeColIndex])) continue;
    const d = parseRowDate(row[dateColIndex]);
    if (d) return { year: d.getFullYear(), monthIndex: d.getMonth() };
  }
  const n = new Date();
  return { year: n.getFullYear(), monthIndex: n.getMonth() };
}

function dateInCalendarMonth(d, year, monthIndex) {
  return d.getFullYear() === year && d.getMonth() === monthIndex;
}

function dateInClosedPeriod(d, startStr, endStr) {
  if (!startStr || !endStr) return false;
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T23:59:59.999");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return d >= start && d <= end;
}

function collectTobRowsInScope(parsed, typeColIndex, dateColIndex, scope, opts) {
  const out = [];
  for (let sourceIndex = 0; sourceIndex < parsed.rows.length; sourceIndex++) {
    const row = parsed.rows[sourceIndex];
    if (!isTobType(row[typeColIndex])) continue;

    if (scope === "individual") {
      if (!opts.selectedIndices.has(sourceIndex)) continue;
      out.push({ sourceIndex, row });
      continue;
    }

    if (dateColIndex < 0) continue;
    const d = parseRowDate(row[dateColIndex]);
    if (!d) continue;

    if (scope === "month") {
      if (!dateInCalendarMonth(d, opts.year, opts.monthIndex)) continue;
    } else if (scope === "period") {
      if (!dateInClosedPeriod(d, opts.periodStart, opts.periodEnd)) continue;
    }

    out.push({ sourceIndex, row });
  }
  return out;
}

function IsinBadge({ ticker, isinMap, isinLoading }) {
  if (!ticker) return <span style={{ color: "#4a4830" }}>—</span>;
  const entry = isinMap[ticker];
  if (!entry) {
    return (
      <span style={{ color: "#4a4830", fontStyle: "italic", fontSize: 11 }}>
        {isinLoading ? "…" : "—"}
      </span>
    );
  }
  if (entry.isin) {
    return (
      <span
        title={`Source: Wikidata${entry.name ? ` · ${entry.name}` : ""}`}
        style={{ fontFamily: "ui-monospace, monospace", color: "#7ab87a", fontSize: 12 }}
      >
        {entry.isin}
      </span>
    );
  }
  if (entry.shareClassFIGI) {
    return (
      <span
        title={`Bloomberg Share Class FIGI · No free ISIN source found for this ETF${entry.name ? ` · ${entry.name}` : ""}`}
        style={{ fontFamily: "ui-monospace, monospace", color: "#6a7a9a", fontSize: 11 }}
      >
        BBG·{entry.shareClassFIGI}
      </span>
    );
  }
  return <span style={{ color: "#4a4830", fontStyle: "italic", fontSize: 11 }}>N/A</span>;
}

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

function TobScopeTable({ headers, entries, showCheckbox, selectedIndices, onToggle, emptyLabel, isinMap, isinLoading }) {
  const tickerColIdx = headers.findIndex((h) => h.trim().toLowerCase() === "ticker");
  const showIsin = tickerColIdx >= 0;
  const extraCols = showIsin ? 1 : 0;
  const colSpan = headers.length + (showCheckbox ? 1 : 0) + extraCols;

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
                  width: 44,
                  textAlign: "center",
                  padding: "10px 8px",
                  fontWeight: 400,
                  color: "#8a8060",
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  borderBottom: "1px solid #2a2820",
                }}
              >
                Include
              </th>
            )}
            {headers.map((h, hi) => (
              <React.Fragment key={`${hi}-${h}`}>
                <th style={thStyle}>{h}</th>
                {hi === tickerColIdx && (
                  <th style={{ ...thStyle, color: isinLoading ? "#5a6840" : "#8a8060" }}>
                    ISIN{isinLoading ? " …" : ""}
                  </th>
                )}
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={colSpan} style={{ padding: "24px 16px", textAlign: "center", color: "#6a6450", fontSize: 13 }}>
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
                  const isTicker = ci === tickerColIdx;
                  return (
                    <React.Fragment key={ci}>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: isTicker && cell ? "#c4a84a" : "#9a9070",
                          fontFamily: isTicker && cell ? "ui-monospace, monospace" : "inherit",
                          verticalAlign: "top",
                        }}
                      >
                        {formatCellDisplay(header, cell)}
                      </td>
                      {isTicker && (
                        <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                          <IsinBadge ticker={cell?.trim() || null} isinMap={isinMap ?? {}} isinLoading={isinLoading} />
                        </td>
                      )}
                    </React.Fragment>
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

export default function BelgianTaxAgent() {
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewFilter, setViewFilter] = useState("all");

  const [showTobWizard, setShowTobWizard] = useState(false);
  const [tobScope, setTobScope] = useState("month");
  const [tobYear, setTobYear] = useState(() => new Date().getFullYear());
  const [tobMonthIndex, setTobMonthIndex] = useState(() => new Date().getMonth());
  const [tobPeriodStart, setTobPeriodStart] = useState("");
  const [tobPeriodEnd, setTobPeriodEnd] = useState("");
  const [tobSelectedIndices, setTobSelectedIndices] = useState(() => new Set());
  const [tobResult, setTobResult] = useState(null);

  const [isinMap, setIsinMap] = useState({});
  const [isinLoading, setIsinLoading] = useState(false);
  const isinCacheRef = useRef({});

  const loadText = useCallback((name, text) => {
    setFileName(name);
    setError(null);
    setViewFilter("all");
    setParsed(parseRevolutCsv(text));
    setShowTobWizard(false);
    setTobScope("month");
    setTobPeriodStart("");
    setTobPeriodEnd("");
    setTobSelectedIndices(new Set());
    setTobResult(null);
  }, []);

  const onFile = useCallback(
    (file) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("Please choose a .csv file (Revolut trading export).");
        setParsed(null);
        setFileName(file.name);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          loadText(file.name, String(reader.result ?? ""));
        } catch (e) {
          setParsed(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      };
      reader.onerror = () => {
        setParsed(null);
        setError("Could not read the file.");
      };
      reader.readAsText(file, "UTF-8");
    },
    [loadText]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  const typeColIndex = parsed ? findTypeColumnIndex(parsed.headers) : -1;
  const dateColIndex = parsed ? findDateColumnIndex(parsed.headers) : -1;

  useEffect(() => {
    if (!parsed || typeColIndex < 0 || !fileName) return;
    const def = defaultTobMonthFromFile(parsed, typeColIndex, dateColIndex);
    setTobYear(def.year);
    setTobMonthIndex(def.monthIndex);
  }, [parsed, fileName, typeColIndex, dateColIndex]);

  useEffect(() => {
    if (!parsed) return;
    if (dateColIndex < 0 && (tobScope === "month" || tobScope === "period")) {
      setTobScope("individual");
      setTobResult(null);
    }
  }, [parsed, dateColIndex, tobScope]);

  const tickerColIndex = useMemo(() => {
    if (!parsed) return -1;
    return parsed.headers.findIndex((h) => h.trim().toLowerCase() === "ticker");
  }, [parsed]);

  useEffect(() => {
    if (!parsed || tickerColIndex < 0) return;
    const allTickers = [
      ...new Set(
        parsed.rows
          .map((row) => row[tickerColIndex]?.trim())
          .filter(Boolean)
      ),
    ];
    const uncached = allTickers.filter((t) => !(t in isinCacheRef.current));
    if (!uncached.length) return;

    setIsinLoading(true);
    Promise.allSettled([
      fetchWikidataIsins(uncached),
      fetchOpenFigiInfo(uncached),
    ]).then(([wdRes, figiRes]) => {
      const wdData = wdRes.status === "fulfilled" ? wdRes.value : {};
      const figiData = figiRes.status === "fulfilled" ? figiRes.value : {};
      const merged = {};
      for (const ticker of uncached) {
        const t = ticker.toUpperCase();
        if (wdData[t]) {
          merged[ticker] = wdData[t];
        } else if (figiData[t]) {
          merged[ticker] = figiData[t];
        } else {
          merged[ticker] = { isin: null, name: null, source: null };
        }
      }
      isinCacheRef.current = { ...isinCacheRef.current, ...merged };
      setIsinMap((prev) => ({ ...prev, ...merged }));
      setIsinLoading(false);
    });
  }, [parsed, tickerColIndex]);

  const { displayEntries, filterNote } = useMemo(() => {
    if (!parsed) return { displayEntries: [], filterNote: null };
    const withIdx = parsed.rows.map((row, sourceIndex) => ({ row, sourceIndex }));
    if (typeColIndex === -1) {
      return {
        displayEntries: withIdx,
        filterNote: "No Type column found — filters are disabled.",
      };
    }
    if (viewFilter === "all") {
      return { displayEntries: withIdx, filterNote: null };
    }
    const pred =
      viewFilter === "tob"
        ? (entry) => isTobType(entry.row[typeColIndex])
        : (entry) => isDividendType(entry.row[typeColIndex]);
    return { displayEntries: withIdx.filter(pred), filterNote: null };
  }, [parsed, typeColIndex, viewFilter]);

  const tobCandidateEntries = useMemo(() => {
    if (!parsed || typeColIndex < 0) return [];
    return parsed.rows
      .map((row, sourceIndex) => ({ row, sourceIndex }))
      .filter((e) => isTobType(e.row[typeColIndex]));
  }, [parsed, typeColIndex]);

  const tobScopedPreview = useMemo(() => {
    if (!showTobWizard || !parsed || typeColIndex < 0) return [];
    return collectTobRowsInScope(parsed, typeColIndex, dateColIndex, tobScope, {
      year: tobYear,
      monthIndex: tobMonthIndex,
      periodStart: tobPeriodStart,
      periodEnd: tobPeriodEnd,
      selectedIndices: tobSelectedIndices,
    });
  }, [
    showTobWizard,
    parsed,
    typeColIndex,
    dateColIndex,
    tobScope,
    tobYear,
    tobMonthIndex,
    tobPeriodStart,
    tobPeriodEnd,
    tobSelectedIndices,
  ]);

  const filterButtons = [
    { id: "all", label: "All" },
    { id: "tob", label: "TOB" },
    { id: "dividends", label: "Dividends" },
  ];

  const tobEligible = Boolean(parsed && typeColIndex >= 0);
  const monthPeriodNeedsDate = dateColIndex >= 0;

  const toggleTobRow = useCallback((sourceIndex) => {
    setTobSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(sourceIndex)) next.delete(sourceIndex);
      else next.add(sourceIndex);
      return next;
    });
  }, []);

  const onTobScopeChange = useCallback((next) => {
    setTobScope(next);
    setTobResult(null);
    if (next !== "individual") setTobSelectedIndices(new Set());
  }, []);

  const runTobCalculation = useCallback(() => {
    if (!parsed || typeColIndex < 0) return;

    if (tobScope === "month" || tobScope === "period") {
      if (dateColIndex < 0) {
        setTobResult({ error: "This file has no Date column — choose Individual transactions instead." });
        return;
      }
    }

    if (tobScope === "period") {
      if (!tobPeriodStart || !tobPeriodEnd) {
        setTobResult({ error: "Pick both a start date and an end date for the period." });
        return;
      }
      if (new Date(tobPeriodStart) > new Date(tobPeriodEnd)) {
        setTobResult({ error: "Start date must be on or before end date." });
        return;
      }
    }

    if (tobScope === "individual" && tobSelectedIndices.size === 0) {
      setTobResult({ error: "Select at least one buy or sell row (use the checkboxes)." });
      return;
    }

    const scoped = collectTobRowsInScope(parsed, typeColIndex, dateColIndex, tobScope, {
      year: tobYear,
      monthIndex: tobMonthIndex,
      periodStart: tobPeriodStart,
      periodEnd: tobPeriodEnd,
      selectedIndices: tobSelectedIndices,
    });

    let label = "";
    if (tobScope === "month") {
      label = `${MONTH_NAMES[tobMonthIndex]} ${tobYear}`;
    } else if (tobScope === "period") {
      label = `${tobPeriodStart} → ${tobPeriodEnd}`;
    } else {
      label = `${tobSelectedIndices.size} selected transaction${tobSelectedIndices.size === 1 ? "" : "s"}`;
    }

    setTobResult({
      error: null,
      scopeLabel: label,
      scopeMode: tobScope,
      count: scoped.length,
      entries: scoped,
    });
  }, [
    parsed,
    typeColIndex,
    dateColIndex,
    tobScope,
    tobYear,
    tobMonthIndex,
    tobPeriodStart,
    tobPeriodEnd,
    tobSelectedIndices,
  ]);

  const cardStyle = {
    border: "1px solid #2a2820",
    borderRadius: 4,
    background: "#111109",
    padding: "18px 20px",
    marginBottom: 16,
  };

  const scopeOption = (id, title, detail, disabled = false) => {
    const active = tobScope === id;
    return (
      <button
        key={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onTobScopeChange(id)}
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
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d0d0f",
        color: "#e8e4db",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #2a2820",
          padding: "28px 40px 24px",
          background: "linear-gradient(180deg,#111108,#0d0d0f)",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            letterSpacing: "4px",
            textTransform: "uppercase",
            color: "#c4a84a",
            marginBottom: "6px",
            fontStyle: "italic",
          }}
        >
          Belgian Tax Calc
        </div>
        <h1 style={{ fontSize: "26px", fontWeight: 400, margin: 0, color: "#f0ead8" }}>Investment Tax Agent</h1>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <p style={{ color: "#9a9070", fontSize: 14, lineHeight: 1.7, margin: "0 0 24px" }}>
          Step 1 — Load your Revolut trading statement CSV. Data is parsed in the browser only; nothing is uploaded.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById("csv-input")?.click()}
          style={{
            border: `1px solid ${dragOver ? "#c4a84a" : parsed ? "#3d3820" : "#222018"}`,
            borderRadius: 4,
            padding: 36,
            textAlign: "center",
            background: dragOver ? "#1a1a0a" : "#0f0f0d",
            cursor: "pointer",
            marginBottom: 24,
            transition: "border-color 0.2s, background 0.2s",
          }}
        >
          <input
            id="csv-input"
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          {parsed ? (
            <>
              <div style={{ fontSize: 22, marginBottom: 8 }}>✅</div>
              <div style={{ color: "#c4a84a", fontSize: 14 }}>{fileName}</div>
              <div style={{ color: "#5a5540", fontSize: 12, marginTop: 6 }}>
                {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} in file · click to load another file
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.45 }}>⬆</div>
              <div style={{ color: "#9a9070", fontSize: 14, marginBottom: 6 }}>Drop your Revolut CSV here</div>
              <div style={{ color: "#4a4535", fontSize: 11, letterSpacing: 1 }}>or click to choose a file</div>
            </>
          )}
        </div>

        {parsed && (
          <div style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTobWizard((v) => !v);
                setTobResult(null);
              }}
              disabled={!tobEligible}
              style={{
                padding: "12px 22px",
                border: "1px solid #c4a84a",
                borderRadius: 4,
                background: tobEligible ? "#1a1a0a" : "#14140f",
                color: tobEligible ? "#c4a84a" : "#4a4535",
                cursor: tobEligible ? "pointer" : "not-allowed",
                fontSize: 12,
                letterSpacing: 2,
                textTransform: "uppercase",
                fontFamily: "Georgia, serif",
              }}
            >
              {showTobWizard ? "Close TOB calculation" : "Calculate TOB"}
            </button>
            {!tobEligible && (
              <span style={{ fontSize: 12, color: "#6a6450" }}>Requires a Type column with buy/sell rows.</span>
            )}
            {showTobWizard && (
              <span style={{ fontSize: 12, color: "#6a6450" }}>
                Full CSV table is hidden — only transactions in your TOB scope are shown in the panel below.
              </span>
            )}
          </div>
        )}

        {showTobWizard && parsed && tobEligible && (
          <div style={cardStyle}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#5a5540",
                marginBottom: 16,
              }}
            >
              TOB — what to include
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8a8060", lineHeight: 1.6 }}>
              Most declarations use a single calendar month (for example March). You can also use a date range, or
              hand-pick buy and sell lines.
            </p>

            {scopeOption(
              "month",
              "A calendar month",
              "Declare TOB for all buys and sells in that month (typical).",
              !monthPeriodNeedsDate
            )}
            {scopeOption(
              "period",
              "A date range",
              "From one date through another (inclusive).",
              !monthPeriodNeedsDate
            )}
            {scopeOption(
              "individual",
              "Individual transactions",
              "Only buy and sell rows from your file are listed below — tick the ones to include."
            )}

            {tobScope === "month" && (
              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                <label style={{ fontSize: 12, color: "#8a8060" }}>
                  Month{" "}
                  <select
                    value={tobMonthIndex}
                    onChange={(e) => {
                      setTobMonthIndex(Number(e.target.value));
                      setTobResult(null);
                    }}
                    style={{
                      marginLeft: 8,
                      padding: "8px 12px",
                      background: "#0d0d0b",
                      border: "1px solid #2a2820",
                      color: "#e8e4db",
                      borderRadius: 3,
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={name} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: "#8a8060" }}>
                  Year{" "}
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={tobYear}
                    onChange={(e) => {
                      setTobYear(Number(e.target.value) || tobYear);
                      setTobResult(null);
                    }}
                    style={{
                      marginLeft: 8,
                      width: 88,
                      padding: "8px 12px",
                      background: "#0d0d0b",
                      border: "1px solid #2a2820",
                      color: "#e8e4db",
                      borderRadius: 3,
                      fontFamily: "ui-monospace, monospace",
                    }}
                  />
                </label>
                {!monthPeriodNeedsDate && (
                  <span style={{ fontSize: 12, color: "#9a7040" }}>No Date column — switch to Individual or Period won’t work.</span>
                )}
              </div>
            )}

            {tobScope === "month" && monthPeriodNeedsDate && (
              <div style={{ marginTop: 20, borderTop: "1px solid #1e1c14", paddingTop: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#5a5540",
                    marginBottom: 8,
                  }}
                >
                  Transactions in scope
                </div>
                <div style={{ fontSize: 12, color: "#6a6450", marginBottom: 4 }}>
                  {MONTH_NAMES[tobMonthIndex]} {tobYear} — {tobScopedPreview.length} buy/sell line
                  {tobScopedPreview.length === 1 ? "" : "s"}
                </div>
                <TobScopeTable
                  headers={parsed.headers}
                  entries={tobScopedPreview}
                  showCheckbox={false}
                  selectedIndices={tobSelectedIndices}
                  onToggle={toggleTobRow}
                  emptyLabel="No buy/sell transactions in this month."
                  isinMap={isinMap}
                  isinLoading={isinLoading}
                />
              </div>
            )}

            {tobScope === "period" && (
              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                <label style={{ fontSize: 12, color: "#8a8060" }}>
                  From{" "}
                  <input
                    type="date"
                    value={tobPeriodStart}
                    onChange={(e) => {
                      setTobPeriodStart(e.target.value);
                      setTobResult(null);
                    }}
                    style={{
                      marginLeft: 8,
                      padding: "8px 10px",
                      background: "#0d0d0b",
                      border: "1px solid #2a2820",
                      color: "#e8e4db",
                      borderRadius: 3,
                    }}
                  />
                </label>
                <label style={{ fontSize: 12, color: "#8a8060" }}>
                  To{" "}
                  <input
                    type="date"
                    value={tobPeriodEnd}
                    onChange={(e) => {
                      setTobPeriodEnd(e.target.value);
                      setTobResult(null);
                    }}
                    style={{
                      marginLeft: 8,
                      padding: "8px 10px",
                      background: "#0d0d0b",
                      border: "1px solid #2a2820",
                      color: "#e8e4db",
                      borderRadius: 3,
                    }}
                  />
                </label>
                {!monthPeriodNeedsDate && (
                  <span style={{ fontSize: 12, color: "#9a7040" }}>No Date column in this file.</span>
                )}
              </div>
            )}

            {tobScope === "period" && monthPeriodNeedsDate && (
              <div style={{ marginTop: 20, borderTop: "1px solid #1e1c14", paddingTop: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#5a5540",
                    marginBottom: 8,
                  }}
                >
                  Transactions in scope
                </div>
                <div style={{ fontSize: 12, color: "#6a6450", marginBottom: 4 }}>
                  {tobPeriodStart && tobPeriodEnd
                    ? `${tobPeriodStart} → ${tobPeriodEnd} — ${tobScopedPreview.length} buy/sell line${tobScopedPreview.length === 1 ? "" : "s"}`
                    : "Set a start and end date to see matching trades."}
                </div>
                <TobScopeTable
                  headers={parsed.headers}
                  entries={tobScopedPreview}
                  showCheckbox={false}
                  selectedIndices={tobSelectedIndices}
                  onToggle={toggleTobRow}
                  emptyLabel={
                    !tobPeriodStart || !tobPeriodEnd
                      ? "Choose dates above to list trades in range."
                      : "No buy/sell transactions in this date range."
                  }
                  isinMap={isinMap}
                  isinLoading={isinLoading}
                />
              </div>
            )}

            {tobScope === "individual" && (
              <div style={{ marginTop: 20, borderTop: "1px solid #1e1c14", paddingTop: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#5a5540",
                    marginBottom: 8,
                  }}
                >
                  Buy and sell only
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#8a8060", lineHeight: 1.6 }}>
                  Cash movements and dividends are hidden here. <strong style={{ color: "#c4a84a" }}>{tobSelectedIndices.size}</strong>{" "}
                  line{tobSelectedIndices.size === 1 ? "" : "s"} selected for TOB.
                </p>
                <TobScopeTable
                  headers={parsed.headers}
                  entries={tobCandidateEntries}
                  showCheckbox
                  selectedIndices={tobSelectedIndices}
                  onToggle={toggleTobRow}
                  emptyLabel="No buy or sell rows in this file."
                  isinMap={isinMap}
                  isinLoading={isinLoading}
                />
              </div>
            )}

            <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <button
                type="button"
                onClick={runTobCalculation}
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

            {tobResult?.error && (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  background: "#1a0a0a",
                  border: "1px solid #3a1515",
                  borderRadius: 3,
                  color: "#c46a4a",
                  fontSize: 13,
                }}
              >
                {tobResult.error}
              </div>
            )}

            {tobResult && !tobResult.error && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  background: "#0d0d0b",
                  border: "1px solid #2a2820",
                  borderRadius: 3,
                  fontSize: 13,
                  color: "#9a9070",
                  lineHeight: 1.6,
                }}
              >
                <div style={{ color: "#c4a84a", marginBottom: 8, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>
                  Scope ready
                </div>
                <div>
                  <strong style={{ color: "#e8e4db" }}>{tobResult.scopeLabel}</strong> —{" "}
                  <strong style={{ color: "#e8e4db" }}>{tobResult.count}</strong> buy/sell transaction
                  {tobResult.count === 1 ? "" : "s"} will be used for TOB.
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#5a5540" }}>
                  Rates and amounts come next; this step only fixes which rows are in scope.
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            style={{
              background: "#1a0a0a",
              border: "1px solid #3a1515",
              borderRadius: 3,
              padding: 16,
              color: "#c46a4a",
              fontSize: 13,
              marginBottom: 24,
              lineHeight: 1.6,
            }}
          >
            {error}
          </div>
        )}

        {parsed && !showTobWizard && (
          <div
            style={{
              border: "1px solid #2a2820",
              borderRadius: 4,
              background: "#111109",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #1e1c14",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: "#5a5540",
                  marginRight: "auto",
                }}
              >
                Parsed transactions
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                }}
                role="group"
                aria-label="Filter by transaction kind"
              >
                {filterButtons.map(({ id, label }) => {
                  const active = viewFilter === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={typeColIndex === -1 && id !== "all"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewFilter(id);
                      }}
                      style={{
                        padding: "8px 16px",
                        border: active ? "1px solid #c4a84a" : "1px solid #2a2820",
                        borderRadius: 3,
                        background: active ? "#1a1a0a" : "transparent",
                        color: active ? "#c4a84a" : "#6a6450",
                        cursor: typeColIndex === -1 && id !== "all" ? "not-allowed" : "pointer",
                        opacity: typeColIndex === -1 && id !== "all" ? 0.45 : 1,
                        fontSize: 11,
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        fontFamily: "Georgia, serif",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {filterNote && (
              <div style={{ padding: "10px 18px", fontSize: 12, color: "#9a7040", borderBottom: "1px solid #1e1c14" }}>
                {filterNote}
              </div>
            )}
            {!filterNote && viewFilter !== "all" && (
              <div style={{ padding: "10px 18px", fontSize: 12, color: "#6a6450", borderBottom: "1px solid #1e1c14" }}>
                Showing {displayEntries.length} of {parsed.rows.length} rows
                {viewFilter === "tob" ? " (buy and sell trades only)" : " (dividends only)"}
              </div>
            )}
            <div style={{ overflowX: "auto", maxHeight: "min(70vh, 640px)", overflowY: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  minWidth: 640,
                }}
              >
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "#14140f", zIndex: 1 }}>
                    {parsed.headers.map((h, hi) => (
                      <th
                        key={`${hi}-${h}`}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          fontWeight: 400,
                          color: "#8a8060",
                          fontSize: 10,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          borderBottom: "1px solid #2a2820",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayEntries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={parsed.headers.length}
                        style={{ padding: "28px 16px", textAlign: "center", color: "#6a6450", fontSize: 13 }}
                      >
                        {viewFilter === "all" ? "No data rows in this file." : "No rows match this filter."}
                      </td>
                    </tr>
                  ) : (
                    displayEntries.map(({ row, sourceIndex }, ri) => (
                      <tr key={`${sourceIndex}-${ri}`} style={{ borderTop: "1px solid #1a1810" }}>
                        {row.map((cell, ci) => {
                            const header = parsed.headers[ci] ?? "";
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
          </div>
        )}
      </main>
    </div>
  );
}
