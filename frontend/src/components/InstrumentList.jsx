import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { fetchAllInstruments } from "../lib/firestoreInstruments.js";
import { classifyInstrument } from "../logic/tobClassification.js";
import InstrumentTypeCell from "./InstrumentTypeCell.jsx";

/**
 * Full instrument list page.
 *
 * Fetches all instruments stored in the user's Firestore instruments sub-collection
 * (populated whenever transaction history is synced from a CSV upload).
 *
 * Shows: ticker, full name, raw OpenFIGI data, derived TOB article, and an
 * interactive Type cell that lets the user set a manual override when OpenFIGI
 * hasn't resolved the instrument.
 *
 * Rows with missing classification data are visually highlighted so the user
 * knows they need to take action.
 */
export default function InstrumentList({ updateManualType }) {
  const { user } = useAuth();
  const [instruments, setInstruments] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!db || !user) return;
    setLoading(true);
    setError(null);
    try {
      const map = await fetchAllInstruments(db, user.uid);
      setInstruments(map);
    } catch {
      setError("Failed to load instruments from cloud.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Wrap the parent's updateManualType so we can keep local state in sync
  // for immediate UI feedback without waiting for a full re-fetch.
  const handleUpdateManualType = useCallback(
    (ticker, manualType) => {
      setInstruments((prev) => {
        if (!prev) return prev;
        const next = new Map(prev);
        const existing = { ...(next.get(ticker) ?? {}) };
        if (manualType === null) {
          delete existing.manualType;
        } else {
          existing.manualType = manualType;
        }
        next.set(ticker, existing);
        return next;
      });
      updateManualType(ticker, manualType);
    },
    [updateManualType]
  );

  // ── Guard states ──────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div
        style={{
          padding: "60px 0",
          textAlign: "center",
          color: "#6a6450",
          fontSize: 13,
          lineHeight: 1.8,
        }}
      >
        Sign in to view your instrument list.
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          padding: "60px 0",
          textAlign: "center",
          color: "#6a6450",
          fontSize: 13,
        }}
      >
        Loading instruments…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          background: "#1a0a0a",
          border: "1px solid #3a1515",
          borderRadius: 3,
          padding: 16,
          color: "#c46a4a",
          fontSize: 13,
        }}
      >
        {error}
      </div>
    );
  }

  if (instruments && instruments.size === 0) {
    return (
      <div
        style={{
          padding: "60px 0",
          textAlign: "center",
          color: "#6a6450",
          fontSize: 13,
          lineHeight: 1.8,
        }}
      >
        No instruments found.
        <br />
        Upload a Revolut CSV and sync to cloud — your instrument list will appear here.
      </div>
    );
  }

  if (!instruments) return null;

  // Sort: unresolved first, then alphabetically by ticker
  const rows = [...instruments.entries()].sort(([a, ai], [b, bi]) => {
    const ac = classifyInstrument(ai);
    const bc = classifyInstrument(bi);
    if (ac.unresolved && !bc.unresolved) return -1;
    if (!ac.unresolved && bc.unresolved) return 1;
    return a.localeCompare(b);
  });

  const unresolvedCount = rows.filter(
    ([, info]) => classifyInstrument(info).unresolved
  ).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Page header ── */}
      <div
        style={{
          marginBottom: 20,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 400,
              margin: 0,
              color: "#e8e4db",
              letterSpacing: 0.5,
            }}
          >
            Instrument List
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 12,
              color: "#6a6450",
              lineHeight: 1.7,
            }}
          >
            All instruments from your transaction history with their TOB
            classification.
            <br />
            Click the{" "}
            <span style={{ color: "#8a7860" }}>Type</span> cell on any row to
            manually set a classification when OpenFIGI hasn&apos;t resolved it.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {unresolvedCount > 0 && (
            <span
              style={{ fontSize: 11, color: "#c4943a", letterSpacing: 0.4 }}
            >
              ⚠ {unresolvedCount} unresolved
            </span>
          )}
          <button
            type="button"
            onClick={load}
            style={{
              padding: "7px 14px",
              background: "transparent",
              border: "1px solid #3d3a28",
              borderRadius: 3,
              color: "#a89870",
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontFamily: "Georgia, serif",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── Unresolved banner ── */}
      {unresolvedCount > 0 && (
        <div
          style={{
            background: "rgba(150, 80, 10, 0.08)",
            border: "1px solid #5a3a10",
            borderRadius: 3,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 12,
            color: "#c4943a",
            lineHeight: 1.7,
          }}
        >
          <strong>
            {unresolvedCount} instrument
            {unresolvedCount !== 1 ? "s" : ""}
          </strong>{" "}
          {unresolvedCount === 1 ? "is" : "are"} missing classification data
          and will be excluded from TOB calculations until resolved. Click the{" "}
          <em>Type</em> column to set the article manually. The app will
          automatically promote manual overrides to authoritative once OpenFIGI
          resolves the ticker.
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #3d3a28" }}>
              {[
                { key: "ticker", label: "Ticker" },
                { key: "name", label: "Name" },
                { key: "openfigi", label: "OpenFIGI" },
                { key: "article", label: "Article" },
                { key: "type", label: "Type" },
              ].map(({ key, label }) => (
                <th
                  key={key}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    fontSize: 10,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    color: "#6a6450",
                    fontWeight: 400,
                    fontFamily: "Georgia, serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map(([ticker, info]) => {
              const classification = classifyInstrument(info);
              const isUnresolved = Boolean(classification.unresolved);
              const isManual = Boolean(classification.manual);

              return (
                <tr
                  key={ticker}
                  style={{
                    borderBottom: "1px solid #1e1c14",
                    background: isUnresolved
                      ? "rgba(150, 80, 10, 0.05)"
                      : "transparent",
                  }}
                >
                  {/* Ticker */}
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: "'Courier New', monospace",
                      fontSize: 12,
                      color: isUnresolved ? "#c4943a" : "#d8d4cb",
                      whiteSpace: "nowrap",
                      borderLeft: `3px solid ${
                        isUnresolved ? "#7a4a10" : "transparent"
                      }`,
                    }}
                  >
                    {isUnresolved && (
                      <span
                        style={{ marginRight: 5, fontSize: 11 }}
                        title="Missing classification — set type manually"
                      >
                        ⚠
                      </span>
                    )}
                    {ticker}
                  </td>

                  {/* Name */}
                  <td
                    style={{
                      padding: "10px 12px",
                      color: "#b0a880",
                      fontSize: 12,
                      maxWidth: 280,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={info.name || undefined}
                  >
                    {info.name || (
                      <span style={{ color: "#3a3830" }}>—</span>
                    )}
                  </td>

                  {/* OpenFIGI raw data */}
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: 11,
                      color: "#7a7060",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {info.securityType ? (
                      <>
                        <span>{info.securityType}</span>
                        {info.securityType2 &&
                          info.securityType2 !== info.securityType && (
                            <span
                              style={{ color: "#4a4535", marginLeft: 5 }}
                            >
                              / {info.securityType2}
                            </span>
                          )}
                        {info.marketSector && (
                          <span
                            style={{
                              color: "#4a4535",
                              marginLeft: 6,
                              fontSize: 10,
                            }}
                          >
                            [{info.marketSector}]
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "#3a3830" }}>—</span>
                    )}
                  </td>

                  {/* TOB Article */}
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isUnresolved ? (
                      <span style={{ color: "#5a4520", fontStyle: "italic" }}>
                        —
                      </span>
                    ) : (
                      <span
                        style={{
                          color: isManual ? "#c4943a" : "#7a9868",
                        }}
                      >
                        {isManual && (
                          <span
                            title="Manually classified — will be updated automatically once OpenFIGI resolves this ticker"
                            style={{ marginRight: 5 }}
                          >
                            ⚠
                          </span>
                        )}
                        {classification.art}
                        <span
                          style={{
                            color: "#4a4535",
                            marginLeft: 6,
                            fontSize: 10,
                          }}
                        >
                          {(classification.rate * 100).toFixed(2)}%
                        </span>
                      </span>
                    )}
                  </td>

                  {/* Type — interactive picker via InstrumentTypeCell */}
                  <InstrumentTypeCell
                    ticker={ticker}
                    instrumentInfo={info}
                    updateManualType={handleUpdateManualType}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer count ── */}
      <div
        style={{
          marginTop: 16,
          fontSize: 11,
          color: "#4a4535",
          letterSpacing: 0.4,
        }}
      >
        {rows.length} instrument{rows.length !== 1 ? "s" : ""} total
        {unresolvedCount > 0
          ? ` · ${unresolvedCount} need${unresolvedCount === 1 ? "s" : ""} classification`
          : ""}
      </div>
    </div>
  );
}
