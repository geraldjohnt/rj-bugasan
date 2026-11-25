# Testing Status

**Last updated:** 2026-11-25

Planned tests: see TESTING_STRATEGY.md.

| Test / check | Status | Date | Notes |
|---|---|---|---|
| Firebase `file://` spike (TQ-1) | Not run | — | Needs user's Firebase project |
| Unit: `tests/services/mockAdapter.test.js` (8 tests incl. concurrent last-stock sale) | PASS 8/8 | 2026-11-25 | `npm test` |
| Smoke: `/build` from file://, offline, Chromium (Playwright, Linux) | PASS | 2026-11-25 | `npm run test:build` |
| Smoke: `/dist` (release, minified) from file://, offline, Chromium (Playwright, Linux) | PASS | 2026-11-25 | `npm run test:dist` |
| Windows Edge / Chrome / Firefox manual open | Not run | — | Needs owner's PC |
