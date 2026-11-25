# Decision Log

| ID | Date | Subject | Context | Alternatives | Decision | Reason | Consequences | Reconsiderable |
|---|---|---|---|---|---|---|---|---|
| D-001 | 2026-11-25 | Project memory | Work spans many sessions with no shared history | Rely on chat history; external memory | Repository-based `project-memory/` + root `CLAUDE.md` protocol | Mandated by user; portable | Every session must read/update these files | No (user mandate) |
| D-002 | 2026-11-25 | Planning before code | Production business system | Iterative coding from day one | No implementation until interview is complete and design is approved | Mandated by user | Phase 0 must finish first | No (user mandate) |
| D-003 | 2026-11-25 | Tech stack | User-specified constraints | — | React + JSX (no TypeScript), local vendored deps, `file://` launch, Firestore intended DB | Mandated by user | Firebase `file://` viability must be proven (TQ-1) | Firestore choice pending spike |
