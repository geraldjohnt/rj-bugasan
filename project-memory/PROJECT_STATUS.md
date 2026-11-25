# Project Status

**Last updated:** 2026-11-25
**Overall status:** Design approved (D-017). Implementation started.
**Current phase:** Phase 1 — Foundation & Firebase spike (in progress)
**Implementation status:** Build pipeline, vendored runtime, temporary foundation screen, Mock and Firestore adapters exist. No business modules yet.

## Completed
- Phase 0: requirements interview (8 rounds) and design documents; approved 2026-11-25.
- Phase 1 (partial): build pipeline (`/build` dev, `/dist` minified release), vendored React 18.3.1 + Firebase 12.13.0 compat + Inter,
  Mock adapter with transactions (8/8 tests pass), Firestore adapter (unverified), foundation screen, offline file:// smoke test (passes in Chromium).

## In progress
- Phase 1: Firebase `file://` spike (TQ-1).

## Not started
- Phases 2–12 (app shell, domain core, all business modules).

## Blockers
- Spike part 2 needs Email/Password enabled and the temporary `_spike` rule. Not blocking Phase 2/3 work.

## Standing instructions
- Release rule (D-018): on "create PR and merge to main" → `npm run release` → `npm test` + `npm run test:dist` → commit `/dist` → PR → merge.
- User prefers questions as click-to-answer options with a recommended default.

## Immediate next actions
0. Firebase project `rj-bugasan` exists; config committed in `config/firebase-config.js` (2026-11-25). Spike part 1 passed.
1. Owner: enable Authentication → Email/Password; publish the temporary `_spike` rule (FIREBASE_SETUP.md step 8). Then Claude runs spike part 2 with a throwaway test account (no password shared in chat).
2. Run the spike (`build/spike.html`) in Edge/Chrome/Firefox on the owner's PC; record results; decide go/no-go for Firestore under file://.
3. Meanwhile start Phase 2 (design system components, app shell, hash router, login/idle-lock UI on Mock) and Phase 3 (domain core + tests).
