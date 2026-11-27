# rj-bugasan — RJ Inventory and Sales Management System

Inventory, sales, installment and collections system for a rice store. React (JSX) app delivered as a folder:
double-click `index.html` (no server, no install). Data lives in Firebase Firestore.

- **Client folder:** `/dist` (minified release build, zip and send / deploy). Test URL: https://geraldjohnt.github.io/rj-bugasan/
- **Source code:** `/src` (readable source, always committed), build tooling in `/tools`, tests in `/tests`.
- **Project documentation:** `project-memory/` (start with `PROJECT_STATUS.md`).

## Development phases

_Last updated: 2026-11-25. Keep this table in sync with `project-memory/DEVELOPMENT_PHASES.md` whenever a phase changes (D-024)._

Status vocabulary: Planned → In progress → Implemented → Tested → Verified (Complete).

| # | Phase | Status | Notes |
|---|---|---|---|
| 0 | Requirements & architecture | Complete | Design approved 2026-11-25 (D-017) |
| 1 | Foundation & Firebase spike | In progress (nearly done) | Only the Windows Edge/Chrome/Firefox check on the store PC remains (KI-009) |
| 2 | Design system & app shell (login, settings) | Implemented & tested (demo) | Awaiting real-Firebase login check after go-live steps |
| 3 | Domain core (money, dates, schedules, allocation) | Complete | 27 unit tests |
| 4 | Inventory (items, movements, adjustments, open sack, stock count, low stock, valuation) | Implemented & tested (demo + rules emulator); released in 0.2.0 | Owner to publish rules + indexes and try it on the real database; sample data available |
| 5 | Customers (list, detail, alternate contacts, credit limit, archive, Walk-in) | Implemented & tested (demo + rules emulator); released in 0.3.0 | Owner to re-publish rules; sample customers available |
| 6 | Sales (new sale, sales list/detail, cancel, delivery, receipts) | Implemented & tested (demo + rules emulator); released in 0.4.0 | Owner to re-publish rules; sample sales available |
| 7 | Installments, payments, collections | Implemented & tested (demo + rules emulator); released in 0.4.0 | Record/void payments, reschedule, Collections screen, reminders, customer statement; owner to re-publish rules |
| 8 | Restocking, suppliers, expenses | Implemented & tested (demo + rules emulator); released in 0.5.0 | Suppliers, restock orders with partial receipts and cost update, expenses; sample data available |
| 9 | Calendar | Implemented & tested (demo + rules emulator); released in 0.5.0 | Month + agenda, filters, custom events; sample reminders |
| 10 | Dashboard & reports | Implemented & tested (demo); released in 0.5.0 | KPIs, 14-day chart, 8 reports with print and CSV |
| 11 | Activity log UI, backup/restore, opening balances | Implemented & tested (demo + rules emulator); released in 0.6.0 | Owner-only activity log, backup download + 7-day reminder, restore with typed RESTORE, opening balances (`OB-`); sample OBs |
| 12 | Firebase go-live & release | Implemented; released in 0.6.0 | User guide (`guide.html`), `npm run deploy:rules`, `npm run verify:release`, go-live checklist; owner steps remain (FIREBASE_SETUP) |
| 13 | Restock batches (oldest first) & other charges on sales | Implemented & tested (demo + rules emulator); not yet released | Batch ids `RJ-RS-SUP001-0001`, per-batch cost and cash price, weighted price across batches, owner batch pick, old stock as first batch, delivery fee and other charges; owner to re-publish rules after release |

## Trying it with sample data

Sign in, then **Settings → System → Load sample data** (or the button on the empty Items page). Each finished phase
adds its own sample records (currently: rice items, customers, sales with installments, payments and collections, opening balances, suppliers with restocks, expenses and calendar reminders; the dashboard and reports use all of it). In demo mode (no Firebase config) the data stays in your browser only.

## Developer commands

| Command | Purpose |
|---|---|
| `npm install` | Install dev dependencies |
| `npm run build` | Development build → `/build` (git-ignored) |
| `npm run release` | Minified client build → `/dist` (only when releasing) |
| `npm test` | Unit and service tests |
| `npm run test:rules` | Firestore security-rules tests (emulator, needs Java) |
| `npm run verify:release` | Every release check on `/dist` (unit, rules, smoke, all E2E) |
| `npm run deploy:rules` | Publish Firestore rules + indexes to project `rj-bugasan` (Firebase CLI, owner/developer machine) |
| `npm run test:e2e` | Click-through tests (demo mode) on `/build` |
| `npm run test:build` / `npm run test:dist` | Offline `file://` smoke test |
