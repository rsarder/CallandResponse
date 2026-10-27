import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { shapeBounds, type Quat, type SceneDocument, type SceneObject, type SceneOperation, type Vec3 } from '@call-and-response/shared';

const IDENTITY = new Matrix4();

export function localMatrixFor(object: SceneObject): Matrix4 {
  return new Matrix4().compose(new Vector3(...object.positionMm), new Quaternion(...object.rotation), new Vector3(...object.scale));
}

export function worldMatrixFor(scene: SceneDocument, objectOrId: SceneObject | string): Matrix4 {
  const object = typeof objectOrId === 'string' ? scene.objects.find(candidate => candidate.id === objectOrId) : objectOrId;
  if (!object) throw new Error(`Object not found: ${String(objectOrId)}`);
  const chain: SceneObject[] = [];
  const visited = new Set<string>();
  let current: SceneObject | undefined = object;
  while (current) {
    if (visited.has(current.id)) throw new Error('Hierarchy contains a cycle');
    visited.add(current.id); chain.unshift(current);
    current = current.parentId ? scene.objects.find(candidate => candidate.id === current!.parentId) : undefined;
  }
  return chain.reduce((matrix, item) => matrix.multiply(localMatrixFor(item)), new Matrix4());
}

export function parentWorldMatrixFor(scene: SceneDocument, parentId?: string | null): Matrix4 {
  return parentId ? worldMatrixFor(scene, parentId) : IDENTITY.clone();
}

export interface TransformParts { positionMm: Vec3; rotation: Quat; scale: Vec3 }

export function decomposeTransform(matrix: Matrix4): TransformParts {
  const position = new Vector3(); const rotation = new Quaternion(); const scale = new Vector3();
  matrix.decompose(position, rotation, scale); rotation.normalize();
  if (![position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, rotation.w, scale.x, scale.y, scale.z].every(Number.isFinite))
    throw new Error('Transform contains non-finite values');
  if (Math.min(scale.x, scale.y, scale.z) < 0.1) throw new Error('Object scale must be at least 0.1 on every axis');
  const recomposed = new Matrix4().compose(position, rotation, scale);
  const a = matrix.elements; const b = recomposed.elements;
  const error = Math.max(...a.map((value, index) => Math.abs(value - b[index]!)));
  if (error > 1e-5) throw new Error('This hierarchy change would introduce shear, which Call and Response does not support');
  return {
    positionMm: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    scale: [scale.x, scale.y, scale.z],
  };
}

export function localTransformForWorld(scene: SceneDocument, world: Matrix4, parentId?: string | null): TransformParts {
  return decomposeTransform(parentWorldMatrixFor(scene, parentId).invert().multiply(world));
}

export function transformOperationsForWorld(
  scene: SceneDocument,
  object: SceneObject,
  world: Matrix4,
  parentId: string | null = object.parentId ?? null,
): SceneOperation[] {
  const transform = localTransformForWorld(scene, world, parentId);
  if (object.shape.kind === 'empty') {
    const average = (transform.scale[0] + transform.scale[1] + transform.scale[2]) / 3;
    if (Math.max(...transform.scale.map(value => Math.abs(value - average))) > 1e-5)
      throw new Error('Groups use uniform scale so descendants never acquire shear');
    transform.scale = [average, average, average];
  }
  const operations: SceneOperation[] = [
    { type: 'set_object_position', targetId: object.id, positionMm: transform.positionMm },
    { type: 'rotate_object', targetId: object.id, rotation: transform.rotation },
    { type: 'set_object_scale', targetId: object.id, scale: transform.scale },
  ];
  if ((object.parentId ?? null) !== parentId) operations.push({ type: 'reparent_object', targetId: object.id, parentId });
  return operations;
}

export function reparentOperations(scene: SceneDocument, objectId: string, parentId: string | null): SceneOperation[] {
  const object = scene.objects.find(candidate => candidate.id === objectId);
  if (!object) throw new Error(`Object not found: ${objectId}`);
  if (parentId === object.id) throw new Error('An object cannot parent itself');
  let ancestor = parentId ? scene.objects.find(candidate => candidate.id === parentId) : undefined;
  while (ancestor) {
    if (ancestor.id === object.id) throw new Error('Hierarchy cannot contain cycles');
    ancestor = ancestor.parentId ? scene.objects.find(candidate => candidate.id === ancestor!.parentId) : undefined;
  }
  return transformOperationsForWorld(scene, object, worldMatrixFor(scene, object), parentId);
}

export function objectWorldBounds(scene: SceneDocument, object: SceneObject): Box3 | null {
  const bounds = shapeBounds(object.shape);
  if (!bounds) return null;
  return new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max)).applyMatrix4(worldMatrixFor(scene, object));
}

export function objectWorldPivot(scene: SceneDocument, object: SceneObject): Vec3 {
  const point = new Vector3().setFromMatrixPosition(worldMatrixFor(scene, object));
  return [point.x, point.y, point.z];
}
