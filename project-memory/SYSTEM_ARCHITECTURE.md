# System Architecture

**Status:** Draft for approval (2026-11-25). Items marked **[SPIKE]** must be proven in Phase 1 before relying on them.

## 1. Runtime model

```
index.html (file://)
 ├─ vendor/react.production.min.js        React 18.3.1 UMD (global React)   — React 19 has no UMD build
 ├─ vendor/react-dom.production.min.js    ReactDOM 18.3.1 UMD
 ├─ vendor/firebase-*-compat.js           Firebase "compat" classic scripts (global firebase)  [SPIKE]
 ├─ config/firebase-config.js             window.RJ_FIREBASE_CONFIG = {...} (web config; not a secret)
 ├─ app.js                                Our code, pre-compiled from JSX into ONE classic script (IIFE)
 └─ app.css, assets/ (fonts, icons, logo)
```

Why this shape:
- Browsers block ES-module scripts (`type="module"`) and `fetch`/XHR of local files under `file://`. Everything is
  therefore loaded with plain `<script src>` tags and bundled into one file. No dynamic imports, no service worker.
- Firebase's modern SDK is ES-module-only; its **compat** builds are classic scripts that expose `firebase.*`.
  We vendor a pinned version locally. [SPIKE]
- Routing uses the URL hash (`#/sales/RJ-2026-00001`) because `history.pushState` is unreliable under `file://`.

## 2. Development vs delivery

| | Development (developer only) | Delivered to client |
|---|---|---|
| Source | `src/**/*.jsx`, `src/**/*.js`, `src/styles/*.css` | — |
| Tooling | Node + esbuild (dev dependency) → bundles JSX into `dist/app.js` (format IIFE, React/Firebase as globals) | none |
| Output | `dist/` | the `dist/` folder, double-click `dist/index.html` |

The client never needs Node, npm, a server or a build step.

## 3. Layers (inside app.js)

```
UI (features/*)  →  hooks (useQuery, useMutation, useAuth, useOnline)
                 →  services (business operations: createSale, recordPayment, openSack, …)
                 →  domain (pure functions: money, quantity, schedule, allocation, totals, reports)
                 →  data adapter interface
                       ├─ MockAdapter      (in-memory + localStorage; development & demos only)
                       └─ FirestoreAdapter (production)
```

- **Domain** is pure JavaScript with no React or Firebase — fully unit-testable with `node --test`.
- **Services** own every multi-document operation and run it inside `adapter.runTransaction(...)`.
- **Adapter interface**: `get, query, subscribe, runTransaction(fn), batch(), serverTime()`. The Mock adapter
  emulates transactions so services behave the same on both.
- Selection by config: if `RJ_FIREBASE_CONFIG` is present → Firestore, otherwise Mock (with a visible "DEMO DATA" banner).

## 4. Online / offline (D-012, RQ-044)

| Situation | Behavior |
|---|---|
| App launch without internet | App shell always loads (all files local). If a valid Firebase session is cached, the user enters read-only mode with cached data **[SPIKE: IndexedDB persistence under file://]**; otherwise the login page shows "Internet required to sign in". |
| Connection lost while working | Offline banner; all save buttons disabled; open forms keep their input. |
| Writes | Always Firestore transactions, which require the server. Never queued offline. |
| Fallback if persistent cache fails under `file://` | Memory cache only: data loaded in this session stays viewable until the tab is closed. |

## 5. Authentication (RQ-040, RQ-041, D-011)
- Firebase Authentication, email/password provider. Username login: `usernames/{username}` → `{ email }`;
  the app looks up the email, then calls `signInWithEmailAndPassword`. The email is the recovery email.
- Session persistence: Firebase Auth `LOCAL` persistence (IndexedDB). A localStorage flag is never used as proof of login. [SPIKE]
- Route guard: no route renders until `onAuthStateChanged` resolves; unauthenticated → `#/login`.
- Idle lock: after N minutes without input, overlay requires password (`reauthenticateWithCredential`).
- Change password in Settings (re-auth + `updatePassword`); "Forgot password" → `sendPasswordResetEmail`.
- Passwords are never stored by the app. No service-account or admin credentials exist in the client.

## 6. Security model
- The `dist` folder is readable by anyone who has it; the Firebase web config is **not** a secret.
- The real boundary is **Firestore Security Rules**: authenticated + `users/{uid}.active == true` + role.
  v1 role `owner` has full access; rules are written per collection so a `staff` role can be added later.
- Rules also enforce immutability: inventory movements, payments (except void fields) and activity logs
  cannot be edited or deleted; nothing in the system can be hard-deleted except custom calendar events.
- Limitation: client-side transactions enforce cross-document rules (stock = Σ movements, balances). Rules
  validate shape and invariants per document. With a single trusted owner this is acceptable; before adding
  staff, consider Cloud Functions (paid Blaze plan) for server-side enforcement. (KI-003)
- `file://` limitations: API-key HTTP-referrer restriction and App Check (reCAPTCHA) cannot be used. (KI-001)

## 7. Device access — PC and phone (RQ-004) — DECISION NEEDED
Opening a local `index.html` works on Windows/macOS PCs. **Phones cannot practically run a local HTML folder**
(iOS Safari cannot; Android Chrome blocks local scripts/storage in most cases). Recommendation (pending approval as D-014):
publish the *same* `dist` folder to **Firebase Hosting** (free) so the phone opens an HTTPS URL, while the PC can
keep double-clicking `index.html`. Hosting also serves as the fallback if the `file://` spike fails.

## 8. Third-party code (all vendored, pinned)
| Library | Why | License |
|---|---|---|
| React 18.3.1 + ReactDOM (UMD) | UI | MIT |
| Firebase JS SDK compat (pinned version with compat builds) | Auth + Firestore | Apache-2.0 |
| Inter font (woff2) with system-font fallback | Typography | OFL |
| Lucide icons (selected SVGs inlined) | Icons | ISC |
No chart, router, date, or state-management libraries: small in-house SVG charts, hash router, `Intl` date
formatting, React context. Fewer dependencies = fewer `file://` surprises.

## 9. Source layout (planned)
```
src/
  main.jsx, app/ (App, router, layout, guards)
  components/ (Button, Input, Select, Table, Dialog, Toast, Badge, EmptyState, …)
  features/ auth, dashboard, sales, collections, customers, inventory, restocks, suppliers,
            expenses, calendar, reports, activity, settings, backup
  domain/ money.js, quantity.js, dates.js, schedule.js, allocation.js, saleTotals.js, reports.js
  services/ (one per business operation group)
  data/ adapter.js, mockAdapter.js, firestoreAdapter.js, collections.js
  styles/ tokens.css, base.css, components.css
tools/ build.js
tests/ domain/*.test.js, services/*.test.js, e2e/*.spec.js
dist/ index.html, app.js, app.css, vendor/, config/, assets/
firebase/ firestore.rules, firestore.indexes.json
```
