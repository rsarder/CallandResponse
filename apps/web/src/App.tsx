import { useEffect, useRef, useState } from 'react';
import { Euler, Quaternion, MathUtils } from 'three';
import { parseSceneJson, type SceneObject, type SceneOperation, type Vec3 } from '@call-and-response/shared';
import { Viewport } from './scene/Viewport';
import { useEditor, type ObjectTool, type WorkspaceMode } from './state/editor';

const modes: { id: WorkspaceMode; label: string; key: string }[] = [
  { id: 'object', label: 'Object', key: '1' }, { id: 'shape', label: 'Shape', key: '2' }, { id: 'view', label: 'View', key: '3' },
];
const tools: { id: ObjectTool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select', key: 'Q', icon: '↖' }, { id: 'move', label: 'Move', key: 'W', icon: '✥' },
  { id: 'rotate', label: 'Rotate', key: 'E', icon: '⟳' }, { id: 'scale', label: 'Scale', key: 'R', icon: '⤢' },
];

function createPrimitive(kind: 'box' | 'cylinder' | 'sphere') {
  const state = useEditor.getState();
  const id = crypto.randomUUID();
  const number = state.scene.objects.filter(o => o.shape.kind === kind).length + 1;
  const name = `${kind[0]!.toUpperCase()}${kind.slice(1)} ${number}`;
  const base = { id, name, positionMm: [state.scene.objects.length * 55, 20, 0] as Vec3 };
  const operation: SceneOperation = kind === 'box' ? { type: 'create_box', ...base, sizeMm: [40, 40, 40] }
    : kind === 'cylinder' ? { type: 'create_cylinder', ...base, radiusMm: 20, heightMm: 40 }
      : { type: 'create_sphere', ...base, radiusMm: 20 };
  if (state.transact([operation], 'mouse')) state.select(id);
}

function deleteSelected() {
  const state = useEditor.getState();
  if (state.mode === 'view' || !state.selectedId) return;
  if (state.transact([{ type: 'delete_object', targetId: state.selectedId }], 'keyboard')) state.select(null);
}

function duplicateSelected() {
  const state = useEditor.getState();
  const object = state.scene.objects.find(o => o.id === state.selectedId);
  if (state.mode === 'view' || !object) return;
  const id = crypto.randomUUID();
  if (state.transact([{ type: 'duplicate_object', targetId: object.id, id, name: `${object.name} copy` }], 'keyboard')) state.select(id);
}

function NumberField({ label, value, onCommit, step = 1 }: { label: string; value: number; onCommit: (value: number) => void; step?: number }) {
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
  return <label className="number-field"><span>{label}</span><input aria-label={label} type="number" step={step} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur(); } }} /></label>;
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
    <div className="section-label section-gap">Position <small>mm</small></div>
    <div className="field-grid">{(['X', 'Y', 'Z'] as const).map((label, i) => <NumberField key={label} label={label} value={position[i]!} onCommit={v => {
      const next: Vec3 = [...position]; next[i] = v;
      edit({ type: 'set_object_position', targetId: object.id, positionMm: next });
    }} />)}</div>
    <div className="section-label section-gap">Rotation <small>degrees</small></div>
    <div className="field-grid">{(['X', 'Y', 'Z'] as const).map((label, i) => <NumberField key={label} label={`${label} rotation`} value={angles[i]!} onCommit={v => updateRotation(i, v)} />)}</div>
    <div className="section-label section-gap">Dimensions <small>mm</small></div>
    {object.shape.kind === 'box' ? <div className="field-grid">{(['Width', 'Height', 'Depth'] as const).map((label, i) => <NumberField key={label} label={label} value={object.shape.kind === 'box' ? object.shape.sizeMm[i]! : 1} onCommit={v => {
      if (object.shape.kind !== 'box') return;
      const sizeMm: Vec3 = [...object.shape.sizeMm]; sizeMm[i] = v;
      edit({ type: 'set_box_dimensions', targetId: object.id, sizeMm });
    }} />)}</div> : object.shape.kind === 'cylinder' ? <div className="field-grid two">
      <NumberField label="Radius" value={object.shape.radiusMm} onCommit={v => { if (object.shape.kind === 'cylinder') edit({ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: v, heightMm: object.shape.heightMm }); }} />
      <NumberField label="Height" value={object.shape.heightMm} onCommit={v => { if (object.shape.kind === 'cylinder') edit({ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: object.shape.radiusMm, heightMm: v }); }} />
    </div> : <NumberField label="Radius" value={object.shape.radiusMm} onCommit={v => edit({ type: 'set_sphere_radius', targetId: object.id, radiusMm: v })} />}
    <div className="section-label section-gap">Material</div>
    <ColorField object={object} />
    <div className="inspector-actions"><button onClick={duplicateSelected}>Duplicate</button><button className="danger" onClick={deleteSelected}>Delete</button></div>
  </fieldset>;
}

function ColorField({ object }: { object: SceneObject }) {
  const [draft, setDraft] = useState(object.material.colorHex);
  useEffect(() => setDraft(object.material.colorHex), [object.material.colorHex]);
  return <div className="color-field"><input type="color" aria-label="Object color" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => {
    if (draft !== object.material.colorHex) useEditor.getState().transact([{ type: 'set_material_color', targetId: object.id, colorHex: draft }], 'numeric');
  }} /><span>{draft.toUpperCase()}</span></div>;
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const scene = useEditor(s => s.scene);
  const mode = useEditor(s => s.mode);
  const tool = useEditor(s => s.tool);
  const selectedId = useEditor(s => s.selectedId);
  const axisLock = useEditor(s => s.axisLock);
  const error = useEditor(s => s.error);
  const past = useEditor(s => s.past);
  const future = useEditor(s => s.future);
  const selected = scene.objects.find(o => o.id === selectedId);
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
  return <div className="app-shell">
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
        <div className="primitive-list"><button disabled={mode === 'view'} onClick={() => createPrimitive('box')}><span className="primitive-icon">▧</span>Box <span>+</span></button><button disabled={mode === 'view'} onClick={() => createPrimitive('sphere')}><span className="primitive-icon">◉</span>Sphere <span>+</span></button><button disabled={mode === 'view'} onClick={() => createPrimitive('cylinder')}><span className="primitive-icon">▤</span>Cylinder <span>+</span></button></div>
        <div className="panel-heading separated"><span>SCENE HIERARCHY</span><span className="count">{scene.objects.length}</span></div>
        <div className="hierarchy">{scene.objects.length ? scene.objects.map(object => <button key={object.id} className={selectedId === object.id ? 'selected' : ''} onClick={() => useEditor.getState().select(object.id)}><span className="hierarchy-icon">{object.shape.kind === 'box' ? '□' : object.shape.kind === 'sphere' ? '○' : '⬡'}</span><span>{object.name}</span><small>{object.shape.kind}</small></button>) : <p className="list-empty">Your scene is empty. Add a primitive above to begin.</p>}</div>
        <div className="left-footer">MM UNITS <span>·</span> Y-UP <span>·</span> OFFLINE READY</div>
      </aside>
      <main className="main-area">
        <div className="viewport-toolbar"><div className="tool-group"><span className="toolbar-label">TOOLS</span>{tools.map(item => <button key={item.id} title={`${item.label} · ${item.key}`} disabled={mode !== 'object'} className={tool === item.id && mode === 'object' ? 'active' : ''} onClick={() => useEditor.getState().setTool(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</div><div className="toolbar-end"><span className={`mode-pill mode-${mode}`}>{mode.toUpperCase()} MODE</span></div></div>
        <div className="canvas-wrap"><Viewport />{!scene.objects.length && <div className="canvas-empty"><div className="empty-illustration">◇</div><h1>Start with a shape</h1><p>Add a primitive and begin shaping your scene.</p><button disabled={mode === 'view'} onClick={() => createPrimitive('box')}>+ Create a box</button></div>}</div>
        <div className="camera-bar"><div className="axis-controls"><span>AXIS</span>{(['x', 'y', 'z'] as const).map(axis => <button key={axis} className={axisLock === axis ? `active axis-${axis}` : ''} onClick={() => useEditor.getState().setAxisLock(axisLock === axis ? null : axis)} aria-pressed={axisLock === axis}>{axis.toUpperCase()}</button>)}<button onClick={() => useEditor.getState().setAxisLock(null)}>Free</button></div><div className="camera-controls"><span>CAMERA</span>{(['perspective', 'front', 'top', 'right'] as const).map(action => <button key={action} onClick={() => useEditor.getState().camera(action)}>{action === 'perspective' ? 'Perspective' : action[0]!.toUpperCase() + action.slice(1)}</button>)}<button title="Focus selected · F" onClick={() => useEditor.getState().camera('focus')}>Focus</button><button onClick={() => useEditor.getState().camera('reset')}>Reset</button></div></div>
      </main>
      <aside className="right-panel"><div className="panel-heading"><span>INSPECTOR</span><span className="panel-index">PROPERTIES</span></div><Inspector object={selected} /><div className="shortcuts"><div className="panel-heading"><span>QUICK KEYS</span></div><p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> Modes</p><p><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> Tools</p><p><kbd>X</kbd><kbd>Y</kbd><kbd>Z</kbd> Axis lock</p><p><kbd>F</kbd> Focus selection</p><p><kbd>Esc</kbd> Cancel preview</p></div></aside>
    </div>
    <footer className="statusbar"><span><i className="status-dot" /> READY</span><span>{scene.objects.length} OBJECT{scene.objects.length === 1 ? '' : 'S'}</span><span>{selected ? `SELECTED: ${selected.name.toUpperCase()}` : 'NO SELECTION'}</span><span className="status-right">Call and Response · Milestone 1</span></footer>
    {error && <div className="error-toast" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => useEditor.getState().setError(null)}>×</button></div>}
  </div>;
}
