import { useCallback, useEffect, useRef, useState } from "react";
import { parseRevolutCsv } from "./utils/csvParser.js";
import { findTypeColumnIndex, findDateColumnIndex } from "./logic/transactionFilters.js";
import FileDropZone from "./components/FileDropZone.jsx";
import TransactionsTable from "./components/TransactionsTable.jsx";
import TobWizard from "./components/TobWizard.jsx";
import QuickTob from "./components/QuickTob.jsx";
import AuthBar from "./components/AuthBar.jsx";
import CloudSyncPanel from "./components/CloudSyncPanel.jsx";
import InstrumentList from "./components/InstrumentList.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { db } from "./lib/firebase.js";
import { fetchKnownInstruments, saveInstruments, resolveAndSaveNewTickers, saveManualInstrumentType } from "./lib/firestoreInstruments.js";
import { resolveTickerNames } from "./lib/openFigi.js";
import { saveParsedCsvForUser, loadSavedHistoryParsed } from "./lib/firestoreTransactions.js";
import { loadTobPaidKeys, saveTobPaidKeys } from "./lib/firestoreTobPaid.js";

const TAB = {
  QUICK: "quick",
  UPLOAD: "upload",
  TRANSACTIONS: "transactions",
  TOB: "tob",
  INSTRUMENTS: "instruments",
};

function NavBar({ activeTab, setActiveTab, hasData, tobEligible, rowCount }) {
  const tabs = [
    { id: TAB.QUICK, label: "Quick TOB" },
    { id: TAB.UPLOAD, label: "Upload" },
    { id: TAB.TRANSACTIONS, label: `Transactions${rowCount > 0 ? ` (${rowCount})` : ""}`, disabled: !hasData },
    { id: TAB.TOB, label: "Calculate TOB", disabled: !tobEligible },
    { id: TAB.INSTRUMENTS, label: "Instruments" },
  ];

  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e) => { setIsMobile(e.matches); if (!e.matches) setMenuOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const activeLabel = tabs.find((t) => t.id === activeTab)?.label ?? "";

  if (isMobile) {
    return (
      <nav
        ref={menuRef}
        style={{ width: "100%", borderBottom: "1px solid #3d3a28", background: "#111109", position: "relative" }}
      >
        {/* Hamburger trigger */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: "transparent",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            color: "#c4a84a",
            fontSize: 12,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontFamily: "Georgia, serif",
          }}
        >
          <span>{activeLabel}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4, width: 18 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ display: "block", height: 1, background: menuOpen ? "#c4a84a" : "#8a7a50", transition: "background 0.15s" }} />
            ))}
          </span>
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "#111109",
              border: "1px solid #3d3a28",
              borderTop: "none",
              zIndex: 100,
            }}
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              const disabled = tab.disabled;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => { if (!disabled) { setActiveTab(tab.id); setMenuOpen(false); } }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "15px 20px",
                    background: active ? "#1a180a" : "transparent",
                    border: "none",
                    borderLeft: active ? "3px solid #c4a84a" : "3px solid transparent",
                    borderBottom: "1px solid #2a2818",
                    color: active ? "#c4a84a" : disabled ? "#4a4535" : "#a89870",
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontSize: 12,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    fontFamily: "Georgia, serif",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav
      style={{
        width: "100%",
        borderBottom: "1px solid #3d3a28",
        background: "#111109",
        padding: "0 20px",
        display: "flex",
        gap: 0,
        alignItems: "flex-end",
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        const disabled = tab.disabled;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setActiveTab(tab.id)}
            style={{
              padding: "14px 22px",
              background: "transparent",
              border: "none",
              borderBottom: active ? "2px solid #c4a84a" : "2px solid transparent",
              color: active ? "#c4a84a" : disabled ? "#4a4535" : "#a89870",
              cursor: disabled ? "not-allowed" : "pointer",
              fontSize: 12,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontFamily: "Georgia, serif",
              marginBottom: -1,
              transition: "color 0.15s, border-color 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

export default function App() {
  const { firebaseConfigured, user } = useAuth();
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [viewFilter, setViewFilter] = useState("all");
  const [activeTab, setActiveTab] = useState(TAB.QUICK);
  const [historyParsed, setHistoryParsed] = useState(null);
  const [historyDocCount, setHistoryDocCount] = useState(0);
  const [dataSource, setDataSource] = useState("file");
  const [instrumentNames, setInstrumentNames] = useState(new Map());
  const instrumentCache = useRef(new Map());

  // TOB paid state — persisted to localStorage so it survives page refresh.
  const [tobPaidKeys, setTobPaidKeys] = useState(() => {
    try {
      const raw = localStorage.getItem("tob_paid_v1");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });

  const toggleTobPaid = useCallback((key) => {
    setTobPaidKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("tob_paid_v1", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  /** Reload cloud history into state (used by Quick TOB on mount and after CSV upload). */
  const reloadHistory = useCallback(async () => {
    if (!db || !user) return;
    const merged = await loadSavedHistoryParsed(db, user.uid);
    setHistoryParsed({ headers: merged.headers, rows: merged.rows });
    setHistoryDocCount(merged.docCount);
  }, [user]);

  /** Mark (or unmark) a batch of keys at once without multiple re-renders. */
  const markPaidBatch = useCallback((keys, paid = true) => {
    setTobPaidKeys((prev) => {
      const next = new Set(prev);
      if (paid) keys.forEach((k) => next.add(k));
      else keys.forEach((k) => next.delete(k));
      try { localStorage.setItem("tob_paid_v1", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  /** Update (or clear) a manual instrument type for a ticker, persisting to Firestore. */
  const updateManualType = useCallback((ticker, manualType) => {
    setInstrumentNames((prev) => {
      const next = new Map(prev);
      const existing = next.get(ticker) ?? {};
      if (manualType === null) {
        const { manualType: _removed, ...rest } = existing;
        next.set(ticker, rest);
      } else {
        next.set(ticker, { ...existing, manualType });
      }
      return next;
    });
    // Keep session cache in sync
    const cached = instrumentCache.current.get(ticker) ?? {};
    if (manualType === null) {
      const { manualType: _removed, ...rest } = cached;
      instrumentCache.current.set(ticker, rest);
    } else {
      instrumentCache.current.set(ticker, { ...cached, manualType });
    }
    if (db && user) {
      saveManualInstrumentType(db, user.uid, ticker, manualType).catch(() => {});
    }
  }, [user]);

  // ── Load TOB paid keys from Firestore when the user signs in ──
  // Merges cloud keys with any keys already in localStorage.
  useEffect(() => {
    if (!db || !user) return;
    let cancelled = false;
    loadTobPaidKeys(db, user.uid)
      .then((cloudKeys) => {
        if (cancelled || !cloudKeys.size) return;
        setTobPaidKeys((prev) => {
          const merged = new Set([...prev, ...cloudKeys]);
          try { localStorage.setItem("tob_paid_v1", JSON.stringify([...merged])); } catch {}
          return merged;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  // ── Auto-load cloud history when the user signs in ──
  useEffect(() => {
    if (!db || !user) return;
    reloadHistory().catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-switch to cloud history as the data source when signed in with no CSV ──
  useEffect(() => {
    if (user && historyParsed && !parsed) {
      setDataSource("history");
    }
  }, [user, historyParsed, parsed]);

  // ── Debounce-save tobPaidKeys to Firestore on every change ──
  useEffect(() => {
    if (!db || !user) return;
    const t = setTimeout(() => {
      saveTobPaidKeys(db, user.uid, tobPaidKeys).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [tobPaidKeys, user]);

  // ── Auto-sync CSV to Firestore whenever a new file is parsed ──
  // After saving, also silently refresh historyParsed so Quick TOB is always up to date.
  const [autoSyncMsg, setAutoSyncMsg] = useState(null);
  useEffect(() => {
    if (!db || !user || !parsed || !fileName) return;
    let cancelled = false;
    async function run() {
      try {
        const res = await saveParsedCsvForUser(db, user.uid, parsed, fileName);
        const tickerIdx = parsed.headers.findIndex(
          (h) => h.trim().toLowerCase() === "ticker"
        );
        if (tickerIdx >= 0) {
          const tickers = [
            ...new Set(
              parsed.rows.map((r) => (r[tickerIdx] ?? "").trim()).filter(Boolean)
            ),
          ];
          if (tickers.length) await resolveAndSaveNewTickers(db, user.uid, tickers);
        }
        // Silently refresh history so Quick TOB always sees the latest DB state
        const merged = await loadSavedHistoryParsed(db, user.uid);
        if (!cancelled) {
          setHistoryParsed({ headers: merged.headers, rows: merged.rows });
          setHistoryDocCount(merged.docCount);
          const msg =
            res.added > 0
              ? `☁  ${res.added} new row${res.added === 1 ? "" : "s"} synced to cloud`
              : `☁  Already up to date — no new rows`;
          setAutoSyncMsg(msg);
          setTimeout(() => { if (!cancelled) setAutoSyncMsg(null); }, 4000);
        }
      } catch {
        // silent — user can still manually save from the Upload tab
      }
    }
    run();
    return () => { cancelled = true; };
  }, [parsed, fileName, user]);

  const displayParsed = dataSource === "history" && historyParsed ? historyParsed : parsed;
  const typeColIndex = displayParsed ? findTypeColumnIndex(displayParsed.headers) : -1;
  const dateColIndex = displayParsed ? findDateColumnIndex(displayParsed.headers) : -1;
  const tobEligible = Boolean(displayParsed && typeColIndex >= 0);
  const rowCount = displayParsed?.rows?.length ?? 0;

  const loadText = useCallback((name, text) => {
    try {
      setParsed(parseRevolutCsv(text));
      setFileName(name);
      setError(null);
      setViewFilter("all");
      setDataSource("file");
      // Stay on Quick TOB if that's where we are; otherwise go to Transactions
      setActiveTab((prev) => prev === TAB.QUICK ? TAB.QUICK : TAB.TRANSACTIONS);
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
    setError(null);
    setActiveTab(TAB.TRANSACTIONS);
  }, []);

  useEffect(() => {
    if (!displayParsed) return;
    if (dateColIndex < 0 && activeTab === TAB.TOB) setActiveTab(TAB.TRANSACTIONS);
  }, [displayParsed, dateColIndex, activeTab]);

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
      const fromCache = new Map(
        tickers.filter((t) => cache.has(t)).map((t) => [t, cache.get(t)])
      );
      const afterCache = tickers.filter((t) => !fromCache.has(t));
      const fromDb = db && user && afterCache.length
        ? await fetchKnownInstruments(db, user.uid, afterCache)
        : new Map();
      fromDb.forEach((v, k) => cache.set(k, v));
      const afterDb = afterCache.filter((t) => !fromDb.has(t));
      const fresh = afterDb.length ? await resolveTickerNames(afterDb) : new Map();
      if (fresh.size) {
        fresh.forEach((v, k) => cache.set(k, v));
        if (db && user) saveInstruments(db, user.uid, fresh);
      }
      if (!cancelled) {
        setInstrumentNames(new Map([...fromCache, ...fromDb, ...fresh]));
      }

      // ── Background re-resolution for manually-typed tickers ──
      // If a DB entry carries a manualType flag it was set as a fallback because
      // OpenFIGI couldn't classify it at the time. Silently retry now; if OpenFIGI
      // succeeds, the fresh data is saved (clearing manualType) and state is updated.
      const manualTickers = [...fromDb.entries()]
        .filter(([, info]) => info.manualType)
        .map(([ticker]) => ticker);

      if (manualTickers.length) {
        resolveTickerNames(manualTickers)
          .then((reclassified) => {
            if (!reclassified.size || cancelled) return;
            reclassified.forEach((v, k) => cache.set(k, v));
            if (db && user) saveInstruments(db, user.uid, reclassified);
            if (!cancelled) {
              setInstrumentNames((prev) => {
                const next = new Map(prev);
                reclassified.forEach((v, k) => next.set(k, v));
                return next;
              });
            }
          })
          .catch(() => {});
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
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowX: "hidden",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          width: "100%",
          borderBottom: "none",
          padding: "18px 20px 14px",
          background: "linear-gradient(180deg,#111108,#0e0e0c)",
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#c4a84a",
              fontStyle: "italic",
            }}
          >
            Belgian Tax Calc
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 400, margin: 0, color: "#f0ead8" }}>
            Investment Tax Agent
          </h1>
        </div>
        <AuthBar />
      </header>

      {/* ── Nav tabs ── */}
      <NavBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasData={Boolean(displayParsed) || Boolean(historyParsed)}
        tobEligible={tobEligible}
        rowCount={rowCount}
      />

      {/* ── Auto-sync status banner ── */}
      {autoSyncMsg && (
        <div
          style={{
            width: "100%",
            padding: "7px 20px",
            background: "#0e1a0e",
            borderBottom: "1px solid #1e3a1e",
            fontSize: 11,
            color: "#72c472",
            letterSpacing: 0.5,
          }}
        >
          {autoSyncMsg}
        </div>
      )}

      {/* ── Main content ── */}
      <main style={{ width: "100%", maxWidth: 1100, padding: "28px 16px", boxSizing: "border-box" }}>

        {/* Error banner — always visible regardless of tab */}
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

        {/* ═══ QUICK TOB tab ═══ */}
        {activeTab === TAB.QUICK && (
          <QuickTob
            parsed={parsed}
            fileName={fileName}
            onFile={onFile}
            user={user}
            historyParsed={historyParsed}
            reloadHistory={reloadHistory}
            instrumentNames={instrumentNames}
            tobPaidKeys={tobPaidKeys}
            toggleTobPaid={toggleTobPaid}
            markPaidBatch={markPaidBatch}
            updateManualType={updateManualType}
          />
        )}

        {/* ═══ UPLOAD tab ═══ */}
        {activeTab === TAB.UPLOAD && (
          <div>
            <p style={{ color: "#c0b890", fontSize: 14, lineHeight: 1.7, margin: "0 0 24px" }}>
              Load your Revolut trading statement CSV. Parsing runs entirely in your browser.
              Optionally sign in to persist and merge rows in your own Firebase database.
            </p>
            <FileDropZone parsed={parsed} fileName={fileName} onFile={onFile} />
            {firebaseConfigured && (
              <CloudSyncPanel
                parsed={parsed}
                fileName={fileName}
                onHistoryLoaded={onHistoryLoaded}
                historyParsed={historyParsed}
              />
            )}
          </div>
        )}

        {/* ═══ TRANSACTIONS tab ═══ */}
        {activeTab === TAB.TRANSACTIONS && !displayParsed && historyParsed && (
          <p style={{ color: "#8a8268", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            Loading transactions…
          </p>
        )}
        {activeTab === TAB.TRANSACTIONS && displayParsed && (
          <div>
            {showDataToggle && (
              <div style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#8a8268" }}>Viewing:</span>
                <button
                  type="button"
                  disabled={!parsed}
                  onClick={() => setDataSource("file")}
                  style={{
                    padding: "7px 14px",
                    border: dataSource === "file" ? "1px solid #c4a84a" : "1px solid #3d3a28",
                    borderRadius: 3,
                    background: dataSource === "file" ? "#1a1a0a" : "transparent",
                    color: dataSource === "file" ? "#c4a84a" : "#a89870",
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
                    padding: "7px 14px",
                    border: dataSource === "history" ? "1px solid #c4a84a" : "1px solid #3d3a28",
                    borderRadius: 3,
                    background: dataSource === "history" ? "#1a1a0a" : "transparent",
                    color: dataSource === "history" ? "#c4a84a" : "#a89870",
                    cursor: historyParsed ? "pointer" : "not-allowed",
                    fontSize: 11,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    fontFamily: "Georgia, serif",
                  }}
                >
                  Cloud history{historyParsed ? ` (${historyDocCount})` : ""}
                </button>
              </div>
            )}
            <TransactionsTable
              parsed={displayParsed}
              typeColIndex={typeColIndex}
              viewFilter={viewFilter}
              setViewFilter={setViewFilter}
              instrumentNames={instrumentNames}
              tobPaidKeys={tobPaidKeys}
              toggleTobPaid={toggleTobPaid}
              updateManualType={updateManualType}
            />
          </div>
        )}

        {/* ═══ TOB tab ═══ */}
        {activeTab === TAB.TOB && tobEligible && (
          <TobWizard
            parsed={displayParsed}
            typeColIndex={typeColIndex}
            dateColIndex={dateColIndex}
            instrumentNames={instrumentNames}
            tobPaidKeys={tobPaidKeys}
            toggleTobPaid={toggleTobPaid}
            updateManualType={updateManualType}
          />
        )}

        {activeTab === TAB.TOB && !tobEligible && (
          <div style={{ color: "#8a8268", fontSize: 14, paddingTop: 8 }}>
            Load a CSV with a Type column containing buy/sell rows first.
          </div>
        )}

        {/* ═══ INSTRUMENTS tab ═══ */}
        {activeTab === TAB.INSTRUMENTS && (
          <InstrumentList
            updateManualType={updateManualType}
            instrumentNames={instrumentNames}
          />
        )}
      </main>
    </div>
  );
}
