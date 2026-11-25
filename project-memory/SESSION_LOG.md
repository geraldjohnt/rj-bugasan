# Session Log

## 2026-11-25 — Session 1: Project kickoff
- **Objective:** Set up project memory; begin requirements interview.
- **Work completed:** Created `CLAUDE.md` and `project-memory/`. Ran all 8 interview rounds (user prefers click-to-answer option prompts with a recommended default). Drafted all design documents.
- **Decisions:** D-001 to D-013.
- **Problems / risks found:** KI-001 to KI-007; notably phones cannot run a local HTML folder (KI-006) and username lookup privacy (KI-004).
- **Remaining work:** User approval (AQ-1 to AQ-5); Phase 1.
- **Next session objective:** Record approval decisions; start Phase 1 if approved.
- **Later in the same session:** Approval received (D-014..D-017). User added the release rule (D-018). Phase 1 foundation built: build pipeline, vendored deps, adapters, foundation screen, unit + smoke tests (all passing). Spike pending the user's Firebase project.
- **Files created:** package.json, package-lock.json, .gitignore, tools/build.cjs, config/firebase-config.js, src/**, tests/**.
- **Problems encountered:** firebase npm package has no LICENSE file (build writes a notice); Node 22 test runner needs a glob; npm audit grpc warning (KI-008).
- **Recommended next session objective:** Phase 2 + Phase 3 on demo data; run the spike once Firebase config arrives.

## 2026-11-25 — Session 1 (cont.): Firebase project connected
- User provided the Firebase web config (project `rj-bugasan`); committed to `config/firebase-config.js` per user instruction (not a secret; Analytics omitted).
- Spike part 1 (no credentials) passed in Chromium from file://: Firestore and Auth servers accept the origin; persistence enables. Auth not yet enabled in console.
- Next: user enables Email/Password + `_spike` rule → spike part 2; continue Phases 2–3.
