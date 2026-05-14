const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

setGlobalOptions({ region: "europe-west1" });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://phasic.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Server-side proxy for the OpenFIGI mapping API.
 * The browser cannot call OpenFIGI directly (no CORS), so the frontend
 * routes production requests through this function instead.
 */
exports.openFigiProxy = onRequest({ invoker: "public" }, async (req, res) => {
  // Set CORS headers on every response including preflight
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

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
