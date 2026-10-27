import { Matrix4, Vector3 } from 'three';
import type { SceneDocument, SceneObject, SceneOperation } from '@call-and-response/shared';
import { decomposeTransform, parentWorldMatrixFor, reparentOperations, worldMatrixFor } from './transforms';

function objectFor(scene: SceneDocument, id: string): SceneObject {
  const object = scene.objects.find(candidate => candidate.id === id);
  if (!object) throw new Error(`Object not found: ${id}`);
  return object;
}

function topLevelSelection(scene: SceneDocument, objectIds: readonly string[]): SceneObject[] {
  const selected = new Set(objectIds);
  return objectIds.map(id => objectFor(scene, id)).filter(object => {
    let parentId = object.parentId;
    while (parentId) {
      if (selected.has(parentId)) return false;
      parentId = objectFor(scene, parentId).parentId;
    }
    return true;
  });
}

export function groupOperations(
  scene: SceneDocument,
  objectIds: readonly string[],
  groupId: string,
  groupName: string,
): SceneOperation[] {
  const items = topLevelSelection(scene, objectIds);
  if (!items.length) throw new Error('Select at least one object to group');
  if (scene.objects.some(object => object.id === groupId)) throw new Error(`Duplicate object ID: ${groupId}`);
  const worldMatrices = items.map(item => worldMatrixFor(scene, item));
  const center = worldMatrices.reduce((sum, matrix) => sum.add(new Vector3().setFromMatrixPosition(matrix)), new Vector3()).multiplyScalar(1 / worldMatrices.length);
  const commonParent = items.every(item => item.parentId === items[0]!.parentId) ? items[0]!.parentId : undefined;
  const groupWorld = new Matrix4().makeTranslation(center.x, center.y, center.z);
  const groupLocal = decomposeTransform(parentWorldMatrixFor(scene, commonParent).invert().multiply(groupWorld));
  const operations: SceneOperation[] = [
    { type: 'create_empty', id: groupId, name: groupName, positionMm: groupLocal.positionMm },
    { type: 'rotate_object', targetId: groupId, rotation: groupLocal.rotation },
    { type: 'set_object_scale', targetId: groupId, scale: groupLocal.scale },
  ];
  if (commonParent) operations.push({ type: 'reparent_object', targetId: groupId, parentId: commonParent });
  items.forEach((item, index) => {
    const local = decomposeTransform(groupWorld.clone().invert().multiply(worldMatrices[index]!));
    operations.push(
      { type: 'set_object_position', targetId: item.id, positionMm: local.positionMm },
      { type: 'rotate_object', targetId: item.id, rotation: local.rotation },
      { type: 'set_object_scale', targetId: item.id, scale: local.scale },
      { type: 'reparent_object', targetId: item.id, parentId: groupId },
    );
  });
  return operations;
}

export function ungroupOperations(scene: SceneDocument, groupId: string): SceneOperation[] {
  const group = objectFor(scene, groupId);
  if (group.shape.kind !== 'empty') throw new Error('Only Empty groups can be ungrouped');
  const operations = scene.objects.filter(object => object.parentId === group.id)
    .flatMap(child => reparentOperations(scene, child.id, group.parentId ?? null));
  operations.push({ type: 'delete_object', targetId: group.id });
  return operations;
}

export function duplicateSubtreeOperations(
  scene: SceneDocument,
  rootId: string,
  newId: () => string,
): { rootId: string; operations: SceneOperation[] } {
  const root = objectFor(scene, rootId);
  const descendants: SceneObject[] = [];
  const visit = (parentId: string) => scene.objects.filter(item => item.parentId === parentId).forEach(child => { descendants.push(child); visit(child.id); });
  visit(root.id);
  const subtree = [root, ...descendants];
  const ids = new Map(subtree.map(item => [item.id, newId()]));
  const operations: SceneOperation[] = subtree.map((item, index) => ({
    type: 'duplicate_object', targetId: item.id, id: ids.get(item.id)!, name: index === 0 ? `${item.name} copy` : item.name, offsetMm: [0, 0, 0],
  }));
  operations.push({ type: 'set_object_position', targetId: ids.get(root.id)!, positionMm: [root.positionMm[0] + 16, root.positionMm[1], root.positionMm[2] + 16] });
  descendants.forEach(child => operations.push({ type: 'reparent_object', targetId: ids.get(child.id)!, parentId: ids.get(child.parentId!)! }));
  return { rootId: ids.get(root.id)!, operations };
}

export function deleteSubtreeOperations(scene: SceneDocument, rootIds: readonly string[]): SceneOperation[] {
  const ids = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of scene.objects) if (object.parentId && ids.has(object.parentId) && !ids.has(object.id)) { ids.add(object.id); changed = true; }
  }
  const depth = (id: string) => {
    let value = 0; let item = objectFor(scene, id);
    while (item.parentId) { value += 1; item = objectFor(scene, item.parentId); }
    return value;
  };
  return [...ids].sort((first, second) => depth(second) - depth(first)).map(targetId => ({ type: 'delete_object', targetId }));
}
