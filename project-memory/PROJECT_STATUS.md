# Project Status

**Last updated:** 2026-11-25
**Overall status:** Design approved (D-017). Implementation started.
**Current phase:** Phases 2 (app shell & login) and 3 (domain core) — implemented; Phase 2 awaiting real-Firebase login check
**Implementation status:** App shell, login/setup/lock/settings, design system and business calculation core exist and are tested. No business module screens (inventory, sales, …) yet.

## Completed
- Phase 0: requirements interview (8 rounds) and design documents; approved 2026-11-25.
- Phase 1 (partial): build pipeline (`/build` dev, `/dist` minified release), vendored React 18.3.1 + Firebase 12.13.0 compat + Inter,
  Mock adapter with transactions (8/8 tests pass), Firestore adapter (unverified), foundation screen, offline file:// smoke test (passes in Chromium).

## Releases
- 0.1.0 — 2026-11-25 — https://github.com/geraldjohnt/rj-bugasan/pull/1 (merged). Verified: unit 35/35, rules 15/15, dist smoke, dist E2E 16/16 (earlier recorded as 17/17; the script has 16 steps).
- GitHub Pages deploy — 2026-11-25 — https://github.com/geraldjohnt/rj-bugasan/pull/2 (merged). `.github/workflows/static.yml` publishes `/dist` on every push to main (D-023). Same checks passed; `/dist` unchanged.

## Completed 2026-11-25 (later)
- Phase 3 domain core (27 tests). Phase 2 shell + auth + settings (17-step E2E in demo mode), Firestore rules for Phase 2 (15 emulator tests).

## In progress
- Phase 1: only the Windows-browser check remains (KI-009); otherwise complete.

## Not started
- Phases 4–12 (all business modules).

## Blockers
- None.

## Standing instructions
- Release rule (D-018): on "create PR and merge to main" → `npm run release` → `npm test` + `npm run test:dist` → commit `/dist` → PR → merge.
- User prefers questions as click-to-answer options with a recommended default.

## Immediate next actions
0. Firebase project `rj-bugasan` connected; Email/Password enabled; spike passed → GO (D-019).
1. ✅ Release 0.1.0 merged to main (2026-11-25, https://github.com/geraldjohnt/rj-bugasan/pull/1). `/dist` on main is the client folder.
2. Owner: follow FIREBASE_SETUP.md "Phase 2 — go-live of login": publish `firebase/firestore.rules`, create the owner in the app, disable public sign-up (KI-011).
3. Owner: confirm `/dist` works in Edge/Chrome/Firefox on the store PC (KI-009).
3a. Owner: set GitHub Settings → Pages → Source to "GitHub Actions" and add `geraldjohnt.github.io` to Firebase Auth authorized domains, then share https://geraldjohnt.github.io/rj-bugasan/ with the client.
4. Next development: Phase 4 (Inventory) and Phase 5 (Customers).
5. (old) Start Phase 2 (design system components, app shell, hash router, login/idle-lock UI on Mock) and Phase 3 (domain core + tests).
