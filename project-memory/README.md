# project-memory

Portable project memory. A new session must be able to resume the project from these files alone.

## Startup order
CLAUDE.md → README.md → PROJECT_STATUS.md → DEVELOPMENT_PHASES.md → OPEN_QUESTIONS.md → DECISIONS.md → task-specific files → verify against source code.

## Files
| File | Purpose |
|---|---|
| PROJECT_STATUS.md | Quick reference: current phase, status, blockers, next actions. Read first. |
| PROJECT_OVERVIEW.md | What the system is, for whom, and why. |
| REQUIREMENTS.md | Confirmed / proposed / deferred / rejected requirements. |
| DEVELOPMENT_ROADMAP.md | Milestones, dependencies, implementation order. |
| DEVELOPMENT_PHASES.md | Per-phase scope, tasks, acceptance criteria, status. |
| SYSTEM_ARCHITECTURE.md | Approved technical architecture and constraints. |
| DATABASE_DESIGN.md | Firestore collections, relationships, indexes, rules. |
| DATA_DICTIONARY.md | Field-level definitions and validation. |
| BUSINESS_RULES.md | Inventory, sales, discount, installment, payment rules. |
| UI_UX_GUIDELINES.md | Design system and interaction standards. |
| DECISIONS.md | Decision log (ID, context, alternatives, choice, consequences). |
| INTERVIEW_LOG.md | Questions asked and the user's answers. |
| OPEN_QUESTIONS.md | Unresolved questions and pending decisions. |
| ASSUMPTIONS.md | Unconfirmed assumptions; never treated as requirements. |
| CHANGELOG.md | Significant project changes. |
| KNOWN_ISSUES.md | Bugs, technical limitations, risks, workarounds. |
| TESTING_STATUS.md | Tests run, results, outstanding tests. |
| IMPLEMENTATION_NOTES.md | Code locations, patterns, how to continue development. |
| SESSION_LOG.md | Chronological session summaries. |
| TESTING_STRATEGY.md | Test levels, tools, critical scenarios. |
| FIREBASE_SETUP.md | Owner's step-by-step Firebase project setup. |

Status vocabulary: **Planned** → **In progress** → **Implemented** → **Tested** → **Verified**.
