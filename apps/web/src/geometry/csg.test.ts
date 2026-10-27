import { describe, expect, it } from 'vitest';
import { inspectMeshTopology, SceneObjectSchema, type SceneDocument, type SceneObject, type Vec3 } from '@call-and-response/shared';
import { analyzeIntersections, booleanMesh, normalizeMeshData, type BooleanKind, type MeshResult } from './csg';
import { worldMatrixFor } from './transforms';

const material = { colorHex: '#76b7ff', opacity: 0.5 };
const identity: [number, number, number, number] = [0, 0, 0, 1];
const object = (id: string, shape: SceneObject['shape'], positionMm: Vec3, overrides: Partial<SceneObject> = {}): SceneObject => SceneObjectSchema.parse({
  id, name: id, shape, positionMm, rotation: identity, scale: [1, 1, 1], material, ...overrides,
});
const document = (...objects: SceneObject[]): SceneDocument => ({ schemaVersion: 2, revision: 0, objects });

const cubeVertices: Vec3[] = [[-10, -10, -10], [10, -10, -10], [10, 10, -10], [-10, 10, -10], [-10, -10, 10], [10, -10, 10], [10, 10, 10], [-10, 10, 10]];
const cubeTriangles: [number, number, number][] = [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2]];
const meshShape: SceneObject['shape'] = { kind: 'mesh', vertices: cubeVertices, triangles: cubeTriangles };

function expectValid(result: MeshResult) {
  expect(result.vertices.length).toBeGreaterThanOrEqual(4);
  expect(result.triangles.length).toBeGreaterThanOrEqual(4);
  expect(inspectMeshTopology(result.triangles).closed).toBe(true);
  expect(result.triangles.every(face => new Set(face).size === 3 && face.every(index => index < result.vertices.length))).toBe(true);
  expect(result.vertices.length).toBeLessThan(result.triangles.length * 3);
  expect(() => SceneObjectSchema.parse({ id: 'result', name: 'Result', shape: { kind: 'mesh', vertices: result.vertices, triangles: result.triangles }, positionMm: result.positionMm, rotation: identity, scale: [1, 1, 1], material })).not.toThrow();
}

describe('mesh normalization', () => {
  it('welds duplicate coordinates, removes degenerate faces, and preserves a closed indexed solid', () => {
    const vertices = [...cubeVertices, cubeVertices[0]!, cubeVertices[1]!];
    const triangles = [...cubeTriangles, [8, 9, 9] as [number, number, number]];
    const result = normalizeMeshData({ vertices, triangles }, { requireClosed: true });
    expect(result.vertices).toHaveLength(8);
    expect(result.triangles).toHaveLength(12);
    expect(result.removedDegenerateTriangles).toBe(1);
    expect(result.weldedVertices).toBe(2);
  });

  it('rejects open or non-manifold Boolean inputs rather than weakening validation', () => {
    expect(() => normalizeMeshData({ vertices: cubeVertices, triangles: cubeTriangles.slice(0, -1) }, { requireClosed: true })).toThrow('watertight');
  });
});

describe('Boolean CSG', () => {
  const shapes: Record<string, SceneObject['shape']> = {
    box: { kind: 'box', sizeMm: [30, 30, 30] },
    cylinder: { kind: 'cylinder', radiusMm: 18, heightMm: 30 },
    sphere: { kind: 'sphere', radiiMm: [18, 15, 12] },
  };
  const combinations = [['box', 'box'], ['box', 'cylinder'], ['box', 'sphere'], ['cylinder', 'cylinder'], ['cylinder', 'sphere'], ['sphere', 'sphere']] as const;
  for (const [first, second] of combinations) for (const kind of ['union', 'subtract', 'intersect'] as BooleanKind[]) {
    it(`${kind} supports transformed ${first} and ${second}`, () => {
      const scene = document(
        object('a', shapes[first]!, [0, 0, 0], { rotation: [0, Math.sin(Math.PI / 16), 0, Math.cos(Math.PI / 16)], scale: [1.1, 0.9, 1.05] }),
        object('b', shapes[second]!, [8, 2, 0], { rotation: [Math.sin(Math.PI / 20), 0, 0, Math.cos(Math.PI / 20)], scale: [0.9, 1.15, 0.95] }),
      );
      expectValid(booleanMesh(scene, 'a', 'b', kind));
    });
  }

  it('supports rotated and non-uniformly scaled operands', () => {
    const rotation: [number, number, number, number] = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
    const scene = document(
      object('a', shapes.cylinder!, [3, 0, -2], { rotation, scale: [1.4, 0.8, 0.65] }),
      object('b', shapes.sphere!, [10, 1, 1], { scale: [0.75, 1.2, 1.1] }),
    );
    expectValid(booleanMesh(scene, 'a', 'b', 'union'));
  });

  it('supports primitive/custom, custom/custom, and chained results', () => {
    const firstScene = document(object('mesh', meshShape, [0, 0, 0]), object('sphere', shapes.sphere!, [8, 0, 0]));
    const first = booleanMesh(firstScene, 'mesh', 'sphere', 'union'); expectValid(first);
    const resultObject = object('result', { kind: 'mesh', vertices: first.vertices, triangles: first.triangles }, first.positionMm);
    const custom = object('custom', meshShape, [14, 1, 0], { rotation: [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)] });
    const secondScene = document(resultObject, custom);
    const chained = booleanMesh(secondScene, 'result', 'custom', 'subtract'); expectValid(chained);
    expectValid(booleanMesh(document(object('m1', meshShape, [0, 0, 0]), object('m2', meshShape, [6, 0, 0])), 'm1', 'm2', 'union'));
  });

  it('retains a shared group parent and stores result geometry around a local bounds-center pivot', () => {
    const group = object('group', { kind: 'empty' }, [30, 10, -5], { material: undefined, scale: [2, 2, 2], rotation: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)] });
    const first = object('a', shapes.box!, [-4, 0, 0], { parentId: group.id });
    const second = object('b', shapes.cylinder!, [4, 0, 0], { parentId: group.id });
    const scene = document(group, first, second);
    const result = booleanMesh(scene, 'a', 'b', 'union'); expectValid(result);
    expect(result.parentId).toBe(group.id);
    expect(result.bounds.center.every(value => Math.abs(value) < 1e-7)).toBe(true);
    const resultObject = object('result', { kind: 'mesh', vertices: result.vertices, triangles: result.triangles }, result.positionMm, { parentId: result.parentId });
    const pivot = worldMatrixFor(document(group, resultObject), resultObject).elements.slice(12, 15);
    expect(pivot.every(Number.isFinite)).toBe(true);
  });
});

describe('overlap analysis', () => {
  it('distinguishes broad-phase candidates from verified solid intersections', () => {
    const overlapping = document(
      object('a', { kind: 'box', sizeMm: [20, 20, 20] }, [0, 0, 0]),
      object('b', { kind: 'sphere', radiiMm: [8, 8, 8] }, [7, 0, 0]),
      object('far', { kind: 'box', sizeMm: [5, 5, 5] }, [100, 0, 0]),
    );
    const result = analyzeIntersections(overlapping);
    expect(result.candidatePairs).toEqual([['a', 'b']]);
    expect(result.verifiedPairs).toEqual([['a', 'b']]);
    expect(result.errors).toEqual([]);
  });

  it('bounds exact work for dense scenes and reports the limitation', () => {
    const objects = Array.from({ length: 8 }, (_, index) => object(
      `box-${index}`, { kind: 'box', sizeMm: [20, 20, 20] }, [index * 0.25, 0, 0],
    ));
    const result = analyzeIntersections(document(...objects));
    expect(result.candidatePairs).toHaveLength(28);
    expect(result.verifiedPairs).toHaveLength(24);
    expect(result.limited).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
