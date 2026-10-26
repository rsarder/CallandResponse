import { z } from 'zod';

const bounded = z.number().finite().min(-100_000).max(100_000);
const dimension = z.number().finite().min(0.1).max(100_000);
const identifier = z.string().min(1).max(128);
const name = z.string().trim().min(1).max(80);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const Vec3Schema = z.tuple([bounded, bounded, bounded]);
export const QuatSchema = z.tuple([bounded, bounded, bounded, bounded]).refine(
  ([x, y, z, w]) => Math.abs(x * x + y * y + z * z + w * w - 1) < 0.001,
  'Rotation must be a unit quaternion',
);
const box = z.strictObject({ kind: z.literal('box'), sizeMm: z.tuple([dimension, dimension, dimension]) });
const cylinder = z.strictObject({ kind: z.literal('cylinder'), radiusMm: dimension, heightMm: dimension });
const sphere = z.strictObject({ kind: z.literal('sphere'), radiusMm: dimension });
export const ShapeSchema = z.discriminatedUnion('kind', [box, cylinder, sphere]);
export const SceneObjectSchema = z.strictObject({
  id: identifier, name, shape: ShapeSchema, positionMm: Vec3Schema, rotation: QuatSchema,
  material: z.strictObject({ colorHex: color }),
});
export const SceneDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative(),
  objects: z.array(SceneObjectSchema).max(500),
}).refine(doc => new Set(doc.objects.map(o => o.id)).size === doc.objects.length, 'Duplicate object IDs');

export type Vec3 = z.infer<typeof Vec3Schema>;
export type Quat = z.infer<typeof QuatSchema>;
export type Shape = z.infer<typeof ShapeSchema>;
export type SceneObject = z.infer<typeof SceneObjectSchema>;
export type SceneDocument = z.infer<typeof SceneDocumentSchema>;
export const emptyScene = (): SceneDocument => ({ schemaVersion: 1, revision: 0, objects: [] });

export const BoxFaceSchema = z.enum(['+x', '-x', '+y', '-y', '+z', '-z']);
export type BoxFace = z.infer<typeof BoxFaceSchema>;

const target = z.strictObject({ targetId: identifier });
const createBase = { id: identifier, name, positionMm: Vec3Schema };
export const SceneOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('create_box'), ...createBase, sizeMm: box.shape.sizeMm }),
  z.strictObject({ type: z.literal('create_cylinder'), ...createBase, radiusMm: dimension, heightMm: dimension }),
  z.strictObject({ type: z.literal('create_sphere'), ...createBase, radiusMm: dimension }),
  z.strictObject({ type: z.literal('duplicate_object'), ...target.shape, id: identifier, name }),
  z.strictObject({ type: z.literal('delete_object'), ...target.shape }),
  z.strictObject({ type: z.literal('translate_object'), ...target.shape, deltaMm: Vec3Schema }),
  z.strictObject({ type: z.literal('set_object_position'), ...target.shape, positionMm: Vec3Schema }),
  z.strictObject({ type: z.literal('rotate_object'), ...target.shape, rotation: QuatSchema }),
  z.strictObject({ type: z.literal('set_box_dimensions'), ...target.shape, sizeMm: box.shape.sizeMm }),
  z.strictObject({ type: z.literal('set_cylinder_dimensions'), ...target.shape, radiusMm: dimension, heightMm: dimension }),
  z.strictObject({ type: z.literal('set_sphere_radius'), ...target.shape, radiusMm: dimension }),
  z.strictObject({ type: z.literal('resize_box_face'), ...target.shape, face: BoxFaceSchema, deltaMm: bounded }),
  z.strictObject({ type: z.literal('rename_object'), ...target.shape, name }),
  z.strictObject({ type: z.literal('set_material_color'), ...target.shape, colorHex: color }),
]);
export type SceneOperation = z.infer<typeof SceneOperationSchema>;
export const SceneTransactionSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  source: z.enum(['mouse', 'keyboard', 'gesture', 'ai', 'numeric']),
  operations: z.array(SceneOperationSchema).min(1).max(100),
});
export type SceneTransaction = z.infer<typeof SceneTransactionSchema>;

export function rotateVector(v: Vec3, q: Quat): Vec3 {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
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
  const size: Vec3 = [...object.shape.sizeMm];
  size[axis] += deltaMm;
  const parsed = box.shape.sizeMm.parse(size);
  const n = faceNormal(face, object.rotation);
  const positionMm: Vec3 = [
    object.positionMm[0] + n[0] * deltaMm / 2,
    object.positionMm[1] + n[1] * deltaMm / 2,
    object.positionMm[2] + n[2] * deltaMm / 2,
  ];
  return SceneObjectSchema.parse({ ...object, positionMm, shape: { kind: 'box', sizeMm: parsed } });
}

export function applyTransaction(input: SceneDocument, transactionInput: SceneTransaction): SceneDocument {
  const scene = SceneDocumentSchema.parse(input);
  const transaction = SceneTransactionSchema.parse(transactionInput);
  if (transaction.expectedRevision !== scene.revision) throw new Error('Scene changed; retry the edit');
  let objects = scene.objects.slice();
  const get = (id: string): SceneObject => {
    const object = objects.find(o => o.id === id);
    if (!object) throw new Error(`Object not found: ${id}`);
    return object;
  };
  const replace = (id: string, update: (object: SceneObject) => SceneObject) => {
    const current = get(id);
    objects = objects.map(o => o.id === id ? SceneObjectSchema.parse(update(current)) : o);
  };
  const insert = (object: SceneObject) => {
    if (objects.some(o => o.id === object.id)) throw new Error(`Duplicate object ID: ${object.id}`);
    objects = [...objects, SceneObjectSchema.parse(object)];
  };
  for (const op of transaction.operations) {
    switch (op.type) {
      case 'create_box': insert({ id: op.id, name: op.name, shape: { kind: 'box', sizeMm: op.sizeMm }, positionMm: op.positionMm, rotation: [0, 0, 0, 1], material: { colorHex: '#76b7ff' } }); break;
      case 'create_cylinder': insert({ id: op.id, name: op.name, shape: { kind: 'cylinder', radiusMm: op.radiusMm, heightMm: op.heightMm }, positionMm: op.positionMm, rotation: [0, 0, 0, 1], material: { colorHex: '#b7a2ff' } }); break;
      case 'create_sphere': insert({ id: op.id, name: op.name, shape: { kind: 'sphere', radiusMm: op.radiusMm }, positionMm: op.positionMm, rotation: [0, 0, 0, 1], material: { colorHex: '#ffc785' } }); break;
      case 'duplicate_object': {
        const original = get(op.targetId);
        insert({ ...original, id: op.id, name: op.name, positionMm: [original.positionMm[0] + 16, original.positionMm[1], original.positionMm[2] + 16] });
        break;
      }
      case 'delete_object': get(op.targetId); objects = objects.filter(o => o.id !== op.targetId); break;
      case 'translate_object': replace(op.targetId, o => ({ ...o, positionMm: [o.positionMm[0] + op.deltaMm[0], o.positionMm[1] + op.deltaMm[1], o.positionMm[2] + op.deltaMm[2]] })); break;
      case 'set_object_position': replace(op.targetId, o => ({ ...o, positionMm: op.positionMm })); break;
      case 'rotate_object': replace(op.targetId, o => ({ ...o, rotation: op.rotation })); break;
      case 'set_box_dimensions': replace(op.targetId, o => { if (o.shape.kind !== 'box') throw new Error('Object is not a box'); return { ...o, shape: { kind: 'box', sizeMm: op.sizeMm } }; }); break;
      case 'set_cylinder_dimensions': replace(op.targetId, o => { if (o.shape.kind !== 'cylinder') throw new Error('Object is not a cylinder'); return { ...o, shape: { kind: 'cylinder', radiusMm: op.radiusMm, heightMm: op.heightMm } }; }); break;
      case 'set_sphere_radius': replace(op.targetId, o => { if (o.shape.kind !== 'sphere') throw new Error('Object is not a sphere'); return { ...o, shape: { kind: 'sphere', radiusMm: op.radiusMm } }; }); break;
      case 'resize_box_face': replace(op.targetId, o => stretchBoxFace(o, op.face, op.deltaMm)); break;
      case 'rename_object': replace(op.targetId, o => ({ ...o, name: op.name })); break;
      case 'set_material_color': replace(op.targetId, o => ({ ...o, material: { colorHex: op.colorHex } })); break;
    }
  }
  return SceneDocumentSchema.parse({ ...scene, revision: scene.revision + 1, objects });
}

export function parseSceneJson(text: string): SceneDocument {
  return SceneDocumentSchema.parse(JSON.parse(text));
}
