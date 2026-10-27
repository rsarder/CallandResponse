import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Quaternion, Vector2, Vector3, type Object3D } from 'three';
import { faceNormal, type BoxFace, type SceneObject, type SceneOperation, type Vec3 } from '@call-and-response/shared';
import { transformOperationsForWorld, worldMatrixFor } from '../geometry/transforms';
import { useEditor, type GesturePointerInput } from '../state/editor';

const boxTriangles: [number, number, number][] = [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2]];
function boxVertices(size: Vec3): Vec3[] {
  const [x, y, z] = size.map(value => value / 2);
  return [[-x!, -y!, -z!], [x!, -y!, -z!], [x!, y!, -z!], [-x!, y!, -z!], [-x!, -y!, z!], [x!, -y!, z!], [x!, y!, z!], [-x!, y!, z!]];
}

interface DragState {
  kind: 'object' | 'face' | 'vertex';
  objectId: string;
  initial: SceneObject;
  plane: Plane;
  startPoint: Vector3;
  startNdc: Vector2;
  lastOperations: SceneOperation[];
  face?: BoxFace;
  vertexIndex?: number;
  vertices?: Vec3[];
  triangles?: [number, number, number][];
  faceAxisPerNdc?: Vector2;
}

function metadata(object: Object3D, key: string): unknown {
  let current: Object3D | null = object;
  while (current) {
    const value = current.userData[key];
    if (value !== undefined) return value;
    current = current.parent;
  }
  return undefined;
}

function GestureCanvasBridge() {
  const { camera, raycaster, scene: renderScene, size } = useThree();
  const cancelSeq = useEditor(state => state.cancelSeq);
  const drag = useRef<DragState | null>(null);
  useEffect(() => { drag.current = null; }, [cancelSeq]);
  useEffect(() => {
    const rayAt = (x: number, y: number) => {
      raycaster.setFromCamera(new Vector2(x, y), camera);
      const intersections = raycaster.intersectObjects(renderScene.children, true);
      return intersections.sort((a, b) => Number(metadata(b.object, 'interactionPriority') ?? 0) - Number(metadata(a.object, 'interactionPriority') ?? 0) || a.distance - b.distance);
    };
    const findTarget = (hits: ReturnType<typeof rayAt>) => {
      for (const hit of hits) {
        const id = metadata(hit.object, 'sceneObjectId');
        if (typeof id === 'string') return { id, hit };
      }
      return null;
    };
    const pointerRay = (x: number, y: number) => {
      raycaster.setFromCamera(new Vector2(x, y), camera);
      return raycaster.ray.clone();
    };
    const handler = (input: GesturePointerInput) => {
      if (input.phase === 'cancel') {
        drag.current = null; useEditor.getState().clearPreview(); return;
      }
      if (input.phase === 'hover') return;
      const state = useEditor.getState();
      const hits = rayAt(input.x, input.y);
      const target = findTarget(hits);
      if (input.phase === 'tap') {
        if (state.mode === 'view') return;
        if (!target) return;
        if (!state.selectedIds.includes(target.id)) state.select(target.id);
        const hit = hits.find(item => metadata(item.object, 'sceneObjectId') === target.id);
        const face = hit ? metadata(hit.object, 'gestureFace') : undefined;
        if (state.mode === 'shape' && typeof face === 'string') state.setFace(face as BoxFace);
        return;
      }
      if (input.phase === 'down') {
        const selected = target ? state.scene.objects.find(object => object.id === target.id) : state.scene.objects.find(object => object.id === state.selectedId);
        if (!selected) return;
        if (selected.id !== state.selectedId) state.select(selected.id);
        const world = worldMatrixFor(state.scene, selected);
        const hit = hits.find(item => metadata(item.object, 'sceneObjectId') === selected.id);
        const hitFace = hit ? metadata(hit.object, 'gestureFace') : undefined;
        const activeFace = state.mode === 'shape' ? (typeof hitFace === 'string' ? hitFace as BoxFace : state.selectedFace) : null;
        const vertex = state.mode === 'shape' && hit ? metadata(hit.object, 'gestureVertex') : undefined;
        if (state.mode === 'shape' && typeof vertex === 'number' && (selected.shape.kind === 'box' || selected.shape.kind === 'mesh')) {
          const vertices = selected.shape.kind === 'box' ? boxVertices(selected.shape.sizeMm) : selected.shape.vertices;
          const triangles = selected.shape.kind === 'box' ? boxTriangles : selected.shape.triangles;
          const point = hit?.point ?? new Vector3().setFromMatrixPosition(world);
          drag.current = { kind: 'vertex', objectId: selected.id, initial: selected, plane: new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), point), startPoint: point, startNdc: new Vector2(input.x, input.y), lastOperations: [], vertexIndex: vertex, vertices, triangles };
          return;
        }
        if (activeFace && selected.shape.kind !== 'empty' && selected.shape.kind !== 'mesh') {
          const worldPosition = new Vector3(); const worldQuaternion = new Quaternion(); const worldScale = new Vector3();
          world.decompose(worldPosition, worldQuaternion, worldScale);
          const normalArray = faceNormal(activeFace, [worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w]);
          const normal = new Vector3(...normalArray).normalize();
          const center = new Vector3().setFromMatrixPosition(world);
          const axisWorld = center.clone().addScaledVector(normal, 10);
          center.project(camera); axisWorld.project(camera);
          const pxPerMm = new Vector2((axisWorld.x - center.x) * size.width / 20, -(axisWorld.y - center.y) * size.height / 20);
          if (pxPerMm.lengthSq() > 0.0001) {
            const mmPerNdc = new Vector2(pxPerMm.x * size.width / 2, -pxPerMm.y * size.height / 2).divideScalar(pxPerMm.lengthSq());
            drag.current = { kind: 'face', objectId: selected.id, initial: selected, plane: new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), hit?.point ?? new Vector3().setFromMatrixPosition(world)), startPoint: hit?.point ?? new Vector3().setFromMatrixPosition(world), startNdc: new Vector2(input.x, input.y), lastOperations: [], face: activeFace, faceAxisPerNdc: mmPerNdc };
          }
          return;
        }
        if (state.mode !== 'object') return;
        const point = hit?.point ?? new Vector3().setFromMatrixPosition(world);
        drag.current = { kind: 'object', objectId: selected.id, initial: selected, plane: new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), point), startPoint: point, startNdc: new Vector2(input.x, input.y), lastOperations: [] };
        return;
      }
      const active = drag.current;
      if (!active) return;
      if (input.phase === 'up') {
        drag.current = null;
        if (active.lastOperations.length) state.transact(active.lastOperations, 'gesture');
        else state.clearPreview();
        return;
      }
      const ray = pointerRay(input.x, input.y);
      if (active.kind === 'face' && active.face && active.faceAxisPerNdc) {
        const ndcDelta = new Vector2(input.x, input.y).sub(active.startNdc);
        const delta = ndcDelta.dot(active.faceAxisPerNdc);
        const axis = active.face[1] === 'x' ? 0 : active.face[1] === 'y' ? 1 : 2;
        let operations: SceneOperation[] = [];
        if (active.initial.shape.kind === 'box') operations = [{ type: 'resize_box_face', targetId: active.objectId, face: active.face, deltaMm: Math.max(0.1 - active.initial.shape.sizeMm[axis]!, delta) }];
        else if (active.initial.shape.kind === 'sphere') {
          const radiiMm: Vec3 = [...active.initial.shape.radiiMm]; radiiMm[axis] = Math.max(0.1, radiiMm[axis]! + delta);
          operations = [{ type: 'set_ellipsoid_radii', targetId: active.objectId, radiiMm }];
        } else if (active.initial.shape.kind === 'cylinder') {
          if (axis === 1) {
            const applied = Math.max(0.1 - active.initial.shape.heightMm, delta);
            const normal = faceNormal(active.face, active.initial.rotation);
            operations = [
              { type: 'set_cylinder_dimensions', targetId: active.objectId, radiusMm: active.initial.shape.radiusMm, heightMm: active.initial.shape.heightMm + applied },
              { type: 'set_object_position', targetId: active.objectId, positionMm: active.initial.positionMm.map((v, index) => v + normal[index]! * applied * active.initial.scale[1] / 2) as Vec3 },
            ];
          } else operations = [{ type: 'set_cylinder_dimensions', targetId: active.objectId, radiusMm: Math.max(0.1, active.initial.shape.radiusMm + delta), heightMm: active.initial.shape.heightMm }];
        }
        active.lastOperations = operations;
        if (operations.length) state.previewOperations(operations, 'gesture');
        return;
      }
      if (active.kind === 'vertex' && active.vertices && active.triangles && typeof active.vertexIndex === 'number') {
        const point = ray.intersectPlane(active.plane, new Vector3());
        if (!point) return;
        const local = point.applyMatrix4(worldMatrixFor(state.scene, active.initial).invert());
        const vertices = active.vertices.slice(); vertices[active.vertexIndex] = [local.x, local.y, local.z];
        const operations: SceneOperation[] = [];
        if (active.initial.shape.kind === 'box') operations.push({ type: 'set_custom_mesh', targetId: active.objectId, vertices: active.vertices, triangles: active.triangles });
        operations.push({ type: 'set_mesh_vertex', targetId: active.objectId, index: active.vertexIndex, positionMm: vertices[active.vertexIndex]! });
        active.lastOperations = operations; state.previewOperations(operations, 'gesture'); return;
      }
      const point = ray.intersectPlane(active.plane, new Vector3());
      if (!point) return;
      const initialWorld = worldMatrixFor(state.scene, active.initial);
      const initialPosition = new Vector3().setFromMatrixPosition(initialWorld);
      const worldPosition = initialPosition.add(point.sub(active.startPoint));
      initialWorld.setPosition(worldPosition);
      try {
        const operations = transformOperationsForWorld(state.scene, active.initial, initialWorld);
        active.lastOperations = operations; state.previewOperations(operations, 'gesture');
      } catch (error) { state.setError(error instanceof Error ? error.message : 'Gesture transform failed'); }
    };
    useEditor.getState().setGesturePointerHandler(handler);
    return () => { if (useEditor.getState().gesturePointerHandler === handler) useEditor.getState().setGesturePointerHandler(null); };
  }, [camera, raycaster, renderScene, size]);
  return null;
}

export { GestureCanvasBridge };
