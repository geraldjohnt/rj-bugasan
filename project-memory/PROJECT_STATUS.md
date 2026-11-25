# Project Status

**Last updated:** 2026-11-25
**Overall status:** Design approved (D-017). Implementation started.
**Current phase:** Phase 4 (Inventory) — implemented and tested (demo + rules emulator); next Phase 5 (Customers)
**Implementation status:** App shell, login/setup/lock/settings, design system, business calculation core and the Inventory module (items, movements, adjustments, open sack, stock count, low stock, valuation, sample data) exist and are tested. Customers, sales and later modules not started.

## Completed
- Phase 0: requirements interview (8 rounds) and design documents; approved 2026-11-25.
- Phase 1 (partial): build pipeline (`/build` dev, `/dist` minified release), vendored React 18.3.1 + Firebase 12.13.0 compat + Inter,
  Mock adapter with transactions (8/8 tests pass), Firestore adapter (unverified), foundation screen, offline file:// smoke test (passes in Chromium).

## Releases
- 0.1.0 — 2026-11-25 — https://github.com/geraldjohnt/rj-bugasan/pull/1 (merged). Verified: unit 35/35, rules 15/15, dist smoke, dist E2E 16/16 (earlier recorded as 17/17; the script has 16 steps).
- 0.2.0 — 2026-11-25 — Phase 4 Inventory — https://github.com/geraldjohnt/rj-bugasan/pull/3. Verified on minified `/dist`: unit 53/53, rules 22/22, dist smoke, E2E shell 16/16 + inventory 15/15.
- GitHub Pages deploy — 2026-11-25 — https://github.com/geraldjohnt/rj-bugasan/pull/2 (merged). `.github/workflows/static.yml` publishes `/dist` on every push to main (D-023). Same checks passed; `/dist` unchanged.

## Completed 2026-11-25 (later)
- Phase 3 domain core (27 tests). Phase 2 shell + auth + settings (17-step E2E in demo mode), Firestore rules for Phase 2 (15 emulator tests).

## In progress
- Phase 1: only the Windows-browser check remains (KI-009); otherwise complete.

## Completed 2026-11-25 (Phase 4)
- Inventory module; Firestore rules + indexes for it; sample data (D-025); root README phase table (D-024). Tests: unit/service 53/53, rules 22/22, E2E shell 16/16 + inventory 15/15.

## Not started
- Phases 5–12.

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
4a. Next development: Phase 5 (Customers), including its sample data.
5. (old) Start Phase 2 (design system components, app shell, hash router, login/idle-lock UI on Mock) and Phase 3 (domain core + tests).
