import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "../lib/firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setUser(null);
      return undefined;
    }
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setAuthError(null);
        return;
      }
      setUser(undefined);
      // Sync displayName from Google provider data if it has changed
      const googleName = u.providerData.find((p) => p.providerId === "google.com")?.displayName;
      if (googleName && googleName !== u.displayName) {
        try { await updateProfile(u, { displayName: googleName }); } catch { /* non-critical */ }
      }
      if (!db) {
        setUser(u);
        setAuthError(null);
        return;
      }
      const email = u.email;
      if (!email) {
        setAuthError(new Error("This sign-in has no email; it cannot be allowlisted."));
        await signOut(auth);
        setUser(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "allowlist", email));
        if (!snap.exists()) {
          setAuthError(
            new Error("This Google account is not on the allowlist. Ask the project owner to add your email in Firestore.")
          );
          await signOut(auth);
          setUser(null);
          return;
        }
        setUser(u);
        setAuthError(null);
      } catch (e) {
        setAuthError(e instanceof Error ? e : new Error(String(e)));
        await signOut(auth);
        setUser(null);
      }
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) return;
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) return;
    setAuthError(null);
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      firebaseConfigured,
      user,
      authLoading: user === undefined,
      authError,
      setAuthError,
      signInWithGoogle,
      signOutUser,
    }),
    [
      firebaseConfigured,
      user,
      authError,
      signInWithGoogle,
      signOutUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
