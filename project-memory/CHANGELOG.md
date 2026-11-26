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
