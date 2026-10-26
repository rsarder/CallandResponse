import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, ThreeEvent, useThree } from '@react-three/fiber';
import { Edges, OrbitControls, OrthographicCamera, PerspectiveCamera, TransformControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix4, OrthographicCamera as ThreeOrthographicCamera, PerspectiveCamera as ThreePerspectiveCamera, Plane, Quaternion, Vector3 } from 'three';
import { faceNormal, type BoxFace, type SceneObject, type SceneOperation, type Vec3 } from '@call-and-response/shared';
import { useEditor } from '../state/editor';
import { worldMatrixFor } from '../geometry/csg';

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
      ? new Vector3().setFromMatrixPosition(worldMatrixFor(state.scene, selected)) : new Vector3(0, 0, 0);
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
  const geometry = useMemo(() => {
    if (shape.kind !== 'mesh') return null;
    const result = new BufferGeometry();
    result.setAttribute('position', new Float32BufferAttribute(shape.vertices.flat(), 3));
    result.setIndex(shape.triangles.flat());
    result.computeVertexNormals();
    return result;
  }, [shape]);
  if (shape.kind === 'empty') return null;
  const material = object.material ?? { colorHex: '#ffffff', opacity: 0.5 };
  return <mesh
    castShadow receiveShadow
    onPointerDown={event => {
      event.stopPropagation();
      if (useEditor.getState().mode !== 'view') {
        const state = useEditor.getState();
        if (event.button === 2 && state.selectedIds.includes(object.id)) return;
        state.select(object.id, event.nativeEvent.shiftKey);
      }
    }}
  >
    {shape.kind === 'box' ? <boxGeometry args={shape.sizeMm} />
      : shape.kind === 'cylinder' ? <cylinderGeometry args={[shape.radiusMm, shape.radiusMm, shape.heightMm, 48]} />
        : shape.kind === 'sphere' ? <sphereGeometry args={[shape.radiusMm, 48, 32]} />
          : geometry ? <primitive object={geometry} attach="geometry" /> : null}
    <meshStandardMaterial color={material.colorHex} transparent={(material.opacity ?? 0.5) < 1} opacity={material.opacity ?? 0.5} depthWrite={(material.opacity ?? 0.5) > 0.98} metalness={0.16} roughness={0.48} emissive={selected ? '#183c5f' : '#000000'} emissiveIntensity={selected ? 0.4 : 0} />
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
  const handleRoot = useRef<Group>(null);
  useEffect(() => {
    drag.current = null;
    if (orbit) orbit.enabled = true;
    return () => { if (orbit) orbit.enabled = true; };
  }, [cancelSeq, orbit]);
  const initialShape = object.shape;
  if (initialShape.kind === 'empty') return null;
  const shown = preview?.id === object.id ? preview : object;
  const getDimensions = (shape: SceneObject['shape']): Vec3 => shape.kind === 'box' || shape.kind === 'mesh' ? [40, 40, 40]
    : shape.kind === 'cylinder' ? [shape.radiusMm * 2, shape.heightMm, shape.radiusMm * 2]
      : shape.kind === 'sphere' ? [shape.radiusMm * 2, shape.radiusMm * 2, shape.radiusMm * 2] : [0, 0, 0];
  const onDown = (event: ThreeEvent<PointerEvent>, face: BoxFace) => {
    event.stopPropagation();
    const state = useEditor.getState();
    state.setFace(face);
    const axis = face[1] === 'x' ? 0 : face[1] === 'y' ? 1 : 2;
    const sign = face[0] === '+' ? 1 : -1;
    const dimensions = getDimensions(initialShape);
    const local = new Vector3(axis === 0 ? dimensions[0] * sign / 2 : 0,
      axis === 1 ? dimensions[1] * sign / 2 : 0,
      axis === 2 ? dimensions[2] * sign / 2 : 0);
    handleRoot.current?.updateWorldMatrix(true, false);
    const matrix = handleRoot.current?.matrixWorld ?? new Matrix4().compose(new Vector3(...object.positionMm), new Quaternion(...object.rotation), new Vector3(1, 1, 1));
    const world = local.clone().applyMatrix4(matrix);
    const start = world.clone().project(camera);
    const localAxis = new Vector3(axis === 0 ? sign * 10 : 0, axis === 1 ? sign * 10 : 0, axis === 2 ? sign * 10 : 0);
    const end = local.clone().add(localAxis).applyMatrix4(matrix).project(camera);
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
    const normal = new Vector3(...faceNormal(current.face, object.rotation));
    const initial = initialShape.kind === 'box' ? initialShape.sizeMm[axis]!
      : initialShape.kind === 'cylinder' ? (axis === 1 ? initialShape.heightMm : initialShape.radiusMm)
        : initialShape.kind === 'sphere' ? initialShape.radiusMm : 40;
    current.delta = Math.max(0.1 - initial, Math.min(100000 - initial, raw));
    const operations: SceneOperation[] = [];
    if (initialShape.kind === 'box') operations.push({ type: 'resize_box_face', targetId: object.id, face: current.face, deltaMm: current.delta });
    else if (initialShape.kind === 'sphere') operations.push({ type: 'set_sphere_radius', targetId: object.id, radiusMm: initialShape.radiusMm + current.delta });
    else if (initialShape.kind === 'cylinder' && axis === 1) {
      const positionMm: Vec3 = [object.positionMm[0] + normal.x * current.delta / 2, object.positionMm[1] + normal.y * current.delta / 2, object.positionMm[2] + normal.z * current.delta / 2];
      operations.push({ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: initialShape.radiusMm, heightMm: initialShape.heightMm + current.delta }, { type: 'set_object_position', targetId: object.id, positionMm });
    } else if (initialShape.kind === 'cylinder') operations.push({ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: initialShape.radiusMm + current.delta, heightMm: initialShape.heightMm });
    useEditor.getState().previewOperations(operations);
  };
  const onUp = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current;
    if (!current) return;
    event.stopPropagation();
    (event.target as Element).releasePointerCapture(event.pointerId);
    drag.current = null;
    if (orbit) orbit.enabled = true;
    if (Math.abs(current.delta) > 0.001) {
      const axis = current.face[1] === 'x' ? 0 : current.face[1] === 'y' ? 1 : 2;
      const normal = new Vector3(axis === 0 ? (current.face[0] === '+' ? 1 : -1) : 0, axis === 1 ? (current.face[0] === '+' ? 1 : -1) : 0, axis === 2 ? (current.face[0] === '+' ? 1 : -1) : 0).applyQuaternion(new Quaternion(...object.rotation));
      let operations: SceneOperation[] = [];
      if (initialShape.kind === 'box') operations = [{ type: 'resize_box_face', targetId: object.id, face: current.face, deltaMm: current.delta }];
      else if (initialShape.kind === 'sphere') operations = [{ type: 'set_sphere_radius', targetId: object.id, radiusMm: initialShape.radiusMm + current.delta }];
      else if (initialShape.kind === 'cylinder' && axis === 1) operations = [
        { type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: initialShape.radiusMm, heightMm: initialShape.heightMm + current.delta },
        { type: 'set_object_position', targetId: object.id, positionMm: [object.positionMm[0] + normal.x * current.delta / 2, object.positionMm[1] + normal.y * current.delta / 2, object.positionMm[2] + normal.z * current.delta / 2] },
      ];
      else if (initialShape.kind === 'cylinder') operations = [{ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: initialShape.radiusMm + current.delta, heightMm: initialShape.heightMm }];
      if (operations.length) useEditor.getState().transact(operations, 'mouse');
    }
    else useEditor.getState().clearPreview();
  };
  return <group ref={handleRoot}>
    {faces.map(face => {
      const axis = face[1] === 'x' ? 0 : face[1] === 'y' ? 1 : 2;
      const sign = face[0] === '+' ? 1 : -1;
      const dimensions = getDimensions(shown.shape);
      const position: Vec3 = [axis === 0 ? sign * (dimensions[0] / 2 + 3) : 0,
        axis === 1 ? sign * (dimensions[1] / 2 + 3) : 0,
        axis === 2 ? sign * (dimensions[2] / 2 + 3) : 0];
      const direction = new Vector3(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
      const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);
      const axisColor = axis === 0 ? '#ff7068' : axis === 1 ? '#75e39a' : '#6ba8ff';
      const color = selectedFace === face ? '#ffdd8a' : axisColor;
      return <group key={face} position={position} quaternion={rotation} onPointerDown={event => onDown(event, face)} onPointerMove={onMove} onPointerUp={onUp}>
        <mesh position={[0, 3.2, 0]}><cylinderGeometry args={[0.75, 0.75, 6.4, 8]} /><meshBasicMaterial color={color} depthTest={false} /></mesh>
        <mesh position={[0, 7.2, 0]}><coneGeometry args={[1.8, 3.8, 10]} /><meshBasicMaterial color={color} depthTest={false} /></mesh>
      </group>;
    })}
  </group>;
}

const boxTriangles: [number, number, number][] = [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2]];
function boxVertices(size: Vec3): Vec3[] {
  const [x, y, z] = size.map(value => value / 2);
  return [[-x!, -y!, -z!], [x!, -y!, -z!], [x!, y!, -z!], [-x!, y!, -z!], [-x!, -y!, z!], [x!, -y!, z!], [x!, y!, z!], [-x!, y!, z!]];
}

function VertexHandles({ object }: { object: SceneObject }) {
  const { camera } = useThree();
  const orbit = useThree(s => s.controls) as OrbitControlsImpl | undefined;
  const preview = useEditor(s => s.preview);
  const cancelSeq = useEditor(s => s.cancelSeq);
  const handleRoot = useRef<Group>(null);
  const drag = useRef<{ index: number; vertices: Vec3[]; triangles: [number, number, number][]; plane: Plane } | null>(null);
  useEffect(() => { drag.current = null; if (orbit) orbit.enabled = true; return () => { if (orbit) orbit.enabled = true; }; }, [cancelSeq, orbit]);
  const vertices = object.shape.kind === 'box' ? boxVertices(object.shape.sizeMm) : object.shape.kind === 'mesh' ? object.shape.vertices : [];
  const triangles = object.shape.kind === 'mesh' ? object.shape.triangles : boxTriangles;
  const editableIndices = object.shape.kind === 'box' ? vertices.map((_, index) => index) : object.shape.kind === 'mesh' ? object.shape.editableVertices ?? [] : [];
  const shownVertices = preview?.id === object.id && preview.shape.kind === 'mesh' ? preview.shape.vertices : vertices;
  const commitEdit = (index: number, next: Vec3[]) => {
    const operations: SceneOperation[] = [];
    if (object.shape.kind === 'box') operations.push({ type: 'set_custom_mesh', targetId: object.id, vertices: vertices, triangles });
    operations.push({ type: 'set_mesh_vertex', targetId: object.id, index, positionMm: next[index]! });
    return operations;
  };
  const onDown = (event: ThreeEvent<PointerEvent>, index: number) => {
    event.stopPropagation();
    const point = event.point.clone();
    const normal = camera.getWorldDirection(new Vector3());
    drag.current = { index, vertices, triangles, plane: new Plane().setFromNormalAndCoplanarPoint(normal, point) };
    if (orbit) orbit.enabled = false;
    (event.target as Element).setPointerCapture(event.pointerId);
  };
  const onMove = (event: ThreeEvent<PointerEvent>) => {
    const active = drag.current;
    if (!active) return;
    event.stopPropagation();
    const hit = event.ray.intersectPlane(active.plane, new Vector3());
    if (!hit) return;
    const local = handleRoot.current ? handleRoot.current.worldToLocal(hit) : hit.sub(new Vector3(...object.positionMm)).applyQuaternion(new Quaternion(...object.rotation).invert());
    const next = active.vertices.slice();
    next[active.index] = [local.x, local.y, local.z];
    const operations: SceneOperation[] = [];
    if (object.shape.kind === 'box') operations.push({ type: 'set_custom_mesh', targetId: object.id, vertices: active.vertices, triangles: active.triangles });
    operations.push({ type: 'set_mesh_vertex', targetId: object.id, index: active.index, positionMm: next[active.index]! });
    useEditor.getState().previewOperations(operations);
  };
  const onUp = (event: ThreeEvent<PointerEvent>) => {
    const active = drag.current;
    if (!active) return;
    event.stopPropagation(); (event.target as Element).releasePointerCapture(event.pointerId); drag.current = null;
    if (orbit) orbit.enabled = true;
    const previewObject = useEditor.getState().preview;
    if (previewObject?.shape.kind === 'mesh') {
      const operations = commitEdit(active.index, previewObject.shape.vertices);
      useEditor.getState().transact(operations, 'mouse');
    } else useEditor.getState().clearPreview();
  };
  if (!editableIndices.length) return null;
  return <group ref={handleRoot}>{editableIndices.map(index => <mesh key={index} position={shownVertices[index] ?? [0, 0, 0]} onPointerDown={event => onDown(event, index)} onPointerMove={onMove} onPointerUp={onUp}>
    <octahedronGeometry args={[2.6, 0]} /><meshStandardMaterial color="#ffc86a" emissive="#b56c16" emissiveIntensity={0.25} depthTest={false} />
  </mesh>)}</group>;
}

function EditableObject({ object, children }: { object: SceneObject; children?: ReactNode }) {
  const selectedId = useEditor(s => s.selectedId);
  const selectedIds = useEditor(s => s.selectedIds);
  const mode = useEditor(s => s.mode);
  const tool = useEditor(s => s.tool);
  const axisLock = useEditor(s => s.axisLock);
  const preview = useEditor(s => s.preview);
  const cancelSeq = useEditor(s => s.cancelSeq);
  const group = useRef<Group>(null);
  const [target, setTarget] = useState<Group | null>(null);
  const canceled = useRef(false);
  const selected = selectedIds.includes(object.id) || selectedId === object.id;
  const shown = preview?.id === object.id ? preview : object;
  useEffect(() => { setTarget(group.current); }, []);
  useEffect(() => {
    canceled.current = true;
    if (!group.current) return;
    group.current.position.set(...object.positionMm);
    group.current.quaternion.set(...object.rotation);
    group.current.scale.set(...(object.scaleMm ?? [1, 1, 1]));
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
      if (object.shape.kind === 'empty') operations.push({ type: 'set_object_scale', targetId: object.id, scaleMm: [s.x, s.y, s.z] });
      else if (object.shape.kind === 'box') operations.push({ type: 'set_box_dimensions', targetId: object.id, sizeMm: [object.shape.sizeMm[0] * s.x, object.shape.sizeMm[1] * s.y, object.shape.sizeMm[2] * s.z] });
      else if (object.shape.kind === 'cylinder') operations.push({ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: object.shape.radiusMm * (s.x + s.z) / 2, heightMm: object.shape.heightMm * s.y });
      else if (object.shape.kind === 'sphere') operations.push({ type: 'set_sphere_radius', targetId: object.id, radiusMm: object.shape.radiusMm * (s.x + s.y + s.z) / 3 });
      else if (object.shape.kind === 'mesh') operations.push({ type: 'set_custom_mesh', targetId: object.id, vertices: object.shape.vertices.map(([x, y, z]) => [x * s.x, y * s.y, z * s.z]), triangles: object.shape.triangles });
      if (Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1) < 0.001) operations.length = 0;
    }
    if (operations.length) {
      if (!useEditor.getState().transact(operations, 'mouse')) {
        g.position.set(...object.positionMm); g.quaternion.set(...object.rotation); g.scale.set(...(object.scaleMm ?? [1, 1, 1]));
      }
    } else {
      g.position.set(...object.positionMm); g.quaternion.set(...object.rotation); g.scale.set(...(object.scaleMm ?? [1, 1, 1]));
    }
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
    } else if (object.shape.kind === 'empty') {
      const factors = [scale.x, scale.y, scale.z];
      const factor = factors.reduce((best, value) => Math.abs(value - 1) > Math.abs(best - 1) ? value : best, 1);
      scale.set(factor, factor, factor);
    }
  };

  const content = <group ref={group} position={shown.positionMm} quaternion={shown.rotation} scale={shown.scaleMm ?? [1, 1, 1]}>
    <ShapeMesh object={shown} selected={selected} />
    {selected && mode === 'shape' && (object.shape.kind === 'box'
      ? <><FaceHandles object={object} /><VertexHandles object={object} /></>
      : object.shape.kind === 'mesh' ? <VertexHandles object={object} /> : <FaceHandles object={object} />)}
    {children}
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
  const booleanPreview = useEditor(s => s.booleanPreview);
  const objects = useMemo(() => scene.objects, [scene.objects]);
  return <>
    <color attach="background" args={['#101b2b']} />
    <ambientLight intensity={1.3} />
    <hemisphereLight args={['#e3f3ff', '#233248', 2]} />
    <directionalLight position={[90, 160, 80]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} />
    <gridHelper args={[1000, 100, '#537092', '#29435f']} position={[0, -0.05, 0]} />
    <axesHelper args={[60]} />
    <group>{objects.filter(object => !object.parentId).map(object => <SceneNode key={object.id} object={object} objects={objects} />)}</group>
    {booleanPreview && <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[new Float32Array(booleanPreview.vertices.flat()), 3]} />
        <bufferAttribute attach="index" args={[new Uint32Array(booleanPreview.triangles.flat()), 1]} />
      </bufferGeometry>
      <meshStandardMaterial color={booleanPreview.kind === 'union' ? '#76e4a1' : '#ff966a'} transparent opacity={0.38} depthWrite={false} side={DoubleSide} />
    </mesh>}
    {mode === 'view' && <group />}
    <CameraRig />
  </>;
}

function SceneNode({ object, objects }: { object: SceneObject; objects: SceneObject[] }) {
  const children = objects.filter(candidate => candidate.parentId === object.id);
  return <EditableObject object={object}>{children.map(child => <SceneNode key={child.id} object={child} objects={objects} />)}</EditableObject>;
}

export function Viewport({ onContextMenu }: { onContextMenu: (x: number, y: number) => void }) {
  const mode = useEditor(s => s.mode);
  return <div className="viewport" aria-label="3D modeling viewport" onContextMenu={event => { event.preventDefault(); onContextMenu(event.clientX, event.clientY); }}>
    <Canvas shadows dpr={[1, 2]} onPointerMissed={() => { if (mode !== 'view') useEditor.getState().select(null); }}>
      <WorkspaceScene />
    </Canvas>
    <div className="viewport-tip">{mode === 'shape' ? 'Drag axis arrows to resize · Drag gold corners to deform box geometry' : 'Drag to orbit · Right drag to pan · Scroll to zoom'}</div>
    <div className="axis-legend"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
  </div>;
}
