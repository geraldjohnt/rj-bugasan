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
- **Release 0.4.0** (Phases 6–7 Sales, payments, collections): minified `/dist`, verified (unit 76/76, rules 35/35, dist smoke, E2E 16+15+12+16).
