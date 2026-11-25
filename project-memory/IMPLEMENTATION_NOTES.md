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

## Code locations
- `tools/build.cjs` — build script (CommonJS because package.json is `"type": "module"`).
- `src/index.html` — HTML template (classic script tags only).
- `src/main.jsx` — entry; picks adapter via `src/data/adapter.js`.
- `src/data/mockAdapter.js` — demo/dev adapter with Firestore-like transactions.
- `src/data/firestoreAdapter.js` — Firestore compat wrapper (not yet verified, TQ-1).
- `src/app/App.jsx` — temporary Phase 1 foundation screen (replace in Phase 2).
- `src/styles/` — `tokens.css` (design tokens), `fonts.css`, `base.css`.
- `src/spike/` — Firebase file:// spike page (dev build only).
- `config/firebase-config.js` — `window.RJ_FIREBASE_CONFIG` (null = demo mode). Not a secret.
- `tests/services/`, `tests/smoke/dist-smoke.js`.

## Firebase
- Project `rj-bugasan`; config in `config/firebase-config.js` (committed; not a secret). With a config present the app uses the Firestore adapter; set to `null` for demo mode.
- Probing from this cloud container: launch Chromium with `proxy: { server: process.env.HTTPS_PROXY }` (CA already trusted in NSS; never disable TLS checks).
- Analytics is deliberately not loaded.
- The offline smoke test forbids network requests; once screens load data at startup, it must allow (and expect failures from) Firestore/Auth hosts while offline.

## Patterns and gotchas
- No imports of React: JSX compiles to `React.createElement` against the global from `vendor/react.js`.
- React 18.3.1 is the last version with UMD builds; do not upgrade to 19 without replacing the loading strategy.
- Firebase 12.13.0 still ships `firebase-*-compat.js` UMD files at the package root. The npm package has no LICENSE file; the build writes a notice from package.json.
- Node 22 `--test` needs a glob, not a directory.
- Bootstrap of the first `users/{uid}` and `usernames/{username}` docs is still to be designed (Firestore console entry or one-time setup flow guarded by a bootstrap flag).

## Release procedure (D-018)
See root CLAUDE.md "Release procedure".
