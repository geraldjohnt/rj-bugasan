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
