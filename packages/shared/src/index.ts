import { z } from 'zod';

const bounded = z.number().finite().min(-100_000).max(100_000);
const dimension = z.number().finite().min(0.1).max(100_000);
const identifier = z.string().min(1).max(128);
const name = z.string().trim().min(1).max(80);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const indexValue = z.number().int().nonnegative();
const triangle = z.tuple([indexValue, indexValue, indexValue]);

export const Vec3Schema = z.tuple([bounded, bounded, bounded]);
export const Scale3Schema = z.tuple([dimension, dimension, dimension]);
export const QuatSchema = z.tuple([bounded, bounded, bounded, bounded]).refine(
  ([x, y, z, w]) => Math.abs(x * x + y * y + z * z + w * w - 1) < 0.001,
  'Rotation must be a unit quaternion',
);

const box = z.strictObject({ kind: z.literal('box'), sizeMm: Scale3Schema });
const cylinder = z.strictObject({ kind: z.literal('cylinder'), radiusMm: dimension, heightMm: dimension });
const sphere = z.strictObject({ kind: z.literal('sphere'), radiiMm: Scale3Schema });
const mesh = z.strictObject({
  kind: z.literal('mesh'),
  vertices: z.array(Vec3Schema).min(4).max(100_000),
  triangles: z.array(triangle).min(4).max(300_000),
  editableVertices: z.array(indexValue).max(100_000).optional(),
});
const empty = z.strictObject({ kind: z.literal('empty') });
export const ShapeSchema = z.discriminatedUnion('kind', [box, cylinder, sphere, mesh, empty]);

function triangleAreaSquared(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  const ux = b[0]! - a[0]!; const uy = b[1]! - a[1]!; const uz = b[2]! - a[2]!;
  const vx = c[0]! - a[0]!; const vy = c[1]! - a[1]!; const vz = c[2]! - a[2]!;
  const cx = uy * vz - uz * vy; const cy = uz * vx - ux * vz; const cz = ux * vy - uy * vx;
  return cx * cx + cy * cy + cz * cz;
}

export const SceneObjectSchema = z.strictObject({
  id: identifier,
  name,
  shape: ShapeSchema,
  positionMm: Vec3Schema,
  rotation: QuatSchema,
  scale: Scale3Schema.default([1, 1, 1]),
  parentId: identifier.optional(),
  material: z.strictObject({ colorHex: color, opacity: z.number().finite().min(0).max(1).default(0.5) }).nullable().optional(),
}).superRefine((object, context) => {
  if (object.shape.kind === 'empty') {
    if (object.material != null) context.addIssue({ code: 'custom', path: ['material'], message: 'Empty objects cannot have a material' });
    if (Math.abs(object.scale[0] - object.scale[1]) > 1e-9 || Math.abs(object.scale[1] - object.scale[2]) > 1e-9)
      context.addIssue({ code: 'custom', path: ['scale'], message: 'Empty group scale must remain uniform to avoid hierarchy shear' });
    return;
  }
  if (object.material == null) context.addIssue({ code: 'custom', path: ['material'], message: 'Visible objects require a material' });
  if (object.shape.kind !== 'mesh') return;
  const shape = object.shape;
  for (let triangleIndex = 0; triangleIndex < shape.triangles.length; triangleIndex++) {
    const face = shape.triangles[triangleIndex]!;
    if (new Set(face).size !== 3 || face.some(vertexIndex => vertexIndex >= shape.vertices.length)) {
      context.addIssue({ code: 'custom', path: ['shape', 'triangles', triangleIndex], message: 'Triangle indices must reference three distinct existing vertices' });
      continue;
    }
    const [a, b, c] = face.map(vertexIndex => shape.vertices[vertexIndex]!);
    if (triangleAreaSquared(a!, b!, c!) <= 1e-20)
      context.addIssue({ code: 'custom', path: ['shape', 'triangles', triangleIndex], message: 'Mesh triangles must have nondegenerate area' });
  }
  const editable = shape.editableVertices ?? [];
  if (new Set(editable).size !== editable.length || editable.some(vertexIndex => vertexIndex >= shape.vertices.length))
    context.addIssue({ code: 'custom', path: ['shape', 'editableVertices'], message: 'Editable vertex indices must be unique and in range' });
});

export const SceneDocumentSchema = z.strictObject({
  schemaVersion: z.literal(2),
  revision: z.number().int().nonnegative(),
  objects: z.array(SceneObjectSchema).max(500),
}).superRefine((document, context) => {
  const ids = new Set<string>();
  const byId = new Map(document.objects.map(object => [object.id, object]));
  for (const object of document.objects) {
    if (ids.has(object.id)) context.addIssue({ code: 'custom', path: ['objects'], message: `Duplicate object ID: ${object.id}` });
    ids.add(object.id);
    if (object.parentId && byId.get(object.parentId)?.shape.kind !== 'empty')
      context.addIssue({ code: 'custom', path: ['objects'], message: `Parent of ${object.id} must be an existing Empty` });
    const visited = new Set([object.id]);
    let parentId = object.parentId;
    while (parentId) {
      if (visited.has(parentId)) {
        context.addIssue({ code: 'custom', path: ['objects'], message: 'Hierarchy cannot contain cycles' });
        break;
      }
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }
});

export type Vec3 = z.infer<typeof Vec3Schema>;
export type Quat = z.infer<typeof QuatSchema>;
export type Shape = z.infer<typeof ShapeSchema>;
export type SceneObject = z.infer<typeof SceneObjectSchema>;
export type SceneDocument = z.infer<typeof SceneDocumentSchema>;
export const emptyScene = (): SceneDocument => ({ schemaVersion: 2, revision: 0, objects: [] });

export interface Bounds3 { min: Vec3; max: Vec3; center: Vec3; size: Vec3 }

export function meshBounds(vertices: readonly Vec3[]): Bounds3 {
  if (!vertices.length) throw new Error('Cannot calculate bounds for an empty mesh');
  const min: Vec3 = [...vertices[0]!] as Vec3;
  const max: Vec3 = [...vertices[0]!] as Vec3;
  for (const vertex of vertices.slice(1)) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis]!, vertex[axis]!);
    max[axis] = Math.max(max[axis]!, vertex[axis]!);
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return { min, max, center, size };
}

export function shapeBounds(shape: Shape): Bounds3 | null {
  if (shape.kind === 'empty') return null;
  if (shape.kind === 'mesh') return meshBounds(shape.vertices);
  const size: Vec3 = shape.kind === 'box' ? shape.sizeMm
    : shape.kind === 'cylinder' ? [shape.radiusMm * 2, shape.heightMm, shape.radiusMm * 2]
      : shape.radiiMm.map(radius => radius * 2) as Vec3;
  const half = size.map(value => value / 2) as Vec3;
  return { min: half.map(value => -value) as Vec3, max: half, center: [0, 0, 0], size };
}

export interface MeshTopologyReport {
  closed: boolean;
  boundaryEdges: number;
  nonManifoldEdges: number;
  inconsistentWindingEdges: number;
}

export function inspectMeshTopology(triangles: readonly (readonly [number, number, number])[]): MeshTopologyReport {
  const edges = new Map<string, { count: number; direction: number }>();
  for (const [a, b, c] of triangles) for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
    const low = Math.min(from, to); const high = Math.max(from, to); const key = `${low}:${high}`;
    const record = edges.get(key) ?? { count: 0, direction: 0 };
    record.count += 1; record.direction += from === low ? 1 : -1; edges.set(key, record);
  }
  let boundaryEdges = 0; let nonManifoldEdges = 0; let inconsistentWindingEdges = 0;
  for (const edge of edges.values()) {
    if (edge.count === 1) boundaryEdges += 1;
    else if (edge.count !== 2) nonManifoldEdges += 1;
    else if (edge.direction !== 0) inconsistentWindingEdges += 1;
  }
  return { closed: boundaryEdges === 0 && nonManifoldEdges === 0 && inconsistentWindingEdges === 0, boundaryEdges, nonManifoldEdges, inconsistentWindingEdges };
}

export const BoxFaceSchema = z.enum(['+x', '-x', '+y', '-y', '+z', '-z']);
export type BoxFace = z.infer<typeof BoxFaceSchema>;

const target = z.strictObject({ targetId: identifier });
const createBase = { id: identifier, name, positionMm: Vec3Schema };
export const SceneOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('create_box'), ...createBase, sizeMm: box.shape.sizeMm }),
  z.strictObject({ type: z.literal('create_cylinder'), ...createBase, radiusMm: dimension, heightMm: dimension }),
  z.strictObject({ type: z.literal('create_sphere'), ...createBase, radiusMm: dimension }),
  z.strictObject({ type: z.literal('create_ellipsoid'), ...createBase, radiiMm: sphere.shape.radiiMm }),
  z.strictObject({ type: z.literal('create_empty'), ...createBase }),
  z.strictObject({ type: z.literal('create_mesh'), ...createBase, vertices: mesh.shape.vertices, triangles: mesh.shape.triangles, parentId: identifier.optional() }),
  z.strictObject({ type: z.literal('duplicate_object'), ...target.shape, id: identifier, name, offsetMm: Vec3Schema.optional() }),
  z.strictObject({ type: z.literal('delete_object'), ...target.shape }),
  z.strictObject({ type: z.literal('translate_object'), ...target.shape, deltaMm: Vec3Schema }),
  z.strictObject({ type: z.literal('set_object_position'), ...target.shape, positionMm: Vec3Schema }),
  z.strictObject({ type: z.literal('rotate_object'), ...target.shape, rotation: QuatSchema }),
  z.strictObject({ type: z.literal('set_object_scale'), ...target.shape, scale: Scale3Schema }),
  z.strictObject({ type: z.literal('set_box_dimensions'), ...target.shape, sizeMm: box.shape.sizeMm }),
  z.strictObject({ type: z.literal('set_cylinder_dimensions'), ...target.shape, radiusMm: dimension, heightMm: dimension }),
  z.strictObject({ type: z.literal('set_ellipsoid_radii'), ...target.shape, radiiMm: sphere.shape.radiiMm }),
  z.strictObject({ type: z.literal('set_sphere_radius'), ...target.shape, radiusMm: dimension }),
  z.strictObject({ type: z.literal('resize_box_face'), ...target.shape, face: BoxFaceSchema, deltaMm: bounded }),
  z.strictObject({ type: z.literal('rename_object'), ...target.shape, name }),
  z.strictObject({ type: z.literal('set_material_color'), ...target.shape, colorHex: color }),
  z.strictObject({ type: z.literal('set_material_opacity'), ...target.shape, opacity: z.number().finite().min(0).max(1) }),
  z.strictObject({ type: z.literal('reparent_object'), ...target.shape, parentId: identifier.nullable() }),
  z.strictObject({ type: z.literal('reorder_object'), ...target.shape, beforeId: identifier.nullable() }),
  z.strictObject({ type: z.literal('set_mesh_vertex'), ...target.shape, index: indexValue, positionMm: Vec3Schema }),
  z.strictObject({ type: z.literal('set_custom_mesh'), ...target.shape, vertices: mesh.shape.vertices, triangles: mesh.shape.triangles }),
]);
export type SceneOperation = z.infer<typeof SceneOperationSchema>;
export const SceneTransactionSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  source: z.enum(['mouse', 'keyboard', 'gesture', 'ai', 'numeric']),
  operations: z.array(SceneOperationSchema).min(1).max(2500),
});
export type SceneTransaction = z.infer<typeof SceneTransactionSchema>;

export function rotateVector(v: Vec3, q: Quat): Vec3 {
  const [x, y, z, w] = q; const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy); const ty = 2 * (z * vx - x * vz); const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty, vy + w * ty + z * tx - x * tz, vz + w * tz + x * ty - y * tx];
}

export function faceNormal(face: BoxFace, rotation: Quat): Vec3 {
  const axis: Vec3 = face[1] === 'x' ? [1, 0, 0] : face[1] === 'y' ? [0, 1, 0] : [0, 0, 1];
  const sign = face[0] === '+' ? 1 : -1;
  return rotateVector([axis[0] * sign, axis[1] * sign, axis[2] * sign], rotation);
}

export function stretchBoxFace(object: SceneObject, face: BoxFace, deltaMm: number): SceneObject {
  if (object.shape.kind !== 'box') throw new Error('Face stretch requires a box');
  const axis = face[1] === 'x' ? 0 : face[1] === 'y' ? 1 : 2;
  const size: Vec3 = [...object.shape.sizeMm]; size[axis] += deltaMm;
  const parsed = box.shape.sizeMm.parse(size);
  const n = faceNormal(face, object.rotation);
  const parentDelta = deltaMm * object.scale[axis]! / 2;
  const positionMm: Vec3 = object.positionMm.map((value, index) => value + n[index]! * parentDelta) as Vec3;
  return SceneObjectSchema.parse({ ...object, positionMm, shape: { kind: 'box', sizeMm: parsed } });
}

const material = (colorHex: string) => ({ colorHex, opacity: 0.5 });

export function applyTransaction(input: SceneDocument, transactionInput: SceneTransaction): SceneDocument {
  const scene = SceneDocumentSchema.parse(input);
  const transaction = SceneTransactionSchema.parse(transactionInput);
  if (transaction.expectedRevision !== scene.revision) throw new Error('Scene changed; retry the edit');
  let objects = scene.objects.slice();
  const get = (id: string): SceneObject => {
    const object = objects.find(candidate => candidate.id === id);
    if (!object) throw new Error(`Object not found: ${id}`);
    return object;
  };
  const replace = (id: string, update: (object: SceneObject) => SceneObject) => {
    const current = get(id);
    objects = objects.map(object => object.id === id ? SceneObjectSchema.parse(update(current)) : object);
  };
  const insert = (object: SceneObject) => {
    if (objects.some(candidate => candidate.id === object.id)) throw new Error(`Duplicate object ID: ${object.id}`);
    objects = [...objects, SceneObjectSchema.parse(object)];
  };
  for (const op of transaction.operations) {
    switch (op.type) {
      case 'create_box': insert({ id: op.id, name: op.name, shape: { kind: 'box', sizeMm: op.sizeMm }, positionMm: op.positionMm, rotation: [0, 0, 0, 1], scale: [1, 1, 1], material: material('#76b7ff') }); break;
      case 'create_cylinder': insert({ id: op.id, name: op.name, shape: { kind: 'cylinder', radiusMm: op.radiusMm, heightMm: op.heightMm }, positionMm: op.positionMm, rotation: [0, 0, 0, 1], scale: [1, 1, 1], material: material('#b7a2ff') }); break;
      case 'create_sphere': insert({ id: op.id, name: op.name, shape: { kind: 'sphere', radiiMm: [op.radiusMm, op.radiusMm, op.radiusMm] }, positionMm: op.positionMm, rotation: [0, 0, 0, 1], scale: [1, 1, 1], material: material('#ffc785') }); break;
      case 'create_ellipsoid': insert({ id: op.id, name: op.name, shape: { kind: 'sphere', radiiMm: op.radiiMm }, positionMm: op.positionMm, rotation: [0, 0, 0, 1], scale: [1, 1, 1], material: material('#ffc785') }); break;
      case 'create_empty': insert({ id: op.id, name: op.name, shape: { kind: 'empty' }, positionMm: op.positionMm, rotation: [0, 0, 0, 1], scale: [1, 1, 1] }); break;
      case 'create_mesh': insert({ id: op.id, name: op.name, shape: { kind: 'mesh', vertices: op.vertices, triangles: op.triangles }, positionMm: op.positionMm, rotation: [0, 0, 0, 1], scale: [1, 1, 1], parentId: op.parentId, material: material('#76b7ff') }); break;
      case 'duplicate_object': {
        const original = get(op.targetId); const offset = op.offsetMm ?? [16, 0, 16];
        insert({ ...original, id: op.id, name: op.name, positionMm: original.positionMm.map((value, axis) => value + offset[axis]!) as Vec3 });
        break;
      }
      case 'delete_object': get(op.targetId); objects = objects.filter(object => object.id !== op.targetId); break;
      case 'translate_object': replace(op.targetId, object => ({ ...object, positionMm: object.positionMm.map((value, axis) => value + op.deltaMm[axis]!) as Vec3 })); break;
      case 'set_object_position': replace(op.targetId, object => ({ ...object, positionMm: op.positionMm })); break;
      case 'rotate_object': replace(op.targetId, object => ({ ...object, rotation: op.rotation })); break;
      case 'set_object_scale': replace(op.targetId, object => ({ ...object, scale: op.scale })); break;
      case 'set_box_dimensions': replace(op.targetId, object => { if (object.shape.kind !== 'box') throw new Error('Object is not a box'); return { ...object, shape: { kind: 'box', sizeMm: op.sizeMm } }; }); break;
      case 'set_cylinder_dimensions': replace(op.targetId, object => { if (object.shape.kind !== 'cylinder') throw new Error('Object is not a cylinder'); return { ...object, shape: { kind: 'cylinder', radiusMm: op.radiusMm, heightMm: op.heightMm } }; }); break;
      case 'set_ellipsoid_radii': replace(op.targetId, object => { if (object.shape.kind !== 'sphere') throw new Error('Object is not an ellipsoid'); return { ...object, shape: { kind: 'sphere', radiiMm: op.radiiMm } }; }); break;
      case 'set_sphere_radius': replace(op.targetId, object => { if (object.shape.kind !== 'sphere') throw new Error('Object is not an ellipsoid'); return { ...object, shape: { kind: 'sphere', radiiMm: [op.radiusMm, op.radiusMm, op.radiusMm] } }; }); break;
      case 'resize_box_face': replace(op.targetId, object => stretchBoxFace(object, op.face, op.deltaMm)); break;
      case 'rename_object': replace(op.targetId, object => ({ ...object, name: op.name })); break;
      case 'set_material_color': replace(op.targetId, object => { if (!object.material) throw new Error('Empty objects have no material'); return { ...object, material: { ...object.material, colorHex: op.colorHex } }; }); break;
      case 'set_material_opacity': replace(op.targetId, object => { if (!object.material) throw new Error('Empty objects have no material'); return { ...object, material: { ...object.material, opacity: op.opacity } }; }); break;
      case 'reparent_object': {
        if (op.parentId === op.targetId) throw new Error('An object cannot parent itself');
        if (op.parentId && get(op.parentId).shape.kind !== 'empty') throw new Error('Only Empty objects can be parents');
        replace(op.targetId, object => ({ ...object, parentId: op.parentId ?? undefined }));
        break;
      }
      case 'reorder_object': {
        const object = get(op.targetId); if (op.beforeId === object.id) break;
        const before = op.beforeId ? get(op.beforeId) : undefined;
        if (before && before.parentId !== object.parentId) throw new Error('Hierarchy items can only be reordered among siblings');
        objects = objects.filter(item => item.id !== object.id);
        if (before) objects.splice(objects.findIndex(item => item.id === before.id), 0, object);
        else {
          const lastSibling = objects.reduce((last, item, index) => item.parentId === object.parentId ? index + 1 : last, 0);
          objects.splice(lastSibling, 0, object);
        }
        break;
      }
      case 'set_mesh_vertex': replace(op.targetId, object => {
        if (object.shape.kind !== 'mesh') throw new Error('Vertex editing requires a custom mesh');
        if (!object.shape.editableVertices?.includes(op.index)) throw new Error('This mesh does not expose editable box corners');
        const vertices = object.shape.vertices.slice(); vertices[op.index] = op.positionMm;
        return { ...object, shape: { ...object.shape, vertices } };
      }); break;
      case 'set_custom_mesh': replace(op.targetId, object => {
        if (object.shape.kind !== 'box' && object.shape.kind !== 'mesh') throw new Error('Only boxes or editable meshes can be replaced with custom topology');
        const editableVertices = object.shape.kind === 'mesh' ? object.shape.editableVertices : Array.from({ length: op.vertices.length }, (_, index) => index);
        return { ...object, shape: { kind: 'mesh', vertices: op.vertices, triangles: op.triangles, ...(editableVertices ? { editableVertices } : {}) } };
      }); break;
    }
  }
  return SceneDocumentSchema.parse({ ...scene, revision: scene.revision + 1, objects });
}

const LegacySceneSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), objects: z.array(z.record(z.string(), z.unknown())) });

export function parseSceneDocument(input: unknown): SceneDocument {
  const current = SceneDocumentSchema.safeParse(input);
  if (current.success) return current.data;
  const legacy = LegacySceneSchema.parse(input);
  const objects = legacy.objects.map(raw => {
    const shapeRaw = raw.shape as Record<string, unknown> | undefined;
    const shape = shapeRaw?.kind === 'sphere' && typeof shapeRaw.radiusMm === 'number'
      ? { kind: 'sphere', radiiMm: [shapeRaw.radiusMm, shapeRaw.radiusMm, shapeRaw.radiusMm] }
      : shapeRaw;
    const scale = Array.isArray(raw.scaleMm) ? raw.scaleMm : [1, 1, 1];
    const materialRaw = raw.material as Record<string, unknown> | null | undefined;
    const materialValue = materialRaw ? { ...materialRaw, opacity: materialRaw.opacity ?? 0.5 } : materialRaw;
    const { scaleMm: legacyScale, ...rest } = raw;
    void legacyScale;
    return { ...rest, shape, scale, material: materialValue };
  });
  return SceneDocumentSchema.parse({ schemaVersion: 2, revision: legacy.revision, objects });
}

export function parseSceneJson(text: string): SceneDocument {
  return parseSceneDocument(JSON.parse(text));
}
