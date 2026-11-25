# Implementation Notes

**Last updated:** 2026-11-25

## Commands (developer machine; Node 22+)
| Command | Purpose |
|---|---|
| `npm install` | Install dev dependencies (esbuild, React, Firebase, Inter) |
| `npm run build` | Dev build → `/build` (readable, inline source maps, includes `spike.html`) |
| `npm run release` | Release build → `/dist` (minified, no maps, no spike) — only when releasing (D-018) |
| `npm test` | Unit/service tests (`node --test "tests/**/*.test.js"`) |
| `npm run test:build` / `test:dist` | Smoke test: opens folder via file:// in Chromium, offline; fails on any error, missing file or network request |

## Additional commands
| `npm run test:e2e` | Click-through test of the shell in demo mode against `/build` (pass `dist` as arg for release) |
| `npm run test:rules` | Firestore rules tests in the emulator (needs Java; downloads the emulator once) |

## Code locations
- `tools/build.cjs` — build script (CommonJS because package.json is `"type": "module"`).
- `src/index.html` — HTML template (classic script tags only).
- `src/main.jsx` — entry; picks adapter via `src/data/adapter.js`.
- `src/data/mockAdapter.js` — demo/dev adapter with Firestore-like transactions.
- `src/data/firestoreAdapter.js` — Firestore compat wrapper (not yet verified, TQ-1).
- `src/app/App.jsx` — providers + route guard; `src/app/Shell.jsx` sidebar/top bar; `src/app/routes.js` menu + phase map.
- `src/app/router.jsx` (hash router), `src/app/prefs.jsx` (appearance; pre-paint copy in `src/index.html`).
- `src/auth/` — `authService.js` (Firebase + demo), `AuthContext.jsx` (session + idle lock), `AuthPages.jsx` (login, setup, lock, reset, change password).
- `src/components/` — shared UI. `src/features/` — pages (settings, system check, placeholder, dev UI reference).
- `src/domain/` — pure business logic (Phase 3).
- `firebase/firestore.rules`, `firebase.json` (emulator on port 8085).
- `src/styles/` — `tokens.css` (design tokens), `fonts.css`, `base.css`.
- `src/spike/` — Firebase file:// spike page (dev build only).
- `config/firebase-config.js` — `window.RJ_FIREBASE_CONFIG` (null = demo mode). Not a secret.
- `tests/services/`, `tests/smoke/dist-smoke.js`.

## Firebase
- Project `rj-bugasan`; config in `config/firebase-config.js` (committed; not a secret). With a config present the app uses the Firestore adapter; set to `null` for demo mode.
- Probing from this cloud container: launch Chromium with `proxy: { server: process.env.HTTPS_PROXY }` (CA already trusted in NSS; never disable TLS checks).
- Analytics is deliberately not loaded.
- Spike finding: the first `onSnapshot` event and cache reads can show pre-transaction values (local cache first, server update after). UI must render from listeners (and may show "syncing" when `metadata.fromCache`/`hasPendingWrites`); never assume a cache read right after a transaction is current.
- Offline transactions do not reject quickly; they hang until the server is reachable. Services must check `navigator.onLine` (and the offline banner state) before starting a write and use a timeout.
- The offline smoke test forbids network requests; once screens load data at startup, it must allow (and expect failures from) Firestore/Auth hosts while offline.

## Patterns and gotchas
- Files containing JSX must be `.jsx` (esbuild only enables JSX for that extension).
- Demo mode for tests: inject `Object.defineProperty(window, 'RJ_FIREBASE_CONFIG', { get: () => null, set: () => {} })` via `addInitScript`.
- Demo credentials: owner / demo1234 (demo only; shown on the login page).
- `html[data-app-ready="true"]` is set once the session state is known (tests wait on it).
- Layout gotcha found by E2E: any extra direct child of `.shell` takes a grid cell (the drawer scrim must be `display:none` on desktop).
- `@firebase/rules-unit-testing` 6.x needs Firebase 13; we use 5.x with Firebase 12.13.0.
- No imports of React: JSX compiles to `React.createElement` against the global from `vendor/react.js`.
- React 18.3.1 is the last version with UMD builds; do not upgrade to 19 without replacing the loading strategy.
- Firebase 12.13.0 still ships `firebase-*-compat.js` UMD files at the package root. The npm package has no LICENSE file; the build writes a notice from package.json.
- Node 22 `--test` needs a glob, not a directory.
- Bootstrap of the first `users/{uid}` and `usernames/{username}` docs is still to be designed (Firestore console entry or one-time setup flow guarded by a bootstrap flag).

## Release procedure (D-018)
See root CLAUDE.md "Release procedure".
