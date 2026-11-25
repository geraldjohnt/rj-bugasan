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
- Spike part 2 passed 9/9 with a throwaway account (deleted afterwards). Decision D-019: GO for Firestore from file://.
- Phases 2 and 3 built (user chose "Start Phases 2 & 3"). Domain core with 27 tests; shell, login (username + first-time owner setup + reset + idle lock + change password), settings, design system; Firestore rules with 15 emulator tests (mutation-checked).
- Bugs found by tests and fixed: void left inconsistent row shape; drawer scrim pushed page content below the sidebar; sidebar did not fit 1366×768; field errors lingered while typing; setup race (auth event before profile existed).
- Next: first release (on user's "create PR and merge to main"), then owner go-live steps, then Phases 4–5.
- Release 0.1.0: release build verified (unit 35/35, rules 15/15, dist smoke, dist E2E 17/17), committed `/dist`, PR https://github.com/geraldjohnt/rj-bugasan/pull/1 created and merged to main.

## 2026-11-25 — Session 2: Phase 4 (Inventory)
- **Objective:** "Continue phase 4"; add phase table to root README (kept up to date); add sample data when a phase is done; keep the unminified source.
- **Work completed:** Phase 4 built end to end (domain, services, screens, rules, indexes, tests). Root README rewritten with phase table (D-024). Sample data loader (D-025). CLAUDE.md updated (README rule, sample-data rule, inventory E2E in the release checks).
- **Decisions:** D-024 … D-027.
- **Tests:** unit/service 53/53, rules 22/22 (mutation-checked), E2E inventory 15/15, shell E2E re-run (see TESTING_STATUS).
- **Bugs found and fixed:** page overflowed sideways at phone width with wide tables; rules test files raced on the shared emulator.
- **Source code question:** confirmed the readable source in `/src` is committed; `/dist` is generated from it.
- **Not done:** no release to `/dist` (only on "create PR and merge to main"); real-Firebase check of Phase 4 needs the owner to publish rules + indexes.
- **Next session objective:** Phase 5 (Customers) with sample customers.
- Release 0.2.0: release build verified on `/dist` (unit 53/53, rules 22/22, smoke, E2E 16/16 + 15/15), PR https://github.com/geraldjohnt/rj-bugasan/pull/3 created and merged to main.
