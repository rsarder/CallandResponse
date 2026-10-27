import { beforeEach, describe, expect, it } from 'vitest';
import { emptyScene } from '@call-and-response/shared';
import { groupOperations, ungroupOperations } from '../geometry/hierarchy';
import { useEditor } from './editor';

beforeEach(() => useEditor.setState({
  scene: emptyScene(), past: [], future: [], selectedId: null, selectedIds: [], selectedFace: null,
  mode: 'object', tool: 'select', axisLock: null, preview: null, booleanPreview: null, transformHandleHovered: false, transformDragging: false, error: null,
}));

describe('editor history and preview', () => {
  it('records one history step per transaction and increments revisions through undo/redo', () => {
    const editor = useEditor.getState();
    editor.transact([{ type: 'create_box', id: 'b', name: 'Box', sizeMm: [20, 20, 20], positionMm: [0, 0, 0] }], 'mouse');
    useEditor.getState().transact([{ type: 'translate_object', targetId: 'b', deltaMm: [5, 0, 0] }], 'mouse');
    expect(useEditor.getState().past).toHaveLength(2);
    expect(useEditor.getState().scene.revision).toBe(2);
    useEditor.getState().undo();
    expect(useEditor.getState().scene.objects[0]?.positionMm).toEqual([0, 0, 0]);
    expect(useEditor.getState().scene.revision).toBe(3);
    useEditor.getState().redo();
    expect(useEditor.getState().scene.objects[0]?.positionMm).toEqual([5, 0, 0]);
    expect(useEditor.getState().scene.revision).toBe(4);
  });

  it('keeps preview out of the canonical scene and clears it on cancel', () => {
    useEditor.getState().transact([{ type: 'create_box', id: 'b', name: 'Box', sizeMm: [20, 20, 20], positionMm: [0, 0, 0] }], 'mouse');
    useEditor.getState().previewOperation({ type: 'resize_box_face', targetId: 'b', face: '+x', deltaMm: 5 });
    expect(useEditor.getState().preview?.shape).toEqual({ kind: 'box', sizeMm: [25, 20, 20] });
    expect(useEditor.getState().scene.objects[0]?.shape).toEqual({ kind: 'box', sizeMm: [20, 20, 20] });
    const count = useEditor.getState().past.length;
    useEditor.getState().cancel();
    expect(useEditor.getState().preview).toBeNull();
    expect(useEditor.getState().past).toHaveLength(count);
  });

  it('rejects a bad project without changing the current scene', () => {
    useEditor.getState().transact([{ type: 'create_sphere', id: 's', name: 'Sphere', radiusMm: 10, positionMm: [0, 0, 0] }], 'mouse');
    const before = useEditor.getState().scene;
    expect(useEditor.getState().load({ schemaVersion: 1, revision: 0, objects: [{ id: 'broken' }] })).toBe(false);
    expect(useEditor.getState().scene).toBe(before);
  });

  it('keeps a failed multi-operation transaction atomic and out of history', () => {
    useEditor.getState().transact([{ type: 'create_box', id: 'b', name: 'Box', sizeMm: [20, 20, 20], positionMm: [0, 0, 0] }], 'mouse');
    const before = useEditor.getState().scene;
    const historyLength = useEditor.getState().past.length;
    const succeeded = useEditor.getState().transact([
      { type: 'translate_object', targetId: 'b', deltaMm: [10, 0, 0] },
      { type: 'create_mesh', id: 'bad', name: 'Bad', positionMm: [0, 0, 0], vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], triangles: [[0, 0, 2]] },
    ], 'mouse');
    expect(succeeded).toBe(false);
    expect(useEditor.getState().scene).toBe(before);
    expect(useEditor.getState().scene.objects[0]?.positionMm).toEqual([0, 0, 0]);
    expect(useEditor.getState().past).toHaveLength(historyLength);
  });

  it('undoes and redoes grouping and ungrouping as single atomic edits', () => {
    useEditor.getState().transact([
      { type: 'create_box', id: 'a', name: 'A', sizeMm: [20, 20, 20], positionMm: [-10, 0, 0] },
      { type: 'create_sphere', id: 'b', name: 'B', radiusMm: 10, positionMm: [10, 0, 0] },
    ], 'mouse');
    const initial = useEditor.getState().scene;
    expect(useEditor.getState().transact(groupOperations(initial, ['a', 'b'], 'g', 'Group'), 'mouse')).toBe(true);
    expect(useEditor.getState().scene.objects.filter(object => object.parentId === 'g')).toHaveLength(2);
    const grouped = useEditor.getState().scene;
    expect(useEditor.getState().transact(ungroupOperations(grouped, 'g'), 'mouse')).toBe(true);
    expect(useEditor.getState().scene.objects.every(object => !object.parentId)).toBe(true);
    useEditor.getState().undo();
    expect(useEditor.getState().scene.objects.filter(object => object.parentId === 'g')).toHaveLength(2);
    useEditor.getState().redo();
    expect(useEditor.getState().scene.objects.some(object => object.id === 'g')).toBe(false);
  });

  it('migrates legacy spheres and object scale during project load', () => {
    expect(useEditor.getState().load({
      schemaVersion: 1, revision: 7, objects: [{
        id: 'legacy', name: 'Legacy sphere', positionMm: [1, 2, 3], rotation: [0, 0, 0, 1], scaleMm: [2, 3, 4],
        shape: { kind: 'sphere', radiusMm: 12 }, material: { colorHex: '#76b7ff' },
      }],
    })).toBe(true);
    const loaded = useEditor.getState().scene.objects[0]!;
    expect(loaded.scale).toEqual([2, 3, 4]);
    expect(loaded.shape).toEqual({ kind: 'sphere', radiiMm: [12, 12, 12] });
    expect(useEditor.getState().scene.schemaVersion).toBe(2);
  });

  it('clears transform-handle ownership when tools, modes, or cancel state change', () => {
    useEditor.getState().setTransformHandleHovered(true);
    useEditor.getState().setTransformDragging(true);
    useEditor.getState().setTool('rotate');
    expect(useEditor.getState()).toMatchObject({ transformHandleHovered: false, transformDragging: false });
    useEditor.getState().setTransformHandleHovered(true);
    useEditor.getState().setTransformDragging(true);
    useEditor.getState().setMode('shape');
    expect(useEditor.getState()).toMatchObject({ transformHandleHovered: false, transformDragging: false });
    useEditor.getState().setTransformHandleHovered(true);
    useEditor.getState().setTransformDragging(true);
    useEditor.getState().cancel();
    expect(useEditor.getState()).toMatchObject({ transformHandleHovered: false, transformDragging: false });
  });
});
