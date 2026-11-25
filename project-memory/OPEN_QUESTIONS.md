# Open Questions

Status values: Open · Answered (see INTERVIEW_LOG) · Deferred

| ID | Subject | Why it matters | Recommended option | Status |
|---|---|---|---|---|
| R1-Q1 | Products & customer types | Shapes catalog, pricing tiers, units | — | Answered (see INTERVIEW_LOG) |
| R1-Q2 | Users & roles | Drives auth model and permissions | Owner (admin) + Staff roles | Answered (see INTERVIEW_LOG) |
| R1-Q3 | Devices, concurrency, internet | Decides whether cloud sync is essential or local-first storage suffices; core architecture driver | Depends on answer | Answered (see INTERVIEW_LOG) |
| R1-Q4 | Locations / warehouses | Multi-location stock changes the data model substantially | Single location in v1 | Answered (see INTERVIEW_LOG) |
| R1-Q5 | Volume | Sizing, Firestore free-tier cost, pagination | — | Answered (see INTERVIEW_LOG) |
| R1-Q6 | Sale workflow, walk-ins, deliveries | Whether customer is mandatory; delivery tracking scope | "Walk-in" default customer for cash sales | Answered (see INTERVIEW_LOG) |
| R1-Q7 | Existing records / migration | Need for import tools and opening balances | Opening-balance import for stock and receivables | Answered (see INTERVIEW_LOG) |
| R1-Q8 | Pain points & v1 priorities | Scoping of first release | — | Answered (see INTERVIEW_LOG) |
| TQ-1 | Firebase SDK + Auth under `file://` | Must be validated by a spike before committing to Firestore | Run spike in Phase 1 once the user creates the Firebase project (FIREBASE_SETUP.md) | Partly answered 2026-11-25 (see TESTING_STATUS); part 2 needs Email/Password enabled + `_spike` rule |
| R5-pending | Should a restock (stock-in) automatically update the item cost price? | Affects profit accuracy under D-007 | Ask in Round 5 | Answered (R5-Q2) |

## Approval items (raised 2026-11-25, Phase 0 close)
| ID | Subject | Why it matters | Recommended option | Status |
|---|---|---|---|---|
| AQ-1 | Phone access (D-014) | Phones cannot open a local HTML folder | Also publish the same build to Firebase Hosting (free) | Answered 2026-11-25: PC only for now (D-014) |
| AQ-2 | Username lookup exposes recovery email to anyone knowing the username (KI-004) | Privacy | Accept, with a non-obvious username | Answered 2026-11-25: accepted (D-015) |
| AQ-3 | Business rules enforced client-side in v1 (KI-003) | Security depth | Accept for owner-only v1; revisit before staff accounts | Answered 2026-11-25: accepted as part of approval (D-016) |
| AQ-4 | Confirm assumptions A-005 to A-009 | Business behavior | Accept as written | Answered 2026-11-25: all accepted |
| AQ-5 | Approve overall design (Phase 0 acceptance) | Gate for coding | — | Answered 2026-11-25: APPROVED, start Phase 1 (D-017) |
