# Implementation Notes

**Last updated:** 2026-11-25

## Commands (developer machine; Node 22+)
| Command | Purpose |
|---|---|
| `npm install` | Install dev dependencies (esbuild, React, Firebase, Inter) |
| `npm run build` | Dev build → `/build` (readable, inline source maps, includes `spike.html`) |
| `npm run release` | Release build → `/dist` (minified, no maps, no spike) — only when releasing (D-018) |
| `npm test` | Unit/service tests (`node --test "tests/**/*.test.js"`) |
| `npm run test:build` / `test:dist` | Smoke test: opens folder via file:// in Chromium, offline; fails on any error, missing file or network request |

## Additional commands
| `npm run test:e2e` | Click-through test of the shell in demo mode against `/build` (pass `dist` as arg for release) |
| `npm run test:rules` | Firestore rules tests in the emulator (needs Java; downloads the emulator once) |

## Code locations
- `tools/build.cjs` — build script (CommonJS because package.json is `"type": "module"`).
- `src/index.html` — HTML template (classic script tags only).
- `src/main.jsx` — entry; picks adapter via `src/data/adapter.js`.
- `src/data/mockAdapter.js` — demo/dev adapter with Firestore-like transactions.
- `src/data/firestoreAdapter.js` — Firestore compat wrapper (not yet verified, TQ-1).
- `src/app/App.jsx` — providers + route guard; `src/app/Shell.jsx` sidebar/top bar; `src/app/routes.js` menu + phase map.
- `src/app/router.jsx` (hash router), `src/app/prefs.jsx` (appearance; pre-paint copy in `src/index.html`).
- `src/auth/` — `authService.js` (Firebase + demo), `AuthContext.jsx` (session + idle lock), `AuthPages.jsx` (login, setup, lock, reset, change password).
- `src/components/` — shared UI. `src/features/` — pages (settings, system check, placeholder, dev UI reference).
- `src/domain/` — pure business logic (Phase 3); `inventory.js` (Phase 4 rules: item form validation, applyDelta, adjustments, open-sack plan, count plan, stock status, valuation).
- `src/data/inventoryService.js` — inventory transactions (create/update/archive item, adjust, open sack, counts). Every quantity change writes item + movement + activity log in one transaction.
- `src/data/activityLog.js` (log entry inside a transaction), `src/data/useData.js` (live `useQuery`/`useDoc` hooks, `actorOf`, `errorMessage`), `src/data/sampleData.js` (D-025).
- `src/features/inventory/` — ItemsPage, ItemDetailPage, MovementsPage (+ MovementsTable), StockCountPages, InventoryDialogs (item form, adjust, open sack, confirm, StockBadge).
- `src/features/system/SampleData.jsx` — "Load sample data" button/panel. `src/app/format.js` — timestamp display (Firestore Timestamp or ISO).
- `firebase/firestore.indexes.json` — composite indexes (referenced from firebase.json).
- `wrapFirestore(db, FieldValue)` in firestoreAdapter.js wraps any compat Firestore (used by rules tests to run real services in the emulator).
- `firebase/firestore.rules`, `firebase.json` (emulator on port 8085).
- `src/styles/` — `tokens.css` (design tokens), `fonts.css`, `base.css`.
- `src/spike/` — Firebase file:// spike page (dev build only).
- `config/firebase-config.js` — `window.RJ_FIREBASE_CONFIG` (null = demo mode). Not a secret.
- `tests/services/`, `tests/smoke/dist-smoke.js`.

## Firebase
- Project `rj-bugasan`; config in `config/firebase-config.js` (committed; not a secret). With a config present the app uses the Firestore adapter; set to `null` for demo mode.
- Probing from this cloud container: launch Chromium with `proxy: { server: process.env.HTTPS_PROXY }` (CA already trusted in NSS; never disable TLS checks).
- Analytics is deliberately not loaded.
- Spike finding: the first `onSnapshot` event and cache reads can show pre-transaction values (local cache first, server update after). UI must render from listeners (and may show "syncing" when `metadata.fromCache`/`hasPendingWrites`); never assume a cache read right after a transaction is current.
- Offline transactions do not reject quickly; they hang until the server is reachable. Services must check `navigator.onLine` (and the offline banner state) before starting a write and use a timeout.
- The offline smoke test forbids network requests; once screens load data at startup, it must allow (and expect failures from) Firestore/Auth hosts while offline.

## Patterns and gotchas
- Files containing JSX must be `.jsx` (esbuild only enables JSX for that extension).
- Demo mode for tests: inject `Object.defineProperty(window, 'RJ_FIREBASE_CONFIG', { get: () => null, set: () => {} })` via `addInitScript`.
- Demo credentials: owner / demo1234 (demo only; shown on the login page).
- `html[data-app-ready="true"]` is set once the session state is known (tests wait on it).
- Layout gotcha found by E2E: any extra direct child of `.shell` takes a grid cell (the drawer scrim must be `display:none` on desktop).
- `@firebase/rules-unit-testing` 6.x needs Firebase 13; we use 5.x with Firebase 12.13.0.
- No imports of React: JSX compiles to `React.createElement` against the global from `vendor/react.js`.
- React 18.3.1 is the last version with UMD builds; do not upgrade to 19 without replacing the loading strategy.
- Firebase 12.13.0 still ships `firebase-*-compat.js` UMD files at the package root. The npm package has no LICENSE file; the build writes a notice from package.json.
- Node 22 `--test` needs a glob, not a directory.
- Bootstrap of the first `users/{uid}` and `usernames/{username}` docs is still to be designed (Firestore console entry or one-time setup flow guarded by a bootstrap flag).

## Release procedure (D-018)
See root CLAUDE.md "Release procedure".

## Phase 4 notes
- Adapters now also provide `subscribeDoc(col, id, cb, onError)`; the Firestore adapter reads with `serverTimestamps: 'estimate'` so freshly written docs sort and display correctly before the server confirms.
- Rules test files share one emulator project: run them serially (`--test-concurrency=1`), otherwise `clearFirestore` in one file wipes the other's data.
- Grid children default to `min-width: auto`; a wide table then pushes the page sideways on phones. `.stack > *, .panel, .page { min-width: 0 }` keeps tables inside their scroll wrapper.
- E2E field helper: locate inputs by the start of their label text (`.field-label` regex), scoped to `.dialog` or `.toolbar`.

## Phase 5 notes
- `src/domain/customers.js` — form/contact validation, `upsertContact` (single primary), `matchesCustomer` (search incl. phone digits), `assertEditable`/`assertArchivable`, `WALK_IN` template, reliability label.
- `src/data/customerService.js` — `ensureWalkIn`, `createCustomer`, `updateCustomer`, `setCustomerStatus`, `saveContact`, `removeContact`; each with an activity-log entry in the same transaction. Summary fields are never written by the customer form (BR-023); Phases 6–7 services own them.
- `src/features/customers/` — CustomersPage (+ `useCustomers` hook, which calls `ensureWalkIn` once when online), CustomerDetailPage (tab in URL: `#/customers/{id}/{tab}`), CustomerDialogs, CustomerBadges (reliability).
- Routes: `/customers`, `/customers/:id`, `/customers/:id/:tab` in `src/app/App.jsx`.
- No composite index is needed for Phase 5 (list query is a single `orderBy nameLower`).
- (Phases 6–7 followed the plan noted here earlier: `paymentIds` + `installmentCount` on the sale (D-033), one movement per item per sale, at-sale payments reversed only by cancel (D-032).)

## Phases 6–7 notes
- `src/domain/sales.js` — `planSale()` turns the New Sale form into a validated plan (lines with snapshots, totals, paid now, receivable rows, credit warning). The form calls it live and `createSale` calls it again inside the transaction with fresh item/customer data, so the screen shows exactly what is saved. Also labels, `DEFAULT_SALES_SETTINGS`, `validateSalesSettings`, `paymentStatusOf`, `nextSeq`.
- `src/domain/collections.js` — `groupCollections` (D-036), `reminderText` (template placeholders), `reliabilityDelta` (D-034), `buildStatement` (closing balance = outstanding).
- `src/data/salesService.js` — `createSale` (counter, items, movements, payment, rows, sale, customer summary, activity log; creates Walk-in if missing — D-029), `cancelSale`, `updateFulfillment`; helpers `readSale`, `readRows`, `paymentDoc`.
- `src/data/paymentService.js` — `recordPayment`, `voidPayment`, `reviseSchedule`. Revision `at` is a client ISO string because `serverTimestamp()` is not allowed inside arrays.
- `src/data/settingsRepo.js` — `loadSalesSettings` / `saveSalesSettings` (`settings/sales`).
- `src/components/Combobox.jsx` — searchable select (↑/↓/Enter/Esc), used for customers and items.
- `src/features/sales/` — NewSalePage, SalesPage, SaleDetailPage (+ cancel/delivery dialogs), SaleTables (sales/payments/schedule tables, status badges), PaymentDialogs (record, void, reschedule), CollectionsPage (+ `copyText` with clipboard fallback), Print (`usePrint`, `useBusiness`, SaleReceipt, PaymentReceipt, StatementDoc).
- Printing: `usePrint()` portals the document into `.print-root` on `<body>` and calls `window.print()`; `@media print` hides everything else. E2E stubs `window.print` and records the printed text.
- Routes: `/sales/new` (`?customer=` preselects), `/sales`, `/sales/:id`, `/collections`, `/collections/:tab` (overdue, today, week, later, no-date), `/settings/sales`.
- E2E helper: the Combobox is driven by clicking its input, typing, then clicking `.combobox-option`.
- Rules: counters accept only `sale-YYYY` / `payment-YYYY` and only `next + 1`; sales are locked except payment totals, delivery, notes and cancellation; installments keep `paidC ≤ amountC` and a status that matches; payments only ACTIVE → VOIDED.

## Phases 8–10 notes
- `src/domain/purchasing.js` — supplier/restock/expense validation, `planReceipt` (received ≤ remaining, status), `statusFromLines`, `costDiffers` (BR-062), `EXPENSE_CATEGORIES`.
- `src/data/purchasingService.js` — suppliers (create/update/archive), restocks (`createRestock` with counter `restock-YYYY`, `updateRestock`, `receiveRestock` → RESTOCK_RECEIPT movements via `writeItemMovement` from salesService + optional cost update, `cancelRestock`, `closeRestock` D-038), expenses (`createExpense`, `voidExpense`). Receipt `at` is a client ISO string (no serverTimestamp inside arrays).
- `src/domain/calendar.js` — `monthGrid`, `gridRange`, `buildEvents` (derived entries, D-040), `eventsByDate`, `validateEventForm`. `src/data/calendarService.js` — custom events create/update/delete.
- `src/domain/reports.js` — all report aggregation (BUSINESS_RULES §7), `netLineRevenue` (D-042), `receivablesAging`, `movementReport`, `restocksBySupplier`, `dailySeries`, `presets`, `toCsv`.
- `useQuery(adapter, col, null, key)` now means "no listener, rows = []" (reports load only what the open tab needs while keeping hook order fixed).
- Screens: `src/features/purchasing/` (SuppliersPage + SupplierDetailPage, RestocksPage + RestockFormPage, RestockDetailPage with ReceiveDialog/ReasonDialog, ExpensesPage, PurchasingParts), `src/features/calendar/CalendarPage.jsx`, `src/features/dashboard/DashboardPage.jsx` (`RevenueCashChart`: SVG grouped bars, one axis, hover tooltip, table view; series colours validated with the dataviz validator — light contrast WARN covered by the table view), `src/features/reports/ReportsPage.jsx` (`buildReport` per tab, `downloadText` for CSV with BOM, `ReportDoc` print).
- Routes: `/` dashboard, `/calendar/:view?m=YYYY-MM`, `/reports/:tab?from&to`, `/suppliers`, `/suppliers/:id`, `/restocks`, `/restocks/new?supplier=`, `/restocks/:id`, `/restocks/:id/edit`, `/expenses`.
- Restock form and receive rows reuse the `.sale-line` grid from New sale.
- E2E: `restocks.e2e.js`, `calendar.e2e.js` (dates computed in Asia/Manila), `reports.e2e.js` (uses `acceptDownloads` for CSV).

## Phases 11–12 notes
- `src/domain/backup.js` — file format, `encodeValue`/`decodeValue` (`{$ts}`), `buildBackup`, `parseBackup` (plain-language errors, strips BOM), `planRestore` (replace: deletes extras), `backupAge`/`backupIsDue`. `src/data/backupService.js` — `exportBackup` (records `settings/backup`, logs), `restoreBackup` (opens/closes `settings/restore` window, batches of 400, progress callback, logs).
- Adapters gained `batchWrite(ops)`, `isTimestamp(v)`, `timestampFromISO(iso)`; `wrapFirestore(db, FieldValue, Timestamp)` — pass `firebase.firestore.Timestamp` (rules tests do for restore).
- `src/domain/openingBalance.js` (`validateOpeningBalanceForm`, `splitEvenly`), `src/data/openingBalanceService.js` (`createOpeningBalance`). `cancelSale` skips the total-purchases reversal for OB.
- Screens: `src/features/system/ActivityLogPage.jsx`, `src/features/system/BackupPage.jsx` (+ `BackupReminder`, `downloadJson` without BOM), `src/features/sales/OpeningBalancesPage.jsx` (+ `OpeningBalanceDialog`, reused on the customer page). SaleDetailPage/SaleTables/SalesPage handle `kind === 'OPENING_BALANCE'`.
- Routes: `/activity`, `/backup`, `/opening-balances`. Nav items are now 30 px high so all 20 fit a 1366×768 screen.
- User guide: `src/guide.html` copied by `tools/build.cjs` (minified in release); link in the user menu (`href="guide.html"`, new tab).
- E2E `tests/e2e/system.e2e.js` (uses Playwright downloads and `setInputFiles('#backup-file')`). Sales E2E: Carmen's outstanding/statement include the sample OB (₱5,200).
- Header "Online" indicator uses `--success` (green) — user request 2026-11-25.
