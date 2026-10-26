# Call and Response

An offline-first, browser-based 3D editor. Milestone 1 provides conventional modeling controls. Webcam gestures, voice, and Muse Spark are planned in later milestones.

## Run locally

Requires Node.js 22 or newer. From this directory:

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. After dependencies are installed, the editor needs no network connection or credentials.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

With `npm run dev` running, `npm run test:browser` exercises the installed Chrome browser at a 1440 × 900 viewport. It covers the editor workflow, face drag cancel/undo, gizmo commits, and JSON validation. The script uses Chrome's headless WebGL software renderer.

The scene uses millimeters, a Y-up right-handed coordinate system, and one Three.js world unit per millimeter. Save downloads editable `SceneDocument` JSON; Load validates that format before replacing the scene.
