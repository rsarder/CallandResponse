# Call and Response — development tracker

Updated: October 26, 2026. Source inspection found only specifications and a one-line README; no application or tests existed.

## Current milestone — M1: conventional editor (active; implementation verified October 26, 2026)

Acceptance: launch locally offline after dependency installation; create/select/move/rotate/scale box, cylinder, sphere; numeric editing; Object/Shape/View modes; six anchored box-face drags; camera navigation and presets; undo/redo; validated JSON save/load. No webcam, microphone, or Meta credentials required.

## In progress

None. M1 verification is complete; future milestones remain pending.

## Pending tasks by milestone

### M2 — P0 gesture-based interaction

- [ ] **GEST-01** P0, owner Developer A (planned), deps CORE-03 — Single MediaPipe recognizer, hand cursor, explicit enable/disable and tracking status. Accept: stable one-hand pointer with correct mirroring and offline editor fallback.
- [ ] **GEST-02** P0, owner Developer A (planned), deps GEST-01/CORE-04 — Point/dwell selection and hysteresis-based custom pinch. Accept: repeated selections and low false activation on demo hardware.
- [ ] **GEST-03** P0, owner Developer A (planned), deps GEST-02/CORE-02 — Contextual pinch object move and box face stretch with target locking and tracking-loss cancel. Accept: one transaction per completed drag; no accidental operation on loss or mode conflict.

### M3 — P0 Muse Spark integration

- [ ] **MUSE-01** P0, owner Developer B (planned), deps CORE-02 — Secure backend adapter and structured plan schema. Accept: credentials server-only; bounded requests; schema-invalid plans rejected.
- [ ] **MUSE-02** P0, owner Developer B (planned), deps MUSE-01/CORE-05 — Scene-aware Muse Spark operations with selected object/face and revision. Accept: real API smoke test; stale/invalid plans leave scene unchanged; clear failures.
- [ ] **MUSE-03** P0, owner Developer B (planned), deps MUSE-02 — Typed command path for local UI commands and AI requests. Accept: local commands never invoke Muse Spark; geometry requests use same executor.

### M4 — P1 voice and advanced interaction

- [ ] **VOICE-01** P1, owner Developer B (planned), deps MUSE-03 — Push-to-talk transcription and shared routing. Accept: supported audio format, final transcripts only, failures reported.
- [ ] **ADV-01** P1, owner Developer A (planned), deps GEST-03 — Reliable View mode pan/orbit gesture(s), optional fist and pinch zoom. Accept: camera moves without scene revisions or history.
- [ ] **ADV-02** P1, owner TBD, deps MUSE-02 — AI plan preview/confirmation and conflict queuing. Accept: cancel leaves scene unchanged and mid-drag mode requests wait.

### M5 — P1 precision, export, and multi-object features

- [ ] **PREC-01** P1, owner TBD, deps CORE-05 — Snapping, measurement guides, and precise axis entry. Accept: predictable mm measurements and no unintended snapping.
- [ ] **MULTI-01** P1, owner TBD, deps CORE-02/MUSE-02 — Multi-selection, align/distribute, optional grouping with defined semantics. Accept: one atomic history entry per multi-object edit.
- [ ] **EXPORT-01** P1, owner TBD, deps CORE-03 — GLB export distinct from native JSON. Accept: exported model reopens in another viewer.

### M6 — P2 stretch goals

- [ ] **STRETCH-01** P2, owner TBD, deps CORE-04 — Corner deformation with valid logical topology. Accept: all shared corner vertices move coherently, no degenerate faces.
- [ ] **STRETCH-02** P2, owner TBD, deps STRETCH-01 — True face extrusion and limited CSG. Accept: actual topology/manifold geometry, tested export.
- [ ] **STRETCH-03** P2, owner TBD, deps GEST-03 — Two-hand manipulation and configurable mappings. Accept: stable gestures without collisions.
- [ ] **STRETCH-04** P2, owner TBD, deps MUSE-02 — Muse Image/SAM references, patterns, arbitrary mesh import. Accept: capabilities described accurately; imported meshes distinguished from primitives.

## Completed tasks

- [x] **CORE-01** P0, owner Codex, deps none — Strict TypeScript npm workspaces and offline web build. Verified: install, typecheck, lint, tests, and production build ran successfully.
- [x] **CORE-02** P0, owner Codex, deps CORE-01 — Portable Zod scene schema, atomic executor, revision and history. Verified: 11 automated tests cover creation, transforms, dimensions, all face signs, rotated anchoring, invalid operations, rollback, history, preview, and JSON validation.
- [x] **CORE-03** P0, owner Codex, deps CORE-02 — Responsive viewport, camera controls, primitive rendering, hierarchy, and mouse selection. Verified in headless Chrome at desktop and narrower viewport sizes.
- [x] **CORE-04** P0, owner Codex, deps CORE-03 — Select/move/rotate/scale gizmos, numeric inspector, and six face-handle previews. Verified in Chrome: all gizmos commit canonical operations; face drags including rotated box commit once; cancel leaves scene unchanged.
- [x] **CORE-05** P0, owner Codex, deps CORE-04 — Native JSON save/load, shortcuts, errors, and usability. Verified in Chrome: save/delete/reopen, invalid load preservation, inspector edits, duplicate, and mode switching.

## Blocked tasks

None for M1. Later live Meta validation requires credentials and service access.

## Integration checkpoints

- [x] **CHECK-01** Shared executor tests pass, including all face signs and rotated opposite-face anchoring (`npm test`, 11 tests).
- [x] **CHECK-02** Web typecheck, lint, tests, and production build pass (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`).
- [x] **CHECK-03** Automated Chrome M1 journey passes without webcam, microphone, Meta credentials, or external requests (`npm run test:browser`).

## Known issues and architectural notes

- Technical plan's earlier day-by-day schedule mixes later gesture/Meta work into day one. This prompt's M1 scope supersedes that sequence while preserving those requirements in M2–M6.
- Canonical dimensions represent primitive scale. UI camera and temporary drag previews remain outside `SceneDocument`.
- Sphere radius is uniform; cylinder radius stays circular. Independent X/Y/Z dimension scaling applies to boxes; the inspector offers radius/height for round primitives.
- The production bundle emits a size warning (about 1.3 MB uncompressed). Build succeeds; splitting vendor modules is a later performance improvement.
- `npm run test:browser` requires a local Chrome installation and a running `npm run dev` server. Its fixed demonstration coordinates assume a 1440 × 900 desktop viewport before the responsive check.

## Next recommended tasks

Begin GEST-01 (hand cursor and one recognizer) and MUSE-01 (secure backend adapter) in their future milestones. Preserve the verified M1 offline path.

## Deadline and feature freeze

Hackathon submission: November 4, 2026, 9:00 PM ET (per specifications). M1 target: October 26, 2026. Gesture, voice, and Muse Spark implementation is frozen out of M1.
