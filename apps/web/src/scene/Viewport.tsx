import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useThree } from '@react-three/fiber';
import { Edges, OrbitControls, OrthographicCamera, PerspectiveCamera, TransformControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Group, OrthographicCamera as ThreeOrthographicCamera, PerspectiveCamera as ThreePerspectiveCamera, Quaternion, Vector3 } from 'three';
import { faceNormal, type BoxFace, type SceneObject, type SceneOperation, type Vec3 } from '@call-and-response/shared';
import { useEditor } from '../state/editor';

const faces: BoxFace[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

function CameraRig() {
  const perspective = useRef<ThreePerspectiveCamera>(null);
  const orthographic = useRef<ThreeOrthographicCamera>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, set, size } = useThree();
  const cameraAction = useEditor(s => s.cameraAction);
  const cameraSeq = useEditor(s => s.cameraSeq);
  const isOrtho = cameraAction === 'front' || cameraAction === 'top' || cameraAction === 'right';
  useEffect(() => {
    const desired = isOrtho ? orthographic.current : perspective.current;
    if (desired && camera !== desired) set({ camera: desired });
  }, [camera, isOrtho, set]);
  useEffect(() => {
    const desired = isOrtho ? orthographic.current : perspective.current;
    if (camera !== desired) return;
    const control = controls.current;
    if (!control) return;
    const state = useEditor.getState();
    const selected = state.scene.objects.find(o => o.id === state.selectedId);
    const target = cameraAction === 'focus' && selected
      ? new Vector3(...selected.positionMm) : new Vector3(0, 0, 0);
    const distance = cameraAction === 'focus' && selected
      ? Math.max(100, selected.shape.kind === 'box' ? Math.max(...selected.shape.sizeMm) * 3 : 160) : 190;
    if (cameraAction === 'front') camera.position.set(target.x, target.y, target.z + distance);
    else if (cameraAction === 'top') camera.position.set(target.x, target.y + distance, target.z);
    else if (cameraAction === 'right') camera.position.set(target.x + distance, target.y, target.z);
    else camera.position.set(target.x + distance * 0.85, target.y + distance * 0.65, target.z + distance * 0.85);
    camera.up.set(0, 1, 0);
    if (cameraAction === 'top') camera.up.set(0, 0, -1);
    control.target.copy(target);
    camera.updateProjectionMatrix();
    control.update();
  }, [camera, cameraAction, cameraSeq, isOrtho]);

  return <>
    <PerspectiveCamera ref={perspective} fov={50} near={0.1} far={100000} position={[160, 120, 160]} />
    <OrthographicCamera ref={orthographic} args={[-size.width / 2, size.width / 2, size.height / 2, -size.height / 2, 0.1, 100000]} zoom={4} position={[0, 0, 190]} />
    <OrbitControls key={camera.uuid} camera={camera} ref={controls} makeDefault enableDamping dampingFactor={0.1} minDistance={8} maxDistance={10000} screenSpacePanning />
  </>;
}

function ShapeMesh({ object, selected }: { object: SceneObject; selected: boolean }) {
  const shape = object.shape;
  return <mesh
    castShadow receiveShadow
    onPointerDown={event => {
      event.stopPropagation();
      if (useEditor.getState().mode !== 'view') useEditor.getState().select(object.id);
    }}
  >
    {shape.kind === 'box' ? <boxGeometry args={shape.sizeMm} />
      : shape.kind === 'cylinder' ? <cylinderGeometry args={[shape.radiusMm, shape.radiusMm, shape.heightMm, 48]} />
      : <sphereGeometry args={[shape.radiusMm, 48, 32]} />}
    <meshStandardMaterial color={object.material.colorHex} metalness={0.16} roughness={0.48} emissive={selected ? '#183c5f' : '#000000'} emissiveIntensity={selected ? 0.4 : 0} />
    {selected && <Edges scale={1.003} threshold={15} color="#dff5ff" />}
  </mesh>;
}

function FaceHandles({ object }: { object: SceneObject }) {
  const { camera, size } = useThree();
  const orbit = useThree(s => s.controls) as OrbitControlsImpl | undefined;
  const selectedFace = useEditor(s => s.selectedFace);
  const preview = useEditor(s => s.preview);
  const cancelSeq = useEditor(s => s.cancelSeq);
  const drag = useRef<{ face: BoxFace; x: number; y: number; pxPerMmX: number; pxPerMmY: number; delta: number } | null>(null);
  useEffect(() => {
    drag.current = null;
    if (orbit) orbit.enabled = true;
    return () => { if (orbit) orbit.enabled = true; };
  }, [cancelSeq, orbit]);
  const initialShape = object.shape;
  if (initialShape.kind !== 'box') return null;
  const shown = preview?.id === object.id && preview.shape.kind === 'box' ? preview : object;
  if (shown.shape.kind !== 'box') return null;

  const onDown = (event: ThreeEvent<PointerEvent>, face: BoxFace) => {
    event.stopPropagation();
    const state = useEditor.getState();
    state.setFace(face);
    const normal = new Vector3(...faceNormal(face, object.rotation));
    const axis = face[1] === 'x' ? 0 : face[1] === 'y' ? 1 : 2;
    const sign = face[0] === '+' ? 1 : -1;
    const local = new Vector3(axis === 0 ? initialShape.sizeMm[0] * sign / 2 : 0,
      axis === 1 ? initialShape.sizeMm[1] * sign / 2 : 0,
      axis === 2 ? initialShape.sizeMm[2] * sign / 2 : 0);
    const world = local.applyQuaternion(new Quaternion(...object.rotation)).add(new Vector3(...object.positionMm));
    const start = world.clone().project(camera);
    const end = world.addScaledVector(normal, 10).project(camera);
    const pxPerMmX = (end.x - start.x) * size.width / 20;
    const pxPerMmY = -(end.y - start.y) * size.height / 20;
    if (pxPerMmX ** 2 + pxPerMmY ** 2 < 0.04) {
      state.setError('This face points toward the camera. Orbit the view or use the inspector.');
      return;
    }
    drag.current = { face, x: event.clientX, y: event.clientY, pxPerMmX, pxPerMmY, delta: 0 };
    if (orbit) orbit.enabled = false;
    (event.target as Element).setPointerCapture(event.pointerId);
  };
  const onMove = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current;
    if (!current) return;
    event.stopPropagation();
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    const denominator = current.pxPerMmX ** 2 + current.pxPerMmY ** 2;
    const raw = (dx * current.pxPerMmX + dy * current.pxPerMmY) / denominator;
    const axis = current.face[1] === 'x' ? 0 : current.face[1] === 'y' ? 1 : 2;
    const initial = initialShape.sizeMm[axis]!;
    current.delta = Math.max(0.1 - initial, Math.min(100000 - initial, raw));
    useEditor.getState().previewOperation({ type: 'resize_box_face', targetId: object.id, face: current.face, deltaMm: current.delta });
  };
  const onUp = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current;
    if (!current) return;
    event.stopPropagation();
    (event.target as Element).releasePointerCapture(event.pointerId);
    drag.current = null;
    if (orbit) orbit.enabled = true;
    if (Math.abs(current.delta) > 0.001) useEditor.getState().transact([{ type: 'resize_box_face', targetId: object.id, face: current.face, deltaMm: current.delta }], 'mouse');
    else useEditor.getState().clearPreview();
  };
  return <>
    {faces.map(face => {
      const axis = face[1] === 'x' ? 0 : face[1] === 'y' ? 1 : 2;
      const sign = face[0] === '+' ? 1 : -1;
      const dimensions = shown.shape.kind === 'box' ? shown.shape.sizeMm : initialShape.sizeMm;
      const position: Vec3 = [axis === 0 ? sign * (dimensions[0] / 2 + 3) : 0,
        axis === 1 ? sign * (dimensions[1] / 2 + 3) : 0,
        axis === 2 ? sign * (dimensions[2] / 2 + 3) : 0];
      return <mesh key={face} position={position} onPointerDown={event => onDown(event, face)} onPointerMove={onMove} onPointerUp={onUp}>
        <sphereGeometry args={[2.8, 16, 12]} />
        <meshStandardMaterial color={selectedFace === face ? '#ffdd8a' : '#73e8ee'} emissive={selectedFace === face ? '#b87919' : '#168b9d'} emissiveIntensity={0.55} depthTest={false} />
      </mesh>;
    })}
  </>;
}

function EditableObject({ object }: { object: SceneObject }) {
  const selectedId = useEditor(s => s.selectedId);
  const mode = useEditor(s => s.mode);
  const tool = useEditor(s => s.tool);
  const axisLock = useEditor(s => s.axisLock);
  const preview = useEditor(s => s.preview);
  const cancelSeq = useEditor(s => s.cancelSeq);
  const group = useRef<Group>(null);
  const [target, setTarget] = useState<Group | null>(null);
  const canceled = useRef(false);
  const selected = selectedId === object.id;
  const shown = preview?.id === object.id ? preview : object;
  useEffect(() => { setTarget(group.current); }, []);
  useEffect(() => {
    canceled.current = true;
    if (!group.current) return;
    group.current.position.set(...object.positionMm);
    group.current.quaternion.set(...object.rotation);
    group.current.scale.set(1, 1, 1);
  }, [object, cancelSeq]);

  const finish = () => {
    const g = group.current;
    if (!g || mode !== 'object' || tool === 'select') return;
    if (canceled.current) return;
    const operations: SceneOperation[] = [];
    if (tool === 'move') {
      const p: Vec3 = [g.position.x, g.position.y, g.position.z];
      if (p.some((v, i) => Math.abs(v - object.positionMm[i]!) > 0.001)) operations.push({ type: 'set_object_position', targetId: object.id, positionMm: p });
    } else if (tool === 'rotate') {
      const q = g.quaternion.clone().normalize();
      if (Math.abs(q.x - object.rotation[0]) + Math.abs(q.y - object.rotation[1]) + Math.abs(q.z - object.rotation[2]) + Math.abs(q.w - object.rotation[3]) > 0.0001)
        operations.push({ type: 'rotate_object', targetId: object.id, rotation: [q.x, q.y, q.z, q.w] });
    } else {
      const s = g.scale;
      if (object.shape.kind === 'box') operations.push({ type: 'set_box_dimensions', targetId: object.id, sizeMm: [object.shape.sizeMm[0] * s.x, object.shape.sizeMm[1] * s.y, object.shape.sizeMm[2] * s.z] });
      else if (object.shape.kind === 'cylinder') operations.push({ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: object.shape.radiusMm * (s.x + s.z) / 2, heightMm: object.shape.heightMm * s.y });
      else operations.push({ type: 'set_sphere_radius', targetId: object.id, radiusMm: object.shape.radiusMm * (s.x + s.y + s.z) / 3 });
      if (Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1) < 0.001) operations.length = 0;
    }
    if (operations.length) useEditor.getState().transact(operations, 'mouse');
    g.scale.set(1, 1, 1);
  };
  const keepRoundPrimitivesRound = () => {
    const scale = group.current?.scale;
    if (!scale || tool !== 'scale') return;
    if (object.shape.kind === 'sphere') {
      const factors = [scale.x, scale.y, scale.z];
      const factor = factors.reduce((best, value) => Math.abs(value - 1) > Math.abs(best - 1) ? value : best, 1);
      scale.set(factor, factor, factor);
    } else if (object.shape.kind === 'cylinder') {
      const radial = Math.abs(scale.x - 1) >= Math.abs(scale.z - 1) ? scale.x : scale.z;
      scale.x = radial;
      scale.z = radial;
    }
  };

  const content = <group ref={group} position={shown.positionMm} quaternion={shown.rotation}>
    <ShapeMesh object={shown} selected={selected} />
    {selected && mode === 'shape' && <FaceHandles object={object} />}
  </group>;
  if (selected && mode === 'object' && tool !== 'select' && target) return <>{content}<TransformControls
    object={target} mode={tool === 'move' ? 'translate' : tool} size={0.8}
    showX={!axisLock || axisLock === 'x'} showY={!axisLock || axisLock === 'y'} showZ={!axisLock || axisLock === 'z'}
    onMouseDown={() => { canceled.current = false; }} onObjectChange={keepRoundPrimitivesRound} onMouseUp={finish}
  /></>;
  return content;
}

function WorkspaceScene() {
  const scene = useEditor(s => s.scene);
  const mode = useEditor(s => s.mode);
  const objects = useMemo(() => scene.objects, [scene.objects]);
  return <>
    <color attach="background" args={['#101b2b']} />
    <ambientLight intensity={1.3} />
    <hemisphereLight args={['#e3f3ff', '#233248', 2]} />
    <directionalLight position={[90, 160, 80]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} />
    <gridHelper args={[1000, 100, '#537092', '#29435f']} position={[0, -0.05, 0]} />
    <axesHelper args={[60]} />
    <group>{objects.map(object => <EditableObject key={object.id} object={object} />)}</group>
    {mode === 'view' && <group />}
    <CameraRig />
  </>;
}

export function Viewport() {
  const mode = useEditor(s => s.mode);
  return <div className="viewport" aria-label="3D modeling viewport">
    <Canvas shadows dpr={[1, 2]} onPointerMissed={() => { if (mode !== 'view') useEditor.getState().select(null); }}>
      <WorkspaceScene />
    </Canvas>
    <div className="viewport-tip">{mode === 'shape' ? 'Drag a glowing face handle to reshape the box' : mode === 'view' ? 'Drag to orbit · Right drag to pan · Scroll to zoom' : 'Drag to orbit · Right drag to pan · Scroll to zoom'}</div>
    <div className="axis-legend"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
  </div>;
}
