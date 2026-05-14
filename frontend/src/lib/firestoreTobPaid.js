import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

const DOC = (uid) => `users/${uid}/tob_paid/v1`;

/**
 * Load the set of paid transaction keys from Firestore.
 * Returns an empty Set if the document doesn't exist yet.
 */
export async function loadTobPaidKeys(firestore, uid) {
  const snap = await getDoc(doc(firestore, ...DOC(uid).split("/")));
  if (!snap.exists()) return new Set();
  return new Set(snap.data().keys ?? []);
}

/**
 * Persist the full set of paid transaction keys to Firestore.
 * Overwrites the existing document (single source of truth).
 */
export async function saveTobPaidKeys(firestore, uid, keys) {
  await setDoc(doc(firestore, ...DOC(uid).split("/")), {
    keys: [...keys],
    updatedAt: serverTimestamp(),
  });
}
