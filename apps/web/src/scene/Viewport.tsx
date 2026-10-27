import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, events as createPointerEvents, type ThreeEvent, useThree } from '@react-three/fiber';
import { Edges, OrbitControls, OrthographicCamera, PerspectiveCamera, TransformControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl, TransformControls as TransformControlsImpl } from 'three-stdlib';
import {
  DoubleSide, Group, Matrix4, Object3D,
  OrthographicCamera as ThreeOrthographicCamera, PerspectiveCamera as ThreePerspectiveCamera,
  Plane, Quaternion, Vector3,
} from 'three';
import {
  faceNormal, shapeBounds, type BoxFace, type SceneDocument, type SceneObject,
  type SceneOperation, type Vec3,
} from '@call-and-response/shared';
import { meshGeometry } from '../geometry/csg';
import { localTransformForWorld, parentWorldMatrixFor, worldMatrixFor } from '../geometry/transforms';
import { useEditor } from '../state/editor';

const faces: BoxFace[] = ['+x', '-x', '+y', '-y', '+z', '-z'];
const HANDLE_INTERACTION_PRIORITY = 100;

function interactionPriority(object: Object3D): number {
  let current: Object3D | null = object;
  while (current) {
    const priority = current.userData.interactionPriority;
    if (typeof priority === 'number') return priority;
    current = current.parent;
  }
  return 0;
}

const handleFirstEvents = (state: Parameters<typeof createPointerEvents>[0]) => {
  const manager = createPointerEvents(state);
  return {
    ...manager,
    filter: (intersections: Parameters<NonNullable<typeof manager.filter>>[0]) => [...intersections].sort((first, second) =>
      interactionPriority(second.object) - interactionPriority(first.object) || first.distance - second.distance),
  };
};

function CameraRig() {
  const perspective = useRef<ThreePerspectiveCamera>(null);
  const orthographic = useRef<ThreeOrthographicCamera>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, set, size } = useThree();
  const cameraAction = useEditor(state => state.cameraAction);
  const cameraSeq = useEditor(state => state.cameraSeq);
  const isOrtho = cameraAction === 'front' || cameraAction === 'top' || cameraAction === 'right';
  useEffect(() => {
    const desired = isOrtho ? orthographic.current : perspective.current;
    if (desired && camera !== desired) set({ camera: desired });
  }, [camera, isOrtho, set]);
  useEffect(() => {
    const desired = isOrtho ? orthographic.current : perspective.current;
    if (camera !== desired || !controls.current) return;
    const state = useEditor.getState();
    const selected = state.scene.objects.find(object => object.id === state.selectedId);
    const target = cameraAction === 'focus' && selected
      ? new Vector3().setFromMatrixPosition(worldMatrixFor(state.scene, selected))
      : new Vector3(0, 0, 0);
    const localSize = selected ? shapeBounds(selected.shape)?.size ?? [40, 40, 40] : [40, 40, 40];
    const scale = selected?.scale ?? [1, 1, 1];
    const distance = cameraAction === 'focus' && selected
      ? Math.max(40, Math.max(...localSize.map((value, axis) => value * scale[axis]!)) * 3)
      : 190;
    if (cameraAction === 'front') camera.position.set(target.x, target.y, target.z + distance);
    else if (cameraAction === 'top') camera.position.set(target.x, target.y + distance, target.z);
    else if (cameraAction === 'right') camera.position.set(target.x + distance, target.y, target.z);
    else camera.position.set(target.x + distance * 0.85, target.y + distance * 0.65, target.z + distance * 0.85);
    camera.up.set(0, cameraAction === 'top' ? 0 : 1, cameraAction === 'top' ? -1 : 0);
    controls.current.target.copy(target); camera.updateProjectionMatrix(); controls.current.update();
  }, [camera, cameraAction, cameraSeq, isOrtho]);
  return <>
    <PerspectiveCamera ref={perspective} fov={50} near={0.1} far={100000} position={[160, 120, 160]} />
    <OrthographicCamera ref={orthographic} args={[-size.width / 2, size.width / 2, size.height / 2, -size.height / 2, 0.1, 100000]} zoom={4} position={[0, 0, 190]} />
    <OrbitControls key={camera.uuid} camera={camera} ref={controls} makeDefault enableDamping dampingFactor={0.1} minDistance={8} maxDistance={10000} screenSpacePanning />
  </>;
}

function CustomGeometry({ shape }: { shape: Extract<SceneObject['shape'], { kind: 'mesh' }> }) {
  const geometry = useMemo(() => meshGeometry(shape), [shape]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

function ShapeMesh({ object, selected }: { object: SceneObject; selected: boolean }) {
  const shape = object.shape;
  if (shape.kind === 'empty') return null;
  const material = object.material ?? { colorHex: '#ffffff', opacity: 0.5 };
  return <mesh castShadow receiveShadow scale={shape.kind === 'sphere' ? shape.radiiMm : [1, 1, 1]}
    onPointerDown={event => {
      const state = useEditor.getState();
      if (state.mode === 'object' && state.tool !== 'select' && state.transformHandleHovered) return;
      event.stopPropagation();
      if (state.mode === 'view') return;
      if (event.button === 2 && state.selectedIds.includes(object.id)) return;
      const objectId = object.id; const additive = event.nativeEvent.shiftKey;
      queueMicrotask(() => {
        const latest = useEditor.getState();
        if (!latest.transformDragging) latest.select(objectId, additive);
      });
    }}>
    {shape.kind === 'box' ? <boxGeometry args={shape.sizeMm} />
      : shape.kind === 'cylinder' ? <cylinderGeometry args={[shape.radiusMm, shape.radiusMm, shape.heightMm, 48]} />
        : shape.kind === 'sphere' ? <sphereGeometry args={[1, 48, 32]} />
          : <CustomGeometry shape={shape} />}
    <meshStandardMaterial color={material.colorHex} transparent={material.opacity < 1} opacity={material.opacity} depthWrite={material.opacity > 0.98} metalness={0.16} roughness={0.48} emissive={selected ? '#183c5f' : '#000000'} emissiveIntensity={selected ? 0.4 : 0} />
    {selected && <Edges scale={1.003} threshold={15} color="#dff5ff" />}
  </mesh>;
}

function dimensionsFor(object: SceneObject): Vec3 {
  const bounds = shapeBounds(object.shape);
  return bounds?.size ?? [0, 0, 0];
}

function FaceHandles({ object }: { object: SceneObject }) {
  const { camera, size } = useThree();
  const orbit = useThree(state => state.controls) as OrbitControlsImpl | undefined;
  const selectedFace = useEditor(state => state.selectedFace);
  const preview = useEditor(state => state.preview);
  const cancelSeq = useEditor(state => state.cancelSeq);
  const drag = useRef<{ face: BoxFace; x: number; y: number; pxPerMmX: number; pxPerMmY: number; delta: number } | null>(null);
  const handleRoot = useRef<Group>(null);
  useEffect(() => {
    drag.current = null; if (orbit) orbit.enabled = true;
    return () => { if (orbit) orbit.enabled = true; };
  }, [cancelSeq, orbit]);
  if (object.shape.kind === 'empty' || object.shape.kind === 'mesh') return null;
  const initialShape = object.shape;
  const shown = preview?.id === object.id ? preview : object;
  const initialDimensions = dimensionsFor(object);
  const makeOperations = (delta: number): SceneOperation[] => {
    const current = drag.current; if (!current) return [];
    const axis = current.face[1] === 'x' ? 0 : current.face[1] === 'y' ? 1 : 2;
    if (initialShape.kind === 'box') return [{ type: 'resize_box_face', targetId: object.id, face: current.face, deltaMm: delta }];
    if (initialShape.kind === 'sphere') {
      const radiiMm: Vec3 = [...initialShape.radiiMm]; radiiMm[axis] += delta;
      return [{ type: 'set_ellipsoid_radii', targetId: object.id, radiiMm }];
    }
    if (axis === 1) {
      const normal = faceNormal(current.face, object.rotation);
      const shift = delta * object.scale[1] / 2;
      return [
        { type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: initialShape.radiusMm, heightMm: initialShape.heightMm + delta },
        { type: 'set_object_position', targetId: object.id, positionMm: object.positionMm.map((value, index) => value + normal[index]! * shift) as Vec3 },
      ];
    }
    return [{ type: 'set_cylinder_dimensions', targetId: object.id, radiusMm: initialShape.radiusMm + delta, heightMm: initialShape.heightMm }];
  };
  const onDown = (event: ThreeEvent<PointerEvent>, face: BoxFace) => {
    event.stopPropagation(); useEditor.getState().setFace(face);
    const axis = face[1] === 'x' ? 0 : face[1] === 'y' ? 1 : 2; const sign = face[0] === '+' ? 1 : -1;
    const local = new Vector3(axis === 0 ? initialDimensions[0] * sign / 2 : 0, axis === 1 ? initialDimensions[1] * sign / 2 : 0, axis === 2 ? initialDimensions[2] * sign / 2 : 0);
    handleRoot.current?.updateWorldMatrix(true, false);
    const matrix = handleRoot.current?.matrixWorld ?? new Matrix4();
    const start = local.clone().applyMatrix4(matrix).project(camera);
    const end = local.clone().add(new Vector3(axis === 0 ? sign * 10 : 0, axis === 1 ? sign * 10 : 0, axis === 2 ? sign * 10 : 0)).applyMatrix4(matrix).project(camera);
    const pxPerMmX = (end.x - start.x) * size.width / 20; const pxPerMmY = -(end.y - start.y) * size.height / 20;
    if (pxPerMmX ** 2 + pxPerMmY ** 2 < 0.04) {
      useEditor.getState().setError('This handle points toward the camera. Orbit the view or use the inspector.'); return;
    }
    drag.current = { face, x: event.clientX, y: event.clientY, pxPerMmX, pxPerMmY, delta: 0 };
    if (orbit) orbit.enabled = false; (event.target as Element).setPointerCapture(event.pointerId);
  };
  const onMove = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current; if (!current) return; event.stopPropagation();
    const dx = event.clientX - current.x; const dy = event.clientY - current.y;
    const denominator = current.pxPerMmX ** 2 + current.pxPerMmY ** 2;
    const raw = (dx * current.pxPerMmX + dy * current.pxPerMmY) / denominator;
    const axis = current.face[1] === 'x' ? 0 : current.face[1] === 'y' ? 1 : 2;
    const initial = initialShape.kind === 'box' ? initialShape.sizeMm[axis]!
      : initialShape.kind === 'sphere' ? initialShape.radiiMm[axis]!
        : axis === 1 ? initialShape.heightMm : initialShape.radiusMm;
    current.delta = Math.max(0.1 - initial, Math.min(100000 - initial, raw));
    useEditor.getState().previewOperations(makeOperations(current.delta));
  };
  const onUp = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current; if (!current) return; event.stopPropagation();
    (event.target as Element).releasePointerCapture(event.pointerId);
    if (orbit) orbit.enabled = true;
    const operations = makeOperations(current.delta); drag.current = null;
    if (Math.abs(current.delta) > 0.001 && operations.length) useEditor.getState().transact(operations, 'mouse');
    else useEditor.getState().clearPreview();
  };
  const shownDimensions = dimensionsFor(shown);
  const maxDimension = Math.max(...shownDimensions);
  const length = Math.max(4, Math.min(14, maxDimension * 0.12));
  const radius = Math.max(0.65, Math.min(2, maxDimension * 0.018));
  return <group ref={handleRoot}>{faces.map(face => {
    const axis = face[1] === 'x' ? 0 : face[1] === 'y' ? 1 : 2; const sign = face[0] === '+' ? 1 : -1;
    const position: Vec3 = [axis === 0 ? sign * shownDimensions[0] / 2 : 0, axis === 1 ? sign * shownDimensions[1] / 2 : 0, axis === 2 ? sign * shownDimensions[2] / 2 : 0];
    const direction = new Vector3(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
    const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);
    const axisColor = axis === 0 ? '#ff7068' : axis === 1 ? '#75e39a' : '#6ba8ff'; const color = selectedFace === face ? '#ffdd8a' : axisColor;
    return <group key={face} position={position} quaternion={rotation} userData={{ interactionPriority: HANDLE_INTERACTION_PRIORITY }} onPointerDown={event => onDown(event, face)} onPointerMove={onMove} onPointerUp={onUp}>
      <mesh position={[0, length / 2, 0]}><cylinderGeometry args={[radius, radius, length, 8]} /><meshBasicMaterial color={color} depthTest={false} /></mesh>
      <mesh position={[0, length + radius * 1.5, 0]}><coneGeometry args={[radius * 2.25, radius * 4, 10]} /><meshBasicMaterial color={color} depthTest={false} /></mesh>
      <mesh position={[0, length * 0.65, 0]}><sphereGeometry args={[Math.max(2.4, radius * 2.4), 10, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    </group>;
  })}</group>;
}

const boxTriangles: [number, number, number][] = [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2]];
function boxVertices(size: Vec3): Vec3[] {
  const [x, y, z] = size.map(value => value / 2);
  return [[-x!, -y!, -z!], [x!, -y!, -z!], [x!, y!, -z!], [-x!, y!, -z!], [-x!, -y!, z!], [x!, -y!, z!], [x!, y!, z!], [-x!, y!, z!]];
}

function VertexHandles({ object }: { object: SceneObject }) {
  const { camera } = useThree(); const orbit = useThree(state => state.controls) as OrbitControlsImpl | undefined;
  const preview = useEditor(state => state.preview); const cancelSeq = useEditor(state => state.cancelSeq);
  const handleRoot = useRef<Group>(null);
  const drag = useRef<{ index: number; vertices: Vec3[]; triangles: [number, number, number][]; plane: Plane } | null>(null);
  useEffect(() => { drag.current = null; if (orbit) orbit.enabled = true; return () => { if (orbit) orbit.enabled = true; }; }, [cancelSeq, orbit]);
  const vertices = object.shape.kind === 'box' ? boxVertices(object.shape.sizeMm) : object.shape.kind === 'mesh' ? object.shape.vertices : [];
  const triangles = object.shape.kind === 'mesh' ? object.shape.triangles : boxTriangles;
  const editableIndices = object.shape.kind === 'box' ? vertices.map((_, index) => index) : object.shape.kind === 'mesh' ? object.shape.editableVertices ?? [] : [];
  const shownVertices = preview?.id === object.id && preview.shape.kind === 'mesh' ? preview.shape.vertices : vertices;
  const operationsFor = (index: number, next: Vec3[]): SceneOperation[] => {
    const operations: SceneOperation[] = [];
    if (object.shape.kind === 'box') operations.push({ type: 'set_custom_mesh', targetId: object.id, vertices, triangles });
    operations.push({ type: 'set_mesh_vertex', targetId: object.id, index, positionMm: next[index]! }); return operations;
  };
  const onDown = (event: ThreeEvent<PointerEvent>, index: number) => {
    event.stopPropagation();
    drag.current = { index, vertices, triangles, plane: new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), event.point) };
    if (orbit) orbit.enabled = false; (event.target as Element).setPointerCapture(event.pointerId);
  };
  const onMove = (event: ThreeEvent<PointerEvent>) => {
    const active = drag.current; if (!active) return; event.stopPropagation();
    const hit = event.ray.intersectPlane(active.plane, new Vector3()); if (!hit) return;
    const local = handleRoot.current ? handleRoot.current.worldToLocal(hit) : hit;
    const next = active.vertices.slice(); next[active.index] = [local.x, local.y, local.z];
    useEditor.getState().previewOperations(operationsFor(active.index, next));
  };
  const onUp = (event: ThreeEvent<PointerEvent>) => {
    const active = drag.current; if (!active) return; event.stopPropagation();
    (event.target as Element).releasePointerCapture(event.pointerId); drag.current = null; if (orbit) orbit.enabled = true;
    const previewObject = useEditor.getState().preview;
    if (previewObject?.shape.kind === 'mesh') useEditor.getState().transact(operationsFor(active.index, previewObject.shape.vertices), 'mouse');
    else useEditor.getState().clearPreview();
  };
  if (!editableIndices.length) return null;
  const handleSize = Math.max(1.8, Math.min(4, Math.max(...dimensionsFor(object)) * 0.04));
  return <group ref={handleRoot}>{editableIndices.map(index => <mesh key={index} position={shownVertices[index]!} userData={{ interactionPriority: HANDLE_INTERACTION_PRIORITY }} onPointerDown={event => onDown(event, index)} onPointerMove={onMove} onPointerUp={onUp}>
    <octahedronGeometry args={[handleSize, 0]} /><meshStandardMaterial color="#ffc86a" emissive="#b56c16" emissiveIntensity={0.25} depthTest={false} />
  </mesh>)}</group>;
}

function matrixParts(matrix: Matrix4) {
  const position = new Vector3(); const quaternion = new Quaternion(); const scale = new Vector3(); matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

function EditableObject({ object, scene }: { object: SceneObject; scene: SceneDocument }) {
  const selectedId = useEditor(state => state.selectedId); const selectedIds = useEditor(state => state.selectedIds);
  const mode = useEditor(state => state.mode); const tool = useEditor(state => state.tool); const axisLock = useEditor(state => state.axisLock);
  const preview = useEditor(state => state.preview); const cancelSeq = useEditor(state => state.cancelSeq);
  const group = useRef<Group>(null); const transformControls = useRef<TransformControlsImpl>(null); const [target, setTarget] = useState<Group | null>(null); const dragging = useRef(false);
  const selected = selectedIds.includes(object.id) || selectedId === object.id;
  const shown = preview?.id === object.id ? preview : object;
  const shownScene = shown === object ? scene : { ...scene, objects: scene.objects.map(item => item.id === object.id ? shown : item) };
  const canonicalWorld = worldMatrixFor(shownScene, shown);
  const parts = matrixParts(canonicalWorld);
  useEffect(() => { setTarget(group.current); }, []);
  useEffect(() => {
    if (!selected) return;
    return () => {
      const state = useEditor.getState();
      state.setTransformHandleHovered(false); state.setTransformDragging(false);
    };
  }, [selected]);
  useEffect(() => {
    dragging.current = false; const current = group.current; if (!current) return;
    const reset = matrixParts(worldMatrixFor(scene, object));
    current.position.copy(reset.position); current.quaternion.copy(reset.quaternion); current.scale.copy(reset.scale); current.updateMatrixWorld(true);
  }, [cancelSeq, object, scene]);
  const constrainGroupScale = () => {
    if (object.shape.kind !== 'empty' || tool !== 'scale' || !group.current) return;
    const values = [group.current.scale.x, group.current.scale.y, group.current.scale.z];
    const uniform = values.reduce((best, value) => Math.abs(value - 1) > Math.abs(best - 1) ? value : best, 1);
    group.current.scale.set(uniform, uniform, uniform);
  };
  const syncTransformHover = () => {
    const axis = (transformControls.current as unknown as { axis?: string | null } | null)?.axis;
    useEditor.getState().setTransformHandleHovered(Boolean(axis));
  };
  const finish = () => {
    useEditor.getState().setTransformDragging(false);
    const current = group.current; if (!current || !dragging.current || mode !== 'object' || tool === 'select') return;
    dragging.current = false; current.updateMatrixWorld(true);
    try {
      const local = localTransformForWorld(scene, current.matrixWorld.clone(), object.parentId);
      if (object.shape.kind === 'empty') {
        const uniform = (local.scale[0] + local.scale[1] + local.scale[2]) / 3;
        local.scale = [uniform, uniform, uniform];
      }
      const operations: SceneOperation[] = [
        { type: 'set_object_position', targetId: object.id, positionMm: local.positionMm },
        { type: 'rotate_object', targetId: object.id, rotation: local.rotation },
        { type: 'set_object_scale', targetId: object.id, scale: local.scale },
      ];
      useEditor.getState().transact(operations, 'mouse');
    } catch (error) {
      useEditor.getState().setError(error instanceof Error ? error.message : 'Transform could not be applied');
      const reset = matrixParts(worldMatrixFor(scene, object)); current.position.copy(reset.position); current.quaternion.copy(reset.quaternion); current.scale.copy(reset.scale);
    }
  };
  const content = <group ref={group} position={parts.position} quaternion={parts.quaternion} scale={parts.scale}>
    <ShapeMesh object={shown} selected={selected} />
    {selected && mode === 'shape' && <>
      {(object.shape.kind === 'box' || object.shape.kind === 'cylinder' || object.shape.kind === 'sphere') && <FaceHandles object={object} />}
      {(object.shape.kind === 'box' || (object.shape.kind === 'mesh' && object.shape.editableVertices?.length)) && <VertexHandles object={object} />}
    </>}
  </group>;
  return <>{content}{selected && mode === 'object' && tool !== 'select' && target && <TransformControls ref={transformControls}
    object={target} mode={tool === 'move' ? 'translate' : tool} size={0.8}
    showX={!axisLock || axisLock === 'x'} showY={!axisLock || axisLock === 'y'} showZ={!axisLock || axisLock === 'z'}
    onChange={syncTransformHover} onMouseDown={() => { dragging.current = true; useEditor.getState().setTransformDragging(true); }} onObjectChange={constrainGroupScale} onMouseUp={() => { finish(); syncTransformHover(); }}
  />}</>;
}

function BooleanPreviewMesh({ scene }: { scene: SceneDocument }) {
  const preview = useEditor(state => state.booleanPreview);
  const geometry = useMemo(() => preview ? meshGeometry(preview) : null, [preview]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!preview || !geometry) return null;
  const matrix = parentWorldMatrixFor(scene, preview.parentId).multiply(new Matrix4().makeTranslation(...preview.positionMm));
  const parts = matrixParts(matrix);
  return <mesh position={parts.position} quaternion={parts.quaternion} scale={parts.scale} geometry={geometry}>
    <meshStandardMaterial color={preview.kind === 'union' ? '#76e4a1' : preview.kind === 'intersect' ? '#78c8ff' : '#ff966a'} transparent opacity={0.38} depthWrite={false} side={DoubleSide} />
  </mesh>;
}

function WorkspaceScene() {
  const scene = useEditor(state => state.scene);
  return <>
    <color attach="background" args={['#101b2b']} />
    <ambientLight intensity={1.3} /><hemisphereLight args={['#e3f3ff', '#233248', 2]} />
    <directionalLight position={[90, 160, 80]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} />
    <gridHelper args={[1000, 100, '#537092', '#29435f']} position={[0, -0.05, 0]} /><axesHelper args={[60]} />
    {scene.objects.map(object => <EditableObject key={object.id} object={object} scene={scene} />)}
    <BooleanPreviewMesh scene={scene} /><CameraRig />
  </>;
}

export function Viewport({ onContextMenu }: { onContextMenu: (x: number, y: number) => void }) {
  const mode = useEditor(state => state.mode);
  const selected = useEditor(state => state.scene.objects.find(object => object.id === state.selectedId));
  const shapeMessage = selected?.shape.kind === 'mesh' && !selected.shape.editableVertices?.length
    ? 'Boolean meshes support Object tools; direct Shape editing is not available.'
    : 'Drag axis arrows to edit primitive geometry · Drag gold corners on box-derived meshes';
  return <div className="viewport" aria-label="3D modeling viewport" onContextMenu={event => { event.preventDefault(); onContextMenu(event.clientX, event.clientY); }}>
    <Canvas events={handleFirstEvents} shadows dpr={[1, 2]} onPointerMissed={() => { if (mode !== 'view') useEditor.getState().select(null); }}><WorkspaceScene /></Canvas>
    <div className="viewport-tip">{mode === 'shape' ? shapeMessage : 'Drag to orbit · Right drag to pan · Scroll to zoom'}</div>
    <div className="axis-legend"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
  </div>;
}
