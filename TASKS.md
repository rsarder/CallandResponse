# Call and Response — development tracker

Updated: October 26, 2026. Feature development remains frozen. The STAB-1 stabilization implementation and quality gate are complete and awaiting product review; gesture, voice, Muse Spark, and unrelated stretch work were not changed.

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

### Stabilization verification

- [x] **CHECK-01** `npm run typecheck` — web and shared strict TypeScript pass.
- [x] **CHECK-02** `npm run lint` — ESLint passes.
- [x] **CHECK-03** `npm test` / focused equivalent — 50 tests pass across four files.
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
- [ ] **MESH-01** P2, owner Codex, deps SHAPE-01 — Box-derived corner editing is implemented, but a dedicated browser regression for corner dragging is still needed before marking the feature independently verified. Accept: shared logical vertex moves, topology remains valid, save/load and undo/redo pass.
- [x] **MAT-01** P1, owner Codex, deps CORE-02 — Validated opacity/color editing and JSON persistence.
- [x] **CTX-01** P1, owner Codex, deps CORE-03 — Selection-aware cursor context menu with Group/Ungroup and all three Boolean actions.
- [x] **EMPTY-01** P1, owner Codex, deps CORE-02 — Transform-only Empty objects without render geometry or material.
- [x] **GROUP-01** P1, owner Codex, deps EMPTY-01/STAB-HIER-01 — Multi-select hierarchy, group/ungroup/reparent, nested hierarchy, duplication, and history.
- [x] **BOOL-01** P1, owner Codex, deps STAB-CSG-01 — Preview/apply/cancel for validated, reusable indexed Boolean results.
- [x] **OVERLAP-01** P1, owner Codex, deps BOOL-01 — Advisory broad/exact overlap diagnostics without scene mutation.

## M2 — P0 gesture-based interaction

- [ ] **GEST-01** P0, owner Developer A (planned), deps CORE-03 — One MediaPipe recognizer, hand cursor, explicit enable/disable, and tracking state. Accept: stable mirrored pointer and fully usable offline mouse fallback.
- [ ] **GEST-02** P0, owner Developer A (planned), deps GEST-01/CORE-04 — Point/dwell selection and hysteresis-based pinch. Accept: repeatable selection with low false activation on demo hardware.
- [ ] **GEST-03** P0, owner Developer A (planned), deps GEST-02/CORE-02 — Contextual pinch move and face stretch through the shared operation system. Accept: target locking, tracking-loss cancel, and one transaction per drag.

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

No M1 stabilization blocker remains. The highest-priority recommended follow-up is **MESH-01**, adding a dedicated browser regression for box-corner deformation so the already implemented feature can be independently verified. After product review, resume **GEST-01** and **MUSE-01** without changing the geometry invariants established by STAB-1.

Hackathon submission target: November 4, 2026, 9:00 PM ET. Webcam, voice, and Muse Spark development remains frozen until this stabilization result is accepted.
