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

## 2026-11-25 — Session 6: Phases 11–12, 2-payment installments
- **Objective:** "Continue phases 11 and 12. Also add an installment plan of 2 payments" → later "make 2 the default", "make Online green", "create PR and merge to main; not complete unless the workflow run succeeds".
- **Work completed:** 2-payment plans + default 2 (D-043); Activity log, Backup/restore (D-044), Opening balances (D-045); rules + index; sample OBs; user guide; deploy/verify scripts; go-live checklist; green Online indicator; docs.
- **Tests:** unit/service 104/104, rules 43/43 (mutation-checked), E2E shell 16 + inventory 15 + customers 12 + sales 16 + restocks 12 + calendar 10 + reports 12 + system 11, smoke on /build.
- **Problems found and fixed:** new nav item pushed Settings below 768 px (nav items 32 → 30 px); shell E2E still expected the Activity-log placeholder; sales E2E counts changed by the sample OB and had a load-timing race on the Schedule tab.
- **Not done:** owner go-live steps (publish rules/index, owner account, close sign-up, Windows checks) — cannot be done from the container.
- Release 0.6.0: merged origin/main, version bumped, `npm run verify:release` passed on `/dist`, PR https://github.com/geraldjohnt/rj-bugasan/pull/7 created and merged to main.

## 2026-11-26 — Session 6 (cont.): sidebar business name
- **Request:** ".brand-name should be the Business name that is set in the settings."
- **Done:** Shell shows `general.businessName` (fallback app name, ellipsis for long names); shell E2E checks it after saving General settings.
- **Tests:** E2E shell 16/16 and system 11/11 on `/build`. Not released (D-018: only on "create PR and merge to main").

## 2026-11-26 — Session 7: payday price and Facebook price poster
- **Request:** a button on Items that downloads a Facebook poster like the owner's reference ("R&J Bugasan Price update": Cash price and Payday option columns, no-stock items crossed out), with separate cash and installment prices. Mid-session: "Remove the rice image. It looks bad." → bowl/sack/wheat illustrations removed.
- **Done:** D-046 (`installmentPriceC`, terms-based list price in New sale and `planSale`), D-047 (`src/domain/poster.js`, `src/features/inventory/pricePoster.js`, `PricePosterDialog.jsx`), sample payday prices, rules, docs.
- **Tests:** unit/service 110/110, rules 43/43 (emulator), smoke on `/build`, E2E on `/build`: shell, inventory (16 steps incl. poster PNG download), customers, sales (incl. price-follows-terms step), restocks, calendar, reports, system — all pass. Not released (D-018).
- **Release 0.7.0:** merged origin/main, version bumped, `npm run release` + `npm run verify:release` passed on `/dist`, PR created and merged to main.

## 2026-11-26 — Session 8: official logo
- **Request:** cut the supplied logo to a circle (shown first, confirmed transparent outside), then use it as the official logo: favicon, top-left logo, and on each receipt.
- **Done:** D-048 (brand files, build copy, favicon links in app and guide, sidebar + sign-in logo, logo in the shared print header). Fixed the Reschedule dialog race found while testing.
- **Tests:** unit/service 110/110, smoke on `/build`, E2E on `/build`: all 8 suites pass (shell now 17 steps with a logo check; sales passed 4 runs in a row after the fix). Not released (D-018).
- **Release 0.7.1:** version bumped, `npm run release` + `npm run verify:release` passed on `/dist`, PR created and merged to main.

## 2026-11-26 — Session 8 (cont.): remove print URL footer
- **Request:** remove the URL footer (`https://geraldjohnt.github.io/rj-bugasan/#/sales/RJ-2026-00003`) from printed/exported receipts, then create PR and merge.
- **Done:** print CSS zero page margin + padding with `box-decoration-break: clone`; KNOWN_ISSUES note on the print-dialog fallback.
- **Tests:** release verification on `/dist` (see TESTING_STATUS). The browser print dialog itself cannot be automated; layout checked via a PDF render.

## 2026-11-26 — Session 9: calendar event details modal
- **Request:** "In calendar, when clicking on an event, just pop it up as a modal. Don't redirect it to another page. Just display important details about that event."
- **Done:** D-049 — `buildEvents` attaches the source record; `CalendarPage` shows an `EventDetails` modal for every entry (month chips, agenda rows, day dialog) with optional Open sale/restock (custom: Edit); user guide updated; calendar E2E updated (11 steps).
- **Tests:** unit/service 110/110 and E2E calendar 11/11 on `/build`. Not released (D-018: only on "create PR and merge to main").
- **Release 0.7.3:** merged origin/main, version bumped, `npm run release` + `npm run verify:release` passed on `/dist`, PR created and merged to main.

## 2026-11-27 — Session 10: restock batches (planning only)
- **Request:** restocks get IDs and their own prices; oldest stock sold first. User asked for a feasibility answer and questions first.
- **Done:** feasibility confirmed; interview Round 9 (R9-Q1…Q11) recorded; proposed decisions D-050 … D-053; approval item BQ-1. No code changed.
- Also: user asked for free-text charge lines on sales (delivery fee etc.); Round 10 recorded; proposed D-054; approval item BQ-2.
- **Approved** by the user ("Approved, start building Phase 13"). During the build the user said to register old stock as the first batch → D-055 (supersedes D-053, which had not been built).
- **Built:** Phase 13 (see DEVELOPMENT_PHASES). Also D-056 (item price edit can reprice batches in stock; receipt checkbox sets item defaults).
- **Tests:** unit/service 132/132 (22 new), rules 46/46 in the emulator (3 new), E2E on `/build`: shell, inventory, customers, sales, restocks, calendar, reports, system and the new batches suite (11 steps); offline smoke on `/build`. Existing E2E expectations updated for the new sample restock/sale and renamed labels. Not released (D-018).
- **Release 0.8.0:** version bumped, `npm run release` + `npm run verify:release` passed on `/dist` (unit 132/132, rules 46/46, smoke, 9 E2E suites); PR created and merged to main.

## 2026-11-27 — Session 10 (cont.): sample data only in Settings, password protected
- **Request:** remove "Load sample data" from all pages; keep it only in Settings, password protected; then create PR and merge.
- **Done:** D-057 — button removed from 7 empty states; Settings → System dialog asks for the password (re-authentication) before loading; E2E suites load sample data through Settings with the password, check the button is gone from empty states, and check empty/wrong password are refused (inventory suite).
- Found while testing: the dialog's password could be wiped just after opening (state reset in an effect); fixed by resetting on click.
- **Release 0.8.1:** `npm run release` + `npm run verify:release` passed on `/dist`; PR created and merged to main.

## 2026-11-27 — Session 11: Android APK
- **Request:** build the app into an APK in `apk/`, keeping previous versions. Mid-session: don't build the APK together with `/dist`; build only when asked, but build one now for testing.
- **Done:** installed Android SDK (platform 35, build-tools 35.0.0; user approved the SDK license; `dl.google.com` added to the cloud environment) in `~/android-sdk` (not in the repo). Wrote `android/` wrapper and `tools/build-apk.cjs` (no Gradle). D-058, KI-025 (signing key in repo), KI-026 (not tested on a phone).
- **Tests:** `npm run test:apk` PASS on `apk/rj-ims-0.8.1.apk`. A trial run with APK inside the release build and version 0.9.0 passed `verify:release`; reverted at the user's request (version stays 0.8.1, `/dist` untouched).
- **Merged to main** (user: "create PR and merge to main"): release build + `verify:release` passed, `/dist` unchanged (no app change, version stays 0.8.1).
- **Next:** owner tests the APK on a phone (KI-026). Future sessions need the Android SDK again (`~/android-sdk` is not kept by the container).

## 2026-11-27 — Session 12: APK 0.9.0 in dist/apk, Settings download link
- **Request:** build the APK for the new version; put APKs in `dist/apk/`; add a download link in Settings.
- **Done (D-059):** `tools/apk-info.cjs` (APK list script), release build keeps `dist/apk/`, `build-apk.cjs` writes to `dist/apk/` and excludes `.apk` files from the packed app, `AndroidAppPanel` in Settings → System, E2E step in `system.e2e.js`, version 0.9.0, 0.8.1 APK moved to `dist/apk/`.
- **Tests:** `npm run release` → `npm run apk` → `npm run verify:release` PASS (unit 132/132, rules 46/46, dist smoke, 9 E2E suites incl. the new Android-panel step) and `npm run test:apk` PASS on `dist/apk/rj-ims-0.9.0.apk`. System E2E also passed on `/build` (no-APK case).
- **Release 0.9.0:** `npm run release` + `npm run verify:release` + `npm run test:apk` passed again; PR created and merged to main. Phone test still open (KI-026).

## 2026-11-28 — Session 13: restock expenses (requirements)
- **Request:** expense lines (fuel, trucking, labor… free text) on restocks, split per unit to guide pricing, saved to Expenses linked to the restock; add new items from inside a restock.
- **Done:** interview Round 12 (12 answers, INTERVIEW_LOG); proposed D-060 … D-064; approval item EQ-1. No code changed.
- **Approved** (EQ-1) and **built Phase 14** in the same session: domain, services, rules, UI, sample data, guide, tests.
- **Tests:** `npm test` 142/142, `npm run test:rules` 48/48, all 10 E2E suites on `/build` pass (new `restockExpenses` 9 steps). No release build (not requested).
- **Release 0.10.0** (user: "create PR and merge to main"): merged main into the branch, version 0.10.0, `npm run release` + `npm run verify:release` passed (unit 142/142, rules 48/48, dist smoke, 10 E2E suites); PR created and merged. No APK (not asked).
- **Next:** owner re-publishes rules (FIREBASE_SETUP "Phase 14") and tries a receive with expenses.

## 2026-11-28 — Session 14: item expense, credit price, SKU, promised dates (requirements)
- **Request:** per-item Expense and Credit price at receiving; pay-later price defaults to the credit price; SKU plan and display; promised dates on partial payments shown on the calendar.
- **Done:** checked the code (sale already defaults to the Payday price, D-046; SKU free text, searchable on Items only; partial payments exist, no promise). Interview Round 13 (18 answers); proposed D-065 … D-069; approval item FQ-1. No code changed.
- **Approved** (FQ-1: "Approve, build Phase 15") and **built Phase 15** in the same session: domain, services, rules, UI, sample data, guide, tests.
- Found while building: back-dated sample payments hit the promise rule → "due" is judged on the payment date (recorded in D-068); a newer promise before an older one's date marks it Replaced (D-069); blank SKU on edit keeps the SKU (D-067); calendar needed all open rows for promises in other months.
- **Tests:** `npm test` 154/154, `npm run test:rules` 51/51, all 11 E2E suites on `/build` pass (new `phase15` 12 steps), offline smoke on `/build`. No release build (not requested).
- **Release 0.11.0** (user: "Create PR and merge to main branch"): merged main into the branch, version 0.11.0, `npm run release` + `npm run verify:release` passed (unit 154/154, rules 51/51, dist smoke, 11 E2E suites); PR created and merged. No APK (not asked).
