import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { computeMeshVolume } from 'three-bvh-csg';
import type { SceneDocument, SceneObject, Vec3 } from '@call-and-response/shared';

export type BooleanKind = 'union' | 'subtract';
export interface MeshResult { vertices: Vec3[]; triangles: [number, number, number][] }

export function worldMatrixFor(scene: SceneDocument, object: SceneObject): Matrix4 {
  const chain: SceneObject[] = [];
  let current: SceneObject | undefined = object;
  while (current) {
    chain.unshift(current);
    current = current.parentId ? scene.objects.find(candidate => candidate.id === current!.parentId) : undefined;
  }
  const result = new Matrix4();
  for (const item of chain) {
    const local = new Matrix4().compose(new Vector3(...item.positionMm), new Quaternion(...item.rotation), new Vector3(...(item.scaleMm ?? [1, 1, 1])));
    result.multiply(local);
  }
  return result;
}

function geometryFor(scene: SceneDocument, object: SceneObject): BufferGeometry {
  const shape = object.shape;
  let geometry: BufferGeometry;
  if (shape.kind === 'box') geometry = new BoxGeometry(...shape.sizeMm);
  else if (shape.kind === 'sphere') geometry = new SphereGeometry(shape.radiusMm, 32, 20);
  else if (shape.kind === 'cylinder') geometry = new CylinderGeometry(shape.radiusMm, shape.radiusMm, shape.heightMm, 32);
  else if (shape.kind === 'mesh') {
    geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(shape.vertices.flat(), 3));
    geometry.setIndex(shape.triangles.flat());
    geometry.computeVertexNormals();
  } else throw new Error('Empty objects have no solid geometry');
  geometry.applyMatrix4(worldMatrixFor(scene, object));
  geometry.computeVertexNormals();
  return geometry;
}

function brush(scene: SceneDocument, object: SceneObject): Brush {
  const result = new Brush(geometryFor(scene, object), new MeshStandardMaterial());
  result.updateMatrixWorld(true);
  return result;
}

function toMeshResult(geometry: BufferGeometry): MeshResult {
  const attribute = geometry.getAttribute('position');
  const vertices: Vec3[] = [];
  for (let i = 0; i < attribute.count; i++) vertices.push([attribute.getX(i), attribute.getY(i), attribute.getZ(i)]);
  const index = geometry.getIndex();
  const triangles: [number, number, number][] = [];
  const count = index ? index.count : attribute.count;
  for (let i = 0; i + 2 < count; i += 3) triangles.push(index
    ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    : [i, i + 1, i + 2]);
  if (vertices.length < 4 || triangles.length < 4) throw new Error('The boolean result has no closed solid volume');
  return { vertices, triangles };
}

export function booleanMesh(scene: SceneDocument, targetId: string, cutterId: string, kind: BooleanKind): MeshResult {
  const target = scene.objects.find(object => object.id === targetId);
  const cutter = scene.objects.find(object => object.id === cutterId);
  if (!target || !cutter) throw new Error('Select two existing objects for a boolean operation');
  if (target.shape.kind === 'empty' || cutter.shape.kind === 'empty') throw new Error('Empty objects cannot be used in boolean operations');
  const a = brush(scene, target); const b = brush(scene, cutter);
  const evaluator = new Evaluator(); evaluator.useGroups = false;
  try {
    const result = evaluator.evaluate(a, b, kind === 'union' ? ADDITION : SUBTRACTION);
    const mesh = toMeshResult(result.geometry);
    result.geometry.dispose();
    return mesh;
  } finally {
    a.geometry.dispose(); b.geometry.dispose();
  }
}

export function intersectingPairs(scene: SceneDocument): [string, string][] {
  const solids = scene.objects.filter(object => object.shape.kind !== 'empty');
  const found: [string, string][] = [];
  const geometries = solids.map(object => {
    const geometry = geometryFor(scene, object); geometry.computeBoundingBox();
    return geometry;
  });
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    if (!geometries[i]!.boundingBox?.intersectsBox(geometries[j]!.boundingBox!)) continue;
    const a = new Brush(geometries[i]!.clone(), new MeshStandardMaterial());
    const b = new Brush(geometries[j]!.clone(), new MeshStandardMaterial());
    a.updateMatrixWorld(true); b.updateMatrixWorld(true);
    const evaluator = new Evaluator(); evaluator.useGroups = false;
    try {
      const overlap = evaluator.evaluate(a, b, INTERSECTION);
      if (Math.abs(Number(computeMeshVolume(overlap.geometry))) > 1e-5) found.push([solids[i]!.id, solids[j]!.id]);
      overlap.geometry.dispose();
    } catch {
      // Non-manifold or invalid custom meshes are reported by the geometry inspector.
    } finally {
      a.geometry.dispose(); b.geometry.dispose();
    }
  }
  geometries.forEach(geometry => geometry.dispose());
  return found;
}

export function previewGeometry(scene: SceneDocument, targetId: string, cutterId: string, kind: BooleanKind): BufferGeometry {
  const target = scene.objects.find(object => object.id === targetId);
  const cutter = scene.objects.find(object => object.id === cutterId);
  if (!target || !cutter) throw new Error('Select two existing objects for a boolean operation');
  const a = brush(scene, target); const b = brush(scene, cutter);
  const evaluator = new Evaluator(); evaluator.useGroups = false;
  const result = evaluator.evaluate(a, b, kind === 'union' ? ADDITION : SUBTRACTION);
  a.geometry.dispose(); b.geometry.dispose();
  return result.geometry;
}
