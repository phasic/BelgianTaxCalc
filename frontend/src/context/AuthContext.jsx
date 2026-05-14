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
} from "firebase/auth";
import { auth, firebaseConfigured } from "../lib/firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setUser(null);
      return undefined;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setAuthError(null);
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
