# Open Questions

Status values: Open · Answered (see INTERVIEW_LOG) · Deferred

| ID | Subject | Why it matters | Recommended option | Status |
|---|---|---|---|---|
| R1-Q1 | Products & customer types | Shapes catalog, pricing tiers, units | — | Open |
| R1-Q2 | Users & roles | Drives auth model and permissions | Owner (admin) + Staff roles | Open |
| R1-Q3 | Devices, concurrency, internet | Decides whether cloud sync is essential or local-first storage suffices; core architecture driver | Depends on answer | Open |
| R1-Q4 | Locations / warehouses | Multi-location stock changes the data model substantially | Single location in v1 | Open |
| R1-Q5 | Volume | Sizing, Firestore free-tier cost, pagination | — | Open |
| R1-Q6 | Sale workflow, walk-ins, deliveries | Whether customer is mandatory; delivery tracking scope | "Walk-in" default customer for cash sales | Open |
| R1-Q7 | Existing records / migration | Need for import tools and opening balances | Opening-balance import for stock and receivables | Open |
| R1-Q8 | Pain points & v1 priorities | Scoping of first release | — | Open |
| TQ-1 | Firebase SDK + Auth under `file://` | Must be validated by a spike before committing to Firestore | Run spike once Firebase config is available | Open |
