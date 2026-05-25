import { useState } from "react";

export default function FileDropZone({ parsed, fileName, onFile }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => document.getElementById("csv-input")?.click()}
      style={{
        border: `1px dashed ${dragOver ? "#f59e0b" : parsed ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 10,
        padding: "40px 24px",
        textAlign: "center",
        background: dragOver ? "rgba(245,158,11,0.05)" : parsed ? "rgba(245,158,11,0.03)" : "rgba(255,255,255,0.02)",
        cursor: "pointer",
        marginBottom: 24,
        transition: "all 0.2s",
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
          <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
          <div style={{ color: "#f59e0b", fontSize: 14, fontWeight: 500 }}>{fileName}</div>
          <div style={{ color: "#71717a", fontSize: 12, marginTop: 6 }}>
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} · tap to load another file
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>↑</div>
          <div style={{ color: "#d4d4d8", fontSize: 14, marginBottom: 6, fontWeight: 500 }}>Drop your Revolut CSV here</div>
          <div style={{ color: "#52525b", fontSize: 12 }}>or tap to choose a file</div>
        </>
      )}
    </div>
  );
}
