import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4,
  SphereGeometry, Vector3,
} from 'three';
import Module from 'manifold-3d';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';
import {
  inspectMeshTopology, meshBounds, type Bounds3, type SceneDocument, type SceneObject, type Vec3,
} from '@call-and-response/shared';
import { parentWorldMatrixFor, worldMatrixFor } from './transforms';

export type BooleanKind = 'union' | 'subtract' | 'intersect';
export interface MeshData { vertices: Vec3[]; triangles: [number, number, number][] }
export interface MeshResult extends MeshData {
  positionMm: Vec3;
  parentId?: string;
  bounds: Bounds3;
  removedDegenerateTriangles: number;
  weldedVertices: number;
}
export interface IntersectionAnalysis {
  verifiedPairs: [string, string][];
  candidatePairs: [string, string][];
  errors: string[];
  limited: boolean;
}

const WELD_TOLERANCE_MM = 1e-5;
// Cross-product length squared. Keep valid CSG sliver triangles: removing one
// from an otherwise manifold output opens the solid. Exact/near-machine-zero
// collinearity is still rejected, while input welding handles collapsed edges.
const AREA_EPSILON_SQUARED = 1e-20;
const MAX_EXACT_OVERLAP_PAIRS = 24;
const kernel = typeof window === 'undefined' ? await Module() : await Module({ locateFile: () => manifoldWasmUrl });
kernel.setup();

function areaSquared(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ac = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  return ab.cross(ac).lengthSq();
}

function signedVolume(data: MeshData): number {
  let volume = 0;
  for (const [ia, ib, ic] of data.triangles) {
    const a = data.vertices[ia]!; const b = data.vertices[ib]!; const c = data.vertices[ic]!;
    volume += a[0] * (b[1] * c[2] - b[2] * c[1])
      - a[1] * (b[0] * c[2] - b[2] * c[0])
      + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return volume / 6;
}

function boundaryVertexIndices(triangles: readonly [number, number, number][]): Set<number> {
  const counts = new Map<string, { count: number; a: number; b: number }>();
  for (const [a, b, c] of triangles) for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
    const low = Math.min(from, to); const high = Math.max(from, to); const key = `${low}:${high}`;
    const record = counts.get(key) ?? { count: 0, a: low, b: high }; record.count += 1; counts.set(key, record);
  }
  const result = new Set<number>();
  for (const edge of counts.values()) if (edge.count === 1) { result.add(edge.a); result.add(edge.b); }
  return result;
}

function edgeSplitPoints(vertices: readonly Vec3[], candidates: ReadonlySet<number>, from: number, to: number, tolerance: number): number[] {
  const a = new Vector3(...vertices[from]!); const b = new Vector3(...vertices[to]!); const edge = b.clone().sub(a);
  const lengthSquared = edge.lengthSq(); if (lengthSquared <= tolerance * tolerance) return [];
  const toleranceSquared = tolerance * tolerance;
  const matches: { index: number; t: number }[] = [];
  for (const index of candidates) {
    if (index === from || index === to) continue;
    const point = new Vector3(...vertices[index]!); const t = point.clone().sub(a).dot(edge) / lengthSquared;
    if (t <= 1e-7 || t >= 1 - 1e-7) continue;
    const closest = a.clone().addScaledVector(edge, t);
    if (closest.distanceToSquared(point) <= toleranceSquared) matches.push({ index, t });
  }
  matches.sort((first, second) => first.t - second.t || first.index - second.index);
  return matches.map(match => match.index);
}

/** Makes CSG T-junctions conforming by splitting long boundary edges at existing boundary vertices. */
function repairTJunctions(data: MeshData, tolerance: number): MeshData {
  let triangles = data.triangles;
  for (let pass = 0; pass < 8; pass++) {
    const candidates = boundaryVertexIndices(triangles);
    if (!candidates.size) break;
    let changed = false;
    const next: [number, number, number][] = [];
    for (const [a, b, c] of triangles) {
      const edges = [[a, b, c], [b, c, a], [c, a, b]] as const;
      let replacement: [number, number, number][] | undefined;
      for (const [from, to, opposite] of edges) {
        const splits = edgeSplitPoints(data.vertices, candidates, from, to, tolerance);
        if (!splits.length) continue;
        const chain = [from, ...splits, to];
        replacement = chain.slice(0, -1).map((value, index) => [value, chain[index + 1]!, opposite]);
        changed = true; break;
      }
      next.push(...(replacement ?? [[a, b, c]]));
    }
    triangles = next;
    if (!changed) break;
  }
  return { vertices: data.vertices, triangles };
}

/** Deterministically welds near-identical coordinates and removes invalid or duplicate faces. */
export function normalizeMeshData(
  input: MeshData,
  options: { toleranceMm?: number; requireClosed?: boolean; weldVertices?: boolean; repairTJunctions?: boolean } = {},
): MeshData & { removedDegenerateTriangles: number; weldedVertices: number } {
  const tolerance = options.toleranceMm ?? WELD_TOLERANCE_MM;
  const toleranceSquared = tolerance * tolerance;
  const vertices: Vec3[] = [];
  const buckets = new Map<string, number[]>();
  const remap = new Array<number>(input.vertices.length);
  const cell = (value: number) => Math.floor(value / tolerance);
  for (let sourceIndex = 0; sourceIndex < input.vertices.length; sourceIndex++) {
    const vertex = input.vertices[sourceIndex]!;
    if (!vertex.every(Number.isFinite)) throw new Error(`Mesh vertex ${sourceIndex} is not finite`);
    if (options.weldVertices === false) {
      remap[sourceIndex] = vertices.length;
      vertices.push([vertex[0], vertex[1], vertex[2]]);
      continue;
    }
    const cx = cell(vertex[0]); const cy = cell(vertex[1]); const cz = cell(vertex[2]);
    let match: number | undefined;
    for (let dx = -1; dx <= 1 && match === undefined; dx++)
      for (let dy = -1; dy <= 1 && match === undefined; dy++)
        for (let dz = -1; dz <= 1 && match === undefined; dz++) {
          const candidates = buckets.get(`${cx + dx}:${cy + dy}:${cz + dz}`) ?? [];
          match = candidates.find(index => {
            const candidate = vertices[index]!;
            const x = candidate[0] - vertex[0]; const y = candidate[1] - vertex[1]; const z = candidate[2] - vertex[2];
            return x * x + y * y + z * z <= toleranceSquared;
          });
        }
    if (match === undefined) {
      match = vertices.length; vertices.push([vertex[0], vertex[1], vertex[2]]);
      const key = `${cx}:${cy}:${cz}`; buckets.set(key, [...(buckets.get(key) ?? []), match]);
    }
    remap[sourceIndex] = match;
  }

  let removedDegenerateTriangles = 0;
  const triangles: [number, number, number][] = [];
  const faces = new Set<string>();
  for (const sourceFace of input.triangles) {
    if (sourceFace.some(index => !Number.isInteger(index) || index < 0 || index >= input.vertices.length))
      throw new Error('Mesh contains an out-of-range triangle index');
    const face = sourceFace.map(index => remap[index]!) as [number, number, number];
    if (new Set(face).size !== 3 || areaSquared(vertices[face[0]]!, vertices[face[1]]!, vertices[face[2]]!) <= AREA_EPSILON_SQUARED) {
      removedDegenerateTriangles += 1; continue;
    }
    const key = [...face].sort((a, b) => a - b).join(':');
    if (faces.has(key)) continue;
    faces.add(key); triangles.push(face);
  }
  if (triangles.length < 4) throw new Error('The mesh has no closed solid volume');

  const used = new Set(triangles.flat());
  const compactVertices: Vec3[] = [];
  const compactMap = new Map<number, number>();
  for (let index = 0; index < vertices.length; index++) if (used.has(index)) {
    compactMap.set(index, compactVertices.length); compactVertices.push(vertices[index]!);
  }
  const compactTriangles = triangles.map(face => face.map(index => compactMap.get(index)!) as [number, number, number]);
  let data: MeshData = { vertices: compactVertices, triangles: compactTriangles };
  if (signedVolume(data) < 0) data.triangles = data.triangles.map(([a, b, c]) => [a, c, b]);
  if (options.requireClosed && options.repairTJunctions !== false) data = repairTJunctions(data, tolerance * 2);
  if (options.requireClosed) {
    const topology = inspectMeshTopology(data.triangles);
    if (!topology.closed) throw new Error(`Mesh must be watertight for CSG (${topology.boundaryEdges} boundary, ${topology.nonManifoldEdges} non-manifold, ${topology.inconsistentWindingEdges} winding edges)`);
  }
  return { ...data, removedDegenerateTriangles, weldedVertices: input.vertices.length - compactVertices.length };
}

function rawMeshData(geometry: BufferGeometry, transform = new Matrix4()): MeshData {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('Geometry has no position attribute');
  const index = geometry.getIndex();
  const start = Math.max(0, geometry.drawRange.start);
  const available = index?.count ?? position.count;
  const count = Math.min(Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : available, available - start);
  const vertices: Vec3[] = [];
  const triangles: [number, number, number][] = [];
  const read = (entry: number): Vec3 => {
    const sourceIndex = index ? index.getX(entry) : entry;
    const point = new Vector3(position.getX(sourceIndex), position.getY(sourceIndex), position.getZ(sourceIndex)).applyMatrix4(transform);
    return [point.x, point.y, point.z];
  };
  for (let entry = start; entry + 2 < start + count; entry += 3) {
    const base = vertices.length;
    vertices.push(read(entry), read(entry + 1), read(entry + 2));
    triangles.push([base, base + 1, base + 2]);
  }
  return { vertices, triangles };
}

export function meshGeometry(data: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(data.vertices.flat(), 3));
  geometry.setIndex(data.triangles.flat());
  geometry.clearGroups();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function localGeometry(object: SceneObject): BufferGeometry {
  const shape = object.shape;
  if (shape.kind === 'box') return new BoxGeometry(...shape.sizeMm);
  if (shape.kind === 'cylinder') return new CylinderGeometry(shape.radiusMm, shape.radiusMm, shape.heightMm, 32, 1, false);
  if (shape.kind === 'sphere') {
    const geometry = new SphereGeometry(1, 32, 20);
    geometry.scale(...shape.radiiMm);
    return geometry;
  }
  if (shape.kind === 'mesh') return meshGeometry(shape);
  throw new Error('Empty objects have no solid geometry');
}

function worldMeshData(scene: SceneDocument, object: SceneObject): MeshData {
  const geometry = localGeometry(object);
  try {
    return normalizeMeshData(rawMeshData(geometry, worldMatrixFor(scene, object)), { requireClosed: true });
  } finally {
    geometry.dispose();
  }
}

function manifoldFromData(data: MeshData) {
  const mesh = new kernel.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(data.vertices.flat()),
    triVerts: new Uint32Array(data.triangles.flat()),
    tolerance: WELD_TOLERANCE_MM,
  });
  return kernel.Manifold.ofMesh(mesh);
}

function dataFromManifold(manifold: InstanceType<typeof kernel.Manifold>): ReturnType<typeof normalizeMeshData> {
  if (manifold.isEmpty()) throw new Error('The Boolean result has no closed solid volume');
  const mesh = manifold.getMesh();
  const vertices: Vec3[] = [];
  for (let offset = 0; offset < mesh.vertProperties.length; offset += mesh.numProp)
    vertices.push([mesh.vertProperties[offset]!, mesh.vertProperties[offset + 1]!, mesh.vertProperties[offset + 2]!]);
  // Manifold's render-oriented output may duplicate property vertices at run or
  // attribute boundaries. Its explicit merge vectors carry the topological
  // identity that position-tolerance welding cannot safely infer.
  const parents = vertices.map((_, index) => index);
  const root = (index: number): number => {
    let current = index;
    while (parents[current] !== current) current = parents[current]!;
    while (parents[index] !== index) { const next = parents[index]!; parents[index] = current; index = next; }
    return current;
  };
  for (let index = 0; index < mesh.mergeFromVert.length; index++) {
    const from = root(mesh.mergeFromVert[index]!); const to = root(mesh.mergeToVert[index]!);
    if (from !== to) parents[Math.max(from, to)] = Math.min(from, to);
  }
  const triangles: [number, number, number][] = [];
  for (let offset = 0; offset < mesh.triVerts.length; offset += 3)
    triangles.push([root(mesh.triVerts[offset]!), root(mesh.triVerts[offset + 1]!), root(mesh.triVerts[offset + 2]!)]);
  return normalizeMeshData({ vertices, triangles }, { requireClosed: true, weldVertices: false, repairTJunctions: false });
}

function evaluateWorld(scene: SceneDocument, target: SceneObject, cutter: SceneObject, kind: BooleanKind): ReturnType<typeof normalizeMeshData> {
  const a = manifoldFromData(worldMeshData(scene, target)); const b = manifoldFromData(worldMeshData(scene, cutter));
  let result: InstanceType<typeof kernel.Manifold> | undefined;
  try {
    result = kind === 'union' ? a.add(b) : kind === 'subtract' ? a.subtract(b) : a.intersect(b);
    return dataFromManifold(result);
  } finally {
    result?.delete(); a.delete(); b.delete();
  }
}

export function booleanMesh(scene: SceneDocument, targetId: string, cutterId: string, kind: BooleanKind): MeshResult {
  const target = scene.objects.find(object => object.id === targetId);
  const cutter = scene.objects.find(object => object.id === cutterId);
  if (!target || !cutter || target.id === cutter.id) throw new Error('Select two different existing objects for a Boolean operation');
  if (target.shape.kind === 'empty' || cutter.shape.kind === 'empty') throw new Error('Empty objects cannot be used in Boolean operations');
  if (scene.objects.some(child => child.parentId === target.id || child.parentId === cutter.id))
    throw new Error('Groups cannot be direct Boolean operands; select solid descendants instead');

  const world = evaluateWorld(scene, target, cutter, kind);
  const parentId = target.parentId === cutter.parentId ? target.parentId : undefined;
  const parentInverse = parentWorldMatrixFor(scene, parentId).invert();
  const parentVertices = world.vertices.map(vertex => {
    const point = new Vector3(...vertex).applyMatrix4(parentInverse); return [point.x, point.y, point.z] as Vec3;
  });
  const parentBounds = meshBounds(parentVertices);
  const localVertices = parentVertices.map(vertex => vertex.map((value, axis) => value - parentBounds.center[axis]!) as Vec3);
  const local = normalizeMeshData(
    { vertices: localVertices, triangles: world.triangles },
    { requireClosed: true, weldVertices: false, repairTJunctions: false },
  );
  return {
    ...local,
    positionMm: parentBounds.center,
    ...(parentId ? { parentId } : {}),
    bounds: meshBounds(local.vertices),
    removedDegenerateTriangles: world.removedDegenerateTriangles + local.removedDegenerateTriangles,
    weldedVertices: world.weldedVertices + local.weldedVertices,
  };
}

function broadPhase(scene: SceneDocument): { pairs: [SceneObject, SceneObject][] } {
  const solids = scene.objects.filter(object => object.shape.kind !== 'empty');
  const boxes = solids.map(object => {
    const geometry = localGeometry(object);
    try {
      geometry.computeBoundingBox();
      return geometry.boundingBox!.clone().applyMatrix4(worldMatrixFor(scene, object));
    } finally { geometry.dispose(); }
  });
  const pairs: [SceneObject, SceneObject][] = [];
  for (let first = 0; first < solids.length; first++) for (let second = first + 1; second < solids.length; second++)
    if (boxes[first]!.intersectsBox(boxes[second]!)) pairs.push([solids[first]!, solids[second]!]);
  return { pairs };
}

export function analyzeIntersections(scene: SceneDocument): IntersectionAnalysis {
  const candidates = broadPhase(scene).pairs;
  const verifiedPairs: [string, string][] = [];
  const errors: string[] = [];
  for (const [first, second] of candidates.slice(0, MAX_EXACT_OVERLAP_PAIRS)) {
    let a: InstanceType<typeof kernel.Manifold> | undefined; let b: InstanceType<typeof kernel.Manifold> | undefined;
    let overlap: InstanceType<typeof kernel.Manifold> | undefined;
    try {
      a = manifoldFromData(worldMeshData(scene, first)); b = manifoldFromData(worldMeshData(scene, second)); overlap = a.intersect(b);
      if (!overlap.isEmpty() && Math.abs(overlap.volume()) > 1e-5) verifiedPairs.push([first.id, second.id]);
    } catch (error) {
      errors.push(`${first.name} / ${second.name}: ${error instanceof Error ? error.message : 'intersection failed'}`);
    } finally {
      overlap?.delete(); a?.delete(); b?.delete();
    }
  }
  return {
    verifiedPairs,
    candidatePairs: candidates.map(([first, second]) => [first.id, second.id]),
    errors,
    limited: candidates.length > MAX_EXACT_OVERLAP_PAIRS,
  };
}
