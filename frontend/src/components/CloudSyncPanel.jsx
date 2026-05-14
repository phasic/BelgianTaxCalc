import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { saveParsedCsvForUser, loadSavedHistoryParsed } from "../lib/firestoreTransactions.js";

export default function CloudSyncPanel({ parsed, fileName, onHistoryLoaded }) {
  const { firebaseConfigured, user } = useAuth();
  const [saveMsg, setSaveMsg] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [loadBusy, setLoadBusy] = useState(false);
  const [loadErr, setLoadErr] = useState(null);

  const onSave = useCallback(async () => {
    if (!db || !user || !parsed) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const res = await saveParsedCsvForUser(db, user.uid, parsed, fileName ?? "");
      setSaveMsg(
        `Saved ${res.added} new row${res.added === 1 ? "" : "s"}. Skipped ${res.skippedExisting} already stored. ` +
          (res.skippedDuplicateInFile
            ? `${res.skippedDuplicateInFile} duplicate line${res.skippedDuplicateInFile === 1 ? "" : "s"} in this file ignored.`
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
    try {
      const merged = await loadSavedHistoryParsed(db, user.uid);
      onHistoryLoaded(merged);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadBusy(false);
    }
  }, [user, onHistoryLoaded]);

  if (!firebaseConfigured) return null;

  if (!user) {
    return (
      <div
        style={{
          marginBottom: 24,
          padding: 16,
          border: "1px solid #2a2820",
          borderRadius: 4,
          background: "#111109",
          fontSize: 13,
          color: "#6a6450",
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
        border: "1px solid #2a2820",
        borderRadius: 4,
        background: "#111109",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#5a5540",
          marginBottom: 12,
        }}
      >
        Cloud history (Firebase)
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#9a9070", lineHeight: 1.6 }}>
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
            color: parsed && !saveBusy ? "#c4a84a" : "#4a4535",
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
            border: "1px solid #3d3820",
            borderRadius: 4,
            background: "#14140f",
            color: "#9a9070",
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

      {saveMsg && (
        <div
          style={{
            fontSize: 12,
            color: saveMsg.startsWith("Saved") ? "#7a9a70" : "#c46a4a",
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
