import { describe, expect, it } from 'vitest';
import {
  applyTransaction, emptyScene, faceNormal, inspectMeshTopology, parseSceneJson, SceneDocumentSchema,
  stretchBoxFace, type BoxFace, type SceneDocument, type SceneObject, type Vec3,
} from './index';

const box: SceneObject = {
  id: 'box-1', name: 'Box', shape: { kind: 'box', sizeMm: [20, 30, 40] },
  positionMm: [10, 20, 30], rotation: [0, 0, 0, 1], scale: [1, 1, 1], material: { colorHex: '#abcdef', opacity: 0.5 },
};
const scene = (objects: SceneObject[] = [box]): SceneDocument => ({ schemaVersion: 2, revision: 0, objects });
const tx = (document: SceneDocument, operations: Parameters<typeof applyTransaction>[1]['operations']) =>
  applyTransaction(document, { expectedRevision: document.revision, source: 'numeric', operations });

describe('scene executor', () => {
  it('creates all primitives with stable IDs and one revision per transaction', () => {
    const result = tx(emptyScene(), [
      { type: 'create_box', id: 'a', name: 'A', sizeMm: [10, 20, 30], positionMm: [0, 0, 0] },
      { type: 'create_cylinder', id: 'b', name: 'B', radiusMm: 5, heightMm: 20, positionMm: [1, 2, 3] },
      { type: 'create_sphere', id: 'c', name: 'C', radiusMm: 8, positionMm: [3, 2, 1] },
    ]);
    expect(result.revision).toBe(1);
    expect(result.objects.map(o => o.shape.kind)).toEqual(['box', 'cylinder', 'sphere']);
    expect(emptyScene().objects).toEqual([]);
  });

  it('translates and rotates while keeping the input immutable', () => {
    const q: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    const input = scene();
    const result = tx(input, [
      { type: 'translate_object', targetId: 'box-1', deltaMm: [5, -2, 7] },
      { type: 'rotate_object', targetId: 'box-1', rotation: q },
    ]);
    expect(result.objects[0]?.positionMm).toEqual([15, 18, 37]);
    expect(result.objects[0]?.rotation).toEqual(q);
    expect(input.objects[0]).toEqual(box);
  });

  it('changes primitive dimensions and names through validated operations', () => {
    const result = tx(scene(), [
      { type: 'set_box_dimensions', targetId: 'box-1', sizeMm: [12, 13, 14] },
      { type: 'rename_object', targetId: 'box-1', name: 'Plate' },
      { type: 'set_material_color', targetId: 'box-1', colorHex: '#123456' },
    ]);
    expect(result.objects[0]?.shape).toEqual({ kind: 'box', sizeMm: [12, 13, 14] });
    expect(result.objects[0]?.name).toBe('Plate');
    expect(result.objects[0]?.material?.colorHex).toBe('#123456');
  });

  it('duplicates a stable object and edits cylinder and sphere dimensions', () => {
    const created = tx(emptyScene(), [
      { type: 'create_cylinder', id: 'c', name: 'Column', radiusMm: 5, heightMm: 20, positionMm: [0, 0, 0] },
      { type: 'create_sphere', id: 's', name: 'Ball', radiusMm: 8, positionMm: [0, 0, 0] },
    ]);
    const result = tx(created, [
      { type: 'duplicate_object', targetId: 'c', id: 'c2', name: 'Column copy' },
      { type: 'set_cylinder_dimensions', targetId: 'c', radiusMm: 7, heightMm: 25 },
      { type: 'set_sphere_radius', targetId: 's', radiusMm: 9 },
    ]);
    expect(result.objects.map(o => o.id)).toEqual(['c', 's', 'c2']);
    expect(result.objects[0]?.shape).toEqual({ kind: 'cylinder', radiusMm: 7, heightMm: 25 });
    expect(result.objects[1]?.shape).toEqual({ kind: 'sphere', radiiMm: [9, 9, 9] });
    expect(result.objects[2]?.positionMm).toEqual([16, 0, 16]);
  });

  it('stores independent ellipsoid radii separately from object transform scale', () => {
    const created = tx(emptyScene(), [{ type: 'create_ellipsoid', id: 'e', name: 'Ellipsoid', radiiMm: [8, 12, 16], positionMm: [0, 0, 0] }]);
    const result = tx(created, [
      { type: 'set_ellipsoid_radii', targetId: 'e', radiiMm: [9, 13, 17] },
      { type: 'set_object_scale', targetId: 'e', scale: [2, 0.5, 1.25] },
    ]);
    expect(result.objects[0]?.shape).toEqual({ kind: 'sphere', radiiMm: [9, 13, 17] });
    expect(result.objects[0]?.scale).toEqual([2, 0.5, 1.25]);
  });

  it('stretches all six faces while anchoring their opposites', () => {
    const faces: BoxFace[] = ['+x', '-x', '+y', '-y', '+z', '-z'];
    for (const face of faces) {
      const result = stretchBoxFace(box, face, 6);
      if (result.shape.kind !== 'box') throw new Error('Expected box');
      const axis = face[1] === 'x' ? 0 : face[1] === 'y' ? 1 : 2;
      expect(result.shape.sizeMm[axis]).toBe(box.shape.kind === 'box' ? box.shape.sizeMm[axis]! + 6 : 0);
      const normal = faceNormal(face, box.rotation);
      const before = box.positionMm.reduce((sum, value, i) => sum + value * normal[i]!, 0) - (box.shape.kind === 'box' ? box.shape.sizeMm[axis]! / 2 : 0);
      const after = result.positionMm.reduce((sum, value, i) => sum + value * normal[i]!, 0) - result.shape.sizeMm[axis]! / 2;
      expect(after).toBeCloseTo(before, 9);
    }
  });

  it('anchors the opposite plane on a rotated box', () => {
    const rotated: SceneObject = { ...box, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] };
    for (const face of ['+x', '-x', '+y', '-y', '+z', '-z'] as BoxFace[]) {
      const stretched = stretchBoxFace(rotated, face, -5);
      const normal = faceNormal(face, rotated.rotation);
      const axis = face[1] === 'x' ? 0 : face[1] === 'y' ? 1 : 2;
      const oldSize = rotated.shape.kind === 'box' ? rotated.shape.sizeMm[axis]! : 0;
      const newSize = stretched.shape.kind === 'box' ? stretched.shape.sizeMm[axis]! : 0;
      const oldPlane = rotated.positionMm.reduce((sum, value, i) => sum + value * normal[i]!, 0) - oldSize / 2;
      const newPlane = stretched.positionMm.reduce((sum, value, i) => sum + value * normal[i]!, 0) - newSize / 2;
      expect(newPlane).toBeCloseTo(oldPlane, 8);
    }
  });

  it('anchors the opposite face when object scale is non-uniform', () => {
    const scaled: SceneObject = { ...box, scale: [2, 0.5, 1.5], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] };
    const stretched = stretchBoxFace(scaled, '+x', 7);
    if (scaled.shape.kind !== 'box' || stretched.shape.kind !== 'box') throw new Error('Expected boxes');
    const normal = faceNormal('+x', scaled.rotation);
    const oldPlane = scaled.positionMm.reduce((sum, value, index) => sum + value * normal[index]!, 0) - scaled.shape.sizeMm[0] * scaled.scale[0] / 2;
    const newPlane = stretched.positionMm.reduce((sum, value, index) => sum + value * normal[index]!, 0) - stretched.shape.sizeMm[0] * stretched.scale[0] / 2;
    expect(newPlane).toBeCloseTo(oldPlane, 8);
  });

  it('rejects invalid edits atomically, including stale revisions', () => {
    const input = scene();
    expect(() => tx(input, [
      { type: 'translate_object', targetId: 'box-1', deltaMm: [2, 0, 0] },
      { type: 'delete_object', targetId: 'missing' },
    ])).toThrow();
    expect(input.objects[0]?.positionMm).toEqual([10, 20, 30]);
    expect(() => tx(input, [{ type: 'resize_box_face', targetId: 'box-1', face: '+x', deltaMm: -20 }])).toThrow();
    expect(() => applyTransaction(input, { expectedRevision: 9, source: 'ai', operations: [{ type: 'delete_object', targetId: 'box-1' }] })).toThrow('Scene changed');
    expect(() => tx(input, [{ type: 'set_box_dimensions', targetId: 'box-1', sizeMm: [Infinity, 1, 1] }])).toThrow();
    expect(() => tx(input, [{ type: 'set_box_dimensions', targetId: 'box-1', sizeMm: [0, 1, 1] }])).toThrow();
  });

  it('validates native JSON and rejects duplicate IDs and unknown fields', () => {
    expect(parseSceneJson(JSON.stringify(scene()))).toEqual(scene());
    expect(() => parseSceneJson('{')).toThrow();
    expect(() => SceneDocumentSchema.parse({ ...scene(), objects: [box, box] })).toThrow();
    expect(() => SceneDocumentSchema.parse({ ...scene(), unexpected: true })).toThrow();
  });

  it('migrates version 1 sphere, material, and Empty scale fields to version 2', () => {
    const migrated = parseSceneJson(JSON.stringify({ schemaVersion: 1, revision: 4, objects: [
      { id: 's', name: 'Sphere', shape: { kind: 'sphere', radiusMm: 7 }, positionMm: [1, 2, 3], rotation: [0, 0, 0, 1], material: { colorHex: '#abcdef' } },
      { id: 'g', name: 'Group', shape: { kind: 'empty' }, positionMm: [0, 0, 0], rotation: [0, 0, 0, 1], scaleMm: [2, 2, 2] },
    ] }));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.objects[0]?.shape).toEqual({ kind: 'sphere', radiiMm: [7, 7, 7] });
    expect(migrated.objects[0]?.material?.opacity).toBe(0.5);
    expect(migrated.objects[1]?.scale).toEqual([2, 2, 2]);
  });

  it('rejects invalid mesh indices and degenerate triangles', () => {
    const base = { id: 'm', name: 'Mesh', positionMm: [0, 0, 0] as Vec3, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as Vec3, material: { colorHex: '#abcdef', opacity: 0.5 } };
    const vertices: Vec3[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
    expect(() => SceneDocumentSchema.parse({ schemaVersion: 2, revision: 0, objects: [{ ...base, shape: { kind: 'mesh', vertices, triangles: [[0, 1, 1], [0, 1, 2], [0, 3, 1], [0, 2, 3]] } }] })).toThrow('distinct');
    expect(() => SceneDocumentSchema.parse({ schemaVersion: 2, revision: 0, objects: [{ ...base, shape: { kind: 'mesh', vertices, triangles: [[0, 1, 4], [0, 1, 2], [0, 3, 1], [0, 2, 3]] } }] })).toThrow('distinct');
  });

  it('reports closed, boundary, and inconsistent-winding topology', () => {
    const closed = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]] as [number, number, number][];
    expect(inspectMeshTopology(closed).closed).toBe(true);
    expect(inspectMeshTopology(closed.slice(0, 3)).boundaryEdges).toBeGreaterThan(0);
    expect(inspectMeshTopology([[0, 2, 1], [0, 3, 1], [1, 2, 3], [2, 0, 3]]).inconsistentWindingEdges).toBeGreaterThan(0);
  });
});
