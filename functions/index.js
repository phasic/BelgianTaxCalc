const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

setGlobalOptions({ region: "europe-west1" });
admin.initializeApp();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://phasic.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Server-side proxy for the OpenFIGI mapping API.
 *
 * Security: Cloud Run is public (so the browser can reach it), but every POST
 * must carry a valid Firebase Auth ID token whose email exists in the allowlist
 * — same rules as the Firestore security rules.
 */
exports.openFigiProxy = onRequest({ invoker: "public" }, async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));

  // Handle CORS preflight without auth check
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // --- Auth verification ---
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing auth token." });
    return;
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(authHeader.slice(7));
  } catch {
    res.status(401).json({ error: "Invalid auth token." });
    return;
  }

  const email = decodedToken.email;
  if (!email) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const allowlistDoc = await admin.firestore().doc(`allowlist/${email}`).get();
  if (!allowlistDoc.exists) {
    res.status(403).json({ error: "Not in allowlist." });
    return;
  }
  // --- End auth ---

  try {
    const upstream = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
