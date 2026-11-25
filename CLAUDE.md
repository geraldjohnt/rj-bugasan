# CLAUDE.md — RJ Inventory and Sales Management System

## Project memory protocol (mandatory)

This project's knowledge lives in the repository, not in conversation history.
Every Claude Code session MUST follow this protocol.

### On session start
1. Read this file.
2. Read `project-memory/README.md`.
3. Read `project-memory/PROJECT_STATUS.md` (the quick-reference file; read it first among the memory files).
4. Read `project-memory/DEVELOPMENT_PHASES.md`.
5. Read `project-memory/OPEN_QUESTIONS.md`.
6. Read `project-memory/DECISIONS.md`.
7. Read any other memory files relevant to the task.
8. Inspect the actual source files to check the documented status. If docs and code disagree, investigate and reconcile before changing anything.

Do not restart requirements gathering for questions already answered in `INTERVIEW_LOG.md`.
If the user says "continue", continue from the "Immediate next actions" in `PROJECT_STATUS.md`.

### Before ending a meaningful session
Update, as applicable: PROJECT_STATUS, DEVELOPMENT_PHASES, OPEN_QUESTIONS, DECISIONS,
REQUIREMENTS, KNOWN_ISSUES, TESTING_STATUS, IMPLEMENTATION_NOTES, CHANGELOG, and append to SESSION_LOG.
Whenever any phase's status changes, also update the **phase table in the root `README.md`** (user instruction
2026-11-25, D-024) so it matches DEVELOPMENT_PHASES.md.

### When a phase is done (user instruction 2026-11-25, D-025)
Add sample data for that phase to `src/data/sampleData.js` (created through the real services, idempotent),
so the owner can test it via Settings → System → "Load sample data".

### Integrity rules
- The repository is the single source of truth.
- Never claim a feature is implemented when only its design exists.
- Never claim a test passed unless it was actually run and passed.
- Never silently reverse a recorded decision; record a superseding decision instead.
- Keep confirmed requirements, recommendations, and assumptions clearly separated.
- Dates use ISO format: YYYY-MM-DD.

## Hard project constraints (summary — see SYSTEM_ARCHITECTURE.md)
- React + JavaScript (JSX). No TypeScript.
- Delivered as a folder opened by double-clicking `index.html` (`file://`). No Node, server, build step, or internet needed to launch.
- All dependencies stored locally; no CDNs at runtime; relative paths only; no service workers or ES-module loading that needs HTTP.
- Firebase Firestore is the intended database. Its `file://` compatibility must be validated before implementation.
- No implementation until the user explicitly approves the planning and architecture.

## Release procedure (mandatory — user instruction 2026-11-25, D-018)

Whenever the user asks to **create a PR and merge to main**:
1. Run the release build (`npm run release`). It produces a **minified, client-ready** app in the root `/dist` folder:
   minified JS bundle, minified CSS, minified HTML, production (`.min`) vendor files only, no source maps,
   no dev/test/spike files, relative paths only.
2. **Verify it still runs:** `npm test` (unit), `npm run test:rules` (security rules, emulator), `npm run test:dist`
   (opens `dist/index.html` via `file://` offline), `node tests/e2e/shell.e2e.js dist` and
   `node tests/e2e/inventory.e2e.js dist`, `node tests/e2e/customers.e2e.js dist`, `node tests/e2e/sales.e2e.js dist`, `node tests/e2e/restocks.e2e.js dist`, `node tests/e2e/calendar.e2e.js dist`, `node tests/e2e/reports.e2e.js dist`, `node tests/e2e/system.e2e.js dist` (click-throughs in demo mode; add each new phase's E2E script here).
   Do not create the PR if anything fails; report the failure instead.
3. Commit the updated `/dist`, create the PR, and merge to main.
4. `/dist` must always be self-contained so the user can zip it and send it to a client or deploy it.
   Never put secrets in `/dist` (the Firebase web config is not a secret).

Day-to-day development builds go to `/build` (git-ignored), never to `/dist`.
