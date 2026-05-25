import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { saveParsedCsvForUser, loadSavedHistoryParsed } from "../lib/firestoreTransactions.js";
import { resolveAndSaveNewTickers } from "../lib/firestoreInstruments.js";

export default function CloudSyncPanel({ parsed, fileName, onHistoryLoaded, historyParsed }) {
  const { firebaseConfigured, user } = useAuth();
  const [saveMsg, setSaveMsg] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [loadBusy, setLoadBusy] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState(null);

  const onSave = useCallback(async () => {
    if (!db || !user || !parsed) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const res = await saveParsedCsvForUser(db, user.uid, parsed, fileName ?? "");

      const tickerColIdx = parsed.headers.findIndex(
        (h) => h.trim().toLowerCase() === "ticker"
      );
      let resolvedCount = 0;
      if (tickerColIdx !== -1) {
        const tickers = parsed.rows
          .map((row) => (row[tickerColIdx] ?? "").trim())
          .filter(Boolean);
        const { resolved } = await resolveAndSaveNewTickers(db, user.uid, tickers);
        resolvedCount = resolved;
      }

      setSaveMsg(
        `Saved ${res.added} new row${res.added === 1 ? "" : "s"}. Skipped ${res.skippedExisting} already stored.` +
          (res.skippedDuplicateInFile
            ? ` ${res.skippedDuplicateInFile} duplicate line${res.skippedDuplicateInFile === 1 ? "" : "s"} in this file ignored.`
            : "") +
          (resolvedCount > 0
            ? ` Resolved ${resolvedCount} new instrument name${resolvedCount === 1 ? "" : "s"} via OpenFIGI.`
            : "")
      );
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  }, [user, parsed, fileName]);

  const onLoadHistory = useCallback(async () => {
    if (!db || !user) return;
    setLoadBusy(true);
    setLoadErr(null);
    setEnrichMsg(null);
    try {
      const merged = await loadSavedHistoryParsed(db, user.uid);
      onHistoryLoaded(merged);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadBusy(false);
    }
  }, [user, onHistoryLoaded]);

  const onEnrich = useCallback(async () => {
    if (!db || !user || !historyParsed) return;
    setEnrichBusy(true);
    setEnrichMsg(null);
    try {
      const tickerIdx = historyParsed.headers.findIndex(
        (h) => h.trim().toLowerCase() === "ticker"
      );
      if (tickerIdx === -1) {
        setEnrichMsg("No Ticker column found in loaded history.");
        return;
      }
      const tickers = [
        ...new Set(
          historyParsed.rows
            .map((row) => (row[tickerIdx] ?? "").trim())
            .filter(Boolean)
        ),
      ];
      const { resolved } = await resolveAndSaveNewTickers(db, user.uid, tickers);
      setEnrichMsg(
        resolved > 0
          ? `Resolved and saved ${resolved} new instrument name${resolved === 1 ? "" : "s"} to the database.`
          : "All instrument names are already up to date."
      );
    } catch (e) {
      setEnrichMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setEnrichBusy(false);
    }
  }, [user, historyParsed]);

  if (!firebaseConfigured) return null;

  if (!user) {
    return (
      <div
        style={{
          marginBottom: 24,
          padding: 16,
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 4,
          background: "#141410",
          fontSize: 13,
          color: "#71717a",
          lineHeight: 1.6,
        }}
      >
        Sign in to save CSV rows to your personal transaction history in Firebase (deduplicated across uploads).
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 24,
        padding: 18,
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 4,
        background: "#141410",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#71717a",
          marginBottom: 12,
        }}
      >
        Cloud history (Firebase)
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#d4d4d8", lineHeight: 1.6 }}>
        Each row is fingerprinted from its column values. Overlapping re-uploads only add rows that are not already
        stored.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          disabled={!parsed || saveBusy}
          onClick={onSave}
          style={{
            padding: "10px 18px",
            border: "1px solid #f59e0b",
            borderRadius: 4,
            background: parsed && !saveBusy ? "#1e1e22" : "#1c1c20",
            color: parsed && !saveBusy ? "#f59e0b" : "#665f42",
            cursor: parsed && !saveBusy ? "pointer" : "not-allowed",
            fontSize: 12,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontFamily: "inherit",
          }}
        >
          {saveBusy ? "Saving…" : "Save current CSV to my history"}
        </button>
        <button
          type="button"
          disabled={loadBusy}
          onClick={onLoadHistory}
          style={{
            padding: "10px 18px",
            border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 4,
            background: "#1c1c20",
            color: "#d4d4d8",
            cursor: loadBusy ? "wait" : "pointer",
            fontSize: 12,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontFamily: "inherit",
          }}
        >
          {loadBusy ? "Loading…" : "Load full history from cloud"}
        </button>
      </div>

      {historyParsed && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#71717a", marginBottom: 10 }}>
            Instrument names
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              disabled={enrichBusy}
              onClick={onEnrich}
              style={{
                padding: "10px 18px",
                border: "1px solid #4a5828",
                borderRadius: 4,
                background: "#1c1c20",
                color: enrichBusy ? "#667050" : "#a0b880",
                cursor: enrichBusy ? "wait" : "pointer",
                fontSize: 12,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                fontFamily: "inherit",
              }}
            >
              {enrichBusy ? "Resolving…" : "Resolve & save instrument names"}
            </button>
          </div>
          {enrichMsg && (
            <div
              style={{
                fontSize: 12,
                color: enrichMsg.startsWith("Resolved and saved") ? "#90c478" : "#d4d4d8",
                marginTop: 10,
              }}
            >
              {enrichMsg}
            </div>
          )}
        </div>
      )}

      {saveMsg && (
        <div
          style={{
            fontSize: 12,
            color: saveMsg.startsWith("Saved") ? "#90c478" : "#f87171",
            marginTop: 12,
          }}
        >
          {saveMsg}
        </div>
      )}
      {loadErr && <div style={{ fontSize: 12, color: "#f87171", marginTop: 12 }}>{loadErr}</div>}
    </div>
  );
}
