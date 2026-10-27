import { useEffect, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';
import { Euler, Quaternion, MathUtils } from 'three';
import { meshBounds, parseSceneJson, type SceneObject, type SceneOperation, type Vec3 } from '@call-and-response/shared';
import { analyzeIntersections, booleanMesh, type BooleanKind, type IntersectionAnalysis } from './geometry/csg';
import { deleteSubtreeOperations, duplicateSubtreeOperations, groupOperations, ungroupOperations } from './geometry/hierarchy';
import { reparentOperations } from './geometry/transforms';
import { Viewport } from './scene/Viewport';
import { useEditor, type ObjectTool, type WorkspaceMode } from './state/editor';
import { useGestureTracking } from './gesture/useGestureTracking';
import type { GestureFrame, TrackedHand } from './gesture/types';
import { confidentGesture, handToViewportNdc, isPinchActive, normalizedPinchDistance } from './gesture/math';

const handConnections: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function HandVisualization({ frame, enabled }: { frame: GestureFrame; enabled: boolean }) {
  if (!enabled || !frame.hands.length) return null;
  const hand = frame.hands[0]!;
  const tip = hand.landmarks[8];
  const cursorX = tip ? (1 - tip.x) * 100 : 0;
  const cursorY = tip ? tip.y * 100 : 0;
  return <>
    <svg className="hand-landmarks" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {frame.hands.map((tracked, handIndex) => <g key={`${tracked.handedness}-${handIndex}`} className="hand-skeleton">
        {handConnections.map(([from, to], index) => {
          const first = tracked.landmarks[from]!; const second = tracked.landmarks[to]!;
          return <line key={index} x1={1 - first.x} y1={first.y} x2={1 - second.x} y2={second.y} />;
        })}
        {tracked.landmarks.map((point, index) => <circle key={index} className={index === 4 || index === 8 ? 'finger-tip' : ''} cx={1 - point.x} cy={point.y} r={index === 0 ? 0.009 : 0.005} />)}
      </g>)}
    </svg>
    <div className="hand-cursor" style={{ left: `${cursorX}%`, top: `${cursorY}%` }} aria-label="Tracked hand pointer"><span /><small>{hand.gesture === 'None' ? 'HAND' : hand.gesture.replaceAll('_', ' ')}</small></div>
  </>;
}

function GestureCameraPanel({ video, status, error, start, stop }: {
  video: RefObject<HTMLVideoElement | null>;
  status: ReturnType<typeof useGestureTracking>['status'];
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}) {
  const running = status === 'tracking' || status === 'loading';
  return <section className={`gesture-camera gesture-camera-${status}`} aria-label="Hand tracking camera">
    <video ref={video} className="webcam-preview" autoPlay muted playsInline hidden={!running} />
    <div className="gesture-camera-footer">
      <span className="gesture-status"><i />{status === 'tracking' ? 'HANDS LIVE' : status === 'loading' ? 'LOADING MODEL' : status === 'requesting' ? 'REQUESTING CAMERA' : status === 'error' ? 'TRACKING ERROR' : 'CAMERA OFF'}</span>
      {running || status === 'requesting' ? <button onClick={stop}>Disable</button> : <button onClick={() => { void start(); }}>Enable hand tracking</button>}
    </div>
    <small className="gesture-privacy">Camera frames are processed on device and not saved. MediaPipe may send usage metrics.</small>
    {error && <small className="gesture-error" role="status">{error}</small>}
  </section>;
}

const modes: { id: WorkspaceMode; label: string; key: string }[] = [
  { id: 'object', label: 'Object', key: '1' }, { id: 'shape', label: 'Shape', key: '2' }, { id: 'view', label: 'View', key: '3' },
];
const tools: { id: ObjectTool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select', key: 'Q', icon: '↖' }, { id: 'move', label: 'Move', key: 'W', icon: '✥' },
  { id: 'rotate', label: 'Rotate', key: 'E', icon: '⟳' }, { id: 'scale', label: 'Scale', key: 'R', icon: '⤢' },
];

function createPrimitive(kind: 'box' | 'cylinder' | 'sphere' | 'empty') {
  const state = useEditor.getState();
  const id = crypto.randomUUID();
  const prefix = kind === 'empty' ? 'EmptyObject' : `${kind[0]!.toUpperCase()}${kind.slice(1)}`;
  const usedNames = state.scene.objects.flatMap(object => { const match = object.name.match(new RegExp(`^${prefix} (\\d+)$`)); return match ? [Number(match[1])] : []; });
  const number = Math.max(0, ...usedNames) + 1;
  const name = `${prefix} ${number}`;
  const base = { id, name, positionMm: [state.scene.objects.length * 55, 20, 0] as Vec3 };
  const operation: SceneOperation = kind === 'empty' ? { type: 'create_empty', ...base }
    : kind === 'box' ? { type: 'create_box', ...base, sizeMm: [40, 40, 40] }
    : kind === 'cylinder' ? { type: 'create_cylinder', ...base, radiusMm: 20, heightMm: 40 }
      : { type: 'create_sphere', ...base, radiusMm: 20 };
  if (state.transact([operation], 'mouse')) state.select(id);
}

function groupSelected() {
  const state = useEditor.getState();
  const chosen = state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : [];
  if (!chosen.length) return;
  const emptyNumber = state.scene.objects.filter(object => object.name.startsWith('EmptyObject ')).length + 1;
  const groupId = crypto.randomUUID();
  try {
    if (state.transact(groupOperations(state.scene, chosen, groupId, `EmptyObject ${emptyNumber}`), 'mouse')) state.select(groupId);
  } catch (error) { state.setError(error instanceof Error ? error.message : 'Grouping failed'); }
}

function ungroupSelected() {
  const state = useEditor.getState();
  const group = state.scene.objects.find(object => object.id === state.selectedId && object.shape.kind === 'empty');
  if (!group) return;
  try {
    const children = state.scene.objects.filter(object => object.parentId === group.id);
    if (state.transact(ungroupOperations(state.scene, group.id), 'mouse')) state.select(children.at(-1)?.id ?? null);
  } catch (error) { state.setError(error instanceof Error ? error.message : 'Ungroup failed'); }
}

function deleteSelected() {
  const state = useEditor.getState();
  if (state.mode === 'view' || !state.selectedIds.length) return;
  const operations = deleteSubtreeOperations(state.scene, state.selectedIds);
  if (state.transact(operations, 'keyboard')) state.select(null);
}

function duplicateSelected() {
  const state = useEditor.getState();
  const object = state.scene.objects.find(o => o.id === state.selectedId);
  if (state.mode === 'view' || !object) return;
  const duplicate = duplicateSubtreeOperations(state.scene, object.id, () => crypto.randomUUID());
  if (state.transact(duplicate.operations, 'keyboard')) state.select(duplicate.rootId);
}

function NumberField({ label, value, onCommit, step = 1, readOnly = false }: { label: string; value: number; onCommit: (value: number) => void; step?: number; readOnly?: boolean }) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next) || draft.trim() === '') {
      useEditor.getState().setError(`${label} must be a finite number.`);
      setDraft(String(Number(value.toFixed(3))));
      return;
    }
    if (Math.abs(next - value) > 0.00001) onCommit(next);
  };
  return <label className="number-field"><span>{label}</span><input aria-label={label} type="number" step={step} value={draft} readOnly={readOnly} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur(); } }} /></label>;
}

function TextField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input className="name-field" aria-label="Object name" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onCommit(draft); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur(); } }} />;
}

function Inspector({ object }: { object: SceneObject | undefined }) {
  const selectedFace = useEditor(s => s.selectedFace);
  const transact = useEditor(s => s.transact);
  const mode = useEditor(s => s.mode);
  if (!object) return <div className="empty-inspector"><div className="empty-symbol">◇</div><strong>No selection</strong><p>Select an object in the viewport or scene list to edit its properties.</p></div>;
  const edit = (operation: SceneOperation) => transact([operation], 'numeric');
  const position = object.positionMm;
  const euler = new Euler().setFromQuaternion(new Quaternion(...object.rotation), 'XYZ');
  const angles = [euler.x, euler.y, euler.z].map(MathUtils.radToDeg);
  const updateRotation = (axis: number, degrees: number) => {
    const next = [...angles]; next[axis] = degrees;
    const q = new Quaternion().setFromEuler(new Euler(...next.map(MathUtils.degToRad) as [number, number, number], 'XYZ')).normalize();
    edit({ type: 'rotate_object', targetId: object.id, rotation: [q.x, q.y, q.z, q.w] });
  };
  return <fieldset className="inspector-body" disabled={mode === 'view'} key={object.id}>
    <div className="section-label">Selected object</div>
    <TextField value={object.name} onCommit={name => edit({ type: 'rename_object', targetId: object.id, name })} />
    <div className="object-type">{object.shape.kind} <span>·</span> {object.id.slice(0, 8)}</div>
    {selectedFace && <div className="face-readout">Face {selectedFace} selected</div>}
    <div className="section-label section-gap">{object.parentId ? 'Local position' : 'Position'} <small>mm</small></div>
    <div className="field-grid">{(['X', 'Y', 'Z'] as const).map((label, i) => <NumberField key={label} label={label} value={position[i]!} onCommit={v => {
      const next: Vec3 = [...position]; next[i] = v;
      edit({ type: 'set_object_position', targetId: object.id, positionMm: next });
    }} />)}</div>
    <div className="section-label section-gap">{object.parentId ? 'Local rotation' : 'Rotation'} <small>degrees</small></div>
    <div className="field-grid">{(['X', 'Y', 'Z'] as const).map((label, i) => <NumberField key={label} label={`${label} rotation`} value={angles[i]!} onCommit={v => updateRotation(i, v)} />)}</div>
    <div className="section-label section-gap">Object scale</div>
    {object.shape.kind === 'empty'
      ? <NumberField label="Uniform scale" value={object.scale[0]} step={0.1} onCommit={v => edit({ type: 'set_object_scale', targetId: object.id, scale: [v, v, v] })} />
      : <div className="field-grid">{(['X scale', 'Y scale', 'Z scale'] as const).map((label, index) => <NumberField key={label} label={label} value={object.scale[index]!} step={0.1} onCommit={value => {
        const scale: Vec3 = [...object.scale]; scale[index] = value; edit({ type: 'set_object_scale', targetId: object.id, scale });
      }} />)}</div>}
    {object.shape.kind !== 'empty' && object.shape.kind !== 'mesh' && <><div className="section-label section-gap">Dimensions <small>mm</small></div>
    {object.shape.kind === 'box' ? <div className="field-grid">{(['Width', 'Height', 'Depth'] as const).map((label, i) => <NumberField key={label} label={label} value={object.shape.kind === 'box' ? object.shape.sizeMm[i]! : 1} onCommit={v => {
      if (object.shape.kind !== 'box') return;
      const sizeMm: Vec3 = [...object.shape.sizeMm]; sizeMm[i] = v;
      edit({ type: 'set_box_dimensions', targetId: object.id, sizeMm });
    }} />)}</div> : object.shape.kind === 'cylinder' ? <div className="field-grid two">
      <NumberField label="Radius" value={object.shape.radiusMm} onCommit={v => { if (object.shape.kind === 'cylinder') edit({ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: v, heightMm: object.shape.heightMm }); }} />
      <NumberField label="Height" value={object.shape.heightMm} onCommit={v => { if (object.shape.kind === 'cylinder') edit({ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: object.shape.radiusMm, heightMm: v }); }} />
    </div> : <div className="field-grid">{(['X radius', 'Y radius', 'Z radius'] as const).map((label, index) => <NumberField key={label} label={label} value={object.shape.kind === 'sphere' ? object.shape.radiiMm[index]! : 1} onCommit={value => {
      if (object.shape.kind !== 'sphere') return;
      const radiiMm: Vec3 = [...object.shape.radiiMm]; radiiMm[index] = value;
      edit({ type: 'set_ellipsoid_radii', targetId: object.id, radiiMm });
    }} />)}</div>}</>}
    {object.shape.kind === 'mesh' && (() => { const bounds = meshBounds(object.shape.vertices); const editable = Boolean(object.shape.editableVertices?.length); return <><div className="section-label section-gap">Mesh bounds <small>mm · read only</small></div><div className="field-grid">{bounds.size.map((value, index) => <NumberField key={index} label={['Width', 'Height', 'Depth'][index]!} value={value} readOnly onCommit={() => undefined} />)}</div><small>{editable ? 'Box-derived editable mesh. Use the gold corner handles in Shape mode; bounds update automatically.' : 'Applied Boolean mesh. Use Object tools or another Boolean operation; direct Shape editing is unavailable.'}</small></>; })()}
    {object.material && <><div className="section-label section-gap">Material</div>
    <ColorField object={object} />
    <OpacityField key={object.id} object={object} /></>}
    <div className="inspector-actions"><button onClick={duplicateSelected}>Duplicate</button><button className="danger" onClick={deleteSelected}>Delete</button></div>
  </fieldset>;
}

function ColorField({ object }: { object: SceneObject }) {
  const colorHex = object.material?.colorHex ?? '#ffffff';
  const [draft, setDraft] = useState(colorHex);
  useEffect(() => setDraft(colorHex), [colorHex]);
  return <div className="color-field"><input type="color" aria-label="Object color" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => {
    if (draft !== colorHex) useEditor.getState().transact([{ type: 'set_material_color', targetId: object.id, colorHex: draft }], 'numeric');
  }} /><span>{draft.toUpperCase()}</span></div>;
}

function OpacityField({ object }: { object: SceneObject }) {
  const opacityValue = object.material?.opacity ?? 0.5;
  const [draft, setDraft] = useState(Math.round(opacityValue * 100));
  useEffect(() => setDraft(Math.round(opacityValue * 100)), [object.id, opacityValue]);
  const commit = (value: number) => {
    const opacity = Math.max(0, Math.min(100, value)) / 100;
    if (Math.abs(opacity - opacityValue) > 0.0001)
      useEditor.getState().transact([{ type: 'set_material_opacity', targetId: object.id, opacity }], 'numeric');
  };
  return <label className="opacity-field"><span>Opacity <small>{draft}%</small></span><input aria-label="Object opacity" type="range" min="0" max="100" step="1" value={draft} onChange={e => setDraft(Number(e.target.value))} onPointerUp={() => commit(draft)} onKeyUp={() => commit(draft)} onWheel={event => {
    event.preventDefault();
    const next = Math.max(0, Math.min(100, draft + (event.deltaY < 0 ? 5 : -5)));
    setDraft(next); commit(next);
  }} /></label>;
}

function saveProject() {
  const scene = useEditor.getState().scene;
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'call-and-response.scene.json'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useKeyboard() {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const state = useEditor.getState();
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); if (event.shiftKey) state.redo(); else state.undo(); return; }
      if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); state.redo(); return; }
      if ((event.ctrlKey || event.metaKey) && key === 'd') { event.preventDefault(); duplicateSelected(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (key === 'delete' || key === 'backspace') { event.preventDefault(); deleteSelected(); }
      else if (key === '1') state.setMode('object');
      else if (key === '2') state.setMode('shape');
      else if (key === '3') state.setMode('view');
      else if (key === 'q') { state.setMode('object'); state.setTool('select'); }
      else if (key === 'w') { state.setMode('object'); state.setTool('move'); }
      else if (key === 'e') { state.setMode('object'); state.setTool('rotate'); }
      else if (key === 'r') { state.setMode('object'); state.setTool('scale'); }
      else if (key === 'x' || key === 'y' || key === 'z') state.setAxisLock(state.axisLock === key ? null : key);
      else if (key === 'f') state.camera('focus');
      else if (key === 'escape') state.cancel();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}

export function App() {
  useKeyboard();
  const gesture = useGestureTracking();
  const gestureModeRef = useRef<WorkspaceMode>('object');
  const lastGestureFrameRef = useRef(0);
  const gestureStateRef = useRef({
    pinch: false, pinchPoint: { x: 0, y: 0 }, pinchMode: 'object' as WorkspaceMode, missingSince: 0,
    point: { x: -1, y: -1, since: 0, tappedAt: 0 }, motion: { name: '', since: 0, x: 0, y: 0 },
    lastHandCenter: null as { x: number; y: number } | null, lastThumbAction: 0,
    twoHandDistance: 0, twoHandLostSince: 0, twoHandScale: null as Vec3 | null, twoHandTarget: null as string | null,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [overlapAnalysis, setOverlapAnalysis] = useState<IntersectionAnalysis>({ verifiedPairs: [], candidatePairs: [], errors: [], limited: false });
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setContextMenu(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const scene = useEditor(s => s.scene);
  const mode = useEditor(s => s.mode);
  const tool = useEditor(s => s.tool);
  const selectedId = useEditor(s => s.selectedId);
  const selectedIds = useEditor(s => s.selectedIds);
  const axisLock = useEditor(s => s.axisLock);
  const error = useEditor(s => s.error);
  const past = useEditor(s => s.past);
  const future = useEditor(s => s.future);
  const selected = scene.objects.find(o => o.id === selectedId);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      try { const result = analyzeIntersections(scene); if (active) setOverlapAnalysis(result); }
      catch (failure) { if (active) setOverlapAnalysis({ verifiedPairs: [], candidatePairs: [], errors: [failure instanceof Error ? failure.message : 'Overlap analysis failed'], limited: false }); }
    }, 120);
    return () => { active = false; window.clearTimeout(timer); };
  }, [scene]);
  const overlapping = new Set(overlapAnalysis.verifiedPairs.flat());
  const overlapCandidates = new Set(overlapAnalysis.candidatePairs.flat());
  const canBoolean = selectedIds.length === 2 && selectedIds.every(id => {
    const item = scene.objects.find(object => object.id === id);
    return item && item.shape.kind !== 'empty' && !scene.objects.some(child => child.parentId === id);
  });
  const canUngroup = Boolean(selected && selected.shape.kind === 'empty');
  const booleanPreview = useEditor(s => s.booleanPreview);
  const openBoolean = (kind: BooleanKind) => {
    const state = useEditor.getState();
    const ids = state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : [];
    if (ids.length !== 2 || !canBoolean) return;
    try {
      const result = booleanMesh(state.scene, ids[0]!, ids[1]!, kind);
      state.setBooleanPreview({ kind, targetId: ids[0]!, cutterId: ids[1]!, ...result });
      setContextMenu(null);
    } catch (failure) { state.setError(failure instanceof Error ? failure.message : 'Boolean preview failed'); }
  };
  const confirmBoolean = () => {
    const state = useEditor.getState(); const preview = state.booleanPreview;
    if (!preview) return;
    const target = state.scene.objects.find(object => object.id === preview.targetId);
    if (!target) return;
    const id = crypto.randomUUID();
    const operations: SceneOperation[] = [
      { type: 'create_mesh', id, name: `${target.name} ${preview.kind === 'union' ? 'Union' : preview.kind === 'intersect' ? 'Intersection' : 'Cut'}`, positionMm: preview.positionMm, vertices: preview.vertices, triangles: preview.triangles, parentId: preview.parentId },
      { type: 'set_material_color', targetId: id, colorHex: target.material?.colorHex ?? '#76b7ff' },
      { type: 'set_material_opacity', targetId: id, opacity: target.material?.opacity ?? 0.5 },
      { type: 'delete_object', targetId: preview.targetId }, { type: 'delete_object', targetId: preview.cutterId },
    ];
    if (state.transact(operations, 'mouse')) { state.setBooleanPreview(null); state.select(id); }
  };
  const resetGesture = (cancel: boolean) => {
    const current = gestureStateRef.current;
    if (cancel && current.pinch && current.pinchMode !== 'view') useEditor.getState().sendGesturePointer({ phase: 'cancel', x: current.pinchPoint.x, y: current.pinchPoint.y });
    if (cancel && current.twoHandTarget) useEditor.getState().clearPreview();
    gestureStateRef.current = { ...current, pinch: false, missingSince: 0, point: { x: -1, y: -1, since: 0, tappedAt: current.point.tappedAt }, motion: { name: '', since: 0, x: 0, y: 0 }, lastHandCenter: null, twoHandDistance: 0, twoHandLostSince: 0, twoHandScale: null, twoHandTarget: null };
  };
  useEffect(() => {
    const state = gestureStateRef.current;
    if (gestureModeRef.current !== mode) { resetGesture(true); gestureModeRef.current = mode; }
    if (gesture.status !== 'tracking') { resetGesture(true); return; }
    const currentFrame = gesture.frame;
    if (!currentFrame.timestamp || currentFrame.timestamp === lastGestureFrameRef.current) return;
    lastGestureFrameRef.current = currentFrame.timestamp;
    const now = performance.now();
    const hands = currentFrame.hands;
    const primary = hands[0];
    if (!primary || primary.landmarks.length < 21) {
      if (state.pinch && !state.missingSince) state.missingSince = now;
      if (state.pinch && now - state.missingSince > 250) resetGesture(true);
      state.point.since = 0; state.lastHandCenter = null; state.motion.name = '';
      if (state.twoHandTarget && !state.twoHandLostSince) state.twoHandLostSince = now;
      if (state.twoHandTarget && now - state.twoHandLostSince > 250) resetGesture(true);
      return;
    }
    state.missingSince = 0;
    const indexTip = primary.landmarks[8]!;
    const normalizedPinch = normalizedPinchDistance(primary.landmarks);
    const gestureName = confidentGesture(primary.gesture, primary.confidence);
    const pointing = gestureName === 'Pointing_Up';
    const pinching = isPinchActive(normalizedPinch, state.pinch);
    const fistGrab = mode === 'object' && gestureName === 'Closed_Fist';
    const ndc = handToViewportNdc(indexTip);
    const virtual = { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2 };
    const centerPoint = primary.landmarks[9]!;
    const handCenter = { x: 1 - centerPoint.x, y: centerPoint.y };

    if (pointing && !state.pinch && now - state.point.tappedAt > 700) {
      const distance = Math.hypot(virtual.x - state.point.x, virtual.y - state.point.y);
      if (distance > 0.035 || !state.point.since) { state.point = { x: virtual.x, y: virtual.y, since: now, tappedAt: state.point.tappedAt }; }
      else if (now - state.point.since >= 650) {
        useEditor.getState().sendGesturePointer({ phase: 'tap', ...ndc });
        state.point.tappedAt = now; state.point.since = 0;
      }
    } else if (!state.pinch) state.point.since = 0;

    const startPinch = (pinching || fistGrab) && !state.pinch;
    if (startPinch) {
      state.pinch = true; state.pinchMode = mode; state.pinchPoint = virtual;
      state.lastHandCenter = handCenter;
      if (mode !== 'view') useEditor.getState().sendGesturePointer({ phase: 'down', ...ndc });
    } else if (state.pinch && (pinching || fistGrab)) {
      if (state.pinchMode === 'view' && state.lastHandCenter) useEditor.getState().cameraGesture('zoom', 0, handCenter.y - state.lastHandCenter.y);
      else useEditor.getState().sendGesturePointer({ phase: 'move', ...ndc });
      state.pinchPoint = virtual; state.lastHandCenter = handCenter;
    } else if (state.pinch) {
      if (state.pinchMode !== 'view') useEditor.getState().sendGesturePointer({ phase: 'up', ...ndc });
      state.pinch = false; state.lastHandCenter = null;
    }

    const dynamicPose = mode === 'view' && !state.pinch && (gestureName === 'Open_Palm' || gestureName === 'Victory');
    if (dynamicPose) {
      if (state.motion.name !== gestureName) state.motion = { name: gestureName, since: now, x: handCenter.x, y: handCenter.y };
      else if (now - state.motion.since >= 180) {
        const dx = handCenter.x - state.motion.x; const dy = handCenter.y - state.motion.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.001) useEditor.getState().cameraGesture(gestureName === 'Open_Palm' ? 'pan' : 'orbit', dx, dy);
        state.motion.x = handCenter.x; state.motion.y = handCenter.y;
      }
    } else state.motion.name = '';

    if ((gestureName === 'Thumb_Up' || gestureName === 'Thumb_Down') && now - state.lastThumbAction > 850) {
      if (state.motion.name !== gestureName) state.motion = { name: gestureName, since: now, x: handCenter.x, y: handCenter.y };
      else if (now - state.motion.since > 350) {
        state.lastThumbAction = now; state.motion.name = '';
        const editor = useEditor.getState();
        if (mode === 'view') editor.camera(gestureName === 'Thumb_Up' ? 'focus' : 'reset');
        else if (gestureName === 'Thumb_Down') editor.cancel();
        else if (editor.booleanPreview) confirmBoolean();
      }
    }

    if (hands.length >= 2) {
      const centerOf = (hand: TrackedHand) => hand.landmarks[9]!;
      const first = centerOf(hands[0]!); const second = centerOf(hands[1]!);
      const separation = Math.hypot(first.x - second.x, first.y - second.y);
      if (mode === 'view') {
        if (state.twoHandDistance) useEditor.getState().cameraGesture('zoom', 0, (state.twoHandDistance - separation) * 0.7);
        state.twoHandDistance = separation;
      } else if (mode === 'object' && useEditor.getState().selectedId && !state.pinch) {
        const editorState = useEditor.getState();
        const object = editorState.scene.objects.find(item => item.id === editorState.selectedId);
        if (object && !state.twoHandScale) { state.twoHandScale = object.scale; state.twoHandTarget = object.id; state.twoHandDistance = separation; }
        else if (object && state.twoHandTarget === object.id && state.twoHandScale && state.twoHandDistance > 0) {
          const ratio = Math.max(0.1, Math.min(10, separation / state.twoHandDistance));
          const scale: Vec3 = [state.twoHandScale[0] * ratio, state.twoHandScale[1] * ratio, state.twoHandScale[2] * ratio];
          useEditor.getState().previewOperations([{ type: 'set_object_scale', targetId: object.id, scale }], 'gesture');
          state.twoHandDistance = Math.max(0.001, state.twoHandDistance);
        }
      }
      state.twoHandLostSince = 0;
    } else if (state.twoHandTarget) {
      const editor = useEditor.getState();
      const preview = editor.preview;
      if (preview && preview.id === state.twoHandTarget) editor.transact([{ type: 'set_object_scale', targetId: preview.id, scale: preview.scale }], 'gesture');
      else editor.clearPreview();
      state.twoHandTarget = null; state.twoHandScale = null; state.twoHandDistance = 0;
    }
  }, [gesture.frame, gesture.status, mode, selectedId, confirmBoolean]);
  const dropSelection = (parentId: string | null) => {
    const state = useEditor.getState();
    const ids = state.selectedIds.length ? state.selectedIds : [];
    try {
      const operations = ids.filter(id => id !== parentId).flatMap(id => reparentOperations(state.scene, id, parentId));
      if (operations.length) state.transact(operations, 'mouse');
    } catch (failure) {
      state.setError(failure instanceof Error ? failure.message : 'Reparenting failed');
    }
  };
  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      if (file.size > 2_000_000) throw new Error('Project file exceeds 2 MB.');
      const parsed = parseSceneJson(await file.text());
      useEditor.getState().load(parsed);
    } catch (failure) {
      useEditor.getState().setError(`Could not load project: ${failure instanceof Error ? failure.message : 'Invalid JSON'}`);
    } finally {
      setLoading(false);
    }
  };
  const renderHierarchy = (parentId: string | null, depth: number): ReactNode => scene.objects.filter(object => (object.parentId ?? null) === parentId).map(object => {
    const warning = overlapping.has(object.id);
    const candidate = !warning && overlapCandidates.has(object.id);
    const children = scene.objects.filter(child => child.parentId === object.id);
    const onDrop = (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault(); event.stopPropagation();
      const box = event.currentTarget.getBoundingClientRect(); const y = event.clientY - box.top;
      const zone = y / box.height;
      if (zone < 0.24 || zone > 0.76) {
        const siblings = scene.objects.filter(item => item.parentId === object.parentId && item.id !== object.id);
        const nextId = zone < 0.24 ? object.id : siblings.find(item => scene.objects.indexOf(item) > scene.objects.indexOf(object))?.id ?? null;
        const ids = useEditor.getState().selectedIds;
        const ops = ids.filter(id => id !== object.id).map(targetId => ({ type: 'reorder_object', targetId, beforeId: nextId } as SceneOperation));
        if (ops.length) useEditor.getState().transact(ops, 'mouse');
      } else dropSelection(object.shape.kind === 'empty' ? object.id : object.parentId ?? null);
    };
    return <div key={object.id} className="hierarchy-node"><button draggable className={`hierarchy-row ${selectedIds.includes(object.id) ? 'selected' : ''}`} style={{ paddingLeft: `${9 + depth * 14}px` }} onClick={event => useEditor.getState().select(object.id, event.shiftKey)} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); if (!selectedIds.includes(object.id)) useEditor.getState().select(object.id); setContextMenu({ x: event.clientX, y: event.clientY }); }} onDragStart={event => { if (!selectedIds.includes(object.id)) useEditor.getState().select(object.id); event.dataTransfer.setData('text/plain', object.id); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={event => event.preventDefault()} onDrop={onDrop}>
      <span className="hierarchy-icon">{object.shape.kind === 'box' ? '□' : object.shape.kind === 'sphere' ? '○' : object.shape.kind === 'empty' ? '◇' : object.shape.kind === 'mesh' ? 'M' : '⬡'}</span><span>{object.name}</span>{warning && <small className="overlap-warning" title="Verified solid intersection">⚠</small>}{candidate && <small className="overlap-warning" title="Bounding boxes overlap; exact analysis is pending or limited">?</small>}<small>{object.shape.kind}</small>
    </button>{children.length > 0 && renderHierarchy(object.id, depth + 1)}</div>;
  });
  return <div className="app-shell" onClick={() => setContextMenu(null)}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><span /></div><div><strong>Call <em>&</em> Response</strong><small>3D MODELING WORKSPACE</small></div></div>
      <div className="project-badge"><span className="status-dot" /> Local project <span className="revision">rev {scene.revision}</span></div>
      <div className="top-actions">
        <button title="Undo · Ctrl+Z" disabled={!past.length} onClick={() => useEditor.getState().undo()}>↶ <span>Undo</span></button>
        <button title="Redo · Ctrl+Y" disabled={!future.length} onClick={() => useEditor.getState().redo()}>↷ <span>Redo</span></button>
        <span className="divider" />
        <button disabled={loading} onClick={() => fileRef.current?.click()}>{loading ? 'Opening…' : 'Open'}</button>
        <button className="primary" onClick={saveProject}>Save project</button>
        <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    </header>
    <div className="workspace">
      <aside className="left-panel">
        <div className="panel-heading"><span>WORKSPACE</span><span className="panel-index">01 / 03</span></div>
        <div className="mode-stack">{modes.map(item => <button key={item.id} className={`mode-button ${mode === item.id ? 'active' : ''}`} onClick={() => useEditor.getState().setMode(item.id)} aria-pressed={mode === item.id}><span className="mode-glyph">{item.id === 'object' ? '▣' : item.id === 'shape' ? '⬡' : '◉'}</span><span>{item.label}<small>{item.id === 'object' ? 'Transform objects' : item.id === 'shape' ? 'Edit geometry' : 'Navigate camera'}</small></span><kbd>{item.key}</kbd></button>)}</div>
        <div className="panel-heading separated"><span>ADD OBJECT</span><span className="panel-index">+</span></div>
        <div className="primitive-list"><button disabled={mode === 'view'} onClick={() => createPrimitive('box')}><span className="primitive-icon">▧</span>Box <span>+</span></button><button disabled={mode === 'view'} onClick={() => createPrimitive('sphere')}><span className="primitive-icon">◉</span>Sphere <span>+</span></button><button disabled={mode === 'view'} onClick={() => createPrimitive('cylinder')}><span className="primitive-icon">▤</span>Cylinder <span>+</span></button><button disabled={mode === 'view'} onClick={() => createPrimitive('empty')}><span className="primitive-icon">◇</span>Empty <span>+</span></button></div>
        <div className="panel-heading separated"><span>SCENE HIERARCHY</span><span className="count">{scene.objects.length}</span></div>
        <div className="hierarchy" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); dropSelection(null); }}>
          {scene.objects.length ? <>{renderHierarchy(null, 0)}<div className="hierarchy-root-drop" aria-label="Move to scene root">Drop here to move to scene root</div></> : <p className="list-empty">Your scene is empty. Add an object above to begin.</p>}
        </div>
        <div className="left-footer">MM UNITS <span>·</span> Y-UP <span>·</span> OFFLINE READY</div>
      </aside>
      <main className="main-area">
        <div className="viewport-toolbar"><div className="tool-group"><span className="toolbar-label">TOOLS</span>{tools.map(item => <button key={item.id} title={`${item.label} · ${item.key}`} disabled={mode !== 'object'} className={tool === item.id && mode === 'object' ? 'active' : ''} onClick={() => useEditor.getState().setTool(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</div><div className="toolbar-end"><span className={`mode-pill mode-${mode}`}>{mode.toUpperCase()} MODE</span></div></div>
        <div className="canvas-wrap"><Viewport onContextMenu={(x, y) => setContextMenu({ x, y })} /><HandVisualization frame={gesture.frame} enabled={gesture.status === 'tracking'} /><GestureCameraPanel video={gesture.video} status={gesture.status} error={gesture.error} start={gesture.start} stop={gesture.stop} />{!scene.objects.length && <div className="canvas-empty"><div className="empty-illustration">◇</div><h1>Start with a shape</h1><p>Add a primitive and begin shaping your scene.</p><button disabled={mode === 'view'} onClick={() => createPrimitive('box')}>+ Create a box</button></div>}</div>
        <div className="camera-bar"><div className="axis-controls"><span>AXIS</span>{(['x', 'y', 'z'] as const).map(axis => <button key={axis} className={axisLock === axis ? `active axis-${axis}` : ''} onClick={() => useEditor.getState().setAxisLock(axisLock === axis ? null : axis)} aria-pressed={axisLock === axis}>{axis.toUpperCase()}</button>)}<button onClick={() => useEditor.getState().setAxisLock(null)}>Free</button></div><div className="camera-controls"><span>CAMERA</span>{(['perspective', 'front', 'top', 'right'] as const).map(action => <button key={action} onClick={() => useEditor.getState().camera(action)}>{action === 'perspective' ? 'Perspective' : action[0]!.toUpperCase() + action.slice(1)}</button>)}<button title="Focus selected · F" onClick={() => useEditor.getState().camera('focus')}>Focus</button><button onClick={() => useEditor.getState().camera('reset')}>Reset</button></div></div>
      </main>
      <aside className="right-panel"><div className="panel-heading"><span>INSPECTOR</span><span className="panel-index">PROPERTIES</span></div><Inspector object={selected} /><div className="shortcuts"><div className="panel-heading"><span>QUICK KEYS</span></div><p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> Modes</p><p><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> Tools</p><p><kbd>X</kbd><kbd>Y</kbd><kbd>Z</kbd> Axis lock</p><p><kbd>F</kbd> Focus selection</p><p><kbd>Esc</kbd> Cancel preview</p></div></aside>
    </div>
    <footer className="statusbar"><span><i className="status-dot" /> READY</span><span>{scene.objects.length} OBJECT{scene.objects.length === 1 ? '' : 'S'}</span><span>{selected ? `SELECTED: ${selected.name.toUpperCase()}` : 'NO SELECTION'}</span>{overlapAnalysis.errors.length > 0 && <span title={overlapAnalysis.errors.join('\n')}>OVERLAP CHECK ERROR</span>}{overlapAnalysis.limited && <span>OVERLAP CHECK LIMITED</span>}<span className="status-right">Call and Response · Stabilization</span></footer>
    {error && <div className="error-toast" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => useEditor.getState().setError(null)}>×</button></div>}
    {contextMenu && <div className="context-menu" style={{ left: `${Math.max(0, Math.min(contextMenu.x, window.innerWidth - 190))}px`, top: `${Math.max(0, Math.min(contextMenu.y, window.innerHeight - 220))}px` }} onClick={event => event.stopPropagation()}>
      <button disabled={!selectedIds.length} onClick={() => { groupSelected(); setContextMenu(null); }}>Group</button>
      <button disabled={!canUngroup} onClick={() => { ungroupSelected(); setContextMenu(null); }}>Ungroup</button>
      <button disabled={!canBoolean} onClick={() => openBoolean('union')}>Union</button>
      <button disabled={!canBoolean} onClick={() => openBoolean('subtract')}>Subtract</button>
      <button disabled={!canBoolean} onClick={() => openBoolean('intersect')}>Intersection</button>
    </div>}
    {booleanPreview && <div className="boolean-preview-panel" onClick={event => event.stopPropagation()}><strong>{booleanPreview.kind === 'union' ? 'Union preview' : booleanPreview.kind === 'intersect' ? 'Intersection preview' : 'Subtract preview'}</strong><span>{scene.objects.find(object => object.id === booleanPreview.targetId)?.name} {booleanPreview.kind === 'union' ? '+' : booleanPreview.kind === 'intersect' ? '∩' : '−'} {scene.objects.find(object => object.id === booleanPreview.cutterId)?.name}</span><small>Ghost geometry shows the resulting indexed mesh at its local bounds-center pivot.</small><div><button onClick={() => useEditor.getState().setBooleanPreview(null)}>Cancel</button><button className="primary" onClick={confirmBoolean}>Apply</button></div></div>}
  </div>;
}
