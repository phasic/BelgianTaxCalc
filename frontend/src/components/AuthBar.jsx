import { useAuth } from "../context/AuthContext.jsx";

export default function AuthBar() {
  const { firebaseConfigured, user, authLoading, authError, setAuthError, signInWithGoogle, signOutUser } = useAuth();

  const btnStyle = (accent) => ({
    padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
    border: `1px solid ${accent ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.1)"}`,
    background: accent ? "rgba(245,158,11,0.1)" : "transparent",
    color: accent ? "#f59e0b" : "#a1a1aa",
    fontWeight: 500, transition: "all 0.15s",
  });

  if (!firebaseConfigured) {
    return (
      <div style={{ fontSize: 11, color: "#71717a", maxWidth: 380, textAlign: "right", lineHeight: 1.5 }}>
        Cloud sync disabled — add Firebase keys in{" "}
        <code style={{ color: "#f59e0b" }}>frontend/.env.local</code>
      </div>
    );
  }

  if (authLoading) {
    return <div style={{ fontSize: 12, color: "#52525b" }}>Checking session…</div>;
  }

  if (user) {
    const label = user.displayName || user.email || "Signed in";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: "#71717a", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <button type="button" style={btnStyle(false)} onClick={() => signOutUser().catch((e) => setAuthError(e))}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button type="button" style={btnStyle(true)} onClick={() => signInWithGoogle().catch((e) => setAuthError(e))}>
        Sign in with Google
      </button>
      {authError && (
        <div style={{ fontSize: 11, color: "#f87171", maxWidth: 280, textAlign: "right" }}>
          {authError.message || String(authError)}
        </div>
      )}
    </div>
  );
}
