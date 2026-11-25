# Development Phases

Never mark a phase complete until its acceptance criteria are verified.

## Phase 0 — Requirements & Architecture
- **Objective:** Complete interview; produce and approve the design.
- **Deliverables:** PROJECT_OVERVIEW, REQUIREMENTS, SYSTEM_ARCHITECTURE, DATABASE_DESIGN, DATA_DICTIONARY, BUSINESS_RULES, UI_UX_GUIDELINES, DEVELOPMENT_ROADMAP, TESTING_STRATEGY, FIREBASE_SETUP.
- **Acceptance criteria:** All interview rounds answered ✅ · documents drafted ✅ · approval items in OPEN_QUESTIONS resolved ☐ · user explicitly approves ☐.
- **Status:** In progress — awaiting user approval (2026-11-25).

## Phase 1 — Foundation & Firebase spike
- **Scope:** repo layout, `tools/build.js` (esbuild → IIFE), vendored React 18.3.1 UMD, Firebase compat, Inter, icons; `dist/index.html` opens via `file://`; Mock adapter skeleton; spike page.
- **Spike checks (Chrome, Edge, Firefox on Windows; plus Hosting URL on phone):** compat scripts load; email/password sign-in; session survives restart; Firestore read/write/transaction; persistent cache; offline detection; fonts load.
- **Acceptance:** `dist/index.html` renders a React page by double-click with network disabled; spike results recorded in TESTING_STATUS and KI-001 updated; go/no-go decision recorded in DECISIONS.
- **Status:** Not started.

## Phase 2 — Design system & app shell
- **Scope:** tokens.css, components (Button, Input, MoneyInput, QtyInput, Select, Combobox, Table, Dialog, Toast, Badge, EmptyState, Skeleton, Tabs), layout, hash router, route guard, login page, idle lock, change password, theme/palette/density settings, offline & demo banners, general settings.
- **Acceptance:** all components shown on an internal "kitchen sink" page in light/dark × 5 palettes; unauthenticated access redirects to login; idle lock works; keyboard navigation verified.
- **Status:** Not started.

## Phase 3 — Domain core
- **Scope:** money.js, quantity.js, dates.js (Asia/Manila business dates, 15th/EOM candidates), schedule.js, allocation.js, saleTotals.js, reports.js.
- **Acceptance:** unit tests for every BR in §0, §3–5, §7 pass, including rounding (sum = financed), Feb/leap years, semi-monthly, overpayment allocation, void reversal.
- **Status:** Not started.

## Phase 4 — Inventory
- **Scope:** item CRUD/archive, sack–kg link, movements list, item history, adjustments with reasons, open sack, stock count, low-stock, valuation.
- **Acceptance:** every quantity change produces a movement; negative stock impossible; open sack atomic; count finalize creates correct adjustments.

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
