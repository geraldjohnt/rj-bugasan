# Changelog

## 2026-11-25
- Created project memory structure and root CLAUDE.md protocol.
- Completed requirements interview (8 rounds) and drafted all Phase 0 design documents.
- Added TESTING_STRATEGY.md and FIREBASE_SETUP.md to project-memory.
- Design approved (D-017). Added release rule (D-018).
- Phase 1 foundation: build pipeline, vendored React/Firebase/Inter, Mock + Firestore adapters, foundation screen, tests.
- Connected Firebase project `rj-bugasan` (web config); spike part 1 passed.
- Firebase spike passed (D-019 GO).
- Phase 3 domain core; Phase 2 app shell, authentication, settings, design system; Firestore rules (Phase 2 scope).
- **Release 0.1.0** merged to main via https://github.com/geraldjohnt/rj-bugasan/pull/1 (minified `/dist`).
- **Phase 4 — Inventory:** items (add/edit/archive/restore, sack ↔ per-kg link, opening stock), stock adjustments with reasons, open sack, movements list and item history, stock count (draft → finalize), low stock and valuation, activity-log entries, Firestore rules + indexes, sample data loader (Settings → System). Root README now shows the phase table.
- **Release 0.2.0** (Phase 4 Inventory) via https://github.com/geraldjohnt/rj-bugasan/pull/3 (minified `/dist`).
- **Phase 5 — Customers:** customer list and detail, add/edit with credit limit, alternate contacts (single primary), archive/restore (blocked while a balance is owed), built-in Walk-in customer, search by phone digits and contact names, activity-log entries, Firestore rules for customers, sample customers.
- **Release 0.3.0** (Phase 5 Customers) via https://github.com/geraldjohnt/rj-bugasan/pull/4 (minified `/dist`).
- **Phase 6 — Sales:** New sale screen (customer and item search, live stock check, price override with below-cost warning, whole-sale discount, Full / Partial-pay-later / Installment terms, live schedule preview with editable due dates, credit-limit warning with logged override, delivery status), Sale IDs `RJ-YYYY-NNNNN` from yearly counters, sales list with filters and totals, sale detail, cancel with reason (stock returned, payments refunded, rows cancelled), delivery/notes updates, printable sale receipts, Settings → Sales, sample sales.
- **Phase 7 — Installments, payments, collections:** record payment (oldest installment first, overpayment rejected), void payment with reason, reschedule with revision history, Collections screen (Overdue / Due today / Next 7 days / Later / No due date) with contacts and copy-reminder, payment receipts, customer Sales/Payments/Schedule/Statement tabs with printable statement, reliability counters.
- Firestore rules for counters, sales, installments and payments (35 emulator tests, mutation-checked).
- **Release 0.4.0** (Phases 6–7 Sales, payments, collections) via https://github.com/geraldjohnt/rj-bugasan/pull/5: minified `/dist`, verified (unit 76/76, rules 35/35, dist smoke, E2E 16+15+12+16).
- **Phase 8 — Restocking, suppliers, expenses:** suppliers list/detail with archive, restock orders `RS-YYYY-NNNNN` (new, edit while open, receive partial/full with stock-in movements and the pre-checked "Update item cost", cancel when nothing received, close a short delivery), expenses with void, rules, sample data.
- **Phase 9 — Calendar:** month and agenda views derived from sales, installments (due/overdue), deliveries and restocks, category filters, custom events (add/edit/delete), click-through, overdue banner.
- **Phase 10 — Dashboard & reports:** dashboard KPIs (revenue vs cash, gross/net profit, receivables, overdue, stock value), needs-attention list, 14-day chart, upcoming collections, recent sales, low stock; Reports (Sales, Profit by item, Profit & loss, Cash collected, Receivables aging, Inventory valuation, Movements & losses, Restocks by supplier) with presets, print/PDF and CSV.
- Tests: unit/service 97/97, rules 39/39 (mutation-checked), E2E shell 16 + inventory 15 + customers 12 + sales 16 + restocks 12 + calendar 10 + reports 12 on `/build`. Not yet released.
- **Release 0.5.0** (Phases 8–10) via https://github.com/geraldjohnt/rj-bugasan/pull/6: minified `/dist`, verified (unit 97/97, rules 39/39, dist smoke, E2E 16+15+12+16+12+10+12).
- **Installments:** 2-payment plans added (2, 3, 4 or 5) and **2 is now the default** (D-043).
- **Phase 11:** Activity log screen; Backup (download, 7-day reminder, owner-only restore with typed RESTORE); Opening balances (`OB-YYYY-NNNNN`) with own screen, customer-page button, sample data; rules + index.
- **Phase 12:** in-app User guide (`guide.html`), `npm run deploy:rules`, `npm run verify:release`, go-live checklist.
- Header "Online" indicator is green.
- **Release 0.6.0** (Phases 11–12, 2-payment default, green Online) via https://github.com/geraldjohnt/rj-bugasan/pull/7 (merged; minified `/dist`, all release checks passed).

## 2026-11-26
- Sidebar brand (`.brand-name`) shows the business name from Settings → General (falls back to "RJ Inventory & Sales"; long names are cut with "…").
- **Release 0.6.1** (sidebar business name): `/dist` rebuilt and verified (unit 104/104, rules 43/43, smoke, all 8 E2E suites).
- Items have a **Payday price** beside the cash price (D-046); new sales use it for Open balance and Installment terms. Items list/detail show both; changes are activity-logged; Firestore rules accept the field.
- Items page → **Price poster** (D-047): downloadable Facebook "Price update" PNG with Cash price and Payday option panels; no-stock items crossed out (or left out). Inter 800/900 weights vendored.
- Two E2E timing races fixed (inventory focus check, system opening-balance preselect) — both also failed on the unchanged code.
- **Release 0.7.0** (payday price, price poster): `/dist` rebuilt and verified (unit 110/110, rules 43/43, smoke, all 8 E2E suites).
- Official R&J Bugasan logo (D-048): favicon, sidebar and sign-in brand, and the header of printed receipts and statements.
- Fixed: Reschedule dialog could lose a row's amount when the rows loaded after the dialog opened (React "controlled to uncontrolled" warning; caused an intermittent sales E2E failure).
- **Release 0.7.1** (official logo, reschedule fix): `/dist` rebuilt and verified (unit 110/110, rules 43/43, smoke, all 8 E2E suites).
- Printing: browser header/footer (page URL, date) no longer printed on receipts, statements and reports (`@page` margin 0, spacing moved inside the document).
- **Release 0.7.2**: `/dist` rebuilt and verified (unit 110/110, rules 43/43, smoke, all 8 E2E suites).
- Calendar: clicking an entry now pops up a details modal instead of leaving the calendar (D-049); "Open sale" / "Open restock" in the modal opens the full record, custom events get an Edit button.
- **Release 0.7.3** (calendar details modal): `/dist` rebuilt and verified (unit 110/110, rules 43/43, smoke, all 8 E2E suites).

## 2026-11-27
- **Phase 13 — Restock batches and other charges** (not yet released): every restock delivery is a batch `RJ-RS-<supplier code>-NNNN` with its own cost and cash price; sales take the oldest batch first (owner can pick a batch), lines across batches use the weighted price, profit uses the real batch cost, cancel returns stock to the same batches; old stock registered automatically as each item's first batch; batches shown and editable on the item page; supplier codes SUP001…; New sale **Other charges** (delivery fee etc.) with suggestions, on receipts and reports; Firestore rules, sample data and user guide updated. Decisions D-050 … D-056 (D-007 and D-053 superseded).
- **Release 0.8.0** (Phase 13): minified `/dist`, Verified on minified `/dist` (`npm run verify:release`): unit 132/132, rules 46/46, dist smoke, all 9 E2E suites (incl. batches 11 steps).
- "Load sample data" removed from every page's empty state; it is only in Settings → System and asks for the password first (D-057).
- **Release 0.8.1** (D-057): Verified on minified `/dist` (`npm run verify:release`): unit 132/132, rules 46/46, dist smoke, all 9 E2E suites.

## 2026-11-27 — Android APK (D-058)
- New `android/` wrapper (WebView activity, print/download/file-picker bridge), `tools/build-apk.cjs`, `npm run apk`, `npm run test:apk` (`tests/smoke/apk-check.js`).
- Built `apk/rj-ims-0.8.1.apk` from the current `/dist` for owner testing. APK builds run only when the owner asks (not part of `npm run release`). `/dist` and the app version unchanged.

## 2026-11-27 — 0.9.0: Android app download in Settings (D-059)
- APKs now live in `dist/apk/` (0.8.1 moved there); the release build keeps that folder.
- Settings → System → **Android app**: "Download Android app" (newest APK) and "Earlier versions".
- Built `dist/apk/rj-ims-0.9.0.apk`. **Release 0.9.0** merged to main.

## 2026-11-28 — 0.10.0: Phase 14 restock expenses
- Receive dialog: expense lines (free text, suggestions), split by value, cost incl. expenses and profit per unit shown (D-060, D-061).
- Restock expenses saved to Expenses as category "Restock", linked to the restock; changed only from the restock (D-062).
- Received deliveries editable: unit cost, cash price, expenses; cost changes update past sale costs from that batch (D-063).
- "New item" (full item form) on the restock order form (D-064).
- Rules, sample data, user guide, tests (unit 142, rules 48, new E2E `restockExpenses` 9 steps).
- **Release 0.10.0:** `npm run release` + `npm run verify:release` passed on `/dist`; PR created and merged to main.
