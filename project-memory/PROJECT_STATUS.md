# Project Status

**Last updated:** 2026-11-26
**Overall status:** Design approved (D-017). Implementation started.
**Current phase:** Phases 11 (Activity log, backup/restore, opening balances) and 12 (go-live & release prep) — implemented, tested, released as 0.6.0; all development phases built. Remaining: owner go-live steps (FIREBASE_SETUP "Phases 11–12 — go-live checklist").
**Implementation status:** App shell, login/setup/lock/settings, design system, business calculation core and the Inventory module the Customers module, and Sales / Payments / Collections (new sale, sales list/detail, cancel, delivery, receipts, record/void payment, reschedule, Collections screen, customer statement, Settings → Sales, sample sales), Restocks/Suppliers/Expenses, Calendar, Dashboard and Reports exist and are tested. Phase 11 (Activity log, Backup/restore, Opening balances) and Phase 12 (user guide, deploy/verify scripts, go-live checklist) exist and are tested. Installment plans: 2–5 payments, default 2 (D-043).

## Completed
- Phase 0: requirements interview (8 rounds) and design documents; approved 2026-11-25.
- Phase 1 (partial): build pipeline (`/build` dev, `/dist` minified release), vendored React 18.3.1 + Firebase 12.13.0 compat + Inter,
  Mock adapter with transactions (8/8 tests pass), Firestore adapter (unverified), foundation screen, offline file:// smoke test (passes in Chromium).

## Releases
- 0.1.0 — 2026-11-25 — https://github.com/geraldjohnt/rj-bugasan/pull/1 (merged). Verified: unit 35/35, rules 15/15, dist smoke, dist E2E 16/16 (earlier recorded as 17/17; the script has 16 steps).
- 0.2.0 — 2026-11-25 — Phase 4 Inventory — https://github.com/geraldjohnt/rj-bugasan/pull/3. Verified on minified `/dist`: unit 53/53, rules 22/22, dist smoke, E2E shell 16/16 + inventory 15/15.
- 0.4.0 — 2026-11-25 — Phases 6–7 Sales, payments, collections — https://github.com/geraldjohnt/rj-bugasan/pull/5 (merged). Verified on minified `/dist`: unit 76/76, rules 35/35, dist smoke, E2E shell 16/16 + inventory 15/15 + customers 12/12 + sales 16/16.
- 0.5.0 — 2026-11-25 — Phases 8–10 Restocks, suppliers, expenses, calendar, dashboard, reports — https://github.com/geraldjohnt/rj-bugasan/pull/6. Verified on minified `/dist`: unit 97/97, rules 39/39, dist smoke, E2E shell 16/16 + inventory 15/15 + customers 12/12 + sales 16/16 + restocks 12/12 + calendar 10/10 + reports 12/12.
- 0.3.0 — 2026-11-25 — Phase 5 Customers — https://github.com/geraldjohnt/rj-bugasan/pull/4. Verified on minified `/dist`: unit 62/62, rules 28/28, dist smoke, E2E shell 16/16 + inventory 15/15 + customers 12/12.
- 0.6.0 — 2026-11-25 — Phases 11–12 (activity log, backup/restore, opening balances, user guide), 2-payment installments (default), green Online indicator. Verified on minified `/dist` with `npm run verify:release`: unit 104/104, rules 43/43, dist smoke, E2E shell 16 + inventory 15 + customers 12 + sales 16 + restocks 12 + calendar 10 + reports 12 + system 11 (all pass). https://github.com/geraldjohnt/rj-bugasan/pull/7 (merged).
- 0.6.1 — 2026-11-26 — Sidebar shows the business name from Settings. Verified on minified `/dist` (`npm run verify:release`): unit 104/104, rules 43/43, dist smoke, E2E shell 16 + inventory 15 + customers 12 + sales 16 + restocks 12 + calendar 10 + reports 12 + system 11.
- GitHub Pages deploy — 2026-11-25 — https://github.com/geraldjohnt/rj-bugasan/pull/2 (merged). `.github/workflows/static.yml` publishes `/dist` on every push to main (D-023). Same checks passed; `/dist` unchanged.

## Completed 2026-11-25 (later)
- Phase 3 domain core (27 tests). Phase 2 shell + auth + settings (17-step E2E in demo mode), Firestore rules for Phase 2 (15 emulator tests).

## In progress
- Phase 1: only the Windows-browser check remains (KI-009); otherwise complete.

## Completed 2026-11-25 (Phase 4)
- Inventory module; Firestore rules + indexes for it; sample data (D-025); root README phase table (D-024). Tests: unit/service 53/53, rules 22/22, E2E shell 16/16 + inventory 15/15.

## Completed 2026-11-25 (Phase 5)
- Customers module; Firestore rules for customers; sample customers. Tests: unit/service 62/62, rules 28/28, E2E shell 16/16 + inventory 15/15 + customers 12/12.

## Completed 2026-11-25 (Phases 6–7, session 4)
- Sales, installments, payments and collections; Firestore rules for counters/sales/installments/payments; sample sales. The session-3 draft (D-028) was used as a starting point, reviewed, completed and tested. Tests: unit/service 76/76, rules 35/35 (mutation-checked), E2E shell 16/16 + inventory 15/15 + customers 12/12 + sales 16/16, offline smoke on `/build`.

## Completed 2026-11-25 (Phases 8–10, session 5)
- Suppliers, restocks (order/edit/receive with cost update/cancel/close), expenses; Calendar (month + agenda, filters, custom events); Dashboard and 8 reports with print and CSV; rules for suppliers/restocks/expenses/calendarEvents; sample data for Phases 8–9. Tests: unit/service 97/97, rules 39/39 (mutation-checked), E2E shell 16 + inventory 15 + customers 12 + sales 16 + restocks 12 + calendar 10 + reports 12, offline smoke on `/build`. Decisions D-038 … D-042.

## Completed 2026-11-25 (Phases 11–12, session 6)
- Activity log screen, backup/restore (D-044), opening balances (D-045), 2-payment plans default 2 (D-043), user guide, `deploy:rules`/`verify:release`, green Online indicator. Tests: unit/service 104/104, rules 43/43, E2E 16+15+12+16+12+10+12+11.

## Completed 2026-11-26 (session 7)
- Payday (installment) price per item and terms-based sale prices (D-046); Items → Price poster PNG for Facebook (D-047). Tests: unit/service 110/110, rules 43/43, all 8 E2E suites on `/build`. **Not yet released** — `/dist` still 0.6.1.

## Not started
- None (all phases built; Phase 12 "Verified" needs the owner's go-live steps).

## Blockers
- None.

## Standing instructions
- Release rule (D-018): on "create PR and merge to main" → `npm run release` → `npm test` + `npm run test:dist` → commit `/dist` → PR → merge.
- User prefers questions as click-to-answer options with a recommended default.
- Root README phase table must be updated whenever a phase changes (D-024).
- When a phase is done, add sample data for it (D-025).
- Keep the readable source (`/src`) committed; `/dist` is only the minified copy (user asked 2026-11-25; already the case).

## Immediate next actions
0. Firebase project `rj-bugasan` connected; Email/Password enabled; spike passed → GO (D-019).
1. ✅ Release 0.1.0 merged to main (2026-11-25, https://github.com/geraldjohnt/rj-bugasan/pull/1). `/dist` on main is the client folder.
2. Owner: follow FIREBASE_SETUP.md "Phase 2 — go-live of login": publish `firebase/firestore.rules`, create the owner in the app, disable public sign-up (KI-011).
3. Owner: confirm `/dist` works in Edge/Chrome/Firefox on the store PC (KI-009).
3a. Owner: set GitHub Settings → Pages → Source to "GitHub Actions" and add `geraldjohnt.github.io` to Firebase Auth authorized domains, then share https://geraldjohnt.github.io/rj-bugasan/ with the client.
3b. Owner: re-publish `firebase/firestore.rules` and create the two indexes (FIREBASE_SETUP "Phase 4"), then try Inventory (optionally Load sample data).
4. ✅ Phase 4 (Inventory) built and released as 0.2.0 (https://github.com/geraldjohnt/rj-bugasan/pull/3); GitHub Pages republishes `/dist` on merge.
4a. ✅ Phase 5 (Customers) built and released as 0.3.0 (https://github.com/geraldjohnt/rj-bugasan/pull/4); GitHub Pages republishes `/dist` on merge.
4b. Owner: re-publish `firebase/firestore.rules` (FIREBASE_SETUP "Phase 5"), open Customers once online (creates Walk-in).
4c. ✅ Phases 6–7 built, tested and released as 0.4.0; GitHub Pages republishes `/dist` on merge.
4d. Owner: re-publish `firebase/firestore.rules` (FIREBASE_SETUP "Phases 6–7"); optionally review Settings → Sales.
4e. ✅ Phases 8–10 built, tested and released as 0.5.0 (https://github.com/geraldjohnt/rj-bugasan/pull/6); GitHub Pages republishes `/dist` on merge.
4g. Owner (after release): re-publish `firebase/firestore.rules` (FIREBASE_SETUP "Phases 8–10"); try Reports → Export CSV and Print on the store PC (KI-015, KI-019).
4h. ✅ Phases 11–12 built and tested; release 0.6.0 (see Releases).
4i. Owner: go-live checklist in FIREBASE_SETUP "Phases 11–12" (publish rules + `activityLogs` index, owner account, close sign-up, enter opening balances, first backup, store-PC checks).
4k. Owner: re-publish `firebase/firestore.rules` (adds optional `installmentPriceC` on items) once this is released; then set each item's Payday price.
4j. Next development: only what the owner reports after go-live (KI-009/015/018/019/021).
5. (old) Start Phase 2 (design system components, app shell, hash router, login/idle-lock UI on Mock) and Phase 3 (domain core + tests).
