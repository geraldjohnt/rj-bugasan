# Testing Strategy

**Status:** Draft for approval (2026-11-25).

| Level | Tool | Scope | Runs on |
|---|---|---|---|
| Unit | `node --test` (no dependencies) | `src/domain/*`: money, quantity, dates, schedule, allocation, totals, report math | Every change |
| Service | `node --test` + Mock adapter | Business operations end-to-end against in-memory data, incl. transaction rollback and simulated concurrency | Every change |
| Security rules | Firebase Emulator + `@firebase/rules-unit-testing` | Allowed/denied matrix per collection, immutability | Phase 12 (needs Java + emulator) |
| E2E | Playwright against `dist/index.html` via `file://` | Login, new sale (each term), payment, void, cancel, open sack, stock count, restock receive, reports export | End of each feature phase |
| Visual/manual | Checklist | Light/dark × palettes, phone layouts, print receipts | End of each UI phase |

Critical scenarios that must have automated tests:
1. Installment sums equal amount financed for all counts/frequencies, including ₱1-remainder and centavo totals.
2. First due date with the 7-day gap across month ends, Feb 28/29, Dec→Jan year change.
3. Overpayment flows to later installments; payment > balance rejected.
4. Void payment restores installment states exactly.
5. Cancel sale returns stock and voids payments; totals and customer balance correct.
6. Two simultaneous sales of the last stock: exactly one succeeds.
7. Sale ID sequence across year boundary; no duplicates under contention.
8. Report definitions (BR §7) on a fixed dataset with known answers.

Results are recorded in TESTING_STATUS.md. A test is only marked passed after it actually ran and passed.
