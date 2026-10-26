import { create } from 'zustand';
import {
  applyTransaction, emptyScene, SceneDocumentSchema, type BoxFace, type SceneDocument,
  type SceneObject, type SceneOperation, type SceneTransaction,
} from '@call-and-response/shared';

export type WorkspaceMode = 'object' | 'shape' | 'view';
export type ObjectTool = 'select' | 'move' | 'rotate' | 'scale';
export type AxisLock = 'x' | 'y' | 'z' | null;
export type CameraAction = 'reset' | 'focus' | 'front' | 'top' | 'right' | 'perspective';

interface EditorState {
  scene: SceneDocument;
  past: SceneDocument[];
  future: SceneDocument[];
  selectedId: string | null;
  selectedFace: BoxFace | null;
  mode: WorkspaceMode;
  tool: ObjectTool;
  axisLock: AxisLock;
  preview: SceneObject | null;
  error: string | null;
  cameraAction: CameraAction;
  cameraSeq: number;
  cancelSeq: number;
  select: (id: string | null) => void;
  setFace: (face: BoxFace | null) => void;
  setMode: (mode: WorkspaceMode) => void;
  setTool: (tool: ObjectTool) => void;
  setAxisLock: (axis: AxisLock) => void;
  camera: (action: CameraAction) => void;
  cancel: () => void;
  setError: (error: string | null) => void;
  previewOperation: (operation: SceneOperation) => void;
  clearPreview: () => void;
  transact: (operations: SceneOperation[], source: SceneTransaction['source']) => boolean;
  undo: () => void;
  redo: () => void;
  load: (input: unknown) => boolean;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'The edit could not be completed.';
}

export const useEditor = create<EditorState>((set, get) => ({
  scene: emptyScene(), past: [], future: [], selectedId: null, selectedFace: null,
  mode: 'object', tool: 'select', axisLock: null, preview: null, error: null,
  cameraAction: 'reset', cameraSeq: 0, cancelSeq: 0,
  select: selectedId => set({ selectedId, selectedFace: null, preview: null }),
  setFace: selectedFace => set({ selectedFace }),
  setMode: mode => set(state => ({ mode, selectedFace: null, preview: null, cancelSeq: state.cancelSeq + 1 })),
  setTool: tool => set(state => ({ tool, preview: null, cancelSeq: state.cancelSeq + 1 })),
  setAxisLock: axisLock => set({ axisLock }),
  camera: cameraAction => set(state => ({ cameraAction, cameraSeq: state.cameraSeq + 1 })),
  cancel: () => set(state => ({ preview: null, selectedFace: null, cancelSeq: state.cancelSeq + 1 })),
  setError: error => set({ error }),
  previewOperation: operation => {
    try {
      const { scene } = get();
      const result = applyTransaction(scene, { expectedRevision: scene.revision, source: 'mouse', operations: [operation] });
      set({ preview: result.objects.find(o => o.id === ('targetId' in operation ? operation.targetId : '')) ?? null, error: null });
    } catch (error) {
      set({ error: describeError(error) });
    }
  },
  clearPreview: () => set({ preview: null }),
  transact: (operations, source) => {
    try {
      const { scene, past } = get();
      const next = applyTransaction(scene, { expectedRevision: scene.revision, source, operations });
      set({ scene: next, past: [...past, scene].slice(-100), future: [], preview: null, error: null });
      return true;
    } catch (error) {
      set({ preview: null, error: describeError(error) });
      return false;
    }
  },
  undo: () => set(state => {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return {
      scene: { ...previous, revision: state.scene.revision + 1 }, past: state.past.slice(0, -1),
      future: [...state.future, state.scene], preview: null, error: null,
      selectedId: previous.objects.some(o => o.id === state.selectedId) ? state.selectedId : null,
      selectedFace: null, cancelSeq: state.cancelSeq + 1,
    };
  }),
  redo: () => set(state => {
    const next = state.future.at(-1);
    if (!next) return state;
    return {
      scene: { ...next, revision: state.scene.revision + 1 }, past: [...state.past, state.scene],
      future: state.future.slice(0, -1), preview: null, error: null,
      selectedId: next.objects.some(o => o.id === state.selectedId) ? state.selectedId : null,
      selectedFace: null, cancelSeq: state.cancelSeq + 1,
    };
  }),
  load: input => {
    try {
      const parsed = SceneDocumentSchema.parse(input);
      const { scene, past } = get();
      set({
        scene: { ...parsed, revision: Math.max(scene.revision, parsed.revision) + 1 },
        past: [...past, scene].slice(-100), future: [], selectedId: null, selectedFace: null,
        preview: null, error: null,
      });
      return true;
    } catch (error) {
      set({ error: `Invalid project file: ${describeError(error)}` });
      return false;
    }
  },
}));
