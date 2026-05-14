import { useAuth } from "../context/AuthContext.jsx";

const btn = (disabled) => ({
  padding: "8px 14px",
  border: "1px solid #524e34",
  borderRadius: 3,
  background: disabled ? "#181810" : "#1a1a0a",
  color: disabled ? "#665f42" : "#c4a84a",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  fontFamily: "Georgia, serif",
});

export default function AuthBar() {
  const {
    firebaseConfigured,
    user,
    authLoading,
    authError,
    setAuthError,
    signInWithGoogle,
    signOutUser,
  } = useAuth();

  if (!firebaseConfigured) {
    return (
      <div
        style={{
        fontSize: 11,
        color: "#a89058",
          maxWidth: 420,
          textAlign: "right",
          lineHeight: 1.5,
        }}
      >
        Cloud sync disabled — add Firebase keys in{" "}
        <code style={{ color: "#c4a84a" }}>frontend/.env.local</code> (see{" "}
        <code style={{ color: "#c4a84a" }}>.env.example</code>).
      </div>
    );
  }

  if (authLoading) {
    return (
      <div style={{ fontSize: 11, color: "#8a8268", letterSpacing: 2, textTransform: "uppercase" }}>
        Checking session…
      </div>
    );
  }

  if (user) {
    const label =
      user.displayName ||
      user.email ||
      user.providerData?.[0]?.uid ||
      "Signed in";
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
        <span style={{ fontSize: 12, color: "#c0b890" }}>{label}</span>
        <button type="button" style={btn(false)} onClick={() => signOutUser().catch((e) => setAuthError(e))}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          style={btn(false)}
          onClick={() => signInWithGoogle().catch((e) => setAuthError(e))}
        >
          Sign in with Google
        </button>
      </div>
      {authError && (
        <div style={{ fontSize: 11, color: "#c46a4a", maxWidth: 360, textAlign: "right" }}>
          {authError.message || String(authError)}
        </div>
      )}
    </div>
  );
}
