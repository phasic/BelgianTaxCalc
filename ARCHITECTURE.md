# Architecture

## Components

| Component | Platform | Role |
|-----------|----------|------|
| Frontend | GitHub Pages | React SPA — all UI and tax calculations |
| Database | Firebase Firestore | Per-user transaction and instrument storage |
| OpenFIGI proxy | Firebase Cloud Functions | Server-side proxy to work around OpenFIGI CORS |

## How they connect

```
GitHub Pages
    │ serves static SPA
    ▼
Browser (React)
    ├── sign-in ──────────────▶ Firebase Auth (Google OAuth)
    ├── read / write ─────────▶ Firestore
    └── ticker lookup ────────▶ Cloud Function (openFigiProxy)
                                        │
                                        └── proxy POST ──▶ OpenFIGI API
```

The Cloud Function exists solely because the OpenFIGI public API does not allow direct browser requests (no CORS headers). In local development the Vite dev server proxies `/openfigi` directly to `api.openfigi.com` instead.

## Firestore data model

```
allowlist/
  {email}                      ← access gate; managed from Firebase console only

users/
  {uid}/
    transactions/{txId}        ← one doc per transaction row (from CSV)
    instruments/{ticker}       ← ticker → name cache (via OpenFIGI)
```

Security rules enforce two conditions on every user read/write:
1. `request.auth.uid` matches the `{uid}` path segment.
2. A doc `allowlist/{email}` exists for the signed-in email.

## Deployment

| What | How |
|------|-----|
| Frontend | Push to `master` → GitHub Actions builds with Vite → deploys `docs/` to GitHub Pages |
| Cloud Function | Same workflow deploys `functions/` to Firebase (`europe-west1`) in parallel |
| Firestore rules | Deploy manually: `npx firebase-tools deploy --only firestore:rules` |

All Firebase config and the `VITE_OPENFIGI_PROXY_URL` are stored as GitHub repository secrets and injected into the Vite build at CI time — nothing is committed to git.
