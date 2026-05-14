import { useCallback, useEffect, useRef, useState } from "react";
import { parseRevolutCsv } from "./utils/csvParser.js";
import { findTypeColumnIndex, findDateColumnIndex } from "./logic/transactionFilters.js";
import FileDropZone from "./components/FileDropZone.jsx";
import TransactionsTable from "./components/TransactionsTable.jsx";
import TobWizard from "./components/TobWizard.jsx";
import AuthBar from "./components/AuthBar.jsx";
import CloudSyncPanel from "./components/CloudSyncPanel.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { db } from "./lib/firebase.js";
import { fetchKnownInstruments, saveInstruments } from "./lib/firestoreInstruments.js";
import { resolveTickerNames } from "./lib/openFigi.js";

export default function App() {
  const { firebaseConfigured, user } = useAuth();
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [viewFilter, setViewFilter] = useState("all");
  const [showTobWizard, setShowTobWizard] = useState(false);
  const [historyParsed, setHistoryParsed] = useState(null);
  const [historyDocCount, setHistoryDocCount] = useState(0);
  const [dataSource, setDataSource] = useState("file");
  const [instrumentNames, setInstrumentNames] = useState(new Map());
  // Session-level cache: persists across CSV/history switches so we never
  // call OpenFIGI twice for the same ticker within one browser session.
  const instrumentCache = useRef(new Map());

  const displayParsed = dataSource === "history" && historyParsed ? historyParsed : parsed;
  const typeColIndex = displayParsed ? findTypeColumnIndex(displayParsed.headers) : -1;
  const dateColIndex = displayParsed ? findDateColumnIndex(displayParsed.headers) : -1;
  const tobEligible = Boolean(displayParsed && typeColIndex >= 0);

  const loadText = useCallback((name, text) => {
    try {
      setParsed(parseRevolutCsv(text));
      setFileName(name);
      setError(null);
      setViewFilter("all");
      setShowTobWizard(false);
      setDataSource("file");
      setHistoryParsed(null);
      setHistoryDocCount(0);
    } catch (e) {
      setParsed(null);
      setError(e instanceof Error ? e.message : String(e));
    }
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
      reader.onload = () => loadText(file.name, String(reader.result ?? ""));
      reader.onerror = () => {
        setParsed(null);
        setError("Could not read the file.");
      };
      reader.readAsText(file, "UTF-8");
    },
    [loadText]
  );

  const onHistoryLoaded = useCallback((merged) => {
    const { headers, rows, docCount } = merged;
    setHistoryParsed({ headers, rows });
    setHistoryDocCount(docCount);
    setDataSource("history");
    setViewFilter("all");
    setShowTobWizard(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!displayParsed) return;
    if (dateColIndex < 0 && showTobWizard) setShowTobWizard(false);
  }, [displayParsed, dateColIndex, showTobWizard]);

  useEffect(() => {
    if (!displayParsed) {
      setInstrumentNames(new Map());
      return;
    }
    const tickerIdx = displayParsed.headers.findIndex(
      (h) => h.trim().toLowerCase() === "ticker"
    );
    if (tickerIdx === -1) {
      setInstrumentNames(new Map());
      return;
    }
    const tickers = [
      ...new Set(
        displayParsed.rows
          .map((row) => (row[tickerIdx] ?? "").trim())
          .filter(Boolean)
      ),
    ];
    if (!tickers.length) {
      setInstrumentNames(new Map());
      return;
    }

    let cancelled = false;
    async function load() {
      const cache = instrumentCache.current;

      // 1. What's already in the session cache?
      const fromCache = new Map(
        tickers.filter((t) => cache.has(t)).map((t) => [t, cache.get(t)])
      );
      const afterCache = tickers.filter((t) => !fromCache.has(t));

      // 2. For the rest, check Firestore (when signed in)
      const fromDb = db && user && afterCache.length
        ? await fetchKnownInstruments(db, user.uid, afterCache)
        : new Map();
      fromDb.forEach((v, k) => cache.set(k, v));
      const afterDb = afterCache.filter((t) => !fromDb.has(t));

      // 3. Only call OpenFIGI for what's still unknown
      const fresh = afterDb.length
        ? await resolveTickerNames(afterDb)
        : new Map();

      // 4. Persist fresh resolutions to Firestore and session cache
      if (fresh.size) {
        fresh.forEach((v, k) => cache.set(k, v));
        if (db && user) saveInstruments(db, user.uid, fresh);
      }

      if (!cancelled) {
        setInstrumentNames(new Map([...fromCache, ...fromDb, ...fresh]));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [displayParsed, user]);

  const showDataToggle = Boolean(user && (parsed || historyParsed));

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
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#c4a84a",
              marginBottom: 6,
              fontStyle: "italic",
            }}
          >
            Belgian Tax Calc
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 400, margin: 0, color: "#f0ead8" }}>
            Investment Tax Agent
          </h1>
        </div>
        <AuthBar />
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <p style={{ color: "#9a9070", fontSize: 14, lineHeight: 1.7, margin: "0 0 24px" }}>
          Step 1 — Load your Revolut trading statement CSV. Parsing runs in your browser. Optional: sign in to
          persist rows in your own Firebase database (deduplicated).
        </p>

        <FileDropZone parsed={parsed} fileName={fileName} onFile={onFile} />

        {firebaseConfigured && <CloudSyncPanel parsed={parsed} fileName={fileName} onHistoryLoaded={onHistoryLoaded} historyParsed={historyParsed} />}

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

        {showDataToggle && (
          <div
            style={{
              marginBottom: 20,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, color: "#6a6450" }}>Data source:</span>
            <button
              type="button"
              disabled={!parsed}
              onClick={() => setDataSource("file")}
              style={{
                padding: "8px 16px",
                border: dataSource === "file" ? "1px solid #c4a84a" : "1px solid #2a2820",
                borderRadius: 3,
                background: dataSource === "file" ? "#1a1a0a" : "transparent",
                color: dataSource === "file" ? "#c4a84a" : "#6a6450",
                cursor: parsed ? "pointer" : "not-allowed",
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontFamily: "Georgia, serif",
              }}
            >
              Current CSV
            </button>
            <button
              type="button"
              disabled={!historyParsed}
              onClick={() => setDataSource("history")}
              style={{
                padding: "8px 16px",
                border: dataSource === "history" ? "1px solid #c4a84a" : "1px solid #2a2820",
                borderRadius: 3,
                background: dataSource === "history" ? "#1a1a0a" : "transparent",
                color: dataSource === "history" ? "#c4a84a" : "#6a6450",
                cursor: historyParsed ? "pointer" : "not-allowed",
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontFamily: "Georgia, serif",
              }}
            >
              Saved history{historyParsed ? ` (${historyDocCount})` : ""}
            </button>
            {dataSource === "history" && !historyParsed && (
              <span style={{ fontSize: 12, color: "#6a6450" }}>Use “Load full history from cloud” first.</span>
            )}
          </div>
        )}

        {displayParsed && (
          <div style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTobWizard((v) => !v);
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

        {showTobWizard && tobEligible && (
          <TobWizard parsed={displayParsed} typeColIndex={typeColIndex} dateColIndex={dateColIndex} />
        )}

        {displayParsed && !showTobWizard && (
          <TransactionsTable
            parsed={displayParsed}
            typeColIndex={typeColIndex}
            viewFilter={viewFilter}
            setViewFilter={setViewFilter}
            instrumentNames={instrumentNames}
          />
        )}
      </main>
    </div>
  );
}
