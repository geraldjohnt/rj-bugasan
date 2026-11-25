# Implementation Notes

**Last updated:** 2026-11-25

No code yet. Planned layout and patterns: SYSTEM_ARCHITECTURE.md §3 and §9.

Notes for Phase 1:
- Use React 18.3.1 UMD (React 19 has no UMD build).
- Bundle with esbuild `format: "iife"`, React/ReactDOM/firebase as globals; no `type="module"` scripts in dist.
- Use hash routing.
- Bootstrap of the first `users/{uid}` and `usernames/{username}` docs is still to be designed (Firestore console entry or one-time setup flow guarded by a bootstrap flag).
