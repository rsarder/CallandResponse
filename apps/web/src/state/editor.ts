import { create } from 'zustand';
import {
  applyTransaction, emptyScene, parseSceneDocument, type BoxFace, type SceneDocument,
  type SceneObject, type SceneOperation, type SceneTransaction, type Vec3,
} from '@call-and-response/shared';

export type WorkspaceMode = 'object' | 'shape' | 'view';
export type ObjectTool = 'select' | 'move' | 'rotate' | 'scale';
export type AxisLock = 'x' | 'y' | 'z' | null;
export type CameraAction = 'reset' | 'focus' | 'front' | 'top' | 'right' | 'perspective';
export interface BooleanPreviewState {
  kind: 'union' | 'subtract' | 'intersect';
  targetId: string;
  cutterId: string;
  vertices: Vec3[];
  triangles: [number, number, number][];
  positionMm: Vec3;
  parentId?: string;
}

export interface GesturePointerInput {
  phase: 'hover' | 'tap' | 'down' | 'move' | 'up' | 'cancel';
  x: number;
  y: number;
}

export interface CameraGestureInput {
  kind: 'pan' | 'orbit' | 'zoom';
  x: number;
  y: number;
  sequence: number;
}

interface EditorState {
  scene: SceneDocument;
  past: SceneDocument[];
  future: SceneDocument[];
  selectedId: string | null;
  selectedIds: string[];
  selectedFace: BoxFace | null;
  mode: WorkspaceMode;
  tool: ObjectTool;
  axisLock: AxisLock;
  preview: SceneObject | null;
  booleanPreview: BooleanPreviewState | null;
  transformHandleHovered: boolean;
  transformDragging: boolean;
  error: string | null;
  cameraAction: CameraAction;
  cameraSeq: number;
  cancelSeq: number;
  gesturePointerHandler: ((input: GesturePointerInput) => void) | null;
  cameraGestureInput: CameraGestureInput | null;
  cameraGesture: (kind: CameraGestureInput['kind'], x: number, y: number) => void;
  setGesturePointerHandler: (handler: ((input: GesturePointerInput) => void) | null) => void;
  sendGesturePointer: (input: GesturePointerInput) => void;
  select: (id: string | null, additive?: boolean) => void;
  setFace: (face: BoxFace | null) => void;
  setMode: (mode: WorkspaceMode) => void;
  setTool: (tool: ObjectTool) => void;
  setAxisLock: (axis: AxisLock) => void;
  camera: (action: CameraAction) => void;
  cancel: () => void;
  setError: (error: string | null) => void;
  previewOperation: (operation: SceneOperation) => void;
  previewOperations: (operations: SceneOperation[], source?: SceneTransaction['source']) => void;
  clearPreview: () => void;
  setBooleanPreview: (preview: BooleanPreviewState | null) => void;
  setTransformHandleHovered: (hovered: boolean) => void;
  setTransformDragging: (dragging: boolean) => void;
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
  scene: emptyScene(), past: [], future: [], selectedId: null, selectedIds: [], selectedFace: null,
  mode: 'object', tool: 'select', axisLock: null, preview: null, booleanPreview: null, error: null,
  transformHandleHovered: false, transformDragging: false,
  cameraAction: 'reset', cameraSeq: 0, cancelSeq: 0,
  gesturePointerHandler: null, cameraGestureInput: null,
  cameraGesture: (kind, x, y) => set(state => ({ cameraGestureInput: { kind, x, y, sequence: (state.cameraGestureInput?.sequence ?? 0) + 1 } })),
  setGesturePointerHandler: gesturePointerHandler => set({ gesturePointerHandler }),
  sendGesturePointer: input => get().gesturePointerHandler?.(input),
  select: (selectedId, additive = false) => set(state => {
    if (!selectedId) return { selectedId: null, selectedIds: [], selectedFace: null, preview: null, booleanPreview: null };
    const selectedIds = additive
      ? state.selectedIds.includes(selectedId) ? state.selectedIds.filter(id => id !== selectedId) : [...state.selectedIds, selectedId]
      : [selectedId];
    return { selectedId: selectedIds.at(-1) ?? null, selectedIds, selectedFace: null, preview: null, booleanPreview: null };
  }),
  setFace: selectedFace => set({ selectedFace }),
  setMode: mode => set(state => ({ mode, selectedFace: null, preview: null, booleanPreview: null, transformHandleHovered: false, transformDragging: false, cancelSeq: state.cancelSeq + 1 })),
  setTool: tool => set(state => ({ tool, preview: null, booleanPreview: null, transformHandleHovered: false, transformDragging: false, cancelSeq: state.cancelSeq + 1 })),
  setAxisLock: axisLock => set({ axisLock }),
  camera: cameraAction => set(state => ({ cameraAction, cameraSeq: state.cameraSeq + 1 })),
  cancel: () => set(state => ({ preview: null, booleanPreview: null, selectedFace: null, transformHandleHovered: false, transformDragging: false, cancelSeq: state.cancelSeq + 1 })),
  setError: error => set({ error }),
  previewOperation: operation => {
    get().previewOperations([operation]);
  },
  previewOperations: (operations, source = 'mouse') => {
    try {
      const { scene } = get();
      const result = applyTransaction(scene, { expectedRevision: scene.revision, source, operations });
      const targetId = operations.find(operation => 'targetId' in operation)?.targetId;
      set({ preview: result.objects.find(o => o.id === targetId) ?? null, error: null });
    } catch (error) {
      set({ error: describeError(error) });
    }
  },
  clearPreview: () => set({ preview: null }),
  setBooleanPreview: booleanPreview => set({ booleanPreview }),
  setTransformHandleHovered: transformHandleHovered => set(state => state.transformHandleHovered === transformHandleHovered ? state : { transformHandleHovered }),
  setTransformDragging: transformDragging => set(state => state.transformDragging === transformDragging ? state : { transformDragging }),
  transact: (operations, source) => {
    try {
      const { scene, past } = get();
      const next = applyTransaction(scene, { expectedRevision: scene.revision, source, operations });
      set({ scene: next, past: [...past, scene].slice(-100), future: [], preview: null, booleanPreview: null, error: null });
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
      future: [...state.future, state.scene], preview: null, booleanPreview: null, error: null,
      selectedId: previous.objects.some(o => o.id === state.selectedId) ? state.selectedId : null,
      selectedIds: state.selectedIds.filter(id => previous.objects.some(o => o.id === id)),
      selectedFace: null, cancelSeq: state.cancelSeq + 1,
    };
  }),
  redo: () => set(state => {
    const next = state.future.at(-1);
    if (!next) return state;
    return {
      scene: { ...next, revision: state.scene.revision + 1 }, past: [...state.past, state.scene],
      future: state.future.slice(0, -1), preview: null, booleanPreview: null, error: null,
      selectedId: next.objects.some(o => o.id === state.selectedId) ? state.selectedId : null,
      selectedIds: state.selectedIds.filter(id => next.objects.some(o => o.id === id)),
      selectedFace: null, cancelSeq: state.cancelSeq + 1,
    };
  }),
  load: input => {
    try {
      const parsed = parseSceneDocument(input);
      const { scene, past } = get();
      set({
        scene: { ...parsed, revision: Math.max(scene.revision, parsed.revision) + 1 },
        past: [...past, scene].slice(-100), future: [], selectedId: null, selectedFace: null,
        preview: null, booleanPreview: null, error: null, selectedIds: [],
      });
      return true;
    } catch (error) {
      set({ error: `Invalid project file: ${describeError(error)}` });
      return false;
    }
  },
}));
