# Development Phases

Never mark a phase complete until its acceptance criteria are verified.

## Phase 0 — Requirements & Architecture
- **Objective:** Complete interview; produce and approve the design.
- **Deliverables:** PROJECT_OVERVIEW, REQUIREMENTS, SYSTEM_ARCHITECTURE, DATABASE_DESIGN, DATA_DICTIONARY, BUSINESS_RULES, UI_UX_GUIDELINES, DEVELOPMENT_ROADMAP, TESTING_STRATEGY, FIREBASE_SETUP.
- **Acceptance criteria:** All interview rounds answered ✅ · documents drafted ✅ · approval items in OPEN_QUESTIONS resolved ✅ · user explicitly approves ✅ (D-017).
- **Status:** Complete (2026-11-25).

## Phase 1 — Foundation & Firebase spike
- **Scope:** repo layout, `tools/build.js` (esbuild → IIFE; dev → `/build`, release minified → `/dist` per D-018), dist smoke test, vendored React 18.3.1 UMD, Firebase compat, Inter, icons; `dist/index.html` opens via `file://`; Mock adapter skeleton; spike page.
- **Spike checks (Chrome, Edge, Firefox on Windows; phone deferred per D-014):** compat scripts load; email/password sign-in; session survives restart; Firestore read/write/transaction; persistent cache; offline detection; fonts load.
- **Acceptance:** `dist/index.html` renders a React page by double-click with network disabled; spike results recorded in TESTING_STATUS and KI-001 updated; go/no-go decision recorded in DECISIONS.
- **Status:** In progress (started 2026-11-25).
- **Progress 2026-11-25:**
  - ✅ Build pipeline (`tools/build.cjs`): dev → `/build`, release (minified) → `/dist`.
  - ✅ Vendored React 18.3.1 UMD, Firebase 12.13.0 compat (app/auth/firestore), Inter font, license notices.
  - ✅ Foundation screen with environment checks; Mock adapter (transactions, optimistic concurrency); Firestore adapter (unverified).
  - ✅ Verified: `/build` and `/dist` open from `file://` with network disabled in Chromium (Playwright) — no errors, no network requests.
  - ✅ Firebase spike passed in Chromium (D-019): auth, write, read, transaction, listener, session restore, offline cache.
  - ☐ Manual check in Edge / Chrome / Firefox on the owner's Windows PC.
  - ☐ Icons (moved to Phase 2 with the component library).

## Phase 2 — Design system & app shell
- **Scope:** tokens.css, components (Button, Input, MoneyInput, QtyInput, Select, Combobox, Table, Dialog, Toast, Badge, EmptyState, Skeleton, Tabs), layout, hash router, route guard, login page, idle lock, change password, theme/palette/density settings, offline & demo banners, general settings.
- **Acceptance:** all components shown on an internal "kitchen sink" page in light/dark × 5 palettes; unauthenticated access redirects to login; idle lock works; keyboard navigation verified.
- **Status:** Implemented and tested in demo mode (2026-11-25). Remaining for completion: real-Firebase login check after the owner publishes rules and runs setup; manual keyboard pass; Combobox/MoneyInput/QtyInput components move to Phases 4–6 where first needed.
- **Built:** components (Button, IconButton, TextField, PasswordField, SelectField, TextAreaField, Segmented, Badge, Banner, Spinner, EmptyState, PageHeader, Panel, Tabs, DataTable, Dialog, Toast, Icon), hash router, app shell (sidebar groups, collapsible, phone drawer, top bar, user menu, online status, demo/offline banners), auth (username login, first-time owner setup, forgot password, idle lock, change password, sign out), settings (General, Appearance, Account, System), public System check page, dev-only UI reference (#/dev/ui), Firestore rules for Phase 2 collections.

## Phase 3 — Domain core
- **Scope:** money.js, quantity.js, dates.js (Asia/Manila business dates, 15th/EOM candidates), schedule.js, allocation.js, saleTotals.js, reports.js.
- **Acceptance:** unit tests for every BR in §0, §3–5, §7 pass, including rounding (sum = financed), Feb/leap years, semi-monthly, overpayment allocation, void reversal.
- **Status:** Complete (2026-11-25) for money, quantity, dates, schedule, allocation/void, sale totals/discount/terms, credit-limit, reliability, aging, doc numbers — 27 tests pass. Report aggregation functions deferred to Phase 10 (they depend on stored data shapes).

## Phase 4 — Inventory
- **Scope:** item CRUD/archive, sack–kg link, movements list, item history, adjustments with reasons, open sack, stock count, low-stock, valuation.
- **Acceptance:** every quantity change produces a movement ✅ (ledger invariant checked in service tests); negative stock impossible ✅ (domain, transaction and rules); open sack atomic ✅; count finalize creates correct adjustments ✅.
- **Status:** Implemented and tested (2026-11-25) in demo mode (unit/service tests, E2E 15/15) and against the Firestore emulator (real services through the rules, 7 tests). Remaining for "Verified": owner publishes rules + indexes (FIREBASE_SETUP "Phase 4") and tries it on the real database.
- **Built:** item list (search, status/unit/stock filters, low/out-of-stock badges, value at cost, totals, summary strip), item add/edit dialog (sack weight, link per-kg ↔ sack, opening stock, price-below-cost warning), item detail (stats, details, stock history), archive/restore, stock adjustment (reason list, note for Other, preview), open sack (default kg cost, override, preview), Movements page (type/date/item filters, show more), Stock count (draft, save, discard, finalize with confirmation, read-only after), activity-log entries for every action, sample data (D-025), Firestore rules + indexes for Phase 4.
- **Decisions in this phase:** stock count compares counted quantities with stock *at finalize time*, not at draft creation (sales may happen during counting); uncounted lines are ignored. KG item cost is set to the confirmed value when a sack is opened (BR-016).

## Phase 5 — Customers
- **Scope:** customer CRUD/archive, alternate contacts, type, credit limit, search, detail page shell, Walk-in system customer.

## Phase 6 — Sales
- **Scope:** new sale form, Sale ID generation, discount, terms (full/open balance/installment), stock re-validation in transaction, sales list/detail, cancel with reversal, delivery status, receipts.
- **Acceptance:** concurrent-sale test cannot oversell; IDs never duplicate; cancel restores stock and voids payments exactly.

## Phase 7 — Installments, payments, collections
- **Scope:** schedule creation and preview, payment recording with allocation, void, reschedule with revisions, collections screen, reminder copy, customer statement data.

## Phase 8 — Restocking, suppliers, expenses
## Phase 9 — Calendar
## Phase 10 — Dashboard & reports
## Phase 11 — Activity log UI, backup/restore, opening balances
## Phase 12 — Firebase go-live & release
- **Scope:** deploy rules & indexes, create owner account + username, optional Hosting deploy, E2E suite on `file://` build, release folder, user guide.

(Detailed tasks and acceptance criteria for phases 8–12 will be expanded when Phase 7 completes.)
