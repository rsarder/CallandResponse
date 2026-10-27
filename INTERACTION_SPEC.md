# Call and Response — Interaction Specification

**Status:** Implementation specification  
**Companion documents:** `AGENTS.md`, `TECHNICAL_PLAN.md`

## 1. Purpose

This document defines how users interact with Call and Response through:

- Mouse and keyboard.
- Webcam hand gestures.
- Typed commands.
- Voice commands.
- AI-assisted modeling instructions.

The application must provide predictable interaction behavior, avoid accidental actions, and preserve consistency across all input methods.

A gesture does not inherently define a modeling operation. Its meaning depends on the current workspace mode, active tool, and selected target.

## 2. Workspace modes

Call and Response supports three workspace modes.

### 2.1 Object mode

Object mode manipulates complete objects without directly editing mesh topology.

Supported operations:

- Select and deselect.
- Translate.
- Rotate.
- Scale.
- Delete.
- Duplicate, when supported.
- Multi-object transforms, when supported.

Tools:

- Select.
- Move.
- Rotate.
- Scale.

Default gesture behavior:

- Point and dwell: Select an object.
- Pinch and drag: Move the selected object.
- Closed fist and move: Alternative grab, when enabled.
- Pinch a rotate/scale handle: Manipulate the active transform.

### 2.2 Shape mode

Shape mode edits an object's geometry.

Initial operations:

- Select a box face.
- Stretch or shrink a box face.
- Enter precise dimensions numerically.

Later operations:

- Corner dragging.
- Vertex manipulation.
- Extrusion.
- More advanced mesh editing.

Default gesture behavior:

- Point toward a face handle: Highlight the handle.
- Point and dwell: Select the face handle.
- Pinch and drag: Move the face along its normal.
- Release: Commit one geometry transaction.

Empty-space pinching must never arbitrarily deform a mesh.

### 2.3 View mode

View mode manipulates only the camera.

Supported operations:

- Orbit.
- Pan.
- Zoom.
- Reset view.
- Focus selected object.
- Set front/top/right view.

Gesture behavior:

- Open palm and move: Pan.
- Victory pose and move: Orbit.
- Pinch and vertical movement: Zoom, if implemented.
- Thumbs up: Focus selected object, if implemented.
- Thumbs down: Reset view, if implemented.

View mode must never modify scene geometry.

## 3. Gesture recognition

### 3.1 Tracking system

Use MediaPipe Gesture Recognizer in the browser.

The recognizer provides:

- Hand landmarks.
- Handedness information.
- Recognized pose categories.
- Confidence values.

Built-in gesture categories include:

- Open Palm.
- Closed Fist.
- Pointing Up.
- Victory.
- Thumb Up.
- Thumb Down.

Pinch is detected manually from landmark distances.

Use a single primary inference pipeline unless profiling demonstrates a need for another implementation.

Camera capture is opt-in and begins only after the user selects **Enable hand tracking**. The video preview is mirrored for the user; normalized landmark coordinates are mirrored once when mapped into viewport coordinates. Show the 21-point hand skeleton in a screen-aligned overlay on the modeling viewport. Webcam-relative depth is not calibrated world position, so the overlay must not be presented as a world-registered VR hand. Process camera frames locally, do not record or save them, and explain that MediaPipe may send usage metrics.

### 3.2 Custom pinch detection

Calculate the distance between the index fingertip and thumb tip.

Normalize that distance using a characteristic hand measurement.

Use separate thresholds for pinch activation and release.

Implement:

- Hysteresis.
- Temporal smoothing.
- Minimum gesture stability.
- Tracking confidence thresholds.
- Tracking-loss cancellation.

Thresholds must be calibrated on the target webcam.

Do not assume fixed pixel distances work at every camera distance.

### 3.3 Dynamic gestures

Static poses alone do not define movement operations.

The system must combine:

1. Recognized pose.
2. Hand position.
3. Hand displacement.
4. Pose duration.
5. Active mode.
6. Active tool.
7. Current selection.
8. Active interaction ownership.

For example, an open palm moving right should pan the camera only if View mode is active and the gesture has been accepted by the interaction controller.

## 4. Gesture mapping

| Gesture | Object mode | Shape mode | View mode | Priority |
|---|---|---|---|---|
| Point and dwell | Select object | Select face/handle | Point/hover | P0 |
| Pinch and drag | Move/transform object | Stretch selected face | Zoom, if enabled | P0 Object/Shape |
| Closed fist and move | Grab object | No default action | No default action | P1 |
| Open palm and move | No destructive action | No destructive action | Pan camera | P1 |
| Victory and move | No destructive action | No destructive action | Orbit camera | P1 |
| Thumbs up | Confirm pending edit | Confirm pending edit | Focus selection | P1 |
| Thumbs down | Cancel pending edit | Cancel pending edit | Reset view | P1 |
| Two-hand separation | Optional uniform scale | No default action | Zoom | P2 |

Every gesture-dependent function must have a mouse, keyboard, or toolbar alternative.

## 5. Gesture interaction states

Use a finite-state controller.

Suggested states:

```text
NO_HAND
    ↓
POSE_CANDIDATE
    ↓
STABLE_POSE
    ↓
HOVER / READY
    ↓
ACTIVE_DRAG or ONE_SHOT_ACTION
    ↓
RELEASE / CANCEL
    ↓
COOLDOWN
```

### NO_HAND

No usable hand is detected.

No gesture action is performed.

### POSE_CANDIDATE

A possible gesture has been detected.

No destructive operation begins yet.

### STABLE_POSE

The gesture meets stability and confidence requirements.

The contextual controller determines whether the action is valid.

### HOVER / READY

The virtual pointer can identify actionable objects and handles.

### ACTIVE_DRAG

An object transform, geometry edit, or camera movement is in progress.

The interaction owns its target and operation until release or cancellation.

### RELEASE

The gesture ends intentionally.

The modeling operation commits one validated transaction.

### CANCEL

The gesture is interrupted or canceled.

Uncommitted changes are discarded.

### COOLDOWN

Prevents repeated discrete actions immediately after completion.

## 6. Gesture arbitration

The interaction controller must prevent conflicting actions.

Rules:

1. Only one active drag may control a particular interaction at a time.
2. A drag locks its selected target.
3. A drag locks its operation type.
4. Pose fluctuations cannot reinterpret an active operation.
5. Mode changes requested during drags are queued.
6. Explicit cancellation aborts the current preview.
7. Sustained tracking loss cancels the operation.
8. Discrete commands use cooldowns to avoid repeated activation.
9. Only handles supported by the current mode/tool can be interacted with.
10. Camera gestures do not generate scene transactions.

Suggested target hit-test priority:

```text
Active shape handles
    ↓
Active transform handles
    ↓
Selected object
    ↓
Other selectable objects
    ↓
Background
```

When an active transform or Shape handle overlaps another rendered object in screen space, the handle owns the left-pointer interaction. The occluding object must not replace the selection or prevent the handle drag. Priority applies only inside the handle's actual picker region; ordinary clicks elsewhere continue to select scene objects normally.

## 7. Webcam pointer mapping

MediaPipe fingertip coordinates are normalized to the webcam image.

Map those coordinates to the Three.js viewport.

```ts
const xNdc = 2 * pointerX - 1;
const yNdc = 1 - 2 * pointerY;
```

Apply horizontal mirroring consistently.

Use Three.js Raycaster for object and handle selection.

The virtual cursor should display:

- Current position.
- Hover target.
- Pinch state.
- Active action.
- Tracking status.

Show clear feedback when no valid target is under the pointer.

## 8. Object dragging

When a grab begins:

1. Identify the selected object.
2. Capture the initial pointer position.
3. Capture the initial object transform.
4. Establish a drag plane.
5. Store the initial grab offset.

During movement:

1. Intersect the current pointer ray with the drag plane.
2. Calculate displacement relative to the initial intersection.
3. Apply the displacement to a temporary preview.
4. Clamp movement if necessary.
5. Respect active axis constraints.

On release:

- Commit one validated transaction.
- Update history once.

On cancellation:

- Restore original state.
- Do not add history.

## 9. Shape dragging

Shape mode uses dedicated geometric handles.

For a box:

- Six face handles are available.
- Each handle corresponds to a local face axis.
- Only the selected face moves.
- The opposite face remains anchored.

During stretching:

1. Identify the selected face.
2. Snapshot the object.
3. Calculate the outward world normal.
4. Project the axis into screen space.
5. Convert hand movement into a signed distance.
6. Calculate new dimensions and position.
7. Show the preview and measurement.
8. Commit on release.

Disable ambiguous drags when the face normal projects to an unusably small screen-space vector.

Corner editing must not be enabled until an appropriate mesh representation is implemented.

## 10. Camera interaction

Use one camera controller shared by conventional and gesture inputs.

Required methods:

```ts
interface CameraController {
  orbit(deltaYaw: number, deltaPitch: number): void;

  pan(deltaX: number, deltaY: number): void;

  zoom(factor: number): void;

  reset(): void;

  focusSelected(): void;

  setPreset(
    preset: "front" | "top" | "right"
  ): void;
}
```

Gesture movement must be smoothed and sensitivity-limited.

Orbit must avoid invalid camera orientations.

Zoom must have minimum and maximum distances.

Camera operations must not modify the logical scene document.

## 11. Voice commands

Use push-to-talk initially.

Speech is transcribed using Muse Voice Transcribe, then passed to the same command router used for typed input.

### 11.1 Local commands

| Voice command | Action |
|---|---|
| "Switch to object mode" | Set Object mode |
| "Switch to shape mode" | Set Shape mode |
| "Switch to view mode" | Set View mode |
| "Select tool" | Activate selection |
| "Move tool" | Activate translation |
| "Rotate tool" | Activate rotation |
| "Scale tool" | Activate scaling |
| "Face stretch tool" | Activate face stretching |
| "Show front view" | Change camera preset |
| "Show top view" | Change camera preset |
| "Reset camera" | Restore default camera |
| "Focus selected" | Focus camera on selection |
| "Zoom in" | Zoom camera |
| "Zoom out" | Zoom camera |
| "Undo" | Undo geometry transaction |
| "Redo" | Redo geometry transaction |
| "Enable gestures" | Enable webcam interaction |
| "Disable gestures" | Disable webcam interaction |
| "Cancel" | Cancel active preview |
| "Confirm" | Confirm pending operation |

Local commands do not require Muse Spark.

### 11.2 AI commands

Examples:

- "Create a box 100 millimeters wide."
- "Extend this face by 20 millimeters."
- "Make the selected object twice as tall."
- "Rotate this cylinder 45 degrees around Y."
- "Align these two objects."
- "Space the selected objects evenly."
- "Make the support the same height as the plate."

Only supported operations may be executed.

Unsupported commands must return appropriate feedback.

## 12. Command routing

Use a central typed command router.

```ts
type WorkspaceMode =
  | "object"
  | "shape"
  | "view";

type ObjectTool =
  | "select"
  | "move"
  | "rotate"
  | "scale";

type UICommand =
  | {
      kind: "set_mode";
      mode: WorkspaceMode;
    }
  | {
      kind: "set_object_tool";
      tool: ObjectTool;
    }
  | {
      kind: "camera";
      action:
        | "reset"
        | "focus"
        | "preset"
        | "orbit"
        | "pan"
        | "zoom";
      parameters?: Record<string, unknown>;
    }
  | {
      kind: "history";
      action: "undo" | "redo";
    }
  | {
      kind: "gesture_input";
      enabled: boolean;
    }
  | {
      kind: "cancel" | "confirm";
    };

type ResolvedCommand =
  | {
      kind: "ui_command";
      command: UICommand;
    }
  | {
      kind: "geometry_request";
      instruction: string;
    }
  | {
      kind: "clarification";
      question: string;
    }
  | {
      kind: "unsupported";
      reason: string;
    };
```

The router must:

- Recognize known mode/tool commands.
- Distinguish camera rotation from object rotation.
- Handle common speech variations.
- Avoid overly broad substring matching.
- Require clarification for ambiguous requests.
- Avoid partially executing unsupported compound commands.
- Process typed and transcribed instructions identically.

## 13. Voice and interaction conflicts

When a voice instruction is received during an active gesture:

- Mode and tool changes queue until release.
- Explicit cancellation may abort the active operation immediately.
- Geometry-changing AI plans must not apply over uncommitted gesture previews.
- Stale AI plans must be rejected or re-planned.

Do not execute unstable partial speech transcripts.

Show the finalized transcript and resolved command.

## 14. AI operation interaction

When the user makes a geometry request:

1. Capture the instruction.
2. Capture the current scene revision.
3. Capture the selection context.
4. Send relevant scene data to the backend.
5. Request a structured Muse Spark plan.
6. Validate the plan.
7. Preview high-impact or ambiguous changes when appropriate.
8. Execute an atomic scene transaction.
9. Update the viewport.
10. Record undo history.

The AI must reference actual scene object IDs.

It may not invent existing object identifiers.

If the target is ambiguous, request clarification.

## 15. UI feedback requirements

The user should always be able to determine:

- Current workspace mode.
- Active editing tool.
- Whether gestures are enabled.
- Whether a hand is detected.
- Which gesture is recognized.
- Which object or handle is hovered.
- Which object or face is selected.
- Whether a drag is active.
- Whether a voice command is being recorded.
- Whether Muse Spark is processing.
- Whether an AI operation is awaiting confirmation.
- Why a requested operation failed.

Recommended interface elements:

- Workspace mode toolbar.
- Scene hierarchy.
- Object property inspector.
- AI command panel.
- Push-to-talk button.
- Webcam preview inset.
- Gesture status indicator.
- Active dimension/axis indicator.
- Undo/redo controls.

## 16. Accessibility and fallbacks

Every core operation must be possible without gestures.

Provide:

- Mouse controls.
- Keyboard shortcuts.
- Numeric editing.
- Mode toolbar.
- Camera toolbar.
- Typed commands.
- Gesture enable/disable toggle.

If webcam permission is denied, conventional modeling must continue.

If the microphone is unavailable, typed commands must remain usable.

If Muse Spark is unavailable, conventional modeling must continue.

## 17. Performance guidelines

- Avoid blocking rendering with hand inference.
- Keep high-frequency landmark data out of large React component trees.
- Minimize unnecessary geometry reconstruction.
- Throttle or frame-limit camera inference if necessary.
- Keep pointer updates responsive.
- Execute AI requests asynchronously without freezing the editor.
- Measure actual performance on the demonstration machine.
- Prefer reliable gestures over a large gesture catalog.

## 18. Gesture testing

Test each supported gesture repeatedly.

Required scenarios:

- Point and dwell selects the intended object.
- Pinch moves the correct object.
- Pinch stretches the correct face.
- Fist grab does not activate accidentally.
- Open palm pans only in View mode.
- Victory pose orbits only in View mode.
- Switching modes changes gesture semantics.
- Losing tracking cancels an uncommitted drag.
- Gesture classification changes do not hijack active interactions.
- Mouse controls work with gesture tracking disabled.

Suggested initial target: at least 9 successful attempts out of 10 for critical gesture workflows on demo hardware.

Measure false activations as well as successful interactions.

## 19. Voice testing

Test:

- Spoken mode switching.
- Spoken tool switching.
- Spoken camera presets.
- Spoken undo and redo.
- Spoken gesture enable/disable.
- AI geometry instructions.
- Ambiguous target handling.
- Compound-command rejection or clarification.
- Transcription failures.
- Network failures.
- Voice commands during active drags.

Verify simple UI commands do not contact Muse Spark.

Verify geometry requests include scene and selection context.

## 20. Demonstration workflow

Target demonstration:

1. Create a rectangular plate.
2. Point at the plate and select it.
3. Pinch and drag to reposition it.
4. Say "switch to shape mode."
5. Pinch a face and stretch it outward.
6. Say "switch to view mode."
7. Pan or orbit using a different hand gesture.
8. Say "switch to object mode."
9. Select a supporting component.
10. Ask Muse Spark to precisely resize and align it.
11. Show the resulting operation and geometry.
12. Undo or redo an operation.
13. Save or export the design.

This demonstration must show actual geometry changes rather than purely visual manipulations.

## 21. Priority policy

### P0

- Mouse interaction.
- Pointing and selection.
- Custom pinch.
- Object translation.
- Box face stretching.
- Clear modes and tools.
- Safe gesture arbitration.
- Functional conventional camera controls.

### P1

- Voice mode switching.
- Voice camera controls.
- Open-palm pan.
- Victory orbit.
- Fist grab.
- Pinch zoom.
- Context-aware AI edits.
- Confirmation previews.

### P2

- Two-hand manipulation.
- Custom gesture mappings.
- Advanced vertex selection.
- Corner deformation.
- Extrusion gestures.
- Continuous voice interaction.

When behind schedule, reduce the number of supported gestures rather than weakening gesture reliability or core geometry functionality.

## 22. Primary implementation principle

Gestures, voice commands, mouse controls, and AI are different input interfaces to a single predictable editing application.

Input recognition and geometry execution must remain separate.

All committed geometry modifications must use the shared validated scene operation engine.

The most important user experience is intuitive physical manipulation followed by precise, context-aware AI refinement.

## 23. Approved shape, hierarchy, material, and boolean interactions

### Shape handles and corners

- Shape mode displays colored axis arrows with shafts and arrowheads at the current editable boundary. During a drag, the previewed handle follows the changed edge or radius.
- Boxes expose six face arrows and eight visually distinct corner handles. A corner drag converts the box to an indexed custom mesh on first edit, then moves the shared logical corner vertex. Box faces continue to use the anchored face-stretch operation.
- Sphere-family primitives expose six radial arrows that independently edit X, Y, and Z radii, allowing true ellipsoids without using object scale. Cylinders expose four radial radius arrows and two cap-height arrows; cap drags preserve the opposite cap plane.
- Boolean-result meshes remain selectable and support object transforms. Their read-only dimensions come from computed local bounds. Arbitrary Boolean meshes do not display fake primitive handles; corner handles are reserved for box-derived custom meshes with declared editable vertices.

### Opacity and empty objects

- New solid objects start at 50% opacity. The inspector provides a 0–100% slider; scrolling over the slider changes opacity in 5% steps.
- Opacity is part of the saved scene material. Empty objects have no material or rendered/collision mesh and contain only position, rotation, and scale.

### Hierarchy and grouping

- Shift-click toggles multi-selection in the hierarchy and viewport.
- Right-click opens a cursor-positioned menu with Group, Ungroup, Union, Subtract, and Intersection. Actions that do not apply to the current selection are disabled.
- Group creates an Empty parent at the selected objects' world-space center and reparents the selection without changing its world pose. Inspector position and rotation values then show local space.
- Ungroup reparents the selected group's direct children to its parent without changing their world pose and removes the group. Nested groups remain intact. An empty group is simply removed. Group duplication recursively duplicates and remaps the descendant subtree.
- Dragging onto an Empty makes the selection its children; dragging above or below a hierarchy row reorders siblings; dropping in the root area reparents to scene root while preserving world pose. Invalid cycles, non-Empty parents, and transforms requiring shear are rejected visibly.
- Empty parent transforms inherit through the scene tree. Group scale is currently represented as a uniform Empty transform.

### Boolean preview and overlap warnings

- Union, Subtract, and Intersection require exactly two selected closed solids. The first selected object is the target; the second is the cutter. Empty objects and objects with children cannot be Boolean inputs; select solid descendants of a group.
- The preview leaves the inputs visible and overlays the computed result. Apply replaces both inputs with one validated indexed local-space mesh in one scene transaction; cancel preserves both inputs. The result remains transformable, serializable, and valid for later chained Boolean operations.
- Results use a bounds-center local pivot. They retain a parent only when both inputs share that parent; otherwise the result is placed at scene root.
- A non-blocking hierarchy warning identifies objects whose closed-solid intersection has positive volume. A separate candidate marker identifies broad-phase bounds overlap that was not exactly verified because work is bounded. Failures and analysis limits are surfaced. Group membership does not suppress checks, empties are excluded, and touching surfaces without intersecting volume are not warned.
