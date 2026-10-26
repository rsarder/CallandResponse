# Call and Response — development tracker

Updated: October 26, 2026. Source inspection found only specifications and a one-line README; no application or tests existed.

## Current milestone — M1+: shape handles, hierarchy, and mesh operations (active; user-approved October 26, 2026)

Acceptance: preserve the M1 offline editor; visible arrow handles resize boxes, spheres, and cylinders; box corner drag creates indexed editable mesh; 50% default opacity is adjustable and persisted; Empty objects can be grouped and reparented with hierarchy and local transforms; right-click menu previews and applies real union/subtract meshes; volumetric overlap warnings include grouped objects. Each edit uses the shared transaction history.

## In progress

- [ ] **SHAPE-01** P0, owner Codex — Replace shape-mode face spheres with axis arrows/lines and add radius/height handles for round primitives. Accept: cursor-following drag preview and one validated commit; dimensions remain positive.
- [ ] **MESH-01** P2, owner Codex, deps SHAPE-01 — Box corner handles convert to editable custom mesh and move a logical vertex coherently. Accept: distinct corner handles, valid indexed topology, undoable edit.
- [ ] **MAT-01** P1, owner Codex — Persist/render opacity, default 50%, inspector 0–100% control with vertical scroll. Accept: intersecting objects remain legible and values round-trip in JSON.
- [ ] **CTX-01** P1, owner Codex — Cursor-positioned right-click menu with Group, Union, Subtract. Accept: menu dismissal, selection-aware actions, unsupported actions visibly disabled until available.
- [ ] **EMPTY-01** P1, owner Codex — Create transform-only EmptyObject N objects. Accept: no mesh/material, hierarchy selection and transform controls.
- [ ] **GROUP-01** P1, owner Codex, deps EMPTY-01 — Multi-select, hierarchy drag/drop, parent transforms, local inspector coordinates, ungroup/reparent with world pose preserved. Accept: no jumps on reparent and transaction undo/redo.
- [ ] **BOOL-01** P2, owner Codex, deps CTX-01/MESH-01 — Actual two-object union/subtraction with preview and editable resulting mesh. Accept: deterministic topology, clear selection ordering, one history entry, export/render checks.
- [ ] **OVERLAP-01** P1, owner Codex, deps BOOL-01 — Advisory intersection warnings including grouped objects; empty objects excluded. Accept: true solid intersection detection, no scene mutation.

Implementation is present for all eight tasks above; each remains in progress until interactive acceptance steps are exercised in a browser. Typecheck, lint, and production build pass; automated and manual interaction checks have not yet been run for this milestone.

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

### Approved feature sequence

- [ ] **CTX-01** → **EMPTY-01** → **GROUP-01** → **BOOL-01** → **OVERLAP-01**, with **SHAPE-01** and **MAT-01** first; **MESH-01** precedes editable CSG output.

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
- [ ] **CHECK-04** Browser interaction acceptance for SHAPE-01 through OVERLAP-01: shape drags, hierarchy reparent/undo, opacity JSON round-trip, CSG preview/apply/cancel, and grouped overlap warnings.

## Known issues and architectural notes

- Technical plan's earlier day-by-day schedule mixes later gesture/Meta work into day one. The approved M1+ feature sequence is being implemented before the still-pending M2/M3 gesture and Muse milestones.
- Canonical dimensions represent primitive scale. UI camera and temporary drag previews remain outside `SceneDocument`.
- Sphere radius is uniform; cylinder radius stays circular. Independent X/Y/Z dimension scaling applies to boxes; the inspector offers radius/height for round primitives.
- Empty objects are transform-only and cannot hold materials; mesh results from booleans remain selectable and transformable, while only box-derived custom meshes expose corner handles.
- Groups are Empty objects. Group scaling inherits through the render hierarchy; manual reparenting decomposes transforms and bakes primitive dimensions where needed. Interactive reparent/boolean edge cases still need browser verification.
- CSG uses `three-bvh-csg` 0.0.17. Boolean results are editable meshes and are no longer parametric primitives.
- The production bundle emits a size warning (about 1.3 MB uncompressed). Build succeeds; splitting vendor modules is a later performance improvement.
- Approved scope extends the current editor with editable indexed meshes, transform-only empties, hierarchical transforms, translucent materials, CSG, and intersection diagnostics. These change the existing schema and require import compatibility handling.
- `npm run test:browser` requires a local Chrome installation and a running `npm run dev` server. Its fixed demonstration coordinates assume a 1440 × 900 desktop viewport before the responsive check.

## Next recommended tasks

Exercise shape drags, multi-select, hierarchy reparent, undo/redo, opacity save/load, boolean previews/results, and overlap warnings in the browser; add focused automated coverage after interaction behavior is confirmed. Then resume GEST-01 and MUSE-01 while preserving the offline path.

## Deadline and feature freeze

Hackathon submission: November 4, 2026, 9:00 PM ET (per specifications). M1 target: October 26, 2026. Gesture, voice, and Muse Spark implementation is frozen out of M1.
