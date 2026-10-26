import { beforeEach, describe, expect, it } from 'vitest';
import { emptyScene } from '@call-and-response/shared';
import { useEditor } from './editor';

beforeEach(() => useEditor.setState({ scene: emptyScene(), past: [], future: [], selectedId: null, preview: null, error: null }));

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
});
