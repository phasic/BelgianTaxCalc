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
          border: "1px solid #3d3a28",
          borderRadius: 4,
          background: "#141410",
          fontSize: 13,
          color: "#8a8268",
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
        border: "1px solid #3d3a28",
        borderRadius: 4,
        background: "#141410",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#7a7460",
          marginBottom: 12,
        }}
      >
        Cloud history (Firebase)
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#c0b890", lineHeight: 1.6 }}>
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
            border: "1px solid #c4a84a",
            borderRadius: 4,
            background: parsed && !saveBusy ? "#1a1a0a" : "#14140f",
            color: parsed && !saveBusy ? "#c4a84a" : "#665f42",
            cursor: parsed && !saveBusy ? "pointer" : "not-allowed",
            fontSize: 12,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontFamily: "Georgia, serif",
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
            border: "1px solid #524e34",
            borderRadius: 4,
            background: "#181810",
            color: "#c0b890",
            cursor: loadBusy ? "wait" : "pointer",
            fontSize: 12,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontFamily: "Georgia, serif",
          }}
        >
          {loadBusy ? "Loading…" : "Load full history from cloud"}
        </button>
      </div>

      {historyParsed && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #2e2c1e" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#7a7460", marginBottom: 10 }}>
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
                background: "#181810",
                color: enrichBusy ? "#667050" : "#a0b880",
                cursor: enrichBusy ? "wait" : "pointer",
                fontSize: 12,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                fontFamily: "Georgia, serif",
              }}
            >
              {enrichBusy ? "Resolving…" : "Resolve & save instrument names"}
            </button>
          </div>
          {enrichMsg && (
            <div
              style={{
                fontSize: 12,
                color: enrichMsg.startsWith("Resolved and saved") ? "#90c478" : "#c0b890",
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
            color: saveMsg.startsWith("Saved") ? "#90c478" : "#c46a4a",
            marginTop: 12,
          }}
        >
          {saveMsg}
        </div>
      )}
      {loadErr && <div style={{ fontSize: 12, color: "#c46a4a", marginTop: 12 }}>{loadErr}</div>}
    </div>
  );
}
