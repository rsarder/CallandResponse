# Call and Response — Technical Plan

**Project:** Call and Response  
**Event:** Meta Global AI Developer Hackathon 2026  
**Team:** Two developers  
**Development time:** Approximately 8.5 days  
**Submission deadline:** November 4, 2026, 9:00 PM ET  
**Status:** Implementation specification

## 1. Project overview

Call and Response is a standalone, browser-based 3D modeling application that supports conventional mouse and keyboard controls, webcam hand gestures, voice commands, and natural-language AI assistance.

The application allows users to:

- Create and manipulate 3D objects.
- Edit underlying geometric properties.
- Navigate a 3D environment.
- Select objects and geometry using hand gestures.
- Physically reshape supported geometry through pinch-and-drag interactions.
- Switch modes and tools through voice commands.
- Request precise modeling operations using Meta Muse Spark.
- Save and reopen editable projects.
- Undo and redo modeling operations.

The conventional editor must function without webcam access, microphone access, an internet connection, or Meta AI services.

Hand tracking, speech recognition, and AI reasoning augment the editor rather than replacing its basic functionality.

### 1.1 Primary objective

Demonstrate a cohesive workflow in which users can intuitively manipulate geometry through gestures and refine those manipulations through scene-aware AI reasoning.

For example:

1. Create a rectangular plate.
2. Select a face using a webcam-controlled cursor.
3. Pinch and drag the face outward to extend the plate.
4. Issue a voice command to switch editing modes.
5. Navigate around the object using different gestures.
6. Ask Muse Spark to modify dimensions or align related objects.
7. Save or export the resulting model.

### 1.2 What this project is not

Call and Response is not intended to be:

- A replacement for Blender, Fusion 360, or professional CAD software.
- A complete parametric constraint solver.
- A manufacturing-certified CAD kernel.
- A general-purpose organic sculpting environment.
- An AI code-generation system that executes arbitrary scripts.
- A system for accurately recovering absolute 3D hand positions from an ordinary webcam.

The project prioritizes a focused, functional editor and a compelling multimodal demonstration.

## 2. Core requirements

### 2.1 Baseline 3D editor

The application must support the following operations with mouse and keyboard, independent of AI and gesture recognition:

- Create primitive objects: boxes, cylinders, and spheres.
- Select and deselect objects.
- Translate objects.
- Rotate objects.
- Uniformly or independently resize objects.
- Delete objects.
- Edit dimensions numerically.
- Select and stretch box faces.
- Lock movement to specific coordinate axes.
- Orbit, pan, and zoom the camera.
- Focus the camera on selected geometry.
- Undo and redo completed modeling operations.
- Save a project to JSON.
- Load a previously saved project.

The baseline editor is the first product milestone.

### 2.2 Webcam interactions

The application must support hand landmark tracking and gesture recognition using a regular webcam.

Required functionality:

- Hand detection.
- Visible hand-controlled cursor.
- Pointing and hovering.
- Selection.
- Custom pinch detection.
- Pinch-and-drag object manipulation.
- Pinch-and-drag box face stretching.
- Gesture enable/disable controls.
- Explicit handling of lost tracking.

Additional gesture actions such as fist grabbing, open-palm panning, and victory-pose orbiting should be implemented according to the priority system.

### 2.3 Voice commands

Users should be able to issue short spoken instructions such as:

- "Switch to shape mode."
- "Activate the move tool."
- "Switch to view mode."
- "Show the front view."
- "Zoom in."
- "Undo."
- "Extend this face by 20 millimeters."
- "Align these two objects."

Commands affecting the interface or camera should execute deterministically without requiring Muse Spark.

Commands involving semantic modeling instructions should be routed to Muse Spark.

### 2.4 AI-assisted modeling

Muse Spark must receive relevant scene context and produce validated modeling operation plans.

The AI must not directly execute JavaScript or manipulate Three.js objects.

It may only request operations supported by the application's deterministic geometry engine.

## 3. Technology stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| 3D renderer | Three.js |
| React integration | React Three Fiber |
| 3D utilities | Drei |
| State management | Zustand |
| Webcam gesture recognition | MediaPipe Gesture Recognizer |
| AI planning | Meta Muse Spark |
| Speech recognition | Meta Muse Voice Transcribe |
| Backend | Node.js, Fastify |
| Data validation | Zod |
| Testing | Vitest, Playwright where practical |
| Native persistence | JSON |
| Portable export | GLB; optional STL |

Prefer a TypeScript monorepo using npm workspaces.

Do not introduce large frameworks or unnecessary dependencies without a clear benefit.

## 4. High-level architecture

The application consists of the following major systems.

### 4.1 Frontend editor

Responsible for:

- Rendering the 3D workspace.
- Displaying objects, selection outlines, editing handles, and measurement guides.
- Presenting the mode and tool interfaces.
- Managing user interactions.
- Maintaining scene and history state.
- Providing mouse and keyboard controls.
- Capturing webcam and microphone input.

### 4.2 Gesture recognition

Responsible for:

- Receiving webcam frames.
- Running MediaPipe inference.
- Tracking hand landmarks.
- Recognizing predefined poses.
- Detecting custom pinch gestures.
- Smoothing input and preventing false activations.
- Producing normalized interaction events.

The gesture recognizer must not directly modify canonical geometry.

### 4.3 Interaction controller

Responsible for interpreting user inputs according to:

- Current workspace mode.
- Active tool.
- Selected object or geometry.
- Gesture type.
- Current drag state.
- Axis constraints.
- Tracking status.

It converts raw input events into typed editing, camera, or interface intents.

### 4.4 Geometry operation engine

Responsible for validating and executing all scene mutations.

It is shared by:

- Mouse editing.
- Keyboard editing.
- Numeric property inputs.
- Webcam gestures.
- AI-generated operation plans.

It must support atomic transactions, validation, undo, and redo.

### 4.5 AI and voice backend

Responsible for:

- Securely accessing Meta APIs.
- Transcribing speech.
- Preparing scene-aware AI requests.
- Requesting structured operation plans.
- Validating model responses.
- Returning typed plans to the frontend.

API keys must never be exposed in frontend bundles.

## 5. Repository architecture

Suggested structure:

```text
call-and-response/
├── AGENTS.md
├── TECHNICAL_PLAN.md
├── INTERACTION_SPEC.md
├── TASKS.md
├── README.md
├── package.json
├── tsconfig.base.json
├── .env.example
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       ├── scene/
│   │       ├── geometry/
│   │       ├── interaction/
│   │       ├── camera/
│   │       ├── commands/
│   │       ├── state/
│   │       ├── components/
│   │       ├── services/
│   │       └── tests/
│   └── server/
│       └── src/
│           ├── routes/
│           ├── meta/
│           ├── validation/
│           └── tests/
├── packages/
│   └── shared/
│       └── src/
│           ├── scene.ts
│           ├── operations.ts
│           ├── executor.ts
│           └── validation.ts
├── fixtures/
└── docs/
    ├── DECISIONS.md
    ├── EVENT_RULES.md
    └── DEMO_SCRIPT.md
```

The shared package must not depend on React, Three.js, browser APIs, MediaPipe, or Meta SDKs.

It should contain portable domain contracts, validation, and deterministic operation logic.

## 6. Scene data model

The scene must have a canonical logical representation independent of rendered meshes.

The renderer derives Three.js objects from this representation.

### 6.1 Coordinate conventions

Use:

- Right-handed coordinate system.
- Y-up.
- Millimeters as canonical geometric units.
- Consistent mapping between logical units and Three.js coordinates.
- Quaternion rotations.
- Stable string object identifiers.

### 6.2 Scene contracts

```ts
export type Vec3 = readonly [number, number, number];

export type Quat = readonly [
  number,
  number,
  number,
  number
];

export type BoxFace =
  | "+x" | "-x"
  | "+y" | "-y"
  | "+z" | "-z";

export type Shape =
  | {
      kind: "box";
      sizeMm: Vec3;
    }
  | {
      kind: "cylinder";
      radiusMm: number;
      heightMm: number;
    }
  | {
      kind: "sphere";
      radiusMm: number;
    };

export interface SceneObject {
  id: string;
  name: string;
  shape: Shape;
  positionMm: Vec3;
  rotation: Quat;
  material: {
    colorHex: string;
  };
}

export interface SceneDocument {
  schemaVersion: 1;
  revision: number;
  objects: SceneObject[];
}
```

Future geometric types may include explicitly defined polygonal meshes with vertices and connectivity.

Do not assume arbitrary imported meshes support primitive-specific editing operations.

### 6.3 Ephemeral editor state

Keep transient interface state separate from the saved scene.

This includes:

- Selected objects.
- Selected faces.
- Active workspace mode.
- Active editing tool.
- Camera position and orientation.
- Gesture recognition results.
- Cursor position.
- Active drag.
- Temporary operation previews.
- Pending AI plans.

## 7. Scene operation engine

All model mutations must pass through a single validated executor.

### 7.1 Initial operations

```ts
export type SceneOperation =
  | {
      type: "create_box";
      id: string;
      name: string;
      sizeMm: Vec3;
      positionMm: Vec3;
    }
  | {
      type: "create_cylinder";
      id: string;
      name: string;
      radiusMm: number;
      heightMm: number;
      positionMm: Vec3;
    }
  | {
      type: "create_sphere";
      id: string;
      name: string;
      radiusMm: number;
      positionMm: Vec3;
    }
  | {
      type: "translate_object";
      targetId: string;
      deltaMm: Vec3;
    }
  | {
      type: "rotate_object";
      targetId: string;
      rotation: Quat;
    }
  | {
      type: "set_box_dimensions";
      targetId: string;
      sizeMm: Vec3;
    }
  | {
      type: "resize_box_face";
      targetId: string;
      face: BoxFace;
      deltaMm: number;
    }
  | {
      type: "delete_object";
      targetId: string;
    };
```

Uniform and axis-specific primitive scaling should be implemented through a well-defined dimension update or an explicitly approved transform operation.

### 7.2 Transactions

```ts
export interface SceneTransaction {
  expectedRevision: number;

  source:
    | "mouse"
    | "keyboard"
    | "gesture"
    | "ai"
    | "numeric";

  operations: SceneOperation[];
}
```

Transactions must:

1. Validate the expected scene revision.
2. Validate all requested operations.
3. Reject invalid object IDs.
4. Reject invalid numeric values.
5. Reject unsupported geometry operations.
6. Apply every operation atomically.
7. Increment the scene revision once after success.
8. Record one history entry.
9. Leave the scene unchanged on failure.

### 7.3 Undo and redo

Maintain centralized scene history.

During continuous dragging, use temporary preview geometry rather than committing every frame.

Commit only when a drag finishes successfully.

Canceling a drag restores the original state.

A multi-operation AI plan is one undoable transaction.

Redo history is cleared when a new edit is committed after undo.

## 8. Geometry manipulation

### 8.1 Object manipulation

Object mode supports:

- Selection.
- Translation.
- Rotation.
- Uniform resizing.
- Axis-specific resizing.

Dragging should preserve the initial grab offset and should not snap the object's origin to the cursor.

### 8.2 Box face stretching

Shape mode must support stretching any of the six faces of a box.

For a selected face with outward world-space normal `n` and signed displacement `deltaMm`:

```text
newSize[axis] = initialSize[axis] + deltaMm

newPosition =
  initialPosition + n * (deltaMm / 2)
```

The selected face moves while the opposite face remains anchored.

The calculation must work for rotated boxes.

Positive displacement extends the selected face outward. Negative displacement contracts it inward.

The operation must reject invalid sizes or non-finite values.

Face stretching is different from resizing an entire box around its center.

### 8.3 Corner manipulation

Corner deformation is a stretch goal.

It requires:

- Eight logical corner vertices for a box.
- Explicit face and triangle connectivity.
- Correct updates to all triangles sharing a corner.
- Surface-normal recalculation.
- Degenerate-geometry validation.
- Preservation of valid mesh topology.

Do not move only one GPU vertex in Three.js `BoxGeometry`, because logical corners may be duplicated across faces.

### 8.4 Extrusion

True extrusion creates additional geometry.

It is not equivalent to moving an entire box face or attaching a separate intersecting cube.

A limited rectangular extrusion is acceptable as an experimental feature once the core geometry editor works.

## 9. Webcam-to-3D interaction

### 9.1 Screen coordinates

MediaPipe provides normalized fingertip coordinates.

Convert these to viewport normalized device coordinates:

```ts
const xNdc = 2 * u - 1;
const yNdc = 1 - 2 * v;
```

Apply horizontal webcam mirroring exactly once if required.

### 9.2 Raycasting

Use Three.js Raycaster to identify:

- Hovered objects.
- Selection handles.
- Face handles.
- Transform gizmos.

Hit testing must prioritize visible, active handles over the object mesh.

### 9.3 Object dragging

For regular object movement:

1. Capture the selected object and initial pointer ray.
2. Create a drag plane through the initial hit position.
3. Intersect subsequent pointer rays with that plane.
4. Calculate displacement from the initial intersection.
5. Apply the displacement to a temporary transform.
6. Commit a validated transaction on release.

Allow axis-constrained movement for improved precision.

### 9.4 Face dragging

For face stretching:

1. Determine the selected face's local axis.
2. Transform its normal into world space.
3. Project the normal into screen space.
4. Measure pointer displacement along that projected direction.
5. Convert displacement to millimeters.
6. Preview the corresponding face-stretch operation.
7. Commit on release.

If the projected normal is nearly zero, disable that drag direction or prompt the user to rotate the camera or use numeric controls.

Use drag-start snapshots to avoid cumulative drift.

## 10. Gesture recognition and interaction

Use MediaPipe Gesture Recognizer as the preferred inference pipeline.

It provides landmarks and several static gesture categories.

Compute pinch as a custom normalized distance between the thumb and index fingertips.

Supported interaction goals include:

- Point and dwell to select.
- Pinch and drag to move objects.
- Pinch face handles to reshape boxes.
- Fist-based grab.
- Open-palm camera pan.
- Victory-pose camera orbit.
- Pinch-based zoom in View mode.
- Optional thumbs-up/down confirmation.

Use one contextual interaction controller.

Never interpret the same pose independently in multiple competing subsystems.

Detailed mappings belong in `INTERACTION_SPEC.md`.

## 11. Camera system

Implement a camera controller supporting:

- Orbit.
- Pan.
- Zoom/dolly.
- Focus selection.
- Reset view.
- Front/top/right presets.

Mouse controls must work independently of the gesture system.

Camera operations do not modify scene geometry, increment scene revisions, or create geometry undo entries.

The View workspace mode changes the interpretation of hand gestures, not the scene data model.

## 12. Voice commands and AI integration

### 12.1 Speech pipeline

```text
Microphone / Push-to-talk
    ↓
Muse Voice Transcribe
    ↓
Final transcript
    ↓
Local command router
    ├── UI / mode / camera / history commands
    │       ↓
    │   Deterministic controller
    │
    └── Geometry requests
            ↓
        Muse Spark planner
            ↓
        Validated operation plan
            ↓
        Shared transaction executor
```

Push-to-talk is the initial implementation.

Use supported audio encoding for the selected Meta transcription endpoint. If the endpoint requires PCM16 WAV, convert or resample browser recordings appropriately.

Typed and spoken commands use the same command router.

### 12.2 Local commands

Examples:

- Set workspace mode.
- Change active tool.
- Enable or disable gestures.
- Change camera preset.
- Orbit or zoom the camera.
- Focus on selected object.
- Undo or redo.
- Confirm or cancel pending changes.

These do not require Muse Spark.

### 12.3 Muse Spark planning

Geometry requests receive a compact scene snapshot containing:

- Object IDs.
- Object types.
- Dimensions.
- Positions.
- Rotations.
- Selected objects.
- Selected face.
- Current document revision.
- Supported operations.
- Coordinate conventions.

The AI should return:

```ts
interface AiPlanResponse {
  status:
    | "operations"
    | "clarification"
    | "unsupported";

  explanation: string;

  operations: SceneOperation[];
}
```

Use structured JSON output and server-side validation.

The application must not execute arbitrary generated code.

The geometry engine remains responsible for numeric calculations and operation correctness.

### 12.4 Concurrent operations

If an AI request is initiated against scene revision N, and the scene changes to revision N+1 before the response arrives, reject or re-plan the stale response.

Do not overwrite recent gesture edits with an outdated AI plan.

Voice mode/tool changes during active gestures should queue until release, except for explicit cancellation.

## 13. Persistence and export

### 13.1 Native project format

Use JSON containing a versioned `SceneDocument`.

Support:

- Download project.
- Load project.
- Validate imported objects and dimensions.
- Restore the editable scene.

### 13.2 Undo/redo

History must preserve whole-scene changes and support multi-object operations.

### 13.3 Portable 3D export

GLB export is the first portable format to add.

Optional STL export can support geometry-only workflows.

The native JSON format is distinct from GLB/STL because it preserves the application's editable object representation.

Importing arbitrary external meshes is a stretch goal.

## 14. Testing requirements

### Geometry

- Create and delete supported shapes.
- Validate dimensions.
- Verify face stretching for all six directions.
- Verify opposite-face anchoring after rotation.
- Reject invalid geometry.
- Validate transaction atomicity.

### Scene and history

- Ensure scene revisions increment correctly.
- Test undo/redo.
- Confirm canceled previews do not commit.
- Confirm AI plans cannot overwrite stale scenes.

### Interaction

- Test raycasting and hit testing.
- Test gesture hysteresis.
- Verify active drag ownership.
- Verify tracking-loss cancellation.
- Verify mode switching.
- Verify camera operations do not modify geometry.

### AI and voice

- Test supported structured operations.
- Reject unknown object IDs.
- Request clarification for ambiguous commands.
- Verify local command routing.
- Test microphone/API failure handling.

### End-to-end

A full demonstration should work repeatedly with actual webcam and Meta API integrations.

The conventional editor must also pass its tests when webcam, microphone, and backend services are unavailable.

## 15. Development milestones

| Day | Milestone |
|---|---|
| 1 | Repository setup, scene contracts, viewport, mouse interaction, Meta API smoke test |
| 2 | Mouse-based face stretch, webcam tracking, gesture classification, command schemas |
| 3 | Webcam object selection/dragging, Muse Spark scene operations |
| 4 | Gesture-driven face stretch, undo/redo, tracking-loss handling |
| 5 | Voice commands, mode switching, View gestures, contextual AI editing |
| 6 | Precision tools, scene save/load, alignment and optional export |
| 7 | Regression testing, reliability, optional enhancements |
| 8 | Feature freeze, deployment, documentation and demo recording |
| 8.5 | Final smoke test and hackathon submission |

Use `TASKS.md` to track the actual current milestone and progress.

Do not use this schedule as proof of implementation.

## 16. Development responsibilities

### Developer A — Frontend and spatial interaction

Owns:

- Three.js viewport.
- Rendering and camera controls.
- Selection, raycasting and editing gizmos.
- Webcam integration.
- Gesture recognition.
- Input arbitration.
- Interaction feedback.

### Developer B — Geometry and AI

Owns:

- Scene contracts.
- Operation executor.
- Geometry mathematics.
- Undo/redo.
- Backend.
- Muse Spark integration.
- Voice command processing.
- Persistence.

Both developers must coordinate on shared interfaces and perform daily integration.

## 17. Scope and priorities

### P0 — Required

- Standalone functional editor.
- Mouse/keyboard editing.
- Primitive creation and transformations.
- Box face stretching.
- Camera navigation.
- Axis locking.
- Undo/redo.
- JSON save/load.
- Basic webcam gesture control.
- Real Muse Spark scene-aware editing.
- Safe error handling.

### P1 — Strong submission

- Push-to-talk voice commands.
- Spoken mode switching.
- Non-pinch camera gestures.
- Context-aware multi-operation editing.
- Multi-object selection and alignment.
- Measurement guides and snapping.
- GLB export.
- AI edit previews.

### P2 — Stretch goals

- Corner and vertex deformation.
- True face extrusion.
- Boolean operations.
- Parametric patterns.
- Two-handed gestures.
- Customizable gesture mappings.
- Muse Image visual references.
- SAM object segmentation.
- Arbitrary mesh import.
- Organic sculpting.

Never sacrifice stable core functionality to implement speculative enhancements.

## 18. Security and reliability

- Keep Meta credentials on the backend.
- Validate all incoming requests and operation plans.
- Never execute AI-generated arbitrary scripts.
- Request user permission before webcam/microphone access.
- Do not save raw camera or microphone recordings by default.
- Use HTTPS for deployed webcam/microphone functionality.
- Rate-limit API requests.
- Bound input sizes and numeric values.
- Present actionable errors.
- Preserve mouse and keyboard fallbacks.

## 19. Definition of done

A feature is complete only when:

1. The intended behavior works.
2. Relevant tests pass.
3. Invalid inputs are handled.
4. Existing features continue working.
5. It integrates with the shared architecture.
6. The feature can be demonstrated.
7. Relevant documentation and `TASKS.md` are updated.

## 20. Primary technical references

- Meta Model API: https://dev.meta.ai/docs/quickstart
- Meta structured output: https://dev.meta.ai/docs/structured-output
- Meta tool calling: https://dev.meta.ai/docs/tool-calling
- Meta speech transcription: https://dev.meta.ai/docs/speech-to-text
- MediaPipe Gesture Recognizer: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js
- Three.js Raycaster: https://threejs.org/docs/pages/Raycaster.html
- Three.js BufferGeometry: https://threejs.org/docs/pages/BufferGeometry.html
- Three.js GLTFExporter: https://threejs.org/docs/pages/GLTFExporter.html
- Optional CSG library: https://github.com/gkjohnson/three-bvh-csg

**Core engineering principle:** The scene is a validated data model. Mouse interactions, gestures, and AI requests are different interfaces to the same deterministic modeling operations.
