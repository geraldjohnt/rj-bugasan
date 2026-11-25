# Session Log

## 2026-11-25 — Session 1: Project kickoff
- **Objective:** Set up project memory; begin requirements interview.
- **Work completed:** Created `CLAUDE.md` and `project-memory/`. Ran all 8 interview rounds (user prefers click-to-answer option prompts with a recommended default). Drafted all design documents.
- **Decisions:** D-001 to D-013.
- **Problems / risks found:** KI-001 to KI-007; notably phones cannot run a local HTML folder (KI-006) and username lookup privacy (KI-004).
- **Remaining work:** User approval (AQ-1 to AQ-5); Phase 1.
- **Next session objective:** Record approval decisions; start Phase 1 if approved.
- **Later in the same session:** Approval received (D-014..D-017). User added the release rule (D-018). Phase 1 foundation built: build pipeline, vendored deps, adapters, foundation screen, unit + smoke tests (all passing). Spike pending the user's Firebase project.
- **Files created:** package.json, package-lock.json, .gitignore, tools/build.cjs, config/firebase-config.js, src/**, tests/**.
- **Problems encountered:** firebase npm package has no LICENSE file (build writes a notice); Node 22 test runner needs a glob; npm audit grpc warning (KI-008).
- **Recommended next session objective:** Phase 2 + Phase 3 on demo data; run the spike once Firebase config arrives.

## 2026-11-25 — Session 1 (cont.): Firebase project connected
- User provided the Firebase web config (project `rj-bugasan`); committed to `config/firebase-config.js` per user instruction (not a secret; Analytics omitted).
- Spike part 1 (no credentials) passed in Chromium from file://: Firestore and Auth servers accept the origin; persistence enables. Auth not yet enabled in console.
- Next: user enables Email/Password + `_spike` rule → spike part 2; continue Phases 2–3.
- Spike part 2 passed 9/9 with a throwaway account (deleted afterwards). Decision D-019: GO for Firestore from file://.
- Phases 2 and 3 built (user chose "Start Phases 2 & 3"). Domain core with 27 tests; shell, login (username + first-time owner setup + reset + idle lock + change password), settings, design system; Firestore rules with 15 emulator tests (mutation-checked).
- Bugs found by tests and fixed: void left inconsistent row shape; drawer scrim pushed page content below the sidebar; sidebar did not fit 1366×768; field errors lingered while typing; setup race (auth event before profile existed).
- Next: first release (on user's "create PR and merge to main"), then owner go-live steps, then Phases 4–5.
- Release 0.1.0: release build verified (unit 35/35, rules 15/15, dist smoke, dist E2E 17/17), committed `/dist`, PR https://github.com/geraldjohnt/rj-bugasan/pull/1 created and merged to main.

## 2026-11-25 — Session 2: Phase 4 (Inventory)
- **Objective:** "Continue phase 4"; add phase table to root README (kept up to date); add sample data when a phase is done; keep the unminified source.
- **Work completed:** Phase 4 built end to end (domain, services, screens, rules, indexes, tests). Root README rewritten with phase table (D-024). Sample data loader (D-025). CLAUDE.md updated (README rule, sample-data rule, inventory E2E in the release checks).
- **Decisions:** D-024 … D-027.
- **Tests:** unit/service 53/53, rules 22/22 (mutation-checked), E2E inventory 15/15, shell E2E re-run (see TESTING_STATUS).
- **Bugs found and fixed:** page overflowed sideways at phone width with wide tables; rules test files raced on the shared emulator.
- **Source code question:** confirmed the readable source in `/src` is committed; `/dist` is generated from it.
- **Not done:** no release to `/dist` (only on "create PR and merge to main"); real-Firebase check of Phase 4 needs the owner to publish rules + indexes.
- **Next session objective:** Phase 5 (Customers) with sample customers.
- Release 0.2.0: release build verified on `/dist` (unit 53/53, rules 22/22, smoke, E2E 16/16 + 15/15), PR https://github.com/geraldjohnt/rj-bugasan/pull/3 created and merged to main.

## 2026-11-25 — Session 3: Phase 5 (Customers), release 0.3.0
- **Objective:** User asked "Proceed phases 5, 6, and 7", then mid-session: "Stop after phase 5. Create PR and merge."
- **Work completed:** Phase 5 end to end (domain, service, screens, rules, sample data, tests). Draft Phase 6/7 domain/services/screens were written, then removed from the branch per the user's instruction (D-028); a patch was kept only in the session scratchpad.
- **Decisions:** D-028 … D-031.
- **Tests:** unit/service 62/62, rules 28/28 (mutation-checked), E2E shell 16/16, inventory 15/15, customers 12/12 (see TESTING_STATUS).
- **Problems found and fixed:** shell E2E used Customers as its placeholder example (now Collections); an older rules test asserted customers were locked (now probes payments); package-lock root version was stale (0.1.0).
- **Next session objective:** Phase 6 (Sales) with sample sales.

## 2026-11-25 — Session 4: Phases 6 (Sales) and 7 (Installments, payments, collections)
- **Objective:** "Continue phase 6 and 7."
- **Work completed:** Started from the session-3 draft patch (D-028; still in an old scratchpad) as a reference: reviewed and kept its domain/services/screens, then completed what was missing — Collections page, Settings → Sales, CSS (sale layout, combobox, print), routes, customer detail tabs, Firestore rules for counters/sales/installments/payments, rules tests, sales E2E, sample sales, docs. Fixed: delivery could still be changed on a cancelled sale (service + rules now refuse); decision reference in the draft pointed to the wrong ID (now D-032).
- **Decisions:** D-032 … D-037.
- **Tests:** unit/service 76/76, rules 35/35 (mutation-checked), E2E shell 16/16, inventory 15/15, customers 12/12, sales 16/16, offline smoke on `/build` (see TESTING_STATUS).
- **Problems found and fixed:** Collections table overflowed at 1366 px; New sale item picker too narrow; shell and customers E2E still expected Phase 6–7 placeholders.
- **Not done:** no release (only on "create PR and merge to main", D-018); real-Firebase check and paper printing need the owner.
- **Next session objective:** release 0.4.0 when asked; then Phase 8 (Restocking, suppliers, expenses).
- Release 0.4.0: version bumped, release build verified on `/dist` (unit 76/76, rules 35/35, smoke, E2E 16/16 + 15/15 + 12/12 + 16/16), committed `/dist`, PR https://github.com/geraldjohnt/rj-bugasan/pull/5 created and merged to main.

## 2026-11-25 — Session 5: Phases 8 (Restocking, suppliers, expenses), 9 (Calendar), 10 (Dashboard & reports)
- **Objective:** "Continue phases 8, 9, and 10."
- **Work completed:** domain (`purchasing.js`, `calendar.js`, `reports.js`), services (`purchasingService.js`, `calendarService.js`), screens (Suppliers, Restocks, Restock detail/receive, Expenses, Calendar, Dashboard, Reports), routes, icons, CSS, Firestore rules for suppliers/restocks/expenses/calendarEvents/restock counter, sample data for Phases 8–9, unit/service/rules/E2E tests, docs.
- **Decisions:** D-038 … D-042.
- **Tests:** unit/service 97/97, rules 39/39 (mutation-checked), E2E shell 16/16, inventory 15/15, customers 12/12, sales 16/16, restocks 12/12, calendar 10/10, reports 12/12, offline smoke on `/build` (see TESTING_STATUS).
- **Problems found and fixed:** shell E2E used Calendar as its placeholder (now Activity log); an old rules test probed `suppliers`/`expenses` as unruled collections (now other paths); sales E2E expected Dinorado stock without the new sample restocks; the expense void rule mutation was not caught until a "void + change amount" assertion was added.
- **Not done:** no release (only on "create PR and merge to main", D-018); real-Firebase check, paper printing and CSV on Windows browsers need the owner.
- **Next session objective:** release 0.5.0 when asked; then Phase 11 (Activity log UI, backup/restore, opening balances).
- Release 0.5.0: merged origin/main into the branch, version bumped, release build verified on `/dist` (unit 97/97, rules 39/39, dist smoke, E2E shell 16/16 + inventory 15/15 + customers 12/12 + sales 16/16 + restocks 12/12 + calendar 10/10 + reports 12/12.), committed `/dist`, PR https://github.com/geraldjohnt/rj-bugasan/pull/6 created and merged to main.
