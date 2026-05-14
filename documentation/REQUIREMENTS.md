# Belgian Tax Calc — Requirements

> Derived from source code as of May 2026. Documents what is implemented — no aspirational additions.

---

## Business Requirements Document (BRD)

### Context & Problem

Belgian retail investors who trade via Revolut are legally required to self-file the **Taks op Beursverrichtingen (TOB)** — a Belgian securities transaction tax on stock and fund purchases and sales. Revolut does not calculate or report TOB. This application fills that gap by parsing Revolut CSV exports and producing article-level TOB amounts ready for self-assessment filing via MyMinfin / SPF Finance.

### Users

Individual Belgian retail investors who trade via Revolut and are personally responsible for quarterly TOB self-assessment.

### Business Goals

| ID   | Goal                                                                                                          |
|------|---------------------------------------------------------------------------------------------------------------|
| BG-1 | Automate TOB calculation from Revolut trading CSV exports                                                     |
| BG-2 | Present per-article breakdowns (120,1° / 120,2° / 120,3°) matching the Belgian self-assessment form          |
| BG-3 | Track per-transaction TOB filing deadlines with urgency indicators                                            |
| BG-4 | Maintain a persistent paid/unpaid state across browser sessions and devices                                   |
| BG-5 | Accumulate a cloud-backed transaction history spanning multiple CSV uploads                                   |
| BG-6 | Enrich transactions with instrument metadata to improve classification accuracy                               |

### Scope

**In scope**
- TOB on BUY and SELL transactions from Revolut trading CSV exports
- Three Belgian TOB articles: 120,1°, 120,2°, 120,3°
- Per-transaction deadline tracking and paid-state management
- Transaction history storage per user via Firebase Firestore
- Instrument classification via OpenFIGI API

**Out of scope**
- Dividend withholding tax (dividends are displayed for reference only)
- Broker formats other than the Revolut trading CSV
- Direct filing or API integration with Belgian tax authorities
- Instruments not covered by the three TOB articles

### TOB Rate Schedule

Source: `frontend/src/logic/tobClassification.js`

| Article  | Category                                          |  Rate |  Cap per transaction |
|----------|---------------------------------------------------|------:|---------------------:|
| 120, 1°  | Distributing funds; non-UCITS accumulating funds  | 1.32% |              €4,000  |
| 120, 2°  | Shares (stocks)                                   | 0.35% |              €1,600  |
| 120, 3°  | UCITS accumulating funds                          | 1.32% |              €4,000  |

### Filing Deadline Rule

Per the implemented logic in `getTobDeadline` (`frontend/src/logic/tobDeadline.js`): the last Monday–Friday workday of the calendar month **two months** after the transaction month.  
Example: transaction in May → deadline is the last workday of July.

---

## Functional Requirements

### FR-A — Data Input

| ID    | Requirement                                                                                                                       |
|-------|-----------------------------------------------------------------------------------------------------------------------------------|
| FR-A1 | Accept Revolut trading CSV files via a drag-and-drop zone or a file picker button                                                |
| FR-A2 | Parse the CSV into a header array and a 2-D cell array; display an error banner when parsing fails                               |
| FR-A3 | Match the following column names case-insensitively: Date, Ticker, Type, Total Amount, Currency, FX Rate                         |

### FR-B — Transaction Display

| ID    | Requirement                                                                                                                                                   |
|-------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-B1 | Classify a row as TOB-eligible when the Type cell starts with "BUY" or "SELL" (case-insensitive, trimmed)                                                     |
| FR-B2 | Classify a row as Dividend when the Type cell equals or starts with "DIVIDEND"                                                                                |
| FR-B3 | Display all transactions in a sortable table; provide filter pills: All / TOB / Dividends                                                                     |
| FR-B4 | Show a Share or Fund instrument label per TOB row, derived from the resolved classification                                                                   |
| FR-B5 | Show a TOB Deadline cell per TOB row with urgency colour coding: overdue / ≤7 days / ≤21 days / ≤60 days / distant                                           |

### FR-C — Authentication & Access Control

| ID    | Requirement                                                                                                                                                       |
|-------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-C1 | Support Google OAuth sign-in via Firebase Authentication                                                                                                          |
| FR-C2 | Gate all cloud features on presence of the signed-in email in the admin-managed Firestore allowlist collection                                                    |
| FR-C3 | In local development, proxy `/openfigi` requests to `api.openfigi.com` via the Vite dev server without authentication                                             |

### FR-D — Cloud Storage & Sync

| ID    | Requirement                                                                                                                                                                              |
|-------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-D1 | Auto-save parsed CSV rows to Firestore (`users/{uid}/transactions/{fingerprint}`) after upload when signed in; use a SHA-256 fingerprint of header-keyed cell values for deduplication |
| FR-D2 | Allow authenticated users to manually load up to 8,000 historical transaction documents from Firestore, ordered by `savedAt` descending                                                 |
| FR-D3 | Allow authenticated users to toggle between the current CSV and the full cloud history as the active data source in the Transactions tab                                                 |

### FR-E — Instrument Resolution & Classification

| ID    | Requirement                                                                                                                                                                    |
|-------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-E1 | Resolve ticker symbols to name, securityType, securityType2, and marketSector via OpenFIGI API (`idType: "TICKER"`); batch 10 tickers per request                             |
| FR-E2 | Cache resolved instrument data in Firestore (`users/{uid}/instruments/{ticker}`) and reuse it across sessions                                                                  |
| FR-E3 | Classify stock-like instruments as Article 120,2°: common stock, preferred stock, ADR, GDR, depositary receipt, Dutch cert, NY reg shrs                                       |
| FR-E4 | Classify fund-like instruments: ETF, mutual fund, open-end fund, closed-end fund, ETP, ETC, ETN, fund                                                                         |
| FR-E5 | Determine accumulating vs distributing by name heuristics: `acc`, `accumulat`, `capitaliz`, `cap`, `thesaurierend`, `herleggend` → accumulating; otherwise distributing       |
| FR-E6 | Determine UCITS status by name containing `ucits`                                                                                                                              |
| FR-E7 | Accumulating + UCITS → 120,3°; accumulating + non-UCITS → 120,1°; distributing fund → 120,1°                                                                                 |
| FR-E8 | When no instrument data is available, default to Article 120,2° and flag the row as unknown                                                                                   |

### FR-F — TOB Calculation

| ID    | Requirement                                                                                                                                                                                              |
|-------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-F1 | Convert non-EUR amounts to EUR by dividing the absolute Total Amount by the FX Rate (Revolut convention: foreign currency units per 1 EUR); treat a missing or "—" FX cell as already EUR              |
| FR-F2 | Calculate per-row TOB: EUR base × article rate, capped at the article maximum; flag rows where the cap is reached                                                                                        |
| FR-F3 | Aggregate EUR base and TOB amounts per article key; produce a single overall TOB total                                                                                                                   |

### FR-G — Quick TOB Flow

| ID    | Requirement                                                                                                              |
|-------|--------------------------------------------------------------------------------------------------------------------------|
| FR-G1 | Present the three most recent calendar months as selectable options (computed from today's date)                         |
| FR-G2 | When signed in, source data from the cloud history; when not signed in, source data from the uploaded CSV               |
| FR-G3 | Display per-article TOB totals and an overall total for unpaid transactions in the selected month only                   |
| FR-G4 | Allow the user to mark all transactions in the selected month as paid in a single batch action                           |
| FR-G5 | Show a direct external link to MyMinfin for filing                                                                       |

### FR-H — TOB Wizard

| ID    | Requirement                                                                                                                                                                                    |
|-------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-H1 | Support three scope-selection modes: calendar month (year + month selects), date range (from/to date inputs), individual row selection (checkboxes per BUY/SELL row)                          |
| FR-H2 | Pre-select the most recent calendar month for which a BUY or SELL row with a valid date exists in the loaded data                                                                              |
| FR-H3 | Display post-calculation output: per-article EUR base and TOB totals, a line-item detail table, a pre-filled filing copy, and outbound links to MyMinfin and SPF Finance                       |
| FR-H4 | Disable the Calculate TOB tab unless a Type column is detected in the loaded data                                                                                                              |

### FR-I — Deadline Tracking

| ID    | Requirement                                                                                                                                                                                            |
|-------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-I1 | Compute the TOB filing deadline as the last Monday–Friday workday of the calendar month two months after the transaction month                                                                         |
| FR-I2 | Colour-code deadline cells: overdue, ≤7 days, ≤21 days, ≤60 days, or distant; paid transactions receive a distinct paid style regardless of days remaining                                           |

### FR-J — Paid-Status Tracking

| ID    | Requirement                                                                                                                                          |
|-------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-J1 | Allow marking individual TOB transactions as paid or unpaid via a click menu on the deadline cell                                                    |
| FR-J2 | Persist paid status locally in `localStorage` under the key `tob_paid_v1`                                                                           |
| FR-J3 | When authenticated, sync paid status to Firestore at `users/{uid}/tob_paid/v1` (single document, `keys: string[]`)                                  |
| FR-J4 | Identify each transaction for paid-state purposes by the composite key: `Date | Ticker | Type | Total Amount`                                       |

---

## Non-Functional Requirements

### Infrastructure & Deployment

| ID     | Category           | Requirement                                                                                                                                         |
|--------|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| NFR-01 | Hosting            | Deployed as a static site on GitHub Pages; no server is required for the core UI                                                                    |
| NFR-02 | CI/CD              | Pushes to `master` trigger GitHub Actions: Vite build (Node 22) → GitHub Pages deploy + Firebase Functions deploy (Node 20) in parallel            |
| NFR-03 | Secrets management | Firebase config and the OpenFIGI proxy URL are injected at Vite build time via GitHub Secrets; no credentials are committed to the repository       |
| NFR-04 | Functions region   | The `openFigiProxy` Cloud Function runs in the `europe-west1` Firebase region                                                                       |
| NFR-05 | Pre-commit gate    | A Husky pre-commit hook runs `vite build` before every commit; it temporarily moves `frontend/.env.local` aside during the build                   |

### Frontend Stack

| ID     | Category               | Requirement                                                                                                          |
|--------|------------------------|----------------------------------------------------------------------------------------------------------------------|
| NFR-06 | Framework              | React 18 (`^18.3.1`) with Vite 5 (`^5.4.10`); plain JavaScript — no TypeScript                                      |
| NFR-07 | Routing                | No router library; navigation is tab state managed in `App.jsx` (tabs: `quick`, `upload`, `transactions`, `tob`)    |
| NFR-08 | Build output           | Vite outputs to `docs/` at repository root; served from the `/BelgianTaxCalc/` base path on GitHub Pages            |
| NFR-09 | Input format constraint| Designed specifically for Revolut trading CSV column names; other broker formats are not supported                   |

### Backend & Data

| ID     | Category        | Requirement                                                                                                                                                                  |
|--------|-----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| NFR-10 | Cloud backend   | Firebase Firestore for storage; Firebase Authentication for Google OAuth                                                                                                     |
| NFR-11 | Data isolation  | Firestore security rules enforce that each user can only read/write documents under their own `users/{uid}` subtree; the allowlist condition applies to every operation      |
| NFR-12 | Read cap        | Cloud history loading is capped at 8,000 Firestore documents per session (`HISTORY_READ_CAP`)                                                                                |
| NFR-13 | Write cap       | Firestore batch writes are capped at 500 operations per batch (`MAX_BATCH_WRITES`)                                                                                           |
| NFR-14 | CORS            | The `openFigiProxy` Cloud Function accepts requests only from `https://phasic.github.io`                                                                                     |
| NFR-15 | Offline         | TOB calculations and transaction display operate entirely in the browser; no network access is required once data is loaded                                                   |

### Access Control

| ID     | Category            | Requirement                                                                                                                                                       |
|--------|---------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| NFR-16 | Allowlist           | Cloud feature access requires a document at `allowlist/{email}` in Firestore; this collection is managed exclusively via the Firebase console                     |
| NFR-17 | Proxy authentication| `openFigiProxy` validates a Firebase ID token (`Authorization: Bearer`) and checks the allowlist before forwarding requests to the OpenFIGI API                   |

---
