# Development Roadmap

**Status:** Draft for approval (2026-11-25). Detail per phase in DEVELOPMENT_PHASES.md.

| # | Phase | Depends on | Milestone |
|---|---|---|---|
| 0 | Requirements & architecture | — | Design approved |
| 1 | Foundation & Firebase `file://` spike | 0 | Build pipeline; spike verdict recorded |
| 2 | Design system, app shell, login, settings core | 1 | Navigable themed shell with real auth (or mock) |
| 3 | Domain core (money, qty, schedule, allocation) + tests | 1 | All domain unit tests pass |
| 4 | Inventory | 2, 3 | Items, movements, adjustments, open sack, stock count |
| 5 | Customers | 2 | Customers with alternate contacts |
| 6 | Sales | 3, 4, 5 | Create/cancel sale, receipts, delivery status |
| 7 | Installments, payments, collections | 6 | Schedules, payments, voids, reschedule, collections screen |
| 8 | Restocking, suppliers, expenses | 4 | Receive stock, cost update, expenses |
| 9 | Calendar | 6, 7, 8 | Month + agenda with filters |
| 10 | Dashboard & reports | 6, 7, 8 | KPIs, 5 reports, CSV/print |
| 11 | Activity log, backup/restore, opening balances | 6, 7 | Owner tools complete |
| 12 | Firebase go-live & release | all | Rules + indexes deployed, E2E pass, release folder |

Phases 3 and 2 can run in parallel; 4 and 5 can run in parallel. Firebase spike needs the user's Firebase project
(FIREBASE_SETUP.md); until then all development uses the Mock adapter.
