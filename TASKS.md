# Call and Response — development tracker

Updated: October 27, 2026. The user has approved starting the gesture milestone after the conventional 3D editor shell and stabilization work. Gesture integration is now active; STAB-1 remains complete and is not being reopened.

## EDITOR-1 — final conventional-editor verification (implementation complete; Mac check pending)

- [x] **GIZMO-01** P0, owner Codex, deps CORE-04/STAB-XFORM-01 — Active transform and Shape handles receive deterministic priority over overlapping scene geometry. Verified in Chrome with a sphere occluding a selected box's move gizmo: the box moved, the sphere remained unchanged, and selection stayed on the box. Picker ownership resets on tool/mode/cancel transitions.
- [x] **MESH-01** P2, owner Codex, deps SHAPE-01 — Repeated box-corner editing verified. The first drag converts a box into a closed indexed mesh; subsequent and post-reload drags retain all eight handles; invalid/open topology is rejected; undo/redo and JSON round trip pass in Chrome.
- [ ] **TEST-PORT-01** P0, owner Codex, deps STAB-E2E-01 — Portable harness implemented: Playwright discovers the installed Chrome channel on Windows/macOS, supports `CHROME_PATH`, `CHROME_CHANNEL`, and `EDITOR_URL`, and reports setup failures directly. Windows/default-channel and URL-override workflows pass; leave pending until the teammate executes it on macOS.
- [x] **EDITOR-DOC-01** P1, owner Codex, deps MESH-01/TEST-PORT-01 — Reconciled `editableVertices` naming, Shape-mode capability messaging, and cross-platform test instructions across the specifications and README.

## STAB-1 — geometry, hierarchy, transform, and interaction stabilization

Milestone status: **complete — quality gate passed October 26, 2026**.

- [x] **STAB-GEO-01** P0, owner Codex, deps CORE-02 — Enforce local geometry, explicit object transforms, deliberate pivots, valid indexed triangles, bounds, and schema-v1 migration. Accepted by shared validation, topology, anchoring, migration, and transform tests; conventions are recorded in `docs/DECISIONS.md`.
- [x] **STAB-CSG-01** P0, owner Codex, deps STAB-GEO-01 — Replace the inconsistent evaluator with normalized `manifold-3d` Union/Subtract/Intersection. Accepted across all six primitive pairings and all operators, ellipsoids, custom meshes, transformed operands, shared-parent operands, and chained results.
- [x] **STAB-XFORM-01** P0, owner Codex, deps STAB-GEO-01 — Flatten rendering to computed world transforms and target gizmos without applying parent matrices twice. Accepted by local/world preservation tests and browser screenshots for move, rotate, and scale gizmos on Boolean meshes.
- [x] **STAB-SHAPE-01** P0, owner Codex, deps STAB-XFORM-01 — Derive primitive handles from canonical geometry, keep bounded visible/hit sizes, and disable unsupported arbitrary-mesh handles. Accepted by box and ellipsoid browser handle drags plus canonical one-transaction history checks.
- [x] **STAB-ELLIPSOID-01** P0, owner Codex, deps STAB-GEO-01 — Add independent X/Y/Z radii to schema, operations, rendering, inspector, handles, CSG, migration, and JSON. Accepted by unit tests and a browser drag proving one radius changes independently.
- [x] **STAB-HIER-01** P0, owner Codex, deps STAB-XFORM-01 — Implement atomic grouping, nested ungrouping, reparenting, subtree deletion, and recursive group duplication with cycle prevention and world-pose preservation. Accepted by six hierarchy tests, editor undo/redo tests, and the browser group/move/ungroup workflow.
- [x] **STAB-MESH-01** P0, owner Codex, deps STAB-GEO-01 — Define generic meshes as validated local-space indexed topology with bounds, deliberate pivot, Object-mode transforms, hierarchy/persistence integration, and reusable CSG input. Unsupported arbitrary face editing is explicitly unavailable.
- [x] **STAB-OVERLAP-01** P1, owner Codex, deps STAB-CSG-01 — Move overlap work out of React rendering; add delayed invalidation, world-AABB broad phase, a 24-pair exact-work bound, and distinct candidates/results/errors. Accepted by positive, negative, and dense-scene tests. Worker offloading remains a documented scaling option, not a current blocker.
- [x] **STAB-E2E-01** P0, owner Codex, deps all STAB tasks — Replace stale private-store browser assertions with user-visible workflows and downloaded JSON checks. Accepted in headless Chrome for shape editing, ellipsoids, history, grouping, round/chained Booleans, gizmo screenshots, mixed hierarchy persistence, and invalid-load safety.
- [x] **STAB-DOC-01** P1, owner Codex, deps all STAB tasks — Document product features and usage in `README.md`, and geometry/hierarchy/pivot/CSG policies in `docs/DECISIONS.md`, `TECHNICAL_PLAN.md`, and `INTERACTION_SPEC.md`.

## Post-stabilization tooling follow-up

- [ ] **TEST-PORT-01** P1, owner Codex — Make the Playwright browser journey independent of Windows Chrome install paths and document same commands for macOS/Windows. Accept: uses Playwright's installed Chrome channel by default, supports executable/base-URL overrides, and is syntax-checked. Cross-platform browser execution remains to be confirmed on macOS.

### Stabilization verification

- [x] **CHECK-01** `npm run typecheck` — web and shared strict TypeScript pass.
- [x] **CHECK-02** `npm run lint` — ESLint passes.
- [x] **CHECK-03** `npm test` — 52 tests pass across four files.
- [x] **CHECK-04** `npm run build` — production build passes; existing bundle-size warning remains non-fatal.
- [x] **CHECK-05** `npm run test:browser` — updated Chrome workflow passes; screenshots confirm centered move/rotate/scale controls and aligned shape handles.
- [x] **CHECK-06** `git diff --check` — no whitespace errors (line-ending notices only).

### Confirmed baseline causes, now resolved

- `three-bvh-csg` emitted degenerate round-primitive triangles and required attributes that chained canonical meshes did not have.
- Boolean outputs mixed baked world coordinates with an origin object transform, separating visible geometry from pivots and gizmos.
- Parented React scene nodes and already-world-transformed gizmo targets applied hierarchy transforms twice.
- Shape controls assumed fixed 40 mm dimensions, and scalar sphere radius could not represent ellipsoids.
- Group operations lacked explicit ungroup/subtree semantics and lost world transforms or parent context.
- Overlap CSG ran synchronously during React render and treated evaluator failures as no overlap.
- The browser harness imported a second/stale Vite Zustand module instead of asserting stable user-visible behavior.

## M1 — P0 core conventional editor

- [x] **CORE-01** P0, owner Codex, deps none — Strict TypeScript npm workspaces and offline Vite web build.
- [x] **CORE-02** P0, owner Codex, deps CORE-01 — Portable Zod scene schema, typed atomic executor, revision tracking, preview separation, and history.
- [x] **CORE-03** P0, owner Codex, deps CORE-02 — Responsive R3F viewport, camera/navigation presets, primitives, hierarchy, selection, and deselection.
- [x] **CORE-04** P0, owner Codex, deps CORE-03 — Select/move/rotate/scale controls, axis locks, numeric inspector, Shape mode, and anchored face stretch.
- [x] **CORE-05** P0, owner Codex, deps CORE-04 — Native validated JSON save/load, shortcuts, errors, and offline operation.
- [x] **SHAPE-01** P0, owner Codex, deps CORE-04 — Axis handles for boxes, cylinders, and ellipsoids; preview during drag and one commit on release.
- [x] **MAT-01** P1, owner Codex, deps CORE-02 — Validated opacity/color editing and JSON persistence.
- [x] **CTX-01** P1, owner Codex, deps CORE-03 — Selection-aware cursor context menu with Group/Ungroup and all three Boolean actions.
- [x] **EMPTY-01** P1, owner Codex, deps CORE-02 — Transform-only Empty objects without render geometry or material.
- [x] **GROUP-01** P1, owner Codex, deps EMPTY-01/STAB-HIER-01 — Multi-select hierarchy, group/ungroup/reparent, nested hierarchy, duplication, and history.
- [x] **BOOL-01** P1, owner Codex, deps STAB-CSG-01 — Preview/apply/cancel for validated, reusable indexed Boolean results.
- [x] **OVERLAP-01** P1, owner Codex, deps BOOL-01 — Advisory broad/exact overlap diagnostics without scene mutation.

## M2 — P0 gesture-based interaction

- [ ] **GEST-01** P0, owner Codex (implemented; hardware verification pending), deps CORE-03 — One locally served MediaPipe recognizer, explicit camera enable/disable, webcam preview, tracking status, and in-viewport hand landmarks. Fake-webcam browser journey verifies model/WASM startup and clean disable. Still needs validation on a real camera; denial/model failure preserve conventional controls.
- [ ] **GEST-02** P0, owner Codex, deps GEST-01/CORE-04 — Mirrored pointer, dwell selection, normalized hysteresis pinch, target/action lock, and cancellation. Accept: repeatable selection and no accidental release/drag action on tracking loss.
- [ ] **GEST-03** P0, owner Codex, deps GEST-02/CORE-02 — Contextual Object/Shape pinch move and face/corner editing through validated previews/transactions. Accept: one history entry per drag, target locking, lost tracking cancels, and camera-only gestures create no scene edits.
- [ ] **GEST-04** P1, owner Codex, deps GEST-02 — Fist grab, View open-palm pan/Victory orbit/pinch zoom, thumbs-up/down focus/reset/confirm/cancel, stable debounce, and camera alternative controls.
- [ ] **GEST-05** P2, owner Codex, deps GEST-03 — Two-hand separation zoom and optional Object-mode uniform scaling, gated behind reliable two-hand tracking.

### Gesture integration checkpoint

- [x] **GEST-CHECK-01** P0, owner Codex, deps GEST-01 — Fake-webcam Playwright path initializes the local recognizer model/WASM, reaches tracking status, and disables cleanly. This verifies setup/lifecycle only; no real gesture classification is inferred from the fake camera.

## M3 — P0 Muse Spark integration

- [ ] **MUSE-01** P0, owner Developer B (planned), deps CORE-02 — Secure backend adapter and structured plan schema. Accept: credentials remain server-side and invalid/bounded requests fail safely.
- [ ] **MUSE-02** P0, owner Developer B (planned), deps MUSE-01/CORE-05 — Scene-aware Muse Spark operations with selection, selected face, and revision context. Accept: stale or invalid plans leave the scene unchanged.
- [ ] **MUSE-03** P0, owner Developer B (planned), deps MUSE-02 — Typed shared command path for local UI and AI requests. Accept: local commands never invoke Muse Spark; geometry plans use the canonical executor.

## M4 — P1 voice and advanced interaction

- [ ] **VOICE-01** P1, owner Developer B (planned), deps MUSE-03 — Push-to-talk transcription and shared routing. Accept: supported audio format, final transcripts only, and visible failures.
- [ ] **ADV-01** P1, owner Developer A (planned), deps GEST-03 — Reliable View-mode pan/orbit gestures and optional zoom. Accept: camera changes create no scene revisions or history.
- [ ] **ADV-02** P1, owner TBD, deps MUSE-02 — AI plan preview/confirmation and conflict queuing. Accept: cancel leaves the scene unchanged and active drags are not interrupted.

## M5 — P1 precision, export, and multi-object features

- [ ] **PREC-01** P1, owner TBD, deps CORE-05 — Snapping, measurement guides, and precise axis entry. Accept: predictable millimeter measurements without unintended snapping.
- [ ] **MULTI-01** P1, owner TBD, deps GROUP-01/MUSE-02 — Align/distribute and richer multi-object operations. Accept: one atomic history entry per edit.
- [ ] **EXPORT-01** P1, owner TBD, deps CORE-03 — GLB export distinct from native JSON. Accept: exported geometry and hierarchy reopen in an independent viewer.

## M6 — P2 stretch goals

- [ ] **STRETCH-01** P2, owner TBD, deps MESH-01 — Broader vertex/face editing for arbitrary meshes with topology safety.
- [ ] **STRETCH-02** P2, owner TBD, deps STRETCH-01 — True extrusion with manifold output.
- [ ] **STRETCH-03** P2, owner TBD, deps GEST-03 — Two-hand manipulation and configurable mappings.
- [ ] **STRETCH-04** P2, owner TBD, deps MUSE-02 — Muse Image/SAM references, patterns, and arbitrary mesh import.
- [ ] **PERF-01** P2, owner TBD, deps STAB-OVERLAP-01 — Profile larger scenes and move exact overlap analysis to a worker if the bounded main-thread pass exceeds the interaction budget.
- [ ] **PERF-02** P2, owner TBD, deps CORE-01 — Split the production vendor/WASM bundle to remove the current large-chunk warning without compromising offline startup.

## Blockers and next priority

No conventional-editor implementation blocker remains. The Mac test checkpoint **TEST-PORT-01** is still open. Gesture testing requires a real webcam and browser permission; fake-device browser coverage will validate UI/lifecycle but cannot prove recognition reliability. MediaPipe inference runs on-device; the browser still requires an available webcam and a supported secure context (localhost is allowed). Do not add generic post-Boolean Shape editing: applied Boolean meshes intentionally remain Object-mode meshes and reusable Boolean inputs.

## Known issues

- Gesture reliability and thresholds have not been calibrated on the team's real cameras. Two-hand and pose actions need real-device trials before they can be called verified.
- The hand skeleton is a mirrored screen-space visualization; webcam landmarks do not provide calibrated absolute world position.
- The production bundle retains the existing large-chunk warning. Gesture model and WASM files add roughly 28 MB of locally served assets so tracking does not depend on a runtime CDN.

## Next recommended tasks

1. Run the real-camera workflow in README and tune dwell/pinch thresholds against the demo hardware; complete GEST-02/03 only after target lock, cancel, and one-transaction drag behavior are confirmed.
2. Verify hand pan/orbit/zoom, thumbs actions, and two-hand scaling on actual cameras; review accidental activation before closing GEST-04/05.
3. Run `npm ci` and the full standard/browser checks on the teammate's Mac to close TEST-PORT-01.

Hackathon submission target: November 4, 2026, 9:00 PM ET. The conventional-editor stabilization remains accepted. Gesture integration is the active milestone; voice and Muse Spark remain queued behind M2 validation and the P0 quality gate.
