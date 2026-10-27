# Call and Response

Call and Response is an offline-first, browser-based 3D modeling editor. The current product provides a conventional modeling workspace with parametric primitives, hierarchy, precise transforms, shape editing, Boolean solid modeling, history, and editable JSON projects. Webcam gestures, voice input, and Muse Spark are intentionally not part of this stabilization milestone.

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

The browser test launches the installed Google Chrome through Playwright's cross-platform `chrome` channel, at a 1440 x 900 viewport with software WebGL. The same commands work on Windows and macOS. If Chrome is installed in a nonstandard location, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable before running `npm run test:browser`. It drives user-visible controls and covers shape dragging/history, grouping and ungrouping, round and chained Booleans, gizmo screenshots, mixed-scene save/load, and invalid-load preservation. Screenshots and downloaded scenes are written under `test-results/browser/` and ignored by Git.

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
