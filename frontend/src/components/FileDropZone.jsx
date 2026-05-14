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
        border: `1px solid ${dragOver ? "#c4a84a" : parsed ? "#524e34" : "#3d3a28"}`,
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
          <div style={{ color: "#8a8268", fontSize: 12, marginTop: 6 }}>
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} in file · click to load another file
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.45 }}>⬆</div>
          <div style={{ color: "#c0b890", fontSize: 14, marginBottom: 6 }}>Drop your Revolut CSV here</div>
          <div style={{ color: "#8a8268", fontSize: 11, letterSpacing: 1 }}>or click to choose a file</div>
        </>
      )}
    </div>
  );
}
