import { useCallback, useEffect, useRef, useState } from "react";
import { parseRevolutCsv } from "./utils/csvParser.js";
import { findTypeColumnIndex, findDateColumnIndex } from "./logic/transactionFilters.js";
import FileDropZone from "./components/FileDropZone.jsx";
import TransactionsTable from "./components/TransactionsTable.jsx";
import TobWizard from "./components/TobWizard.jsx";
import QuickTob from "./components/QuickTob.jsx";
import CloudSyncPanel from "./components/CloudSyncPanel.jsx";
import InstrumentList from "./components/InstrumentList.jsx";
import TobGuide from "./components/TobGuide.jsx";
import Overview from "./components/Overview.jsx";
import SettingsPage from "./components/SettingsPage.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { db } from "./lib/firebase.js";
import { fetchKnownInstruments, saveInstruments, resolveAndSaveNewTickers, saveManualInstrumentType } from "./lib/firestoreInstruments.js";
import { resolveTickerNames } from "./lib/openFigi.js";
import { saveParsedCsvForUser, loadSavedHistoryParsed } from "./lib/firestoreTransactions.js";
import { loadTobPaidKeys, saveTobPaidKeys } from "./lib/firestoreTobPaid.js";

const TAB = {
  QUICK: "quick",
  UPLOAD: "upload",
  OVERVIEW: "overview",
  TRANSACTIONS: "transactions",
  TOB: "tob",
  INSTRUMENTS: "instruments",
  GUIDE: "guide",
  SETTINGS: "settings",
};

const HIDEABLE_TABS = [
  { id: "transactions", label: "Transactions" },
  { id: "tob",         label: "Calculate TOB" },
  { id: "instruments", label: "Instruments" },
  { id: "guide",       label: "Guide" },
];

function userInitial(user) {
  const name = user?.displayName || user?.email || "";
  return name.charAt(0).toUpperCase() || "?";
}

function TopBar({ activeTab, setActiveTab, hasData, tobEligible, rowCount, hiddenTabs }) {
  const { firebaseConfigured, user, authLoading, authError, setAuthError, signInWithGoogle, signOutUser } = useAuth();

  const allTabs = [
    { id: TAB.QUICK, label: "Quick TOB" },
    { id: TAB.UPLOAD, label: "Upload" },
    { id: TAB.OVERVIEW, label: "Overview" },
    { id: TAB.TRANSACTIONS, label: `Transactions${rowCount > 0 ? ` (${rowCount})` : ""}`, disabled: !hasData },
    { id: TAB.TOB, label: "Calculate TOB", disabled: !tobEligible },
    { id: TAB.INSTRUMENTS, label: "Instruments" },
    { id: TAB.GUIDE, label: "Guide" },
  ];
  const tabs = allTabs.filter((t) => !hiddenTabs.has(t.id));

  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const barRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e) => { setIsMobile(e.matches); if (!e.matches) setMenuOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!menuOpen && !userMenuOpen) return;
    const handler = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) {
        setMenuOpen(false);
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen, userMenuOpen]);

  const headerStyle = {
    width: "100%", height: 52, boxSizing: "border-box", flexShrink: 0,
    background: "rgba(9,9,11,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    display: "flex", alignItems: "center",
    position: "sticky", top: 0, zIndex: 50,
  };

  const glassPanel = {
    position: "absolute", zIndex: 200,
    background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
    paddingTop: 4, paddingBottom: 4,
  };

  const sep = <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />;

  const logo = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 20, paddingRight: 16, flexShrink: 0 }}>
      <div style={{ width: 6, height: 26, borderRadius: 3, background: "linear-gradient(180deg, #fbbf24 0%, #f59e0b 60%, #d97706 100%)" }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: "#fafafa", letterSpacing: -0.2, whiteSpace: "nowrap" }}>Belgian Tax Calc</span>
    </div>
  );

  const settingsBtn = (close) => (
    <button type="button"
      onClick={() => { setActiveTab(TAB.SETTINGS); close(); }}
      style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "11px 16px", background: activeTab === TAB.SETTINGS ? "rgba(245,158,11,0.08)" : "transparent", border: "none", cursor: "pointer", color: activeTab === TAB.SETTINGS ? "#f59e0b" : "#a1a1aa", fontSize: 13, textAlign: "left" }}>
      <span style={{ fontSize: 13, lineHeight: 1 }}>⚙</span>
      Settings
    </button>
  );

  const authItems = !firebaseConfigured ? null : authLoading ? (
    <div style={{ padding: "12px 16px", fontSize: 12, color: "#52525b" }}>Checking session…</div>
  ) : user ? (
    <>
      <div style={{ padding: "10px 16px 6px", fontSize: 11, color: "#52525b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {user.displayName || user.email}
      </div>
      <button type="button"
        onClick={() => { signOutUser().catch((e) => setAuthError(e)); setMenuOpen(false); setUserMenuOpen(false); }}
        style={{ display: "block", width: "100%", padding: "9px 16px 11px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontSize: 13, color: "#a1a1aa" }}>
        Sign out
      </button>
    </>
  ) : (
    <>
      <button type="button"
        onClick={() => { signInWithGoogle().catch((e) => setAuthError(e)); setMenuOpen(false); }}
        style={{ display: "block", width: "100%", padding: "9px 16px 11px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontSize: 13, color: "#f59e0b", fontWeight: 500 }}>
        Sign in with Google
      </button>
      {authError && <div style={{ padding: "0 16px 10px", fontSize: 11, color: "#f87171" }}>{authError.message || String(authError)}</div>}
    </>
  );

  if (isMobile) {
    return (
      <header ref={barRef} style={headerStyle}>
        {logo}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setMenuOpen((v) => !v)}
          style={{ width: 52, height: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ display: "block", width: 18, height: 1.5, borderRadius: 1, background: menuOpen ? "#f59e0b" : "#52525b", transition: "background 0.15s" }} />
          ))}
        </button>
        {menuOpen && (
          <div style={{ ...glassPanel, top: 52, left: 0, right: 0, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none", minWidth: "unset" }}>
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} type="button" disabled={tab.disabled}
                  onClick={() => { if (!tab.disabled) { setActiveTab(tab.id); setMenuOpen(false); } }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "13px 20px", background: active ? "rgba(245,158,11,0.08)" : "transparent", border: "none", borderLeft: `2px solid ${active ? "#f59e0b" : "transparent"}`, borderBottom: "1px solid rgba(255,255,255,0.04)", color: active ? "#f59e0b" : tab.disabled ? "#3f3f46" : "#a1a1aa", cursor: tab.disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: active ? 500 : 400 }}>
                  {tab.label}
                </button>
              );
            })}
            {sep}
            {settingsBtn(() => setMenuOpen(false))}
            {authItems && <>{sep}{authItems}</>}
          </div>
        )}
      </header>
    );
  }

  // Desktop: logo | tabs (flex) | user avatar
  return (
    <header ref={barRef} style={headerStyle}>
      {logo}
      <nav style={{ flex: 1, display: "flex", alignItems: "stretch", height: "100%", overflowX: "auto", overflowY: "hidden", minWidth: 0 }}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" disabled={tab.disabled}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              style={{ padding: "0 18px", height: "100%", background: "transparent", border: "none", borderBottom: `2px solid ${active ? "#f59e0b" : "transparent"}`, color: active ? "#f59e0b" : tab.disabled ? "#3f3f46" : "#71717a", cursor: tab.disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: active ? 500 : 400, whiteSpace: "nowrap", transition: "color 0.15s, border-color 0.15s", marginBottom: -1 }}>
              {tab.label}
            </button>
          );
        })}
      </nav>
      {/* User / auth */}
      <div style={{ position: "relative", padding: "0 16px", flexShrink: 0 }}>
        {!firebaseConfigured ? null : authLoading ? (
          <div style={{ fontSize: 12, color: "#52525b" }}>…</div>
        ) : user ? (
          <>
            <button type="button" title={user.displayName || user.email} onClick={() => setUserMenuOpen((v) => !v)}
              style={{ width: 32, height: 32, borderRadius: "50%", border: `1px solid ${userMenuOpen ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.1)"}`, background: userMenuOpen ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.08)", color: "#f59e0b", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
              {userInitial(user)}
            </button>
            {userMenuOpen && (
              <div style={{ ...glassPanel, top: "calc(100% + 8px)", right: 0, borderRadius: 10, minWidth: 220 }}>
                <div style={{ padding: "10px 16px 8px", fontSize: 11, color: "#52525b", borderBottom: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
                  {user.displayName || user.email}
                </div>
                {settingsBtn(() => setUserMenuOpen(false))}
                {sep}
                <button type="button" onClick={() => { signOutUser().catch((e) => setAuthError(e)); setUserMenuOpen(false); }}
                  style={{ display: "block", width: "100%", padding: "9px 16px 11px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontSize: 13, color: "#a1a1aa" }}>
                  Sign out
                </button>
              </div>
            )}
          </>
        ) : (
          <button type="button" onClick={() => signInWithGoogle().catch((e) => setAuthError(e))}
            style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer", border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontWeight: 500, whiteSpace: "nowrap" }}>
            Sign in
          </button>
        )}
      </div>
    </header>
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

  const [hiddenTabs, setHiddenTabs] = useState(() => {
    try {
      const raw = localStorage.getItem("nav_hidden_tabs_v1");
      return new Set(raw ? JSON.parse(raw) : ["tob", "instruments"]);
    } catch {
      return new Set(["tob", "instruments"]);
    }
  });
  useEffect(() => {
    if (hiddenTabs.has(activeTab)) setActiveTab(TAB.QUICK);
  }, [hiddenTabs]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleHiddenTab = useCallback((tabId) => {
    setHiddenTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      try { localStorage.setItem("nav_hidden_tabs_v1", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

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

  const reloadHistory = useCallback(async () => {
    if (!db || !user) return;
    const merged = await loadSavedHistoryParsed(db, user.uid);
    setHistoryParsed({ headers: merged.headers, rows: merged.rows });
    setHistoryDocCount(merged.docCount);
  }, [user]);

  const markPaidBatch = useCallback((keys, paid = true) => {
    setTobPaidKeys((prev) => {
      const next = new Set(prev);
      if (paid) keys.forEach((k) => next.add(k));
      else keys.forEach((k) => next.delete(k));
      try { localStorage.setItem("tob_paid_v1", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

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

  useEffect(() => {
    if (!db || !user) return;
    reloadHistory().catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && historyParsed && !parsed) {
      setDataSource("history");
    }
  }, [user, historyParsed, parsed]);

  useEffect(() => {
    if (!db || !user) return;
    const t = setTimeout(() => {
      saveTobPaidKeys(db, user.uid, tobPaidKeys).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [tobPaidKeys, user]);

  const [autoSyncMsg, setAutoSyncMsg] = useState(null);
  useEffect(() => {
    if (!db || !user || !parsed || !fileName) return;
    let cancelled = false;
    async function run() {
      try {
        const res = await saveParsedCsvForUser(db, user.uid, parsed, fileName);
        const tickerIdx = parsed.headers.findIndex((h) => h.trim().toLowerCase() === "ticker");
        if (tickerIdx >= 0) {
          const tickers = [...new Set(parsed.rows.map((r) => (r[tickerIdx] ?? "").trim()).filter(Boolean))];
          if (tickers.length) await resolveAndSaveNewTickers(db, user.uid, tickers);
        }
        const merged = await loadSavedHistoryParsed(db, user.uid);
        if (!cancelled) {
          setHistoryParsed({ headers: merged.headers, rows: merged.rows });
          setHistoryDocCount(merged.docCount);
          const msg = res.added > 0
            ? `☁  ${res.added} new row${res.added === 1 ? "" : "s"} synced to cloud`
            : `☁  Already up to date — no new rows`;
          setAutoSyncMsg(msg);
          setTimeout(() => { if (!cancelled) setAutoSyncMsg(null); }, 4000);
        }
      } catch { /* silent */ }
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
      setActiveTab((prev) => prev === TAB.QUICK ? TAB.QUICK : TAB.TRANSACTIONS);
    } catch (e) {
      setParsed(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a .csv file (Revolut trading export).");
      setParsed(null);
      setFileName(file.name);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => loadText(file.name, String(reader.result ?? ""));
    reader.onerror = () => { setParsed(null); setError("Could not read the file."); };
    reader.readAsText(file, "UTF-8");
  }, [loadText]);

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
    if (!displayParsed) { setInstrumentNames(new Map()); return; }
    const tickerIdx = displayParsed.headers.findIndex((h) => h.trim().toLowerCase() === "ticker");
    if (tickerIdx === -1) { setInstrumentNames(new Map()); return; }
    const tickers = [...new Set(displayParsed.rows.map((row) => (row[tickerIdx] ?? "").trim()).filter(Boolean))];
    if (!tickers.length) { setInstrumentNames(new Map()); return; }

    let cancelled = false;
    async function load() {
      const cache = instrumentCache.current;
      const loggedIn = Boolean(db && user);
      const fromCache = loggedIn
        ? new Map()
        : new Map(tickers.filter((t) => cache.has(t)).map((t) => [t, cache.get(t)]));
      const afterCache = loggedIn ? tickers : tickers.filter((t) => !fromCache.has(t));
      const fromDb = loggedIn && afterCache.length ? await fetchKnownInstruments(db, user.uid, afterCache) : new Map();
      fromDb.forEach((v, k) => cache.set(k, v));
      const afterDb = afterCache.filter((t) => !fromDb.has(t));
      const fresh = afterDb.length ? await resolveTickerNames(afterDb) : new Map();
      if (fresh.size) {
        fresh.forEach((v, k) => cache.set(k, v));
        if (loggedIn) saveInstruments(db, user.uid, fresh);
      }
      if (!cancelled) {
        const allTickers = new Map(tickers.map((t) => [t, {}]));
        fromCache.forEach((v, k) => allTickers.set(k, v));
        fromDb.forEach((v, k) => allTickers.set(k, v));
        fresh.forEach((v, k) => allTickers.set(k, v));
        setInstrumentNames(allTickers);
      }
      const manualTickers = [...fromDb.entries()].filter(([, info]) => info.manualType).map(([ticker]) => ticker);
      const stubTickers = afterDb.filter((t) => !fresh.has(t));
      const retryTickers = [...new Set([...manualTickers, ...stubTickers])];
      if (retryTickers.length) {
        resolveTickerNames(retryTickers)
          .then((reclassified) => {
            if (!reclassified.size || cancelled) return;
            reclassified.forEach((v, k) => cache.set(k, v));
            if (loggedIn) saveInstruments(db, user.uid, reclassified);
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
    <div style={{ minHeight: "100vh", background: "#09090b", color: "#fafafa", display: "flex", flexDirection: "column", alignItems: "center", overflowX: "hidden" }}>

      {/* ── Top bar: logo + nav + auth in one ── */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasData={Boolean(displayParsed) || Boolean(historyParsed)}
        tobEligible={tobEligible}
        rowCount={rowCount}
        hiddenTabs={hiddenTabs}
      />

      {/* ── Auto-sync toast ── */}
      {autoSyncMsg && (
        <div style={{
          width: "100%", padding: "6px 20px",
          background: "rgba(34,197,94,0.08)", borderBottom: "1px solid rgba(34,197,94,0.18)",
          fontSize: 12, color: "#22c55e",
        }}>
          {autoSyncMsg}
        </div>
      )}

      {/* ── Main content ── */}
      <main style={{ width: "100%", maxWidth: 1100, padding: "28px 16px", boxSizing: "border-box" }}>

        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 8, padding: 16, color: "#f87171", fontSize: 13,
            marginBottom: 24, lineHeight: 1.6,
          }}>
            {error}
          </div>
        )}

        {activeTab === TAB.QUICK && (
          <QuickTob
            parsed={parsed} fileName={fileName} onFile={onFile}
            user={user} historyParsed={historyParsed} reloadHistory={reloadHistory}
            instrumentNames={instrumentNames} tobPaidKeys={tobPaidKeys}
            toggleTobPaid={toggleTobPaid} markPaidBatch={markPaidBatch}
            updateManualType={updateManualType}
          />
        )}

        {activeTab === TAB.UPLOAD && (
          <div>
            {/* ── Get CSV from Revolut ── */}
            {(() => {
              const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
              const btnHref = isMobile ? "revolut://" : "https://app.revolut.com/invest";
              const btnLabel = isMobile ? "↗ Open Revolut App" : "↗ Open Revolut Invest";
              return (
                <div style={{ marginBottom: 28, padding: "18px 20px", background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#52525b", marginBottom: 14 }}>
                    Step 1 — Download your CSV from Revolut
                  </div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                      <a
                        href={btnHref}
                        {...(!isMobile && { target: "_blank", rel: "noopener noreferrer" })}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "12px 20px",
                          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 4,
                          color: "#f59e0b", fontSize: 12, letterSpacing: 1, textDecoration: "none",
                          fontFamily: "inherit", textTransform: "uppercase",
                        }}
                      >
                        {btnLabel}
                      </a>
                      {isMobile && (
                        <a
                          href="https://app.revolut.com/invest"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11, color: "#52525b", textDecoration: "none", textAlign: "center" }}
                        >
                          App not opening? Use web version
                        </a>
                      )}
                    </div>
                    <ol style={{ margin: 0, padding: "0 0 0 18px", color: "#71717a", fontSize: 13, lineHeight: 2 }}>
                      <li>Click <strong style={{ color: "#e4e4e7" }}>More</strong> (bottom right)</li>
                      <li>Go to <strong style={{ color: "#e4e4e7" }}>Documents</strong></li>
                      <li>Select <strong style={{ color: "#e4e4e7" }}>Stocks</strong> → <strong style={{ color: "#e4e4e7" }}>Account statement</strong></li>
                      <li>Choose your date range and download the <strong style={{ color: "#e4e4e7" }}>CSV</strong></li>
                    </ol>
                  </div>
                </div>
              );
            })()}

            {/* ── Drop zone ── */}
            <div style={{ marginBottom: 8, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#52525b" }}>
              Step 2 — Drop the CSV here
            </div>
            <FileDropZone parsed={parsed} fileName={fileName} onFile={onFile} />
            {firebaseConfigured && (
              <CloudSyncPanel
                parsed={parsed} fileName={fileName}
                onHistoryLoaded={onHistoryLoaded} historyParsed={historyParsed}
              />
            )}
          </div>
        )}

        {activeTab === TAB.OVERVIEW && (
          <Overview displayParsed={displayParsed} instrumentNames={instrumentNames} tobPaidKeys={tobPaidKeys} />
        )}

        {activeTab === TAB.TRANSACTIONS && !displayParsed && historyParsed && (
          <p style={{ color: "#71717a", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            Loading transactions…
          </p>
        )}
        {activeTab === TAB.TRANSACTIONS && displayParsed && (
          <div>
            {showDataToggle && (
              <div style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#71717a" }}>Viewing:</span>
                {[
                  { key: "file", label: "Current CSV", enabled: Boolean(parsed) },
                  { key: "history", label: `Cloud history${historyParsed ? ` (${historyDocCount})` : ""}`, enabled: Boolean(historyParsed) },
                ].map(({ key, label, enabled }) => {
                  const active = dataSource === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!enabled}
                      onClick={() => enabled && setDataSource(key)}
                      style={{
                        padding: "5px 12px", borderRadius: 20,
                        border: `1px solid ${active ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.08)"}`,
                        background: active ? "rgba(245,158,11,0.1)" : "transparent",
                        color: active ? "#f59e0b" : enabled ? "#a1a1aa" : "#3f3f46",
                        cursor: enabled ? "pointer" : "not-allowed",
                        fontSize: 12, fontWeight: active ? 500 : 400,
                        transition: "all 0.15s",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            <TransactionsTable
              parsed={displayParsed} typeColIndex={typeColIndex}
              viewFilter={viewFilter} setViewFilter={setViewFilter}
              instrumentNames={instrumentNames} tobPaidKeys={tobPaidKeys}
              toggleTobPaid={toggleTobPaid} updateManualType={updateManualType}
            />
          </div>
        )}

        {activeTab === TAB.TOB && tobEligible && (
          <TobWizard
            parsed={displayParsed} typeColIndex={typeColIndex} dateColIndex={dateColIndex}
            instrumentNames={instrumentNames} tobPaidKeys={tobPaidKeys}
            toggleTobPaid={toggleTobPaid} updateManualType={updateManualType}
          />
        )}

        {activeTab === TAB.TOB && !tobEligible && (
          <div style={{ color: "#71717a", fontSize: 14, paddingTop: 8 }}>
            Load a CSV with a Type column containing buy/sell rows first.
          </div>
        )}

        {activeTab === TAB.INSTRUMENTS && (
          <InstrumentList updateManualType={updateManualType} instrumentNames={instrumentNames} />
        )}

        {activeTab === TAB.GUIDE && <TobGuide />}

        {activeTab === TAB.SETTINGS && (
          <SettingsPage hiddenTabs={hiddenTabs} toggleHiddenTab={toggleHiddenTab} />
        )}
      </main>
    </div>
  );
}
