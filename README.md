# Call and Response

Call and Response is an offline-first, browser-based 3D modeling editor. The product provides a conventional modeling workspace with parametric primitives, hierarchy, precise transforms, shape editing, Boolean solid modeling, history, and editable JSON projects. Optional webcam gesture controls are now being integrated; the conventional editor remains usable without a camera.

## What you can do

- Create boxes, cylinders, spheres/ellipsoids, and transform-only Empty groups.
- Select objects in the viewport or scene hierarchy; Shift-click builds a multi-selection.
- Move, rotate, and scale objects with viewport gizmos or numeric inspector fields.
- Use visible transform and Shape handles even when another object overlaps them on screen; active handle hit targets take priority over scene selection.
- Orbit, pan, zoom, focus the selection, reset the camera, or use front/top/right views.
- Switch explicitly between Object, Shape, and View modes.
- Stretch any box face while preserving the opposite face plane, including on rotated boxes.
- Edit cylinder radius and height and edit an ellipsoid's X, Y, and Z radii independently.
- Edit box-derived mesh corners. Arbitrary Boolean meshes intentionally use Object mode only.
- Group objects under an Empty, transform the group, ungroup without a visual jump, nest groups, drag objects between parents, and duplicate a group with its descendants.
- Preview and apply Union, Subtract, or Intersection to two closed solids. Supported inputs include boxes, cylinders, ellipsoids, valid custom meshes, transformed objects, and earlier Boolean results.
- See advisory overlap markers: `!` is a verified positive-volume intersection and `?` is a broad-phase candidate that was not yet exactly checked.
- Undo and redo complete edits. A completed drag or hierarchy/Boolean transaction is one history step; camera movement is not history.
- Save the editable scene as validated JSON and reopen it later. Invalid files are rejected without replacing the current scene.
- Optionally enable webcam hand tracking for point/dwell, pinch editing, and View-mode hand navigation. The live preview and landmark skeleton are visible alongside the modeled scene.

## Start the editor

Node.js 22 or newer is recommended.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Once dependencies are installed, the editor does not need an internet connection, API credentials, a webcam, or a microphone.

## Basic workflow

1. Add a Box, Sphere, or Cylinder from the left panel.
2. In **Object mode**, choose Select, Move, Rotate, or Scale. Use the viewport gizmo for direct manipulation or the inspector for exact values.
3. In **Shape mode**, drag the colored boundary arrows to change primitive geometry. Object scale and shape dimensions are separate values: Object mode changes the object transform; Shape mode changes its canonical dimensions.
4. Shift-click two scene rows, right-click, and choose Union, Subtract, or Intersection. Selection order matters for Subtract: the first selected object is the target and the second is the cutter. Review the preview, then Apply or Cancel.
5. Shift-click objects and choose Group. Select the Empty group to move the whole subtree. Right-click the selected group and choose Ungroup to release its direct children while preserving their world positions.
6. Use **Save project** to download the native `SceneDocument` JSON. Use **Open** to validate and restore it.

## Modes and shortcuts

| Action | Shortcut |
| --- | --- |
| Object / Shape / View mode | `1` / `2` / `3` |
| Select / Move / Rotate / Scale | `Q` / `W` / `E` / `R` |
| Lock X / Y / Z axis | `X` / `Y` / `Z` |
| Delete selection | `Delete` or `Backspace` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` (`Cmd` on macOS) |
| Focus selection | `F` |
| Cancel preview or active edit | `Esc` |

Shortcuts are ignored while typing in a text or numeric input.

## Geometry conventions

Scenes use millimeters, a right-handed Y-up coordinate system, and one Three.js world unit per millimeter. Primitive geometry and indexed custom meshes are stored in object-local coordinates. Each object has local position, quaternion rotation, and scale; parent transforms compose those values into world placement.

Primitive origins are their natural centers. Boolean results are recentered around their local geometric-bounds center, which becomes their deliberate pivot. Gizmos target that pivot's actual world transform. Generic Boolean meshes keep valid indexed topology and can be transformed, grouped, saved, reloaded, and used in later Boolean operations; arbitrary face/vertex editing is not exposed for them.

See [docs/DECISIONS.md](docs/DECISIONS.md) for the detailed invariants and hierarchy/Boolean policies.

## Optional webcam gestures

Choose **Enable hand tracking** in the viewport's camera panel to request camera access. The camera stays off until enabled. The preview is mirrored, inference runs in a worker, and the hand landmarks are drawn over the modeling viewport as a screen-aligned visual guide. A regular webcam does not provide calibrated absolute 3D hand position, so this overlay is not a world-registered VR hand model. Webcam frames are processed on device and are not saved by the editor; MediaPipe may send usage metrics. Current gesture mappings follow [INTERACTION_SPEC.md](INTERACTION_SPEC.md); mouse, keyboard, and toolbar controls remain available.

The MediaPipe Gesture Recognizer model and WebAssembly runtime are served from the local app assets. They are distributed under MediaPipe's Apache 2.0 license. Model source: [Google AI Edge Gesture Recognizer web guide](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js).

## Validation commands

Run these from the repository root after `npm ci`. Unit tests, typechecking, linting, and builds do not require Chrome or a running development server.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Run the automated unit/integration suite with:

```sh
npm test
```

For the browser regression journey, install Google Chrome, start `npm run dev` in one terminal, and run this in another:

```sh
npm run test:browser
```

The browser test launches the installed Google Chrome through Playwright's cross-platform `chrome` channel, at a 1440 x 900 viewport with software WebGL and a fake webcam. It checks that the locally served MediaPipe model/WASM initialize and that tracking can be disabled, then drives user-visible controls through shape dragging/history, grouping and ungrouping, round and chained Booleans, gizmo screenshots, mixed-scene save/load, and invalid-load preservation. The fake webcam does not validate real gesture accuracy. The same commands work on Windows and macOS. For a nonstandard Chrome location use `CHROME_PATH` (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`); use `CHROME_CHANNEL` to select a Playwright-supported channel. To target another running editor, set `BROWSER_TEST_BASE_URL` or `EDITOR_URL`. Screenshots and downloaded scenes are written under `test-results/browser/` and ignored by Git.

For a real camera check, open the app at `http://localhost:5173`, choose **Enable hand tracking**, and grant camera access. Hold one hand in view and check that its mirrored preview, skeleton, and pointer follow it. In Object mode, point/dwell over an object and pinch/drag it; in Shape mode, pinch/drag a visible handle; in View mode, try open-palm pan, Victory orbit, and pinch zoom. Denying permission or selecting **Disable** must leave normal mouse editing usable.

PowerShell path override:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:\Path\To\chrome.exe'
npm run test:browser
```

macOS/Linux path override:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/path/to/Google Chrome" npm run test:browser
```

If the dev server is running on another URL, set `BROWSER_TEST_BASE_URL` (for example, `http://localhost:5174`) before running the browser test.

## Current limitations

- Boolean operands must be closed manifold solids. Empty groups and objects that themselves have children are not direct operands; select their solid descendants.
- Arbitrary Boolean-result meshes do not expose primitive Shape-mode handles. Their computed dimensions are read-only; use Object-mode transforms or another Boolean operation.
- Overlap checking first uses bounding boxes and caps exact solid checks in dense scenes to keep interaction responsive. The status bar reports when exact checking is limited or fails.
- Reparenting rejects transforms that would require shear, because the saved transform model is translation + quaternion rotation + scale.
- Native JSON is the editable project format. GLB export is planned but not implemented.
