const NAV_TABS = [
  { id: "transactions", label: "Transactions" },
  { id: "tob",         label: "Calculate TOB" },
  { id: "instruments", label: "Instruments" },
  { id: "guide",       label: "Guide" },
];

function Toggle({ on }) {
  return (
    <div style={{
      width: 36, height: 20, borderRadius: 10, flexShrink: 0, position: "relative",
      background: on ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.06)",
      border: `1px solid ${on ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.1)"}`,
      transition: "background 0.2s, border-color 0.2s",
    }}>
      <div style={{
        position: "absolute", top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: "50%",
        background: on ? "#f59e0b" : "#3f3f46",
        transition: "left 0.2s, background 0.2s",
      }} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#52525b", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

export default function SettingsPage({ hiddenTabs, toggleHiddenTab }) {
  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: "#fafafa", marginBottom: 32, letterSpacing: -0.3 }}>Settings</div>

      <Section title="Navigation">
        <div style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden" }}>
          {NAV_TABS.map(({ id, label }, i) => {
            const visible = !hiddenTabs.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleHiddenTab(id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "15px 18px",
                  background: "transparent", border: "none",
                  borderBottom: i < NAV_TABS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14, color: visible ? "#d4d4d8" : "#52525b", transition: "color 0.15s" }}>{label}</span>
                <Toggle on={visible} />
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#3f3f46" }}>Choose which tabs appear in the navigation bar.</div>
      </Section>
    </div>
  );
}
