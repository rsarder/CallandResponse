import { describe, expect, it } from 'vitest';
import { applyTransaction, emptyScene, type SceneDocument, type SceneOperation } from '@call-and-response/shared';
import { deleteSubtreeOperations, duplicateSubtreeOperations, groupOperations, ungroupOperations } from './hierarchy';
import { reparentOperations, worldMatrixFor } from './transforms';

const apply = (scene: SceneDocument, operations: SceneOperation[]) => applyTransaction(scene, { expectedRevision: scene.revision, source: 'mouse', operations });
const created = () => apply(emptyScene(), [
  { type: 'create_box', id: 'a', name: 'A', sizeMm: [20, 30, 40], positionMm: [-20, 3, 5] },
  { type: 'create_cylinder', id: 'b', name: 'B', radiusMm: 8, heightMm: 25, positionMm: [18, -2, 7] },
  { type: 'create_sphere', id: 'c', name: 'C', radiusMm: 10, positionMm: [2, 8, -25] },
]);

function expectMatrixClose(actual: number[], expected: number[], precision = 6) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, precision));
}

describe('hierarchy operations', () => {
  it('groups objects without changing their world transforms', () => {
    const initial = created();
    const before = ['a', 'b'].map(id => worldMatrixFor(initial, id).elements);
    const grouped = apply(initial, groupOperations(initial, ['a', 'b'], 'group', 'Group'));
    expect(grouped.objects.find(object => object.id === 'group')?.shape.kind).toBe('empty');
    expect(grouped.objects.filter(object => object.parentId === 'group').map(object => object.id)).toEqual(['a', 'b']);
    ['a', 'b'].forEach((id, index) => expectMatrixClose(worldMatrixFor(grouped, id).elements, before[index]!));
  });

  it('ungroups nested groups while preserving every released child world transform', () => {
    const initial = created();
    const first = apply(initial, groupOperations(initial, ['a', 'b'], 'inner', 'Inner'));
    const nested = apply(first, groupOperations(first, ['inner', 'c'], 'outer', 'Outer'));
    const beforeInner = worldMatrixFor(nested, 'inner').elements;
    const beforeC = worldMatrixFor(nested, 'c').elements;
    const outerRemoved = apply(nested, ungroupOperations(nested, 'outer'));
    expect(outerRemoved.objects.some(object => object.id === 'outer')).toBe(false);
    expectMatrixClose(worldMatrixFor(outerRemoved, 'inner').elements, beforeInner);
    expectMatrixClose(worldMatrixFor(outerRemoved, 'c').elements, beforeC);
    const beforeA = worldMatrixFor(outerRemoved, 'a').elements;
    const beforeB = worldMatrixFor(outerRemoved, 'b').elements;
    const allRemoved = apply(outerRemoved, ungroupOperations(outerRemoved, 'inner'));
    expectMatrixClose(worldMatrixFor(allRemoved, 'a').elements, beforeA);
    expectMatrixClose(worldMatrixFor(allRemoved, 'b').elements, beforeB);
    expect(allRemoved.objects.every(object => !object.parentId)).toBe(true);
  });

  it('reparents through a rotated uniformly scaled group without visible movement', () => {
    let scene = created();
    scene = apply(scene, [
      { type: 'create_empty', id: 'parent', name: 'Parent', positionMm: [30, 10, -12] },
      { type: 'rotate_object', targetId: 'parent', rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
      { type: 'set_object_scale', targetId: 'parent', scale: [2, 2, 2] },
    ]);
    const before = worldMatrixFor(scene, 'a').elements;
    const parented = apply(scene, reparentOperations(scene, 'a', 'parent'));
    expectMatrixClose(worldMatrixFor(parented, 'a').elements, before);
    const unparented = apply(parented, reparentOperations(parented, 'a', null));
    expectMatrixClose(worldMatrixFor(unparented, 'a').elements, before);
  });

  it('duplicates an entire group subtree with remapped parent references', () => {
    const initial = created();
    const grouped = apply(initial, groupOperations(initial, ['a', 'b'], 'group', 'Group'));
    let number = 0;
    const duplicate = duplicateSubtreeOperations(grouped, 'group', () => `copy-${number++}`);
    const result = apply(grouped, duplicate.operations);
    const copiedGroup = result.objects.find(object => object.id === duplicate.rootId)!;
    const copiedChildren = result.objects.filter(object => object.parentId === copiedGroup.id);
    expect(copiedGroup.shape.kind).toBe('empty');
    expect(copiedChildren).toHaveLength(2);
    expect(copiedChildren.every(object => object.id.startsWith('copy-'))).toBe(true);
    expect(result.objects.filter(object => object.parentId === 'group')).toHaveLength(2);
  });

  it('deletes descendants with a group and handles empty groups explicitly', () => {
    const initial = created();
    const grouped = apply(initial, groupOperations(initial, ['a', 'b'], 'group', 'Group'));
    const deleted = apply(grouped, deleteSubtreeOperations(grouped, ['group']));
    expect(deleted.objects.map(object => object.id)).toEqual(['c']);
    const withEmpty = apply(deleted, [{ type: 'create_empty', id: 'empty', name: 'Empty', positionMm: [0, 0, 0] }]);
    const withoutEmpty = apply(withEmpty, ungroupOperations(withEmpty, 'empty'));
    expect(withoutEmpty.objects.some(object => object.id === 'empty')).toBe(false);
  });

  it('rejects cycles atomically', () => {
    let scene = created();
    scene = apply(scene, [
      { type: 'create_empty', id: 'one', name: 'One', positionMm: [0, 0, 0] },
      { type: 'create_empty', id: 'two', name: 'Two', positionMm: [0, 0, 0] },
      { type: 'reparent_object', targetId: 'two', parentId: 'one' },
    ]);
    const before = JSON.stringify(scene);
    expect(() => apply(scene, [{ type: 'reparent_object', targetId: 'one', parentId: 'two' }])).toThrow('cycles');
    expect(JSON.stringify(scene)).toBe(before);
  });
});
