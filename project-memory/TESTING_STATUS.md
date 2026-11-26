# Testing Status

**Last updated:** 2026-11-25

Planned tests: see TESTING_STRATEGY.md.

| Test / check | Status | Date | Notes |
|---|---|---|---|
| Firebase `file://` spike (TQ-1) — part 1, no credentials (Chromium 158, Linux, via proxy) | PASS (partial) | 2026-11-25 | Origin `file://`. Firestore server reached: read on `_spike` returned `permission-denied` (rules working). Auth server reached: `auth/configuration-not-found` (Email/Password not yet enabled in console). `enablePersistence` → enabled. |
| Firebase spike — part 2 (Chromium 158, Linux, file://, throwaway account, persistent browser profile) | PASS 9/9 | 2026-11-25 | Create account; write; server read; transaction; realtime listener; login session restored after reopening the file; offline read from cache; offline transaction cannot commit; cleanup (test doc + account deleted). |
| Unit: `tests/services/mockAdapter.test.js` (8 tests incl. concurrent last-stock sale) | PASS 8/8 | 2026-11-25 | `npm test` |
| Smoke: `/build` from file://, offline, Chromium (Playwright, Linux) | PASS | 2026-11-25 | `npm run test:build` |
| Smoke: `/dist` (release, minified) from file://, offline, Chromium (Playwright, Linux) | PASS | 2026-11-25 | `npm run test:dist` |
| Windows Edge / Chrome / Firefox manual open | Not run | — | Needs owner's PC |
| Unit: domain (money, quantity, dates, schedule, allocation, sale totals) — 27 tests | PASS 27/27 | 2026-11-25 | `npm test` (35 total with mock adapter) |
| Security rules (Firestore emulator) — 15 tests | PASS 15/15 | 2026-11-25 | `npm run test:rules`; mutation check: weakening the bootstrap/owner rules made 2 tests fail as expected |
| E2E shell, demo mode, file:// — 17 steps (redirect, wrong/right login, session reload, layout, nav fits 1366×768, 404, dark/palette persist, density, settings validate+save, password mismatch, lock survives reload, sign-out, phone drawer, no JS errors) | PASS 17/17 | 2026-11-25 | `npm run test:e2e` (build) and on minified dist |
| Smoke /build and trial /dist (Phase 2 shell) | PASS | 2026-11-25 | dist not committed (release rule D-018) |
| Real Firebase login flow (setup owner, sign in, change password, reset email) | Not run | — | Needs rules published; owner performs setup |
| Release 0.1.0 verification on minified /dist | PASS | 2026-11-25 | unit 35/35, rules 15/15, smoke, E2E 17/17 |
| Unit + service: inventory domain (7) and inventory services on Mock adapter (11, incl. ledger invariant, concurrent last-stock removal, count at finalize time, sample data idempotent) | PASS 53/53 total | 2026-11-25 | `npm test` |
| Security rules incl. Phase 4 (22 tests; real inventory services run through the emulator) | PASS 22/22 | 2026-11-25 | `npm run test:rules` (files now run serially). Mutation check: removing the movement arithmetic rule and allowing item delete made 2 tests fail as expected |
| E2E inventory, demo mode, file:// on /build — 15 steps (validation, add sack/kg, link, duplicate name, open sack, adjust incl. limits, edit price, movements filter, stock count draft/reload/finalize, archive/restore, sample data ×2, low-stock filter, phone width, no JS errors) | PASS 15/15 | 2026-11-25 | `node tests/e2e/inventory.e2e.js build`; found and fixed: wide tables pushed the page sideways on phones |
| E2E shell on /build after Phase 4 (+ offline smoke on /build) | PASS 16/16, smoke PASS | 2026-11-25 | `npm run test:e2e` runs shell + inventory |
| Inventory on the real Firebase project | Not run | — | Needs rules + indexes published by the owner |
| Release 0.2.0 verification on minified /dist | PASS | 2026-11-25 | unit 53/53, rules 22/22, dist smoke, E2E shell 16/16 + inventory 15/15 |
| Unit + service: customers (validation, contacts/primary, search, reliability, create/edit/log, archive with balance, Walk-in, sample data) — 9 tests | PASS 62/62 total | 2026-11-25 | `npm test` |
| Security rules incl. Phase 5 (6 customer tests; real customer services through the emulator) | PASS 28/28 | 2026-11-25 | `npm run test:rules`. Mutation check: removing the BR-026 archive guard and the Walk-in field guard made 2 tests fail as expected |
| E2E customers, demo mode, file:// on /build — 12 steps (validation, add with credit limit, contacts add/edit/remove + single primary, tab in URL, edit/clear limit, duplicate-name warning, search by phone digits and contact name, archive/restore, Walk-in locked, sample data ×2 + type filter, phone width, no JS errors) | PASS 12/12 | 2026-11-25 | `node tests/e2e/customers.e2e.js build` |
| E2E shell + inventory on /build after Phase 5 (+ offline smoke on /build) | PASS 16/16, 15/15, smoke PASS | 2026-11-25 | Shell test now uses Collections as its "not built yet" example |
| Unit + service: sales & payments (walk-in sale/IDs/snapshot cost, stock guard across lines, concurrent last-sack sales, installment schedule + credit-limit override, edited due dates, cancel reversal, delivery update, oldest-first allocation + reliability, void + at-sale guard, reschedule rules, cancelled-is-final, open balance without due date, archived customer, sales settings validation, sample data idempotent) — invariants (stock ledger, rows vs balance, payments vs paid, outstanding, statement) checked after each scenario | PASS 76/76 total | 2026-11-25 | `npm test` |
| Security rules incl. Phases 6–7 (7 new tests: full lifecycle of the real services through the rules, no oversell, counters +1 only, sale arithmetic/Walk-in/locked/cancel final, installment paid ≤ amount/status/history, payment void-only, strangers denied; sample data incl. sales through the rules) | PASS 35/35 | 2026-11-25 | `npm run test:rules`. Mutation check: removing the sale paid+balance=total update rule, the payment void-only key guard and the counter +1 rule made 3 tests fail as expected |
| E2E sales, demo mode, file:// on /build — 16 steps (sample data, walk-in sale with 2 lines, stock guard, installment sale with override price + down payment + preview, record payment with allocation and overpayment error, void, reschedule total check, delivery, print sale/payment receipts, cancel with stock return, Collections overdue/contacts/copy reminder/pay, customer tabs + statement print, Settings → Sales prefix used, phone width, no JS errors) | PASS 16/16 | 2026-11-25 | `node tests/e2e/sales.e2e.js build`; found and fixed: Collections table wider than the page at 1366 px; item picker too narrow on New sale |
| E2E shell 16/16, inventory 15/15, customers 12/12 on /build after Phases 6–7 (+ offline smoke on /build) | PASS | 2026-11-25 | Shell test now uses Calendar as its "not built yet" example; customers test now expects the real Sales/Payments/Schedule tabs |
| Sales/payments on the real Firebase project | Not run | — | Needs release + rules published by the owner |
| Printing on a real printer / Save as PDF | Not run | — | E2E stubs `window.print`; owner to try a receipt on the store PC |
| Release 0.4.0 verification on minified /dist | PASS | 2026-11-25 | unit 76/76, rules 35/35, dist smoke, E2E shell 16/16 + inventory 15/15 + customers 12/12 + sales 16/16 |
| Unit + service: Phases 8–10 — purchasing domain (6: supplier/restock/receipt/expense validation, status flow, over-receive), calendar + reports domain (9: month grid incl. leap Feb, derived events, filters, sales summary, discount spread, cash/expenses/net, aging buckets, valuation, losses, restocks by supplier, daily series, presets, CSV escaping), services (6: supplier archive, restock order/partial/full receipt with cost update, edit/cancel/close, expenses void, calendar events, sample data idempotent) with stock-ledger and receipts invariants | PASS 97/97 total | 2026-11-25 | `npm test` |
| Security rules incl. Phases 8–9 (4 new tests: restock lifecycle through the rules, rejected direct writes, expenses void-only, calendar events) | PASS 39/39 | 2026-11-25 | `npm run test:rules`. Mutation check: removing "receipts only grow", the expense void-only key guard and the event time check made 3 tests fail as expected (the expense case needed a new assertion, added) |
| E2E restocks (Phase 8), demo mode, file:// on /build — 12 steps (sample data in every status, add supplier, new restock from supplier, receive partial at new cost with pre-checked update, over-receive error, edit below received refused, receive rest without cost update, cancel/close, expenses Other note + void totals, movements, phone width, no JS errors) | PASS 12/12 | 2026-11-25 | `node tests/e2e/restocks.e2e.js build` |
| E2E calendar (Phase 9) — 11 steps (today highlighted, all six categories from sample data, add custom event, details modal then Edit/move, filters remembered, month navigation, derived-entry details modal without navigation (D-049), day dialog → details → Open sale, delete, phone width, no JS errors) | PASS 11/11 | 2026-11-26 | `node tests/e2e/calendar.e2e.js build` |
| E2E dashboard & reports (Phase 10) — 12 steps (empty dashboard offers sample data, KPIs/attention/chart hover/table view, KPI links, every report cross-checked against the dashboard, presets + bad range, losses and restocks by supplier, CSV download content, print, phone width, no JS errors) | PASS 12/12 | 2026-11-25 | `node tests/e2e/reports.e2e.js build` |
| E2E shell 16/16, inventory 15/15, customers 12/12, sales 16/16 on /build after Phases 8–10 (+ offline smoke on /build) | PASS | 2026-11-25 | Shell test now uses Activity log as its "not built yet" example; sales test expects the Dinorado stock incl. sample restocks (32) |
| Phases 8–10 on the real Firebase project | Not run | — | Needs release + rules published by the owner |
| Release 0.5.0 verification on minified /dist | PASS | 2026-11-25 | unit 97/97, rules 39/39, dist smoke, E2E shell 16/16 + inventory 15/15 + customers 12/12 + sales 16/16 + restocks 12/12 + calendar 10/10 + reports 12/12 |
| Unit + service incl. Phase 11 (opening-balance validation/service/refusals, backup encode/decode, file checks, export → change → restore equals snapshot) and 2-installment schedules | PASS 104/104 | 2026-11-25 | `npm test` |
| Security rules incl. Phase 11 (4 tests: OB through real services, forged OB shapes, restore round-trip with paid rows + timestamps, staff refused) | PASS 43/43 | 2026-11-25 | `npm run test:rules`. Mutation check: removing the `settings/restore.active` condition made the restore test fail as expected |
| E2E system (Phase 11–12), demo mode, file:// on /build — 11 steps (backup reminder, OB list/totals not in Sales, add OB with validation + split, payment + Collections, customer-page button, activity log filter/search/link, backup download content, restore with wrong file / typed RESTORE / data back, phone width, user guide, no JS errors) | PASS 11/11 | 2026-11-25 | `node tests/e2e/system.e2e.js build` |
| E2E all suites on /build after Phases 11–12 | PASS shell 16, inventory 15, customers 12, sales 16, restocks 12, calendar 10, reports 12, system 11; smoke PASS | 2026-11-25 | sales E2E now checks the default 2-payment preview before switching to 3 |

## 2026-11-26 — Release 0.7.0 (payday price, price poster)
- `npm run verify:release` on minified `/dist`: unit/service 110/110, rules 43/43, dist smoke, E2E shell, inventory (incl. poster PNG download), customers, sales (incl. price follows terms), restocks, calendar, reports, system — all pass.

## 2026-11-26 — Release 0.7.1 (official logo)
- `npm run verify:release` on minified `/dist`: unit/service 110/110, rules 43/43, dist smoke, E2E shell (17, incl. logo), inventory, customers, sales, restocks, calendar, reports, system — all pass.

## 2026-11-26 — Release 0.7.2 (print footer)
- `npm run verify:release` on minified `/dist`: see release line in PROJECT_STATUS. Not automatable: whether the real print dialog omits its header/footer (Chrome/Edge do with a zero page margin).

## 2026-11-26 — Release 0.7.3 (calendar details modal)
- `npm run verify:release` on minified `/dist`: unit/service 110/110, rules 43/43, dist smoke, E2E shell, inventory, customers, sales, restocks, calendar (11), reports, system — all pass.
