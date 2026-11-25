# Testing Status

**Last updated:** 2026-11-25

Planned tests: see TESTING_STRATEGY.md.

| Test / check | Status | Date | Notes |
|---|---|---|---|
| Firebase `file://` spike (TQ-1) — part 1, no credentials (Chromium 158, Linux, via proxy) | PASS (partial) | 2026-11-25 | Origin `file://`. Firestore server reached: read on `_spike` returned `permission-denied` (rules working). Auth server reached: `auth/configuration-not-found` (Email/Password not yet enabled in console). `enablePersistence` → enabled. |
| Firebase spike — part 2: sign-in, write, transaction, listener, session restore | Not run | — | Needs Email/Password enabled + temporary `_spike` rule |
| Unit: `tests/services/mockAdapter.test.js` (8 tests incl. concurrent last-stock sale) | PASS 8/8 | 2026-11-25 | `npm test` |
| Smoke: `/build` from file://, offline, Chromium (Playwright, Linux) | PASS | 2026-11-25 | `npm run test:build` |
| Smoke: `/dist` (release, minified) from file://, offline, Chromium (Playwright, Linux) | PASS | 2026-11-25 | `npm run test:dist` |
| Windows Edge / Chrome / Firefox manual open | Not run | — | Needs owner's PC |
