# AGENTS.md — Call and Response

> **Purpose:** Repository-wide instructions for human developers and AI coding agents building Call and Response for the Meta AI Developer Hackathon (October 26–November 4, 2026). **Read this file before making changes.** Follow the existing codebase over speculative assumptions; this is a target architecture, not a claim that a feature is already implemented.

## 1. Mission and product definition

Call and Response is a **standalone, browser-based, AI-assisted 3D modeling editor**. Users can create and edit simple 3D geometry with **mouse and keyboard**, manipulate objects and their shapes through **webcam hand gestures**, and use **voice or typed natural language** to change application modes/tools, navigate the scene, or request precise scene-aware edits from **Meta Muse Spark**.

The baseline editor **must be usable without camera, microphone, network, or AI**. Gesture, voice, and AI interfaces are additional input layers over the same underlying editor—not separate editors or mandatory dependencies for ordinary editing.

**Flagship demonstration:** A user creates a box, selects a face with their hand, pinches and drags to stretch that face while anchoring the opposite face, then speaks a command like “make this face exactly 30 millimeters longer and align it with that block.” Muse Spark plans valid edits to the *same* scene, and the deterministic geometry engine applies them. A distinct View mode lets users pan/orbit/zoom the camera through gestures or voice commands.

**Explicitly not building:** a Blender plug-in, a full CAD kernel, a general-purpose sculpting app, unbounded AI code execution, automatic 3D reconstruction from a webcam, or manufacturing-certified geometry.

## 2. Source-of-truth and decision rules

- `AGENTS.md` governs agent conduct, architectural boundaries, and milestone priorities.
- `TECHNICAL_PLAN.md` provides detailed mathematics and system design where present.
- `INTERACTION_SPEC.md` provides detailed gesture/mode behavior where present.
- If docs disagree, prioritize this file's **offline-first baseline editor**, stable shared operation engine, and newest explicitly approved project scope. **Report the conflict; don't silently invent a new architecture.**
- Inspect the existing repository before coding. Prefer completing existing partially implemented systems over adding duplicates.
- Time budget: **two developers, ~8.5 development days**, ending at the published hackathon submission deadline. Keep iterations small and demo-driven.

## 3. Non-negotiable architecture

1. **One canonical `SceneDocument`** containing serializable, logical object geometry and transforms. Three.js meshes are derived views, not canonical state.
2. **One validated operation executor** for edits initiated by mouse, keyboard, gestures, numeric inputs, or Muse Spark. Do not implement separate geometry mutation paths.
3. **Atomic transactions**: apply all operations or none, support undo/redo, and use one undo entry per drag or multi-operation AI plan, not one per frame.
4. **Offline-capable baseline:** create/select/transform/delete objects, manipulate supported geometry, navigate the camera, save/load JSON, and undo/redo without external models or webcam.
5. **Separate camera state from scene geometry**: orbit/pan/zoom and mode/tool switching must not create scene revisions or geometry undo entries.
6. **Explicit Object / Shape / View modes** and an active tool; gesture meaning is contextual and visible to the user.
7. **No direct AI-generated JavaScript, Python, shell commands, `eval`, or `Function`**. Muse Spark generates allowlisted, schema-valid operations only.
8. **Never expose Meta credentials in frontend code.** Call Meta from a backend. Never log secrets or save raw camera streams/audio by default.
9. **Keep mouse, keyboard, and typed commands as fallbacks**, with clear error messages if tracking, speech, or the model API fails.
10. **Don't fake geometry.** A rendered decal is not a hole; multiple overlapping boxes are not a true manifold extrusion. Describe incomplete features honestly.

## 4. Technology and boundaries

Recommended implementation (do not replace an already functional equivalent without agreement):

| Layer | Preferred technology | Responsibility |
| --- | --- | --- |
| Web application | React, TypeScript (strict), Vite | Panels, modes, toolbars, inspector, input orchestration |
| 3D renderer | Three.js, React Three Fiber, Drei | Viewport, gizmos, raycasting, camera and rendered meshes |
| UI/scene state | Zustand | Scene/history, selection, temporary interaction state |
| Webcam | MediaPipe `@mediapipe/tasks-vision` Gesture Recognizer | Landmark tracking, canned poses, custom pinch recognition |
| AI planner | Meta Muse Spark | Typed scene-aware edit proposals |
| Voice transcription | Meta Muse Voice Transcribe | Speech-to-text for local or AI commands |
| Server | Node.js, Fastify | Meta API access, validation, timeouts, limits |
| Contracts/tests | Zod, Vitest | Portable schemas, pure operations, geometry validation |
| Browser tests | Playwright (if time) | Core user journeys and fallbacks |

Use npm workspaces and a monorepo if starting from scratch. Keep shared domain types **free of** React, Three.js, MediaPipe, browser globals, and the Meta SDK.

Suggested layout (adapt to the repository rather than duplicating it):

```text
AGENTS.md
TECHNICAL_PLAN.md
INTERACTION_SPEC.md
README.md
.env.example
apps/
  web/src/
    app/ components/ scene/ geometry/ interaction/ camera/
    commands/ state/ services/ tests/
  server/src/
    routes/ meta/ validation/ tests/
packages/
  shared/src/
    scene.ts operations.ts executor.ts validation.ts
fixtures/
  basic-scene.json ai-command-cases.json ui-command-cases.json
docs/
  DECISIONS.md DEMO_SCRIPT.md EVENT_RULES.md
```

### Ownership for two developers

- **Developer A — frontend/spatial interaction:** viewport, mouse selection, gizmos, webcam, gesture recognition, raycasting, drag math, camera navigation, visible state and feedback.
- **Developer B — domain engine/AI:** scene schema, geometry operations, transaction/history rules, backend, Muse Spark schemas/prompts, typed/voice command router, JSON import/export.
- **Shared changes:** public types, coordinate conventions, new operation kinds, build infrastructure and cross-module integrations require coordination and tests. Integrate at least daily.
- Agents may be assigned to narrower tasks, but **may not create a second scene store, gesture pipeline, command router, or incompatible operation schema**.

## 5. Canonical geometric contracts

Choose these conventions across all layers:

- **Units:** millimeters (`mm`) for logical geometry and world coordinates; renderer uses a consistent documented mapping (prefer 1 world unit = 1 mm for simple MVP).
- **Coordinates:** right-handed world, **Y-up**. Document sign and axis interpretation for camera and face movement.
- **Rotations:** normalized quaternions (`[x,y,z,w]`), not independent Euler-angle sources of truth.
- **Identifiers:** stable unique string IDs; never target objects by array index in AI plans.
- **Document vs UI:** selection, mode, tool, gesture detection, camera pose, and draft drag state are *ephemeral*, not automatically persisted in `SceneDocument`.

```ts
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export type BoxFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export type Shape =
  | { kind: 'box'; sizeMm: Vec3 }
  | { kind: 'cylinder'; radiusMm: number; heightMm: number }
  | { kind: 'sphere'; radiusMm: number };
// Future: {kind: 'hexahedron', cornersMm: readonly Vec3[]} with validated topology.

export interface SceneObject {
  id: string;
  name: string;
  shape: Shape;
  positionMm: Vec3;
  rotation: Quat;
  material: { colorHex: string };
  // Parent/group membership only after stable multi-object semantics are defined.
}

export interface SceneDocument {
  schemaVersion: 1;
  revision: number;
  objects: SceneObject[];
}

export interface SelectionContext {
  selectedObjectIds: string[];
  selectedFace: BoxFace | null;
  mode: 'object' | 'shape' | 'view';
  objectTool: 'select' | 'move' | 'rotate' | 'scale';
  shapeTool: 'face_stretch' | 'corner_pull' | 'extrude';
  axisLock: 'x' | 'y' | 'z' | null;
}
```

**P0 operation union:**

```ts
export type SceneOperation =
  | { type: 'create_box'; id: string; name: string; sizeMm: Vec3; positionMm: Vec3 }
  | { type: 'create_cylinder'; id: string; name: string; radiusMm: number; heightMm: number; positionMm: Vec3 }
  | { type: 'create_sphere'; id: string; name: string; radiusMm: number; positionMm: Vec3 }
  | { type: 'translate_object'; targetId: string; deltaMm: Vec3 }
  | { type: 'rotate_object'; targetId: string; rotation: Quat }
  | { type: 'set_box_dimensions'; targetId: string; sizeMm: Vec3 }
  | { type: 'resize_box_face'; targetId: string; face: BoxFace; deltaMm: number }
  | { type: 'delete_object'; targetId: string };

export interface SceneTransaction {
  expectedRevision: number;
  source: 'mouse' | 'keyboard' | 'gesture' | 'ai' | 'numeric';
  operations: SceneOperation[];
}
```

**Scaling:** Support direct uniform/axis scaling in the editor, but define clearly whether it acts by setting canonical dimensions (preferred for primitives) or by a separate transformation. Do not allow persistent mesh scale and shape dimensions to drift into conflicting sources of truth.

**P1 operations:** align objects, distribute objects, duplicate objects, set material/name, simple grouping and ungrouping *if a clear transform hierarchy exists*. If grouping is not ready, support multi-object selection/transforms without representing it as a permanent group.

**P2 operations:** corner deformation, true extrusion, Boolean union/subtract, parametric patterns. Add these to the shared union only when actual geometry implementations and tests exist.

### Face stretch invariant (highest-priority geometry test)

For a box with current center `p`, local dimensions `d`, unit rotation quaternion `q`, chosen signed local face axis, and outward **world** unit normal `n`:

```text
newDimension[axis] = initialDimension[axis] + signedDeltaMm
newPositionMm = initialPositionMm + n * (signedDeltaMm / 2)
newRotation = initialRotation
```

Positive `signedDeltaMm` moves the *chosen* face outward, negative moves it inward. The **opposite face remains in exactly the same plane**, even when rotated. Reject zero/negative sizes, NaN/Infinity, extreme dimensions, or invalid axes. `set_box_dimensions` is a different operation: it changes the box dimensions about its center unless explicitly specified otherwise.

**Drag implementation:** keep an initial snapshot, display transient previews, and commit only on release. Cancel safely on explicit cancel, mode conflict, or sustained tracking loss. No per-frame history entries.

## 6. Geometry, camera and raycasting requirements

### Editor-first mouse and keyboard path

The first usable editor must have:

- Primitive creation and a scene object list.
- Mouse click-to-select, visible selection and transform controls.
- Object move/rotate/scale and numeric inspector inputs.
- Shape mode with **six box face handles**; drag any face to stretch while anchoring opposite face.
- Orbit, pan, zoom, reset/focus camera; view presets are desirable.
- Axis locking and optionally grid snapping to improve precision.
- Undo/redo, scene JSON export/import with schema validation, and clear empty/error states.

**Do not wait for MediaPipe or Muse Spark to finish before making conventional controls usable.** Hand gestures should drive the same hit tests/tools that mouse input has already proven.

### 2D webcam to 3D pointer

1. Obtain normalized fingertip `(u,v)`; apply webcam mirroring **exactly once**.
2. Map to viewport normalized device coordinates `x=2u-1`, `y=1-2v`.
3. Use `THREE.Raycaster.setFromCamera()` for object/handle hover and selection.
4. For translation, intersect the ray with a defined camera-facing or axis-constrained drag plane and preserve the original grab offset.
5. For face stretching, project the selected face normal to screen space and convert pointer displacement to a signed distance using start-of-drag data (not accumulated per-frame changes).
6. Disable/offer orbit or numeric editing if the projected axis is nearly zero. Clamp values and show the active axis/dimension.

A standard webcam cannot accurately provide arbitrary absolute 6-DOF hand position. **Never advertise calibrated physical tracking.**

## 7. Gesture and mode specification

**P0:** Recognize one hand, show virtual cursor, point/dwell-to-select, detect custom pinch, pinch-drag object move, pinch-drag box face stretch, release/cancel. Gesture interpretation depends on current mode and tool.

**P1:** Open-palm pan and Victory-pose orbit in View mode; fist as alternative object grab; pinch-based zoom in View mode; thumbs-up/down confirm/cancel if demonstrably reliable. Multiple gestures are a product goal, but minimize collisions and remove unreliable ones under deadline pressure.

**P2:** Two-hand spread/twist, configurable gesture mappings, advanced vertex/corner manipulation.

| Workspace mode | What changes | Core input behavior |
| --- | --- | --- |
| **Object** | Object transform / selection | Point selects; pinch moves object; explicit rotate/scale tools |
| **Shape** | Underlying geometry | Point selects face handle; pinch changes real box dimensions |
| **View** | Only camera | Open palm pans, Victory orbits, pinch zooms if implemented |

### Recognition and arbitration rules

- Prefer a **single** MediaPipe Gesture Recognizer for landmarks + predefined categories; compute pinch from thumb/index distance normalized by hand size. `Pinch` is **not** a built-in canned pose.
- Do not run both full Gesture Recognizer and Hand Landmarker pipelines without proven need.
- Use temporal smoothing, gesture dwell/confirmation, hysteresis, cooldowns, and a finite-state controller such as `IDLE -> HOVER -> CANDIDATE -> DRAGGING -> RELEASE/CANCEL`.
- Gesture recognition is not action execution. A centralized interaction dispatcher chooses the meaning based on mode, tool, selection and active drag.
- Once a drag starts, **lock the target/action until release or cancel**. Do not allow a transient Fist/Open Palm classification to hijack a face stretch.
- Gesture interaction can be enabled/disabled immediately, with prominent feedback. Camera and modeling must remain usable with mouse/keyboard.
- Queue mode/tool changes requested by voice during active drags until release. An explicit Cancel aborts the preview first.
- Camera gestures change camera state only, not `SceneDocument.revision` or geometry undo history.
- Add visible status: camera permission/tracking, active pose, gesture enabled/disabled, mode, tool, selected target, active constraint.

## 8. Voice, local command routing, and AI planning

Treat speech as an input modality, not as a separate editing engine:

```text
Push-to-talk audio -> Muse Voice Transcribe -> finalized transcript
                                              |
                                              v
                                    shared command router
                                      /             \
                 deterministic local command       geometry request
                   (mode/tool/view/history)               |
                        |                                v
                   UI/camera state                  Muse Spark plan
                                                         |
                                                validate operation plan
                                                         |
                                                applyTransaction(scene)
```

**Local commands (do not send to Muse Spark):** “switch to shape mode,” “enter view mode,” “activate move tool,” “show front view,” “zoom in,” “undo,” “redo,” “disable gestures,” “cancel,” “confirm.” Typed and transcribed text pass through the same local router. Use a bounded, explicit grammar/alias table; do not rely on fragile substring matches for unrelated sentences.

**AI geometry requests:** “create a 100 mm plate,” “extend this face by 20 mm,” “align these supports,” “evenly space these three objects.” Pass a compact scene snapshot, selection/face context, allowed operation list, unit and coordinate convention, and document revision to Muse Spark.

The server returns a typed plan with `status: 'operations' | 'clarification' | 'unsupported'`, an explanation, and allowlisted operations. Validate syntax with Zod and semantic preconditions in the executor. Return clarification rather than inventing object IDs or interpreting uncertain referents. Reject stale plans if the scene revision changed during inference. A complex/destructive plan should support preview/confirmation.

**Do not claim structured JSON alone makes an edit correct.** The model determines intent; deterministic code checks IDs, bounds, math, selection and transaction validity.

### Meta integration requirements

- Keep `MODEL_API_KEY` only on the backend. Use documented supported model IDs and endpoints; verify actual access with a real smoke test. Do not claim mocks are live Meta responses.
- Put model API calls behind an adapter that can be mocked for offline development and tests.
- Enforce request timeouts, length/rate limits, operation-count limits and user-visible failure messages.
- Start with structured output for a narrow operation set. Tool calling is optional, not necessary for P0.
- Voice P1: use **push-to-talk** and a documented supported input format. If using the Meta file transcription endpoint documented for mono PCM16 WAV at 16/24 kHz, convert/resample browser recordings first; don't assume WebM can be posted as WAV.
- Voice commands received during an active drag queue until completion unless explicitly canceling; never execute from unstable partial transcripts.
- SAM object segmentation and Muse Image concept images are **P2** and do not substitute for hand tracking or actual 3D geometry generation.

## 9. Persistence, history, export and import

- **P0 native format:** Download/upload validated `SceneDocument` JSON with `schemaVersion`. Imported files cannot bypass type/range checks.
- **P0 undo/redo:** Maintain scene-level transaction history. One complete drag or AI plan = one history step; redo is invalidated on a new edit after undo.
- **P1 export:** GLB export of the evaluated meshes; verify reopen in another viewer. If STL is added, document its lack of intrinsic units and the app's mm convention.
- **P2 import:** Arbitrary GLB/STL importing; distinguish imported arbitrary meshes from editable parametric primitives. Do not pretend all imported meshes support face handles and `set_box_dimensions`.
- Make “save native editable project” and “export renderable model” separate UI actions.

## 10. Priorities and scope cuts

### P0 — must ship

Baseline editor independent of augmentation; object creation/select/move/rotate/scale/delete; camera navigation; box face stretch via mouse; axis constraints; undo/redo; native JSON save/load; webcam hand cursor + pinch selection/movement/face stretch; Muse Spark working against live scene context via validated operations; typed command path and error handling.

### P1 — strong submission

Voice push-to-talk and spoken mode/tool switches; at least **one reliable non-pinch View gesture** (ideally both Open Palm pan and Victory orbit); scene-aware AI multi-object alignment/distribution; GLB export; simple grouping/multi-select; snapping/dimension guides; edit preview and confirmation.

### P2 — only if P0/P1 stable

Corner pull with valid logical mesh topology; actual face extrusion; limited CSG hole subtraction; parametric patterns; two-hand scale/twist; editable gesture mapping; Muse Image concept references; SAM-assisted reference-object segmentation; arbitrary external mesh import; organic sculpting.

**Scope-cut order when behind:** eliminate SAM/Muse Image -> two-hand gestures -> advanced CSG/extrusion -> corner deformation -> extra canned poses -> grouping/patterns. Never sacrifice a functional offline editor, reliable face stretch, or the working Muse Spark integration to chase breadth.

## 11. Eight-and-a-half-day implementation gates

| Day | Build focus | Acceptance gate |
| --- | --- | --- |
| **1** | Repo contracts, renderer/editor shell, shared operation engine, backend/Meta smoke test | With mouse: create/select/modify primitives; typecheck and executor tests start passing |
| **2** | Mouse face handles/resize and gesture recognition; command schema | Mouse face stretch correct; fingertip + pinch visible; typed local mode command works |
| **3** | Hand object selection/drag and live Muse Spark plan execution | Pinch moves selected object; real or explicitly blocked Meta integration targets scene object IDs |
| **4** | Pinch face stretch, axis locks, undo/cancel, stability | Pinch reshapes a real box; opposite face stays anchored; undo works |
| **5** | Voice + mode changes, one View gesture, contextual AI edit | Spoken “switch to view mode”; hand pans/orbits; AI edits currently selected geometry |
| **6** | Precision and usability, multi-object AI commands, native save/load | Editor works with webcam/AI disabled and can reopen a saved editable project |
| **7** | Regression, GLB if feasible, optional P1 features | Stable complete demo; no unresolved P0 defects |
| **8** | Feature freeze, deployment, documentation, recording | Three successive end-to-end demo runs; links and permissions verified |
| **8.5** | Final smoke test and submission | Submit **before November 4, 2026, 9 PM ET**, with buffer |

**Daily integration rule:** both developers merge/test a small working path each day. If a gate is missed, fix it before moving to the next class of features. Record blockers in `docs/DECISIONS.md` or issues.

## 12. Acceptance tests agents must protect

- **Offline editor:** without camera/microphone/AI, can create/select/transform/delete objects, use camera, reshape box face, undo/redo, and save/load JSON.
- **Face math:** stretching any of ±X/±Y/±Z preserves the opposite face plane, including with nonidentity rotation; negative extension respects size limits.
- **Undo semantics:** one drag is one undo step; canceled drags create none; multi-operation failure rolls back all actions.
- **AI safety:** invalid ID, unknown operation, out-of-range values and stale scene revisions cannot alter scene.
- **Mode safety:** View gestures do not modify geometry; a mid-drag voice mode switch waits for completion; tracking loss cancels safely.
- **Camera and pointer:** mirroring is correct; projected face-axis degeneracy is handled; active object does not jump to pointer center at grab start.
- **Voice routing:** simple mode/camera/history instructions do not contact Muse Spark; a geometry request uses an AI planner and validator.
- **Robustness:** users receive understandable errors for denied webcam/mic permissions and unavailable backend or model.
- **Regression:** test representative create, move, resize, align and face-stretch instructions against a fixed scene; evaluate both correct plans and clarification behavior.
- **Demo:** a new user can complete the scripted workflow repeatedly with a mouse fallback and a real AI request.

## 13. Security and engineering hygiene

- Enable strict TypeScript. Avoid `any`, unsafe casts, broad `@ts-ignore`, swallowed errors, and hidden mutations.
- Keep geometry pure and testable. Add focused unit tests for each operation and invalid inputs.
- Run appropriate checks, e.g. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (or actual equivalents). Report what **really** ran.
- Never commit `.env`, real API keys, private webcam/audio captures, or user-submitted private designs.
- Use a trusted backend proxy, CORS allowlist, size limits, and request throttling. Don't expose unrestricted AI execution endpoints.
- Webcam/microphone require explicit consent; deployed browser capture should be served over HTTPS.
- Use only dependencies justified by a milestone. Confirm licenses if adapting code from outside repositories.
- Make small commits/PRs, preserve existing work, and do not silently replace the stack.
- Favor stable, testable behavior and fast recovery over unverified cleverness.

## 14. Agent workflow for each task

1. Read `AGENTS.md`, the relevant sections of `TECHNICAL_PLAN.md` and `INTERACTION_SPEC.md`, and inspect current source files.
2. State the **one task**, intended behavior, acceptance test, and modules likely to change.
3. Implement the smallest complete vertical slice; avoid parallel abstractions and decorative placeholders.
4. Add or update unit/integration tests and fixtures. Validate failures and undo/cancel behavior, not just happy path.
5. Run the real available checks. If they fail, explain why. Do not say they passed if they were not run.
6. Summarize changed files, observed behavior, risks, assumptions, and the next highest-priority task.
7. If a requirement is ambiguous or conflicts with existing code, document the tradeoff and choose the narrowest path that protects the current acceptance gate.

**Required work report:**

```text
Summary:
Files changed:
Acceptance test:
Checks run (exact commands + results):
Manual reproduction steps:
Remaining risks / blockers:
Next recommended task:
```

## 15. External technical references

- Hackathon: https://cerebralvalley.ai/e/meta-ai-developer-hackathon
- Meta Model API: https://dev.meta.ai/docs/quickstart
- Meta structured output: https://dev.meta.ai/docs/structured-output
- Meta tool calling: https://dev.meta.ai/docs/tool-calling
- Meta speech: https://dev.meta.ai/docs/speech-to-text
- MediaPipe Gesture Recognizer: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js
- MediaPipe Hand Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- Three.js Raycaster: https://threejs.org/docs/pages/Raycaster.html
- Three.js GLTFExporter: https://threejs.org/docs/pages/GLTFExporter.html
- Three.js BufferGeometry: https://threejs.org/docs/pages/BufferGeometry.html
- Optional CSG: https://github.com/gkjohnson/three-bvh-csg

**North star:** a functional 3D editor that stays useful without AI, plus a striking, reliable interaction where a person physically reshapes geometry with a webcam gesture and Muse Spark precisely understands and edits **that same geometry** through natural language.

## 16. Task Tracking and Autonomous Progress Updates

`TASKS.md` is the project's authoritative development tracker. Coding agents are responsible for creating and maintaining it as development progresses.

### 16.1 TASKS.md Creation

If `TASKS.md` does not exist, the coding agent must create it before beginning substantial implementation work.

Initialize it using:

- `AGENTS.md`
- `TECHNICAL_PLAN.md`
- `INTERACTION_SPEC.md`
- The current repository state
- Existing completed functionality
- The active development milestone

Do not assume planned functionality is already implemented.

Inspect the repository before marking tasks as completed.

### 16.2 Required TASKS.md Structure

The document must contain:

1. **Current milestone:** The active development phase and its acceptance criteria.
2. **In progress:** Tasks currently being implemented, including owner or responsible agent.
3. **Pending tasks:** Upcoming tasks organized by priority and dependency.
4. **Completed tasks:** Verified completed work.
5. **Blocked tasks:** Work that cannot proceed, including the cause and required resolution.
6. **Integration checkpoints:** Tests or workflows that must function before proceeding.
7. **Known issues:** Reproducible bugs and important technical limitations.
8. **Next recommended tasks:** The highest-priority actionable work.
9. **Deadline and feature freeze:** The project submission deadline and current scope restrictions.

Use Markdown checkboxes for task status.

Each nontrivial task should have a unique identifier, a short description, priority, owner, dependencies when relevant, and acceptance criteria.

### 16.3 Automatic Task Updates

Coding agents are authorized and expected to update `TASKS.md` during normal development.

Agents must update the tracker when:

- A task is started.
- A task is completed and verified.
- A blocker is discovered.
- A blocker is resolved.
- An integration checkpoint passes or fails.
- A task requires additional work.
- An approved architectural decision changes the implementation plan.
- New necessary implementation tasks are discovered.

Agents do not need separate permission for routine task-status updates.

Task tracking should happen as part of implementation, not as a separate optional activity.

### 16.4 Completion Requirements

Do not mark a task complete merely because code has been written.

A task can be marked complete only when:

1. Its acceptance criteria are satisfied.
2. The relevant implementation exists.
3. Applicable tests have passed.
4. The implementation integrates with existing systems.
5. No known blocking defect prevents the intended behavior.

If tests cannot be run, record the limitation and leave the task pending verification.

Distinguish between:

- Implemented.
- Tested.
- Fully completed.

Do not claim unverified functionality is complete.

### 16.5 Task Dependencies and Priorities

Agents must respect task dependencies.

Do not implement dependent features before their required foundations exist.

Prioritize work in this order:

1. Correctness and architectural integrity.
2. Core P0 functionality.
3. Blocking integration problems.
4. Reliability and acceptance tests.
5. P1 features.
6. P2 stretch goals.

Do not begin stretch goals while critical P0 requirements are incomplete.

If the project falls behind schedule, identify appropriate scope reductions rather than silently abandoning required features.

### 16.6 Agent Autonomy and Restrictions

Agents may autonomously:

- Create `TASKS.md`.
- Add implementation subtasks required by approved features.
- Update task status.
- Record blockers.
- Document test results.
- Recommend the next task.
- Reorganize the task list for clarity.
- Implement assigned tasks within approved architectural boundaries.

Agents must not autonomously:

- Remove established project requirements.
- Reclassify P0 requirements as optional.
- Add major features outside the approved scope.
- Replace the technical architecture.
- Mark incomplete tasks as complete.
- Delete unresolved blockers or known issues.
- Overwrite another developer's active work.
- Change critical acceptance criteria without approval.

Major scope or architecture changes require explicit developer approval.

### 16.7 Multi-Agent and Two-Developer Coordination

When multiple coding agents or developers are working concurrently:

- Each active task must have an identified owner.
- Avoid assigning overlapping modifications to the same files without coordination.
- Preserve another agent's task updates.
- Do not overwrite `TASKS.md` with an outdated local version.
- Coordinate changes to shared interfaces and operation schemas.
- Record integration dependencies and merge blockers.
- Prefer small, independently testable tasks.

If conflicting changes are discovered, preserve existing work and report the conflict.

### 16.8 Required Agent Workflow

Before starting a task:

1. Read `AGENTS.md`.
2. Read `TASKS.md`, creating it if missing.
3. Read relevant technical specifications.
4. Inspect existing code and recent changes.
5. Identify the highest-priority assigned or unblocked task.
6. Confirm its acceptance criteria and dependencies.
7. Mark the task in progress.

During implementation:

1. Follow the approved architecture.
2. Implement the smallest complete functionality.
3. Add relevant tests.
4. Record important blockers or newly discovered dependencies.
5. Avoid unrelated features or refactoring.

After implementation:

1. Run relevant available tests.
2. Verify acceptance criteria.
3. Update task status accurately.
4. Record remaining issues.
5. Update technical documentation if required.
6. Identify the next highest-priority task.
7. Provide a concise implementation report.

### 16.9 Documentation Maintenance

`AGENTS.md` contains stable project instructions and must not be rewritten for routine progress updates.

`TASKS.md` tracks implementation status and should be updated frequently.

`TECHNICAL_PLAN.md` describes the agreed technical design.

`INTERACTION_SPEC.md` describes approved user interaction behavior.

`docs/DECISIONS.md` records significant approved architectural changes.

Coding agents must keep these documents consistent without treating the task tracker as authorization to change the project scope.

### 16.10 End-of-Task Reporting

Every completed coding task must include:

- Task identifier and description.
- Implementation summary.
- Files created or modified.
- Tests performed and results.
- Acceptance criteria verified.
- Remaining issues or blockers.
- Changes made to `TASKS.md`.
- Next recommended task.

**Important:** Maintaining `TASKS.md` is part of completing a coding task. A task should not be considered fully finished until its status and relevant notes have been updated.